/**
 * Motion primitives for the /c/:slug glass landing page.
 * framer-motion 12 only. Every primitive no-ops when `enabled` is false (builder preview)
 * or the OS asks for reduced motion. Hooks are always called (rules of hooks); only output changes.
 */
import {
  animate, motion, useInView, useReducedMotion, useScroll, useSpring, useTransform,
  type HTMLMotionProps, type MotionStyle,
} from "framer-motion";
import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

/* ---------- (a) Spring presets ----------
 * zeta = damping / (2 * sqrt(stiffness * mass)). Apple UI springs sit near zeta 0.8-0.9: a hint of life, no wobble. */
export const SPRING = {
  // zeta~0.86, settles ~0.55s: arrives fast, one soft overshoot you feel more than see.
  entrance: { type: "spring", stiffness: 180, damping: 23, mass: 1 },
  // zeta~0.70, settles ~0.2s: a press must answer within a frame or two; the tiny rebound reads as physical.
  press: { type: "spring", stiffness: 600, damping: 31, mass: 0.8 },
  // zeta~0.75, ~0.3s: hover is seen tens of times per visit, so it stays quick and small.
  hoverLift: { type: "spring", stiffness: 400, damping: 30, mass: 1 },
  // zeta~0.91, heavier mass, ~0.7s: big glass slabs should feel weighty and calm, not bouncy.
  panel: { type: "spring", stiffness: 120, damping: 22, mass: 1.1 },
  // zeta~1.22 overdamped: smoothing for scroll-linked values; never overshoots, never visibly lags.
  follow: { stiffness: 150, damping: 30, mass: 1 },
} as const;

/** Strong ease-out for duration-based bits (count-up, opacity). Never ease-in for UI. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** true only when motion should run: interactive page and no reduced-motion preference. */
export function useMotionOn(enabled: boolean): boolean {
  const reduce = useReducedMotion();
  return enabled && !reduce;
}

/* ---------- (b) Hero entrance ----------
 * Order: eyebrow -> name -> lead -> actions -> photo. 60-80ms stagger keeps the sequence under ~0.8s.
 * LCP rule: name + lead are painted at opacity 1 on frame one; they only glide 10px, never fade.
 * `transform` strings (not x/y) let framer-motion hand the animation to WAAPI, off the busy main thread at load. */
export type HeroStep = "eyebrow" | "name" | "lead" | "actions" | "photo";
const HERO_DELAY: Record<HeroStep, number> = { eyebrow: 0, name: 0.06, lead: 0.12, actions: 0.2, photo: 0.28 };

export function useHeroEntrance(enabled: boolean) {
  const on = useMotionOn(enabled);
  return (step: HeroStep): HTMLMotionProps<"div"> => {
    if (!on) return {};
    const delay = HERO_DELAY[step];
    const transition = { ...SPRING.entrance, delay };
    if (step === "name" || step === "lead") {
      return { initial: { transform: "translateY(10px)" }, animate: { transform: "translateY(0px)" }, transition };
    }
    const fade = { opacity: { duration: 0.32, ease: EASE_OUT, delay } };
    if (step === "photo") {
      return {
        initial: { opacity: 0, transform: "scale(0.96)", filter: "blur(6px)" },
        animate: { opacity: 1, transform: "scale(1)", filter: "blur(0px)" },
        transition: { ...transition, ...fade, filter: { duration: 0.45, ease: EASE_OUT, delay } },
      };
    }
    return {
      initial: { opacity: 0, transform: "translateY(14px)" },
      animate: { opacity: 1, transform: "translateY(0px)" },
      transition: { ...transition, ...fade },
    };
  };
}
// Usage: const hero = useHeroEntrance(interactive); <motion.h1 {...hero("name")}>...</motion.h1>
// Props are tag-agnostic; spread onto motion.p / motion.h1 / motion.figure (cast if TS complains).

/* ---------- (c) Pointer light + GlassPanel ----------
 * Writes --mx/--my (px, relative to the element) and --ml (0|1) straight onto element.style.
 * rAF-throttled, zero React renders, skipped on touch/coarse pointers. Vars live on the panel only,
 * so consume them in the panel's own ::before to keep style recalcs local. */
export function usePointerLight<T extends HTMLElement>(ref: RefObject<T | null>, enabled: boolean) {
  const on = useMotionOn(enabled);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0, x = 0, y = 0;
    let rect: DOMRect | null = null;
    const write = () => {
      frame = 0;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };
    const onEnter = () => { rect = el.getBoundingClientRect(); el.style.setProperty("--ml", "1"); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      rect ??= el.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(write);
    };
    const onLeave = () => { rect = null; el.style.setProperty("--ml", "0"); };
    const invalidate = () => { rect = null; }; // scroll/resize moves the box; re-measure lazily on next move
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      ["--mx", "--my", "--ml"].forEach((p) => el.style.removeProperty(p));
    };
  }, [ref, on]);
}
/* CSS contract:
 * .lx-glass { position: relative; isolation: isolate; }
 * .lx-glass::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1;
 *   background: radial-gradient(420px circle at var(--mx, 50%) var(--my, 0%), rgb(255 255 255 / .18), transparent 60%);
 *   opacity: var(--ml, 0); transition: opacity .3s ease; } */

