/** Method — MingCe Evidence Loop explanation (printable). */
import {
  DISCLAIMER_EN,
  DISCLAIMER_ZH,
  METHOD_BADGE_EN,
  METHOD_BADGE_ZH,
  METHOD_VERSION,
  PROMPT_VERSION,
} from '@2027strategy/shared';
import { useUiLanguage } from '../useQueryLang';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { PrintHeader } from '../components/PrintHeader';
import { FocusableH1, PageShell } from '../components/ui';

export default function Method() {
  const { lang, t } = useUiLanguage();
  const badge = lang === 'zh-CN' ? METHOD_BADGE_ZH : METHOD_BADGE_EN;
  const disclaimer = lang === 'zh-CN' ? DISCLAIMER_ZH : DISCLAIMER_EN;
  const subtitle = lang === 'zh-CN' ? t.method.subtitleZh : t.method.subtitleEn;

  return (
    <PageShell topBar={<TopBar lang={lang} langSwitch />} footer={<Footer lang={lang} />}>
      <PrintHeader title={t.method.title} />
      <FocusableH1>{t.method.title}</FocusableH1>
      <p className="page-subtitle">{subtitle}</p>

      <div className="method-badge">
        {t.common.methodShortZh} · {badge}
      </div>

      <p className="method-intro">{t.method.intro}</p>

      <div className="method-cards">
        <section className="report-section">
          <h2 className="report-section-title">{t.method.aiRoleTitle}</h2>
          <p className="report-section-body-text">{t.method.aiRole}</p>
        </section>
        <section className="report-section">
          <h2 className="report-section-title">{t.method.aiNotTitle}</h2>
          <p className="report-section-body-text">{t.method.aiNot}</p>
        </section>
      </div>

      <section className="method-layers" aria-label={t.method.title}>
        <ol className="layer-list">
          {t.method.layers.map((layer, i) => (
            <li key={layer.title} className="layer-card">
              <span className="layer-number" aria-hidden="true">
                {i + 1}
              </span>
              <div className="layer-copy">
                <h3 className="layer-title">{layer.title}</h3>
                <p className="layer-source">— {layer.source}</p>
                <p className="layer-body">{layer.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="report-section">
        <h2 className="report-section-title">{t.method.sourcesTitle}</h2>
        <ul className="source-list">
          {t.method.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer" className="text-link">
                {source.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="report-section">
        <h2 className="report-section-title">{t.method.independentTitle}</h2>
        <p className="report-section-body-text">{t.method.independent}</p>
        <p className="report-section-body-text">{disclaimer}</p>
      </section>

      <p className="kv-line">
        <strong>{t.method.versionLabel}</strong> {METHOD_VERSION}
      </p>
      <p className="kv-line">
        <strong>{t.method.updateDateLabel}</strong> {PROMPT_VERSION}
      </p>
    </PageShell>
  );
}
