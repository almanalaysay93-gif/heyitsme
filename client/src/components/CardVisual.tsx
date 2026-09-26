import { getInitials } from "@/lib/cardKit";
import { parseLinks, themeOptions, type CardDraft } from "@/lib/card";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

export function CardVisual({ card, compact = false, onClick, label }: { card: CardDraft; compact?: boolean; onClick?: () => void; label?: string }) {
  const theme = themeOptions.find((item) => item.id === card.theme) ?? themeOptions[0];
  const links = parseLinks(card.links);
  const props = {
    whileHover: { y: -7, rotateX: 2, rotateY: -2 },
    className: `card-visual theme-${theme.id} ${compact ? "card-visual-compact" : ""}`,
    style: { ["--card-a" as string]: theme.colors[0], ["--card-b" as string]: theme.colors[1], ["--card-c" as string]: theme.colors[2] },
  };
  const face = (
    <>
      <span className="card-glow" />
      <span className="card-topline"><span className="eyebrow">heyitsme</span><span className={`status-dot ${card.published ? "is-live" : ""}`} /></span>
      <span className="card-avatar">{card.avatarUrl ? <img src={card.avatarUrl} alt="" /> : getInitials(card.displayName)}</span>
      <span className="card-name">{card.displayName || "Your name"}</span>
      <span className="card-role">{card.title || "Your title"}{card.company ? ` · ${card.company}` : ""}</span>
      {!compact && <span className="card-bio">{card.bio || "A little context makes a great introduction."}</span>}
      <span className="card-bottomline"><span>{card.location || "Anywhere, really"}</span><span>{links[0] || "your.link"}</span></span>
    </>
  );
  // Previews with nothing to do render as a plain element, not a button that goes nowhere.
  if (!onClick) return <motion.div {...props}>{face}</motion.div>;
  return (
    <motion.button type="button" onClick={onClick} aria-label={label} whileTap={{ scale: 0.985 }} {...props}>
      {face}
    </motion.button>
  );
}

// Pointer-follow 3D tilt. Collapses to a static card under reduced motion.
export function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [10, -10]), { stiffness: 160, damping: 18 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-12, 12]), { stiffness: 160, damping: 18 });
  const glareX = useTransform(px, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(py, [0, 1], ["0%", "100%"]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,.28), transparent 45%)`;
  if (reduceMotion) return <div className={`tilt-card ${className}`}>{children}</div>;
  return (
    <motion.div
      className={`tilt-card ${className}`}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        px.set((event.clientX - rect.left) / rect.width);
        py.set((event.clientY - rect.top) / rect.height);
      }}
      onPointerLeave={() => { px.set(0.5); py.set(0.5); }}
    >
      {children}
      <motion.span className="tilt-glare" style={{ background: glare }} aria-hidden="true" />
    </motion.div>
  );
}

export function Field({ label, value, onChange, placeholder, type = "text", required = false, id, error, inputRef, onBlur, hint }: any) {
  const inputId = id || (label ? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  const errorId = inputId && error ? `${inputId}-error` : undefined;

  return (
    <label className="field-label" htmlFor={inputId}>
      <span>{label}{required ? " *" : ""}</span>
      {hint ? <small className="field-hint" style={{ fontSize: "11px", color: "var(--text-dim, rgba(255,255,255,0.5))", display: "block", marginBottom: "4px" }}>{hint}</small> : null}
      <input
        id={inputId}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={error ? "has-error" : undefined}
      />
      {error ? (
        <span id={errorId} className="field-error-text" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
