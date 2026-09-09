/**
 * Email providers. Console = dev/sandbox default (never a real send).
 * SMTP = nodemailer-compatible via built-in fetch-free approach; kept behind
 * the EmailService interface so provider code never leaks into orchestration.
 */
import type { AppEnv } from '../env';
import { logger } from '../logger';
import type {
  ConsentConfirmationInput,
  DeletionReceiptInput,
  EmailResult,
  EmailService,
  ReportEmailInput,
} from './types';
import { buildReportEmail, dict } from './types';

export class ConsoleEmailProvider implements EmailService {
  readonly providerName = 'console';
  private counter = 0;
  constructor(private env: AppEnv) {}

  private record(kind: string, subject: string) {
    this.counter += 1;
    logger.info('email', `[console-provider] ${kind}`, {
      subjectHash: subject.slice(0, 12),
      emailId: `console-${this.counter}`,
    });
  }

  async sendReport(i: ReportEmailInput): Promise<EmailResult> {
    const { subject } = buildReportEmail(i);
    this.record('report', subject);
    if (this.env.NODE_ENV !== 'test') {
      logger.info('email', `[console-provider:report] to=${i.to} subject=${subject}`);
    }
    return { ok: true, provider: this.providerName, emailId: `console-${this.counter}`, status: 'sent' };
  }

  async sendDeletionReceipt(i: DeletionReceiptInput): Promise<EmailResult> {
    this.record('deletion-receipt', dict(i.language).email.deletionReceiptSubject);
    return { ok: true, provider: this.providerName, emailId: `console-${this.counter}`, status: 'sent' };
  }

  async sendConsentConfirmation(i: ConsentConfirmationInput): Promise<EmailResult> {
    this.record('consent-confirmation', dict(i.language).email.consentConfirmationSubject);
    return { ok: true, provider: this.providerName, emailId: `console-${this.counter}`, status: 'sent' };
  }
}

export interface SmtpTransport {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ accepted: boolean }>;
}

/**
 * SMTP adapter using an injected transport (nodemailer-like). We keep the
 * dependency out of the core so CI/dev never need SMTP credentials.
 */
export function createSmtpEmailService(
  env: AppEnv,
  transport: SmtpTransport,
): EmailService {
  return {
    providerName: 'smtp',
    async sendReport(i: ReportEmailInput): Promise<EmailResult> {
      const { subject, text, html } = buildReportEmail(i);
      const r = await transport.sendMail({ from: env.EMAIL_FROM, to: i.to, subject, text, html });
      return { ok: r.accepted, provider: 'smtp', emailId: 'smtp', status: r.accepted ? 'sent' : 'failed' };
    },
    async sendDeletionReceipt(i: DeletionReceiptInput): Promise<EmailResult> {
      const d = dict(i.language);
      const r = await transport.sendMail({
        from: env.EMAIL_FROM,
        to: i.to,
        subject: d.email.deletionReceiptSubject,
        text: d.email.deletionReceiptBody,
        html: `<p>${d.email.deletionReceiptBody.replace(/</g, '&lt;')}</p>`,
      });
      return { ok: r.accepted, provider: 'smtp', emailId: 'smtp', status: r.accepted ? 'sent' : 'failed' };
    },
    async sendConsentConfirmation(i: ConsentConfirmationInput): Promise<EmailResult> {
      const d = dict(i.language);
      const r = await transport.sendMail({
        from: env.EMAIL_FROM,
        to: i.to,
        subject: d.email.consentConfirmationSubject,
        text: i.purposes.join(', '),
        html: `<p>${i.purposes.join(', ').replace(/</g, '&lt;')}</p>`,
      });
      return { ok: r.accepted, provider: 'smtp', emailId: 'smtp', status: r.accepted ? 'sent' : 'failed' };
    },
  };
}

export type { EmailService };
