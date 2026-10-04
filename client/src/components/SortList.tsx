import { GripVertical } from "lucide-react";
import { createElement, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** The list with one item taken out and put back at another position. */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Where position `at` ends up after the item at `from` moves to `to`. For rows that point at a list by position. */
export function movedPosition(at: number, from: number, to: number): number {
  if (at === from) return to;
  if (from < to && at > from && at <= to) return at - 1;
  if (from > to && at >= to && at < from) return at + 1;
  return at;
}

const EDGE = 72;

/**
 * A list whose rows are reordered by dragging a grip. Each row swaps with its neighbor as the pointer passes the
 * neighbor's middle, so `onMove` is always one step. With a keyboard: focus the grip, press the up or down arrow.
 * `children` returns one element per row, with its own key, and places `grip` inside it.
 */
export function SortList({ as = "ol", className, count, name, onMove, children }: {
  as?: "ol" | "div";
  className?: string;
  count: number;
  name: (index: number) => string;
  onMove: (from: number, to: number) => void;
  children: (index: number, grip: ReactNode) => ReactNode;
}) {
  const list = useRef<HTMLElement | null>(null);
  const held = useRef<number | null>(null);
  // A step changes the rows on the next render. Until then the page still shows the old order, so no second step.
  const waiting = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const latest = useRef({ onMove, count });
  latest.current = { onMove, count };

  useEffect(() => {
    waiting.current = false;
    const rows = list.current?.children;
    if (rows) for (let index = 0; index < rows.length; index += 1) rows[index].toggleAttribute("data-dragging", index === dragging);
  });
  useEffect(() => () => stop.current?.(), []);

  const step = (from: number, to: number) => {
    waiting.current = true;
    latest.current.onMove(from, to);
    setSaid(`Moved to position ${to + 1} of ${latest.current.count}.`);
  };

  const start = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    held.current = index;
    setDragging(index);
    document.body.style.userSelect = "none";
    const move = (pointer: PointerEvent) => {
      const rows = list.current?.children;
      const from = held.current;
      if (!rows || from === null || waiting.current) return;
      if (pointer.clientY < EDGE) window.scrollBy(0, -14);
      else if (pointer.clientY > window.innerHeight - EDGE) window.scrollBy(0, 14);
      const middle = (at: number) => { const box = rows[at].getBoundingClientRect(); return box.top + box.height / 2; };
      const to = from > 0 && pointer.clientY < middle(from - 1) ? from - 1 : from < rows.length - 1 && pointer.clientY > middle(from + 1) ? from + 1 : from;
      if (to === from) return;
      held.current = to;
      setDragging(to);
      step(from, to);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.userSelect = "";
      held.current = null;
      stop.current = null;
      setDragging(null);
    };
    stop.current = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : -1;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (to < 0 || to >= count) return;
    step(index, to);
    // The grip that was focused now belongs to another row, or was moved in the page and lost focus.
    requestAnimationFrame(() => list.current?.children[to]?.querySelector<HTMLButtonElement>("[data-sort-grip]")?.focus());
  };

  const grip = (index: number) => count < 2 ? null : (
    <button type="button" className="sort-grip" data-sort-grip aria-label={`Reorder ${name(index)}. Drag, or press the up or down arrow key.`} onPointerDown={event => start(event, index)} onKeyDown={event => onKey(event, index)}>
      <GripVertical size={16} aria-hidden="true" />
    </button>
  );

  return <>
    {createElement(as, { ref: list, className }, Array.from({ length: count }, (_, index) => children(index, grip(index))))}
    <span className="pd-sr-only" role="status" aria-live="polite">{said}</span>
  </>;
}
