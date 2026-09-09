/**
 * EmailService abstraction (PRD §17.3). Transactional delivery is independent
 * of newsletter consent. Providers: console (dev/sandbox) and SMTP.
 * Email bodies carry thesis + secure links only — never raw answers (PRIV-010).
 */
import type { Language } from '@2027strategy/shared';
import { dict } from '@2027strategy/shared';

export interface ReportEmailInput {
  to: string;
  firstName?: string;
  language: Language;
  thesis: string;
  reportUrl: string;
  deleteUrl: string;
  expiryDateIso: string;
}

export interface DeletionReceiptInput {
  to: string;
  language: Language;
}

export interface ConsentConfirmationInput {
  to: string;
  language: Language;
  purposes: string[];
}

export interface EmailResult {
  ok: boolean;
  provider: string;
  emailId: string;
  status: 'sent' | 'failed';
  errorCategory?: string;
}

export interface EmailService {
  readonly providerName: string;
  sendReport(i: ReportEmailInput): Promise<EmailResult>;
  sendDeletionReceipt(i: DeletionReceiptInput): Promise<EmailResult>;
  sendConsentConfirmation(i: ConsentConfirmationInput): Promise<EmailResult>;
}

export { dict } from '@2027strategy/shared';

export function formatExpiryText(iso: string, language: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return language === 'zh-CN'
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}




export function buildReportEmail(i: ReportEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const d = dict(i.language);
  const greeting = i.firstName
    ? d.email.reportGreeting.replace('{name}', i.firstName)
    : i.language === 'zh-CN'
      ? '您好：'
      : 'Hello,';
  const subject = i.language === 'zh-CN' ? d.email.reportSubjectZh : d.email.reportSubject;
  const expiry = formatExpiryText(i.expiryDateIso, i.language);
  const expiryNote = d.email.expiryNote.replace('{date}', expiry);
  const text = [
    greeting,
    '',
    d.email.reportBody,
    '',
    `${d.email.reportThesisLabel}\n${i.thesis}`,
    '',
    `${d.email.openReport}: ${i.reportUrl}`,
    '',
    expiryNote,
    '',
    d.email.noSensitiveNote,
    d.email.newsletterSeparateNote,
    '',
    `${d.email.deleteDataNote}: ${i.deleteUrl}`,
  ].join('\n');
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#272B2D;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#183B4E;margin:0 0 16px;">${subject}</h2>
      <p>${greeting.replace(/</g, '&lt;')}</p>
      <p>${d.email.reportBody.replace(/</g, '&lt;')}</p>
      <p style="font-style:italic;color:#275D38;">${d.email.reportThesisLabel.replace(/</g, '&lt;')}</p>
      <p style="font-size:17px;line-height:1.5;">${i.thesis.replace(/</g, '&lt;')}</p>
      <p><a href="${i.reportUrl}" style="display:inline-block;background:#183B4E;color:#F7F3EA;padding:12px 20px;text-decoration:none;border-radius:10px;">${d.email.openReport.replace(/</g, '&lt;')}</a></p>
      <p style="color:#6b6b6b;font-size:13px;">${expiryNote.replace(/</g, '&lt;')}</p>
      <p style="color:#6b6b6b;font-size:13px;">${d.email.noSensitiveNote.replace(/</g, '&lt;')}<br/>${d.email.newsletterSeparateNote.replace(/</g, '&lt;')}</p>
      <p style="font-size:13px;"><a href="${i.deleteUrl}" style="color:#8C2F39;">${d.email.deleteDataNote.replace(/</g, '&lt;')}</a></p>
    </div>`;
  return { subject, text, html };
}
