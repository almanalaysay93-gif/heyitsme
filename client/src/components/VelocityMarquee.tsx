import {
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import { useRef, type ReactNode } from "react";

const wrap = (min: number, max: number, value: number) => {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
};

type VelocityMarqueeProps = {
  children: ReactNode;
  /** Percent of one copy's width per second. Negative runs right-to-left reversed. */
  speed?: number;
  className?: string;
};

/**
 * Endless row that drifts on its own, speeds up and skews with page scroll velocity,
 * and flips direction when the reader scrolls back up. Hovering slows it to a crawl.
 * With reduced motion it still drifts at base speed, without scroll effects.
 */
export function VelocityMarquee({ children, speed = 3, className = "" }: VelocityMarqueeProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);
  const hovered = useRef(false);
  const direction = useRef(1);

  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { damping: 50, stiffness: 400 });
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 4], { clamp: false });
  const skewX = useTransform(smoothVelocity, [-2400, 2400], [10, -10]);
  const x = useTransform(baseX, (value) => `${wrap(-50, 0, value)}%`);

  useAnimationFrame((_, delta) => {
    if (!inView) return;
    // Reduced motion keeps the gentle base drift but drops scroll boost, reversal, and skew.
    const factor = reduceMotion ? 0 : velocityFactor.get();
    if (factor < 0) direction.current = -1;
    else if (factor > 0) direction.current = 1;
    let moveBy = direction.current * speed * (delta / 1000);
    moveBy += moveBy * Math.abs(factor);
    if (hovered.current) moveBy *= 0.2;
    baseX.set(baseX.get() - moveBy);
  });

  return (
    <div
      ref={rootRef}
      className={`lp-marquee-track ${className}`}
      onPointerEnter={() => { hovered.current = true; }}
      onPointerLeave={() => { hovered.current = false; }}
    >
      <motion.div className="lp-marquee-row" style={reduceMotion ? { x } : { x, skewX }}>
        <div className="lp-marquee-copy">{children}</div>
        <div className="lp-marquee-copy" aria-hidden="true">{children}</div>
      </motion.div>
    </div>
  );
}
