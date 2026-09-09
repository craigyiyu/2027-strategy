/** Print-only document header used by the report / method / privacy pages. */
import type { ReactNode } from 'react';

export function PrintHeader({
  title,
  meta,
}: {
  title: string;
  meta?: ReactNode;
}) {
  return (
    <header className="print-header">
      <div className="print-header-brand">2027 Strategy</div>
      <h1 className="print-header-title">{title}</h1>
      {meta ? <div className="print-header-meta">{meta}</div> : null}
    </header>
  );
}
