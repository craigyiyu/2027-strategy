/**
 * Landing — sales-forward hero, value pillars, process timeline, sample brief,
 * FAQ, and a clear bilingual CTA. Designed to read as a real product page,
 * not a generic SaaS hero.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SAMPLE_REPORT_PREVIEW_EN, SAMPLE_REPORT_PREVIEW_ZH, type Language } from '@2027strategy/shared';
import { useUiLanguage } from '../useQueryLang';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { BrandWordmark, useHeadingFocus } from '../components/ui';
import { IconArrowRight, IconCheck, IconShield, IconSpark } from '../components/icons';
import { useReveal } from '../hooks/useReveal';

const READINESS_LEVEL_LABEL: Record<Language, Record<'green' | 'amber' | 'red', string>> = {
  en: { green: 'Ready', amber: 'Amber', red: 'Red' },
  'zh-CN': { green: '绿', amber: '黄', red: '红' },
};

export default function Landing() {
  const { lang, t } = useUiLanguage();
  const headingRef = useHeadingFocus();
  const sampleRef = useReveal<HTMLDivElement>({ delay: 0 });
  const processRef = useReveal<HTMLDivElement>({ delay: 80 });
  const faqRef = useReveal<HTMLUListElement>({ delay: 120 });
  const ctaRef = useReveal<HTMLDivElement>({ delay: 80 });

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  const headline = lang === 'zh-CN' ? t.landing.headlineZh : t.landing.headline;
  const subheadline = lang === 'zh-CN' ? t.landing.subheadlineZh : t.landing.subheadline;
  const sample = lang === 'zh-CN' ? SAMPLE_REPORT_PREVIEW_ZH : SAMPLE_REPORT_PREVIEW_EN;
  const readyLabel = READINESS_LEVEL_LABEL[lang];

  return (
    <div className="app-shell landing">
      <a className="skip-link" href="#landing-main">{t.common.skipToContent}</a>
      <TopBar lang={lang} langSwitch />
      <main id="landing-main" className="landing-main">
        {/* HERO — sales-forward, asymmetric, with a quiet editorial illustration */}
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="hero-eyebrow"><span className="hero-eyebrow-dot" /> {t.landing.valuePropKicker}</p>
              <h1 ref={headingRef} tabIndex={-1} className="hero-headline">{headline}</h1>
              <p className="hero-subheadline">{subheadline}</p>
              <div className="hero-cta">
                <Link to="/start" className="btn btn-primary btn-lg">
                  {t.landing.ctaStart}
                  <IconArrowRight size={18} />
                </Link>
                <Link to="/method" className="btn btn-ghost btn-lg">
                  {t.landing.ctaSecondary}
                </Link>
              </div>
              <ul className="hero-proof" aria-label="Why it matters">
                <li>{t.landing.proof1}</li>
                <li>{t.landing.proof2}</li>
                <li>{t.landing.proof3}</li>
              </ul>
              <span className="hero-duration-badge" aria-label={t.landing.durationBadge}>
                <span className="hero-duration-dot" /> {t.landing.durationBadge}
              </span>
            </div>
            <aside className="hero-side no-print" aria-hidden="true">
              <div className="decision-landscape">
                <svg viewBox="0 0 320 260" role="presentation" className="landscape-svg">
                  <g className="landscape-lines">
                    <path d="M20 210 C 90 180, 120 160, 160 130 S 250 60, 300 44" />
                    <path d="M20 225 C 100 200, 140 180, 180 150 S 260 95, 300 84" />
                    <path d="M20 240 C 110 220, 150 205, 195 175 S 265 130, 300 124" />
                  </g>
                  <g className="landscape-marks">
                    <circle cx="160" cy="130" r="5" />
                    <circle cx="230" cy="92" r="4" />
                    <circle cx="285" cy="58" r="6" />
                    <circle cx="285" cy="58" r="12" className="mark-ring" />
                  </g>
                  <rect x="14" y="14" width="292" height="232" rx="12" className="landscape-frame" />
                </svg>
              </div>
            </aside>
          </div>
        </section>

        {/* VALUE PILLARS — four-card grid with the privacy one offset */}
        <section className="value-band">
          <div className="container">
            <header className="value-band-head">
              <h2 className="section-title">{t.landing.valuePropKicker}</h2>
              <p className="value-band-lead">{t.landing.valuePropLead}</p>
            </header>
            <div className="value-grid">
              <article className="value-card">
                <span className="value-icon" aria-hidden="true"><IconSpark size={20} /></span>
                <h3>{t.landing.valuePropPillar1Title}</h3>
                <p>{t.landing.valuePropPillar1Body}</p>
              </article>
              <article className="value-card">
                <span className="value-icon" aria-hidden="true"><IconCheck size={20} /></span>
                <h3>{t.landing.valuePropPillar2Title}</h3>
                <p>{t.landing.valuePropPillar2Body}</p>
              </article>
              <article className="value-card">
                <span className="value-icon" aria-hidden="true"><IconArrowRight size={20} /></span>
                <h3>{t.landing.valuePropPillar3Title}</h3>
                <p>{t.landing.valuePropPillar3Body}</p>
              </article>
              <article className="value-card value-card-accent">
                <span className="value-icon" aria-hidden="true"><IconShield size={20} /></span>
                <h3>{t.landing.valuePropPrivacyTitle}</h3>
                <p>{t.landing.valuePropPrivacyBody}</p>
              </article>
            </div>
          </div>
        </section>

        {/* SAMPLE BRIEF — anonymized CTO scenario, 12 sections distilled */}
        <section className="sample-band">
          <div className="container">
            <header className="section-head sample-band-head">
              <p className="hero-eyebrow"><span className="hero-eyebrow-dot" /> {t.landing.sampleKicker}</p>
              <h2 className="section-title">{t.landing.sampleLead}</h2>
              <p className="section-note">{t.landing.sampleNote}</p>
            </header>
            <div ref={sampleRef} className="sample-card">
              <div className="sample-card-meta">
                <span className="sample-card-reviewer">{sample.reviewer}</span>
                <span className="sample-card-divider" aria-hidden="true" />
                <span className="sample-card-runtime">{t.landing.durationBadge}</span>
              </div>
              <h3 className="sample-card-thesis">{sample.thesis}</h3>
              <div className="sample-card-grid">
                <section className="sample-block">
                  <span className="sample-block-label">{t.landing.sampleCruxLabel}</span>
                  <p className="serif-lead">{sample.crux}</p>
                </section>
                <section className="sample-block">
                  <span className="sample-block-label">{t.landing.samplePrioritiesLabel}</span>
                  <ol className="sample-list sample-list-numbered">
                    {sample.priorities.map((p, i) => (<li key={i}><span className="sample-list-marker">{i + 1}</span><span>{p}</span></li>))}
                  </ol>
                </section>
                <section className="sample-block">
                  <span className="sample-block-label">{t.landing.sampleStopDeferLabel}</span>
                  <ul className="sample-list sample-list-stop">
                    {sample.stopDefer.map((p, i) => (<li key={i}><span className="sample-list-marker" aria-hidden="true">×</span><span>{p}</span></li>))}
                  </ul>
                </section>
                <section className="sample-block sample-block-wide">
                  <span className="sample-block-label">{t.landing.sampleReadinessLabel}</span>
                  <div className="sample-readiness" role="list">
                    {sample.readiness.map((r) => (
                      <span key={r.label} className={`pill pill-${r.level}`} role="listitem">
                        <span className="pill-dot" aria-hidden="true" /> {r.label}: {readyLabel[r.level]}
                      </span>
                    ))}
                  </div>
                </section>
                <section className="sample-block sample-block-wide">
                  <span className="sample-block-label">{t.landing.sampleDecisionLabel}</span>
                  <p className="serif-lead serif-quote">{sample.decisionExcerpt}</p>
                </section>
              </div>
            </div>
          </div>
        </section>

        {/* PROCESS — five numbered steps + duration card */}
        <section className="process-band">
          <div className="container">
            <header className="value-band-head">
              <p className="hero-eyebrow"><span className="hero-eyebrow-dot" /> {t.landing.processKicker}</p>
              <h2 className="section-title">{t.landing.processLead}</h2>
            </header>
            <div ref={processRef} className="process-grid">
              <ol className="process-steps">
                {[
                  { title: t.landing.processStep1Title, body: t.landing.processStep1Body, n: 1 },
                  { title: t.landing.processStep2Title, body: t.landing.processStep2Body, n: 2 },
                  { title: t.landing.processStep3Title, body: t.landing.processStep3Body, n: 3 },
                  { title: t.landing.processStep4Title, body: t.landing.processStep4Body, n: 4 },
                  { title: t.landing.processStep5Title, body: t.landing.processStep5Body, n: 5 },
                ].map((s) => (
                  <li key={s.n} className="process-step">
                    <span className="process-step-num">{s.n}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <aside className="process-duration">
                <span className="process-duration-badge">{t.landing.durationBadge}</span>
                <h3>{t.landing.processDurationTitle}</h3>
                <p>{t.landing.processDurationBody}</p>
              </aside>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="faq-band">
          <div className="container">
            <h2 className="section-title">{t.landing.sampleFaqTitle}</h2>
            <ul ref={faqRef} className="faq-list">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n}>
                  <details className="faq-item" open={n === 1}>
                    <summary>{t.landing[`sampleFaqQ${n}` as keyof typeof t.landing] as string}</summary>
                    <p>{t.landing[`sampleFaqA${n}` as keyof typeof t.landing] as string}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA + trust + audience */}
        <section className="cta-band">
          <div className="container">
            <div ref={ctaRef} className="cta-card">
              <div className="cta-card-head">
                <p className="hero-eyebrow"><span className="hero-eyebrow-dot" /> {t.landing.ctaBookKicker}</p>
                <h2 className="section-title">{t.landing.ctaBookLead}</h2>
              </div>
              <Link to="/start" className="btn btn-primary btn-xl">
                {t.landing.ctaStart}
                <IconArrowRight size={20} />
              </Link>
            </div>
            <div className="trust-grid">
              <div className="privacy-promise">
                <span className="value-icon" aria-hidden="true"><IconShield size={22} /></span>
                <p>{t.landing.privacyPromise}</p>
                <ul className="trust-list">
                  <li>{t.landing.trustNote1}</li>
                  <li>{t.landing.trustNote2}</li>
                  <li>{t.landing.trustNote3}</li>
                </ul>
              </div>
              <div className="audience-note">
                <p>{t.landing.audienceNote}</p>
                <ul className="audience-chips">
                  <li>{t.landing.audiences.cto}</li>
                  <li>{t.landing.audiences.ir}</li>
                  <li>{t.landing.audiences.bu}</li>
                  <li>{t.landing.audiences.emba}</li>
                </ul>
                <BrandWordmark />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer lang={lang} />
    </div>
  );
}
