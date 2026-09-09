/**
 * ConsentPanel — four independent permission choices from dict(lang).delivery,
 * all unchecked by default. Each purpose is stored separately by the server.
 */
import { Link } from 'react-router-dom';
import { dict, type ConsentPurpose, type Language } from '@2027strategy/shared';
import { Checkbox } from './ui';

export type ConsentState = Record<'reportDelivery' | 'newsletter' | 'pulse' | 'followup', boolean>;

export const CONSENT_ORDER: Array<{ key: keyof ConsentState; purpose: ConsentPurpose }> = [
  { key: 'reportDelivery', purpose: 'report_delivery' },
  { key: 'newsletter', purpose: 'newsletter' },
  { key: 'pulse', purpose: 'pulse' },
  { key: 'followup', purpose: 'followup' },
];

function labelKey(key: keyof ConsentState): string {
  switch (key) {
    case 'reportDelivery':
      return 'consentDeliveryLabel';
    case 'newsletter':
      return 'consentNewsletter';
    case 'pulse':
      return 'consentPulse';
    case 'followup':
      return 'consentFollowup';
  }
}

export function ConsentPanel({
  lang,
  consents,
  onChange,
}: {
  lang: Language;
  consents: ConsentState;
  onChange: (key: keyof ConsentState, value: boolean) => void;
}) {
  const t = dict(lang);
  return (
    <fieldset className="consent-panel">
      <legend className="consent-legend sr-only">{t.delivery.heading}</legend>
      {CONSENT_ORDER.map(({ key }) => (
        <Checkbox
          key={key}
          id={`consent-${key}`}
          checked={consents[key]}
          onChange={(next) => onChange(key, next)}
          label={t.delivery[labelKey(key)]}
        />
      ))}
      <p className="consent-note">
        {t.delivery.consentPolicyNote}{' '}
        <Link to="/privacy" className="text-link">
          {t.delivery.privacyPolicyLink}
        </Link>
      </p>
    </fieldset>
  );
}