export type GlassPanelProps = HTMLMotionProps<"section"> & { enabled: boolean; light?: boolean };

/** Frosted section that springs in once when 15% is in view. Plain static section when disabled. */
export function GlassPanel({ enabled, light = true, className, children, ...rest }: GlassPanelProps) {
  const ref = useRef<HTMLElement>(null);
  const on = useMotionOn(enabled);
  usePointerLight(ref, enabled && light);
  const cls = ["lx-glass", className].filter(Boolean).join(" ");
  const motionProps: HTMLMotionProps<"section"> = on
    ? {
        initial: { opacity: 0, transform: "translateY(24px) scale(0.98)" },
        whileInView: { opacity: 1, transform: "translateY(0px) scale(1)" },
        viewport: { once: true, amount: 0.15 },
        transition: { ...SPRING.panel, opacity: { duration: 0.4, ease: EASE_OUT } },
      }
    : {};
  return <motion.section ref={ref} className={cls} {...motionProps} {...rest}>{children}</motion.section>;
}

/* ---------- (d) CountUp ----------
 * Animates the first number in "12 yrs", "140+", "4.9", "₱350", "1,200+" from 0 when in view.
 * Screen readers get the final text (visually hidden copy); the ticking copy is aria-hidden.
 * textContent is written directly: no per-frame renders. React's vdom keeps format(0), so later
 * parent re-renders never reset the DOM. Reduced motion / disabled / no number -> final text as-is. */
const SR_ONLY: CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};
const NUM = /^([\s\S]*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/;

export function parseLeadingNumber(value: string) {
  const m = NUM.exec(value);
  if (!m) return null;
  const raw = m[2];
  const target = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(target)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  const fmt = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: raw.includes(","),
  });
  return { prefix: m[1], suffix: m[3], target, format: (n: number) => fmt.format(n) };
}

export type CountUpProps = { value: string; enabled: boolean; duration?: number; className?: string };

export function CountUp({ value, enabled, duration = 1.1, className }: CountUpProps) {
  const on = useMotionOn(enabled);
  const parsed = parseLeadingNumber(value);
  const numRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(numRef, { once: true, amount: 0.6 });
  const run = on && parsed !== null && parsed.target > 0;

  useEffect(() => {
    const el = numRef.current;
    if (!run || !inView || !el || !parsed) return;
    // Duration-based, not a spring: a spring would overshoot and flash "5.0" on its way to "4.9".
    const controls = animate(0, parsed.target, {
      duration, ease: EASE_OUT,
      onUpdate: (n) => { el.textContent = parsed.format(n); },
      onComplete: () => { el.textContent = parsed.format(parsed.target); },
    });
    return () => controls.stop();
  }, [run, inView, value, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run || !parsed) return <span className={className}>{value}</span>;
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      <span aria-hidden="true">{parsed.prefix}<span ref={numRef}>{parsed.format(0)}</span>{parsed.suffix}</span>
      <span style={SR_ONLY}>{value}</span>
    </span>
  );
}

/* ---------- (e) Press / hover ----------
 * scale 0.97 on press (0.95-0.98 range); 2px lift on hover. framer-motion never fires whileHover for touch,
 * so taps can't leave a stuck lift. Disabled -> {} and the CSS :active rule in cardLanding.css still applies. */
export function usePressProps(enabled: boolean, opts: { lift?: boolean } = {}): HTMLMotionProps<"button"> {
  const on = useMotionOn(enabled);
  if (!on) return {};
  return {
    whileTap: { scale: 0.97, transition: SPRING.press },
    ...(opts.lift === false ? {} : { whileHover: { y: -2, transition: SPRING.hoverLift } }),
    transition: SPRING.hoverLift, // release path: back to rest on the quick hover spring
  };
}
// Use lift:false for dock buttons and icon-only socials (seen constantly; press feedback is enough).

/* ---------- (f) Hero photo parallax ----------
 * Photo drifts 0 -> 24px down as the hero scrolls out, so it reads as sitting behind the glass copy. */
export function useHeroParallax<T extends HTMLElement>(ref: RefObject<T | null>, enabled: boolean, maxTravel = 24): MotionStyle | undefined {
  const on = useMotionOn(enabled);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const raw = useTransform(scrollYProgress, [0, 1], [0, Math.min(Math.max(maxTravel, 0), 24)]);
  const y = useSpring(raw, SPRING.follow);
  return on ? { y } : undefined;
}
// Usage: const heroRef = useRef<HTMLElement>(null); const px = useHeroParallax(heroRef, interactive);
// <section ref={heroRef}>... <motion.div style={px}><motion.figure {...hero("photo")}>...</motion.figure></motion.div></section>
// Keep parallax (style.y) and entrance (animate.transform) on separate elements so they never fight.
