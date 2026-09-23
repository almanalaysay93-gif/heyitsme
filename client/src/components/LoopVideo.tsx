import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

type LoopVideoProps = {
  src?: string | null;
  className?: string;
  /** Shown until the clip can play, and kept if it never loads (missing file, reduced motion, Save-Data). */
  fallback?: ReactNode;
  /** Load and play only while on screen. Off for above-the-fold clips. */
  lazy?: boolean;
};

export function isVideoUrl(url?: string | null) {
  if (!url) return false;
  return /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url);
}

function prefersSavedData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

/**
 * Muted, looping, decorative background video. The fallback stays mounted until the first frame is ready,
 * then the clip cross-fades in, so a missing file simply leaves the code-made motion in place.
 */
export function LoopVideo({ src, className = "", fallback = null, lazy = true }: LoopVideoProps) {
  const reduceMotion = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(!lazy);
  const [armed, setArmed] = useState(!lazy);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackGone, setFallbackGone] = useState(false);
  const enabled = Boolean(src) && !reduceMotion && !failed && !prefersSavedData();

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setFallbackGone(false);
  }, [src]);

  // Unmount the fallback once the clip has faded over it, so its own animation stops costing frames.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setFallbackGone(true), 800);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!lazy || !enabled || !wrapRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) setArmed(true);
    }, { rootMargin: "240px 0px" });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [lazy, enabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (inView) void video.play().catch(() => undefined);
    else video.pause();
  }, [inView, ready]);

  return (
    <div ref={wrapRef} className={`loop-video ${ready ? "is-ready" : ""} ${className}`} aria-hidden="true">
      {!fallbackGone ? <div className="loop-video-fallback">{fallback}</div> : null}
      {enabled && armed ? (
        <video
          ref={videoRef}
          src={src ?? undefined}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
