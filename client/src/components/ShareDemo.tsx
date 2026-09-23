import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Check, Download, QrCode, ScanLine, UserRoundPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

const BEAT_MS = 2800;

const beats = [
  { title: "Show your code", copy: "Your page, one QR away." },
  { title: "They scan", copy: "Any phone camera works." },
  { title: "Your page opens", copy: "No app, no sign-up." },
  { title: "Saved, both ways", copy: "They keep you. You get them." },
];

const spring = { type: "spring" as const, stiffness: 260, damping: 24 };

/** Code-made product film: one phone shares, the other scans, opens the page and saves the contact. */
export function ShareDemo() {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { margin: "-15% 0px" });
  const [beat, setBeat] = useState(reduceMotion ? 2 : 0);
  const [paused, setPaused] = useState(false);
  const playing = inView && !paused && !reduceMotion;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setBeat((value) => (value + 1) % beats.length), BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [beat, playing]);

  const jump = (index: number) => {
    setBeat(index);
    setPaused(false);
  };

  return (
    <div className="sd" ref={rootRef}>
      <div className="sd-scene" aria-hidden="true">
        <div className="sd-arc">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none">
            <path className="sd-arc-track" d="M60 100 C 140 -10, 260 -10, 340 100" />
            <motion.path
              className="sd-arc-live"
              d="M60 100 C 140 -10, 260 -10, 340 100"
              initial={false}
              animate={{ pathLength: beat >= 1 ? 1 : 0, opacity: beat >= 1 ? 1 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          {beat === 1 && !reduceMotion ? (
            <motion.span
              className="sd-spark"
              initial={{ left: "15%", top: "83%", opacity: 0 }}
              animate={{ left: ["15%", "32%", "50%", "68%", "85%"], top: ["83%", "30%", "15%", "30%", "83%"], opacity: [0, 1, 1, 1, 0] }}
              transition={{ duration: 1.1, ease: "easeInOut", delay: 0.15 }}
            />
          ) : null}
        </div>

        <motion.div className="sd-phone sd-phone-a" animate={{ rotate: beat === 0 ? -4 : -8, y: beat === 0 ? -6 : 0 }} transition={spring}>
          <div className="sd-screen sd-screen-share">
            <div className="sd-mini-card">
              <span className="sd-mini-avatar">AM</span>
              <strong>Alex Morgan</strong>
              <small>Creative director</small>
            </div>
            <motion.div className="sd-qr" animate={{ scale: beat <= 1 ? 1 : 0.86, opacity: beat <= 1 ? 1 : 0.55 }} transition={spring}>
              <QRCodeSVG value={typeof window === "undefined" ? "https://heyitsme.app" : window.location.origin} size={86} bgColor="transparent" fgColor="#10152a" />
            </motion.div>
            <AnimatePresence>
              {beat === 3 ? (
                <motion.div className="sd-toast sd-toast-in" initial={{ opacity: 0, y: -18, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ ...spring, delay: 0.5 }}>
                  <span><UserRoundPlus size={12} /></span> Jordan sent their details
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div className="sd-phone sd-phone-b" animate={{ rotate: beat >= 2 ? 3 : 7, y: beat >= 2 ? -10 : 0 }} transition={spring}>
          <AnimatePresence mode="popLayout" initial={false}>
            {beat <= 1 ? (
              <motion.div key="camera" className="sd-screen sd-screen-camera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 0.35 }}>
                <div className={`sd-viewfinder ${beat === 1 ? "is-locked" : ""}`}>
                  <i /><i /><i /><i />
                  <motion.span className="sd-target" animate={{ opacity: beat === 1 ? 1 : 0.25, scale: beat === 1 ? 1 : 0.8 }} transition={spring}>
                    <QrCode size={44} />
                  </motion.span>
                  {beat === 1 && !reduceMotion ? <span className="sd-scanline" /> : null}
                </div>
                <small className="sd-camera-hint"><ScanLine size={12} /> {beat === 1 ? "heyitsme link found" : "Point at a code"}</small>
              </motion.div>
            ) : (
              <motion.div key="page" className="sd-screen sd-screen-page" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 180, damping: 24 }}>
                <div className="sd-page-cover" />
                <span className="sd-page-avatar">AM</span>
                <strong>Alex Morgan</strong>
                <small>Creative director · Studio North</small>
                <motion.span className="sd-page-save" animate={beat === 3 ? { scale: [1, 0.92, 1] } : { scale: 1 }} transition={{ duration: 0.4 }}>
                  {beat === 3 ? <><Check size={12} /> Saved</> : <><Download size={12} /> Save contact</>}
                </motion.span>
                <span className="sd-page-row" /><span className="sd-page-row" /><span className="sd-page-row short" />
                <AnimatePresence>
                  {beat === 3 ? (
                    <motion.div className="sd-toast" initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                      <span><Check size={12} /></span> Added to contacts
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <ol className="sd-steps" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        {beats.map((item, index) => (
          <li key={item.title}>
            <button type="button" className={index === beat ? "is-active" : index < beat ? "is-done" : ""} aria-current={index === beat ? "step" : undefined} onClick={() => jump(index)}>
              <span className="sd-step-bar">
                <motion.i
                  key={`${index}-${beat}-${playing}`}
                  initial={{ scaleX: index < beat ? 1 : 0 }}
                  animate={{ scaleX: index < beat ? 1 : index === beat ? (playing ? 1 : 0.5) : 0 }}
                  transition={{ duration: index === beat && playing ? BEAT_MS / 1000 : 0.2, ease: "linear" }}
                />
              </span>
              <strong>{item.title}</strong>
              <small>{item.copy}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
