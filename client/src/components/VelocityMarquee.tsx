import { type ReactNode } from "react";

type VelocityMarqueeProps = {
  children: ReactNode;
  /** Speed factor or duration in seconds. Positive drifts left, negative drifts right. */
  speed?: number;
  reverse?: boolean;
  className?: string;
};

/**
 * High-performance, GPU-accelerated endless ticker row.
 * Runs on compositor thread via CSS keyframes with 100% smooth looping and zero hitching.
 * Pauses gracefully on hover so users can interact with pills.
 */
export function VelocityMarquee({
  children,
  speed = 3,
  reverse = false,
  className = "",
}: VelocityMarqueeProps) {
  const isReverse = reverse || speed < 0;
  // Map speed to clean duration in seconds (default ~30-36s for natural editorial reading pace)
  const duration = Math.abs(speed) < 10
    ? Math.round(96 / Math.max(0.6, Math.abs(speed)))
    : Math.abs(speed);

  return (
    <div className={`lp-marquee-track ${className}`}>
      <div
        className={`lp-marquee-row ${isReverse ? "is-reverse" : "is-forward"}`}
        style={{ animationDuration: `${duration}s` }}
      >
        <div className="lp-marquee-copy">
          {children}
          {children}
        </div>
        <div className="lp-marquee-copy" aria-hidden="true">
          {children}
          {children}
        </div>
      </div>
    </div>
  );
}
