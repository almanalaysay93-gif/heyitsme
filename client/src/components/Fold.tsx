import { useEffect, useRef, type ReactNode } from "react";

/**
 * A collapsible group in the card builder. Closed by default, so a tab reads as a short list of groups.
 * `attention` marks unfinished rows inside; `forceOpen` opens it when a save error points at something inside.
 */
export function Fold({
  title,
  meta,
  hint,
  attention = false,
  attentionLabel = "Unfinished",
  forceOpen = false,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: ReactNode;
  hint?: ReactNode;
  attention?: boolean;
  attentionLabel?: string;
  forceOpen?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Opens on demand but never closes by itself: the owner may still be typing inside once the error clears.
  useEffect(() => {
    if (forceOpen && ref.current) ref.current.open = true;
  }, [forceOpen]);
  return (
    <details ref={ref} className="fold" open={defaultOpen || undefined}>
      <summary>
        <span className="fold-title">{title}</span>
        {attention ? <span className="fold-flag">{attentionLabel}</span> : null}
        {meta ? <span className="fold-meta">{meta}</span> : null}
      </summary>
      <div className="fold-body">
        {hint ? <p className="fold-hint">{hint}</p> : null}
        {children}
      </div>
    </details>
  );
}
