/**
 * Minimal inline SVG icon set (no icon library). All icons inherit
 * `currentColor`, stroke-based, 24x24 viewBox.
 */

interface IconProps {
  size?: number;
  className?: string;
  label?: string;
}

function baseProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
}

export function IconArrowRight({ size = 18, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M4 12h16" />
      <path d="M14 6l6 6-6 6" />
    </svg>
  );
}

export function IconArrowLeft({ size = 18, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M20 12H4" />
      <path d="M10 6l-6 6 6 6" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M4 12.5l5.2 5.2L20 6.8" />
    </svg>
  );
}

export function IconPrinter({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

export function IconMail({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </svg>
  );
}

export function IconTrash({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconShield({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M12 2.5l7.5 3v6c0 5-3.2 8.6-7.5 10-4.3-1.4-7.5-5-7.5-10v-6z" />
      <path d="M8.7 12l2.3 2.3 4.3-4.6" />
    </svg>
  );
}

export function IconChevronDown({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconChevronUp({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function IconClose({ size = 18, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconPen({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}

export function IconLightbulb({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 1 3.8 10.7c-.7.6-1.2 1.4-1.4 2.3H9.6c-.2-.9-.7-1.7-1.4-2.3A6 6 0 0 1 12 3z" />
    </svg>
  );
}

export function IconSpark({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
    </svg>
  );
}

export function IconLink({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.4 1.4" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4" />
    </svg>
  );
}
