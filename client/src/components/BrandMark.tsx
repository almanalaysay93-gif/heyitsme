// The heyitsme mark: two cards facing each other, joined by a link.
// Same shapes as client/public/logo.svg; keep the two in step.
const LEFT = "M17 22 L46 11 L46 63 L17 74 Z";
const RIGHT = "M54 30 L83 41 L83 84 L54 93 Z";

function Mark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g className="mark-cards" strokeWidth="7" strokeLinejoin="round">
        <path className="mark-left" d={LEFT} />
        <path className="mark-right" d={RIGHT} />
      </g>
      <rect className="mark-link" x="34" y="45" width="32" height="13" rx="6.5" />
    </svg>
  );
}

export function BrandMark() {
  return <Mark className="brand-mark" />;
}

// Loading state: the cards drift apart and snap back together as the link reconnects.
export function LogoLoader({ label }: { label?: string }) {
  return (
    <>
      <Mark className="logo-loader" />
      {label ? <span>{label}</span> : null}
    </>
  );
}
