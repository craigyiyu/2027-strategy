/** Privacy — data use explained per purpose (printable). */
import { POLICY_VERSION } from '@2027strategy/shared';
import { useUiLanguage } from '../useQueryLang';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { FocusableH1, PageShell } from '../components/ui';

const SECTION_KEYS = [
  'startAnonymously',
  'whatWeStore',
  'whyWeAsk',
  'sensitive',
  'consentPurposes',
  'retention',
  'deletion',
  'ai',
  'contact',
] as const;

export default function Privacy() {
  const { lang, t } = useUiLanguage();
  const sections = t.privacy.sections;

  return (
    <PageShell topBar={<TopBar lang={lang} langSwitch />} footer={<Footer lang={lang} />}>
      <FocusableH1>{t.privacy.title}</FocusableH1>
      <p className="page-subtitle">{t.privacy.intro}</p>

      <div className="privacy-sections">
        {SECTION_KEYS.map((key, i) => {
          const section = sections[key];
          return (
            <section className="report-section" key={key}>
              <h2 className="report-section-title">
                <span className="section-index" aria-hidden="true">
                  {i + 1}
                </span>
                {section.title}
              </h2>
              <p className="report-section-body-text">{section.body}</p>
            </section>
          );
        })}
      </div>

      <p className="kv-line">
        <strong>{t.privacy.policyVersionLabel}</strong> {POLICY_VERSION}
      </p>
    </PageShell>
  );
}
