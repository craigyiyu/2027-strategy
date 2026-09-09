/**
 * Lightweight accessible modal dialog (role=dialog, ESC close, focus moved
 * into the dialog and returned to the opener on close).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Button } from './ui';
import { IconClose } from './icons';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <Button variant="ghost" className="modal-close" onClick={onClose} aria-label={t.common.close}>
            <IconClose size={18} />
          </Button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  confirmVariant = 'primary',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="confirm-body">{body}</div>
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t.common.cancel}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
          {busy ? t.common.saving : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
