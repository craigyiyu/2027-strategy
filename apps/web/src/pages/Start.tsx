/** Start — sprint setup: lens, role, industry, privacy mode, then session. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IndustryBand, Lens, PrivacyMode, RoleBand } from '@2027strategy/shared';
import { useUiLanguage } from '../useQueryLang';
import { ApiError, createSession, rememberSessionTokens } from '../api';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { ErrorNotice } from '../components/ErrorNotice';
import {
  Field,
  FocusableH1,
  LangSwitch,
  PageShell,
  SelectField,
  TextInput,
  useFieldId,
} from '../components/ui';
import { IconCheck, IconShield } from '../components/icons';
import type { Dict } from '@2027strategy/shared';

type DictStart = Dict['start'];

const LENS_OPTIONS: Array<{
  value: Lens;
  title: keyof DictStart;
  desc: keyof DictStart;
}> = [
  { value: 'technology', title: 'lensTechnology', desc: 'lensTechnologyDesc' },
  { value: 'business', title: 'lensBusiness', desc: 'lensBusinessDesc' },
  { value: 'leadership', title: 'lensLeadership', desc: 'lensLeadershipDesc' },
];

const ROLE_OPTIONS: Array<{ value: RoleBand; label: keyof DictStart }> = [
  { value: 'c_suite', label: 'roleCsuite' },
  { value: 'director_vp', label: 'roleDirector' },
  { value: 'owner', label: 'roleOwner' },
  { value: 'senior_manager', label: 'roleSenior' },
  { value: 'other', label: 'roleOther' },
];

const INDUSTRY_OPTIONS: Array<{ value: IndustryBand; label: keyof DictStart }> = [
  { value: 'integrated_resort_hospitality', label: 'industryIr' },
  { value: 'technology', label: 'industryTech' },
  { value: 'financial_services', label: 'industryFs' },
  { value: 'professional_services', label: 'industryPs' },
  { value: 'consumer', label: 'industryConsumer' },
  { value: 'public_nonprofit', label: 'industryPublic' },
  { value: 'other', label: 'industryOther' },
];

export default function Start() {
  const { lang, t, setLang } = useUiLanguage();
  const navigate = useNavigate();

  const [lens, setLens] = useState<Lens>('technology');
  const [roleBand, setRoleBand] = useState<RoleBand>('c_suite');
  const [industryBand, setIndustryBand] = useState<IndustryBand>('integrated_resort_hospitality');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('private');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lensId = useFieldId('lens');
  const roleId = useFieldId('role');
  const industryId = useFieldId('industry');
  const aliasId = useFieldId('alias');
  const privacyId = useFieldId('privacy');

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createSession({
        language: lang,
        lens,
        roleBand,
        industryBand,
        organizationAlias: alias.trim().length > 0 ? alias.trim() : undefined,
        privacyMode,
      });
      rememberSessionTokens(res.token, res.reportToken);
      navigate(`/session/${encodeURIComponent(res.token)}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 429 ? t.errors.rateLimited : t.errors.generic);
      } else {
        setError(t.errors.network);
      }
      setBusy(false);
    }
  };

  return (
    <PageShell topBar={<TopBar lang={lang} langSwitch />} footer={<Footer lang={lang} />}>
      <FocusableH1>{t.start.title}</FocusableH1>
      <p className="page-subtitle">{t.start.subtitle}</p>

      {error ? <ErrorNotice lang={lang} message={error} /> : null}

      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset className="form-section">
          <legend className="form-legend">{t.start.languageLabel}</legend>
          <LangSwitch />
          <p className="field-hint">{t.start.languageHint}</p>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-legend">{t.start.lensLabel}</legend>
          <p className="field-hint">{t.start.lensHint}</p>
          <div className="choice-grid" role="radiogroup" aria-label={t.start.lensLabel}>
            {LENS_OPTIONS.map((option) => {
              const id = `${lensId}-${option.value}`;
              const checked = lens === option.value;
              return (
                <label key={option.value} htmlFor={id} className={`choice-card ${checked ? 'is-selected' : ''}`}>
                  <input
                    id={id}
                    type="radio"
                    name="lens"
                    value={option.value}
                    checked={checked}
                    onChange={() => setLens(option.value)}
                  />
                  <span className="choice-radio" aria-hidden="true">
                    {checked ? <IconCheck size={14} /> : null}
                  </span>
                  <span className="choice-body">
                    <span className="choice-title">{t.start[option.title]}</span>
                    <span className="choice-desc">{t.start[option.desc]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="form-grid-2">
          <Field label={t.start.roleLabel} htmlFor={roleId} hint={t.start.roleHint} required>
            <SelectField id={roleId} value={roleBand} onChange={(e) => setRoleBand(e.target.value as RoleBand)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t.start[option.label]}
                </option>
              ))}
            </SelectField>
          </Field>

          <Field label={t.start.industryLabel} htmlFor={industryId} hint={t.start.industryHint} required>
            <SelectField
              id={industryId}
              value={industryBand}
              onChange={(e) => setIndustryBand(e.target.value as IndustryBand)}
            >
              {INDUSTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t.start[option.label]}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>

        <Field label={t.start.aliasLabel} htmlFor={aliasId} hint={t.start.aliasHint}>
          <TextInput
            id={aliasId}
            value={alias}
            maxLength={120}
            onChange={(e) => setAlias(e.target.value)}
            placeholder={t.start.aliasPlaceholder}
          />
        </Field>

        <fieldset className="form-section">
          <legend className="form-legend">{t.start.privacyLabel}</legend>
          <div className="choice-grid" role="radiogroup" aria-label={t.start.privacyLabel}>
            {(
              [
                {
                  value: 'private' as PrivacyMode,
                  title: t.start.privacyPrivate,
                  desc: t.start.privacyPrivateDesc,
                },
                {
                  value: 'save' as PrivacyMode,
                  title: t.start.privacySave,
                  desc: t.start.privacySaveDesc,
                },
              ]
            ).map((option) => {
              const id = `${privacyId}-${option.value}`;
              const checked = privacyMode === option.value;
              return (
                <label key={option.value} htmlFor={id} className={`choice-card ${checked ? 'is-selected' : ''}`}>
                  <input
                    id={id}
                    type="radio"
                    name="privacyMode"
                    value={option.value}
                    checked={checked}
                    onChange={() => setPrivacyMode(option.value)}
                  />
                  <span className="choice-radio" aria-hidden="true">
                    {checked ? <IconCheck size={14} /> : null}
                  </span>
                  <span className="choice-body">
                    <span className="choice-title">{option.title}</span>
                    <span className="choice-desc">{option.desc}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="callout callout-warn" role="note">
          <IconShield size={18} />
          <p>{t.start.consentNotice}</p>
        </div>
        <p className="privacy-mode-note">{t.start.privacyModeNote}</p>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? t.common.saving : t.start.ctaBegin}
          </button>
        </div>
      </form>
    </PageShell>
  );
}
