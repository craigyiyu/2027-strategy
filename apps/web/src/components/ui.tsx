/**
 * Small design-system primitives: layout shell, buttons, fields, language
 * switch and accessibility helpers (skip link, heading focus, live region).
 */
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { IconCheck } from './icons';

/* ---------------------------- focus helpers ---------------------------- */

export function useHeadingFocus(): React.RefObject<HTMLHeadingElement> {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Give the browser a frame to paint, then move focus to the page heading.
    const id = window.setTimeout(() => {
      ref.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  return ref;
}

/* ------------------------------- buttons ------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  block = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, block ? 'btn-block' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}

interface ButtonLinkProps {
  to: string;
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

export function ButtonLink({
  to,
  variant = 'secondary',
  block = false,
  className,
  children,
  onClick,
}: ButtonLinkProps) {
  const classes = ['btn', `btn-${variant}`, block ? 'btn-block' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <Link to={to} className={classes} onClick={onClick}>
      {children}
    </Link>
  );
}

/* -------------------------------- fields ------------------------------- */

export function Field({
  label,
  hint,
  htmlFor,
  error,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return <input id={id} className="input" {...rest} />;
}

export function TextArea({
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string }) {
  return <textarea id={id} className="textarea" {...rest} />;
}

export function SelectField({
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string; children: ReactNode }) {
  return (
    <select id={id} className="select" {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="checkbox-row" htmlFor={id}>
      <span className="checkbox-control">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="checkbox-box" aria-hidden="true">
          {checked ? <IconCheck size={14} /> : null}
        </span>
      </span>
      <span className="checkbox-copy">
        <span className="checkbox-label">{label}</span>
        {description ? <span className="checkbox-desc">{description}</span> : null}
      </span>
    </label>
  );
}

/* ------------------------------- layout -------------------------------- */

export function BrandWordmark({ className }: { className?: string }) {
  const { t } = useI18n();
  return <span className={`wordmark ${className ?? ''}`}>{t.common.productName}</span>;
}

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-switch ${className ?? ''}`}>
      <button
        type="button"
        className={lang === 'en' ? 'is-active' : ''}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        {t.common.languageNameEn}
      </button>
      <button
        type="button"
        className={lang === 'zh-CN' ? 'is-active' : ''}
        aria-pressed={lang === 'zh-CN'}
        onClick={() => setLang('zh-CN')}
      >
        {t.common.languageNameZh}
      </button>
    </div>
  );
}

/** Live region for autosave / async status announcements. */
export function LiveRegion({ text, assertive = false }: { text: string; assertive?: boolean }) {
  return (
    <span className="sr-only" aria-live={assertive ? 'assertive' : 'polite'} role="status">
      {text}
    </span>
  );
}

/** Root page shell with skip link + main landmark. */
export function PageShell({
  children,
  topBar,
  wide = false,
  footer,
}: {
  children: ReactNode;
  topBar?: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t.common.skipToContent}
      </a>
      {topBar ?? null}
      <main id="main-content" className={wide ? 'container container-wide' : 'container'}>
        {children}
      </main>
      {footer ?? null}
    </div>
  );
}

/** H1 that receives keyboard focus after navigation (WCAG focus management). */
export function FocusableH1({
  children,
  id,
  tabIndex = -1,
}: {
  children: ReactNode;
  id?: string;
  tabIndex?: number;
}) {
  const ref = useHeadingFocus();
  return (
    <h1 ref={ref} id={id} tabIndex={tabIndex} className="page-title">
      {children}
    </h1>
  );
}

export function useFieldId(prefix: string): string {
  const raw = useId();
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
}
