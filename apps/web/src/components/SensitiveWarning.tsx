/**
 * SensitiveWarning — shown when the shared client-side scan flags blocked
 * content. No "submit anyway" path exists: only edit or replace with an
 * abstract description (dict interview.sensitive*).
 */
import { useState } from 'react';
import {
  dict,
  type Language,
  type SensitivityCategory,
} from '@2027strategy/shared';
import { fmt } from '../format';
import { Modal } from './Modal';
import { Button } from './ui';

function categoryCopyKey(category: SensitivityCategory): string | null {
  switch (category) {
    case 'credential':
      return 'sensitiveCategoryCredential';
    case 'personal_data':
      return 'sensitiveCategoryPersonalData';
    case 'security_detail':
      return 'sensitiveCategorySecurityDetail';
    case 'confidential_financial':
      return 'sensitiveCategoryConfidentialFinancial';
    default:
      return null;
  }
}

export function SensitiveWarning({
  open,
  onClose,
  category,
  lang,
  onSubmitAbstract,
}: {
  open: boolean;
  onClose: () => void;
  category: SensitivityCategory;
  lang: Language;
  /** Returns true when the new text is acceptable (parent should submit). */
  onSubmitAbstract: (abstract: string) => Promise<boolean>;
}) {
  const t = dict(lang);
  const [abstract, setAbstract] = useState('');
  const [busy, setBusy] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);

  const categoryKey = categoryCopyKey(category);
  const categoryLabel = categoryKey ? t.interview[categoryKey] : category;

  const handleEdit = () => {
    setAbstract('');
    setStillBlocked(false);
    onClose();
  };

  const handleSubmitAbstract = async () => {
    if (!abstract.trim()) {
      setStillBlocked(true);
      return;
    }
    setBusy(true);
    const ok = await onSubmitAbstract(abstract.trim());
    setBusy(false);
    if (!ok) {
      setStillBlocked(true);
    } else {
      setAbstract('');
      setStillBlocked(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleEdit}
      title={t.interview.sensitiveTitle}
      wide
    >
      <p className="sensitive-body">
        {fmt(t.interview.sensitiveBody, { category: categoryLabel })}
      </p>
      <p className="sensitive-body sensitive-note">
        {t.interview.sensitiveNeverSubmit}
      </p>

      <div className="sensitive-actions">
        <Button variant="secondary" onClick={handleEdit}>
          {t.interview.sensitiveEdit}
        </Button>
        <span className="sensitive-or">{t.common.optional}</span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="sensitive-abstract">
          {t.interview.sensitiveAbstract}
        </label>
        <textarea
          id="sensitive-abstract"
          className="textarea"
          rows={4}
          value={abstract}
          onChange={(e) => {
            setAbstract(e.target.value);
            setStillBlocked(false);
          }}
          placeholder={t.interview.textareaPlaceholder}
        />
        {stillBlocked ? (
          <p className="field-error" role="alert">
            {t.interview.sensitiveNeverSubmit}
          </p>
        ) : null}
        <div className="field-actions">
          <Button variant="primary" onClick={() => void handleSubmitAbstract()} disabled={busy}>
            {busy ? t.common.saving : t.interview.sensitiveAbstract}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
