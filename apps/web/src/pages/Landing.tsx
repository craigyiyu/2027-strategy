/** Landing — editorial hero, value props, proof points, privacy promise. */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SAMPLE_PREVIEW } from '@2027strategy/shared';
import { useUiLanguage } from '../useQueryLang';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { BrandWordmark, useHeadingFocus } from '../components/ui';
import { IconArrowRight, IconLightbulb, IconShield, IconSpark } from '../components/icons';

export default function Landing() {
  const { lang, t } = useUiLanguage();
  const headingRef = useHeadingFocus();

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  const headline = lang === 'zh-CN' ? t.landing.headlineZh : t.landing.headline;
  const subheadline = lang === 'zh-CN' ? t.landing.subheadlineZh : t.landing.subheadline;

  return (
    <div className="app-shell landing">
      <a className="skip-link" href="#landing-main">
        {t.common.skipToContent}
      </a>
      <TopBar lang={lang} langSwitch />
      <main id="landing-main" className="landing-main">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="hero-eyebrow">{t.landing.eyebrow}</p>
              <h1 ref={headingRef} tabIndex={-1} className="hero-headline">
                {headline}
              </h1>
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
              <ul className="hero-proof">
                <li>{t.landing.proof1}</li>
                <li>{t.landing.proof2}</li>
                <li>{t.landing.proof3}</li>
              </ul>
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

        <section className="value-band">
          <div className="container value-grid">
            <article className="value-card">
              <span className="value-icon" aria-hidden="true">
                <IconLightbulb size={20} />
              </span>
              <h2>{t.landing.valueCard1Title}</h2>
              <p>{t.landing.valueCard1Body}</p>
            </article>
            <article className="value-card">
              <span className="value-icon" aria-hidden="true">
                <IconSpark size={20} />
              </span>
              <h2>{t.landing.valueCard2Title}</h2>
              <p>{t.landing.valueCard2Body}</p>
            </article>
            <article className="value-card">
              <span className="value-icon" aria-hidden="true">
                <IconShield size={20} />
              </span>
              <h2>{t.landing.valueCard3Title}</h2>
              <p>{t.landing.valueCard3Body}</p>
            </article>
          </div>
        </section>

        {lang === 'en' ? (
          <section className="sample-band">
            <div className="container">
              <div className="section-head">
                <h2 className="section-title">{t.landing.sampleTitle}</h2>
                <Link to="/start" className="btn btn-primary">
                  {t.landing.ctaStart}
                  <IconArrowRight size={18} />
                </Link>
              </div>
              <div className="sample-grid">
                <article className="sample-card">
                  <span className="sample-label">{t.landing.sampleThesis}</span>
                  <p className="serif-lead">{SAMPLE_PREVIEW.strategyThesis}</p>
                </article>
                <article className="sample-card">
                  <span className="sample-label">{t.landing.sampleChallenge}</span>
                  <p className="serif-lead">{SAMPLE_PREVIEW.pivotalChallenge}</p>
                </article>
                <article className="sample-card">
                  <span className="sample-label">{t.landing.samplePriorities}</span>
                  <ul className="sample-list">
                    {SAMPLE_PREVIEW.proposedPriorities.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </article>
                <article className="sample-card">
                  <span className="sample-label">{t.landing.sampleTension}</span>
                  <p className="serif-lead">{SAMPLE_PREVIEW.unresolvedTension}</p>
                </article>
              </div>
            </div>
          </section>
        ) : null}

        <section className="trust-band">
          <div className="container trust-grid">
            <div className="privacy-promise">
              <span className="value-icon" aria-hidden="true">
                <IconShield size={22} />
              </span>
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
        </section>
      </main>
      <Footer lang={lang} />
    </div>
  );
}
