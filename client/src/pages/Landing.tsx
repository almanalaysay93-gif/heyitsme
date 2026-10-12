import { useAuth } from "@/_core/hooks/useAuth";
import { BrandMark } from "@/components/BrandMark";
import { LegalLinks } from "@/components/LegalLinks";
import { LoopVideo } from "@/components/LoopVideo";
import { QRCodeSVG } from "qrcode.react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { startGoogleLogin } from "@/const";
import { usePageMeta } from "@/hooks/usePageMeta";
import { landingMedia } from "@/lib/media";
import type { PlanColumn, PlanRow } from "@/components/PlansFilm";
import { formatPeso, PLAN_LIMITS, PRICES_MINOR, TEAMS_PLAN } from "@shared/plans";
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  Download,
  FileSpreadsheet,
  Mail,
  Menu,
  MessageCircle,
  Nfc,
  QrCode,
  Quote,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import "./landing.css";

const HowFilm = lazy(() => import("@/components/HowFilm"));
const PlansFilm = lazy(() => import("@/components/PlansFilm"));

// Free to Teams, side by side. Every number is read from shared/plans.ts.
const planColumns: [PlanColumn, PlanColumn, PlanColumn] = [
  { name: "Free", priceMinor: 0, per: "forever" },
  { name: "Pro", priceMinor: PRICES_MINOR.pro.monthly, per: "/month" },
  { name: "Teams", priceMinor: TEAMS_PLAN.priceMinor, per: "/month for each team" },
];
const planRows: PlanRow[] = [
  { label: "Cards", cells: [`${PLAN_LIMITS.free.cards} card`, `${PLAN_LIMITS.pro.cards} cards`, `${TEAMS_PLAN.seats} seats included`] },
  { label: "QR code and NFC link", cells: [true, true, true] },
  { label: "New leads", cells: [`${PLAN_LIMITS.free.monthlyLeads} a month`, "Unlimited", "Shared team contacts"] },
  { label: "Insights", cells: [`${PLAN_LIMITS.free.analyticsDays} days`, `${PLAN_LIMITS.pro.analyticsDays} days`, "Team analytics"] },
  { label: "Branding", cells: ["heyitsme branding", "Removable", "Your company brand"] },
  { label: "Event pages", cells: [false, false, "RSVP and check-in"] },
];

const hit = { type: "spring" as const, stiffness: 520, damping: 30, mass: 0.9 };
const ease = [0.77, 0, 0.175, 1] as const;

const band = ["Start free", "QR code", "NFC-ready link", "Save in one tap", "Lead capture", "Your own page"];

const steps = [
  { title: "Build", copy: "Name, role, photo, links, and the channels you actually answer." },
  { title: "Share", copy: "A QR code for the room, a link for the chat, an NFC tap for the handshake." },
  { title: "Keep", copy: "They save your contact in one tap, or send theirs back to your list." },
];

const inside = [
  { icon: QrCode, title: "Share it your way", copy: "A QR code, a personal link, and SMS and email helpers." },
  { icon: Download, title: "Save in one tap", copy: "Visitors download your contact as a .vcf file that opens in their phone contacts." },
  { icon: BriefcaseBusiness, title: "Show the work", copy: "Images, videos, PDFs, and project links sit under your name." },
  { icon: MessageCircle, title: "Every channel", copy: "LinkedIn, WhatsApp, Telegram, Viber, Signal, Calendly, and more, as buttons." },
  { icon: FileSpreadsheet, title: "Contacts that stick", copy: "Exchanged details land in a searchable list. CSV export is on Pro." },
  { icon: BarChart3, title: "See what gets tapped", copy: "Views, saves, and link taps. No third-party trackers." },
  { icon: Quote, title: "Kind words", copy: "Add quotes from past clients. Proof, in their words." },
  { icon: Mail, title: "Email signatures", copy: "HTML and rich text signatures that link to your card." },
];

/** A line of display type that rises out of its own mask. */
// The display serif has no peso glyph, so the sign is set in the body face.
function Peso({ minor }: { minor: number }) {
  const text = formatPeso(minor);
  return <b aria-label={text}><i className="nx-peso" aria-hidden="true">{text.slice(0, 1)}</i><span aria-hidden="true">{text.slice(1)}</span></b>;
}

function Rise({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <span className={`nx-rise ${className}`}>
      <motion.span initial={{ y: "108%", rotate: 5 }} animate={{ y: 0, rotate: 0 }} transition={{ ...hit, delay }}>
        {children}
      </motion.span>
    </span>
  );
}

/** Section heading that is cut in by a wipe when it reaches the viewport. */
function Cut({ children, id, className = "" }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <motion.h2
      id={id}
      className={`nx-h2 ${className}`}
      initial={{ clipPath: "inset(0 100% 0 0)", x: -48 }}
      whileInView={{ clipPath: "inset(0 0% 0 0)", x: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.55, ease }}
    >
      {children}
    </motion.h2>
  );
}

function FlipCard({ front, back, label, style, className = "" }: { front: string; back: string; label: string; style?: Record<string, MotionValue<number> | MotionValue<string>>; className?: string }) {
  return (
    <motion.div className={`nx-card3d ${className}`} style={style} role="img" aria-label={label}>
      <img className="nx-card3d-face" src={front} alt="" width={1004} height={638} loading="lazy" decoding="async" />
      <img className="nx-card3d-face nx-card3d-back" src={back} alt="" width={1004} height={638} loading="lazy" decoding="async" />
    </motion.div>
  );
}

function Hero({ start, cta }: { start: () => void; cta: string }) {
  const ref = useRef<HTMLElement>(null);
  const fine = useRef(false);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 140, damping: 20, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 140, damping: 20, mass: 0.6 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const stageRotY = useTransform(sx, [-0.5, 0.5], [-16, 16]);
  const stageRotX = useTransform(sy, [-0.5, 0.5], [12, -12]);
  const stageY = useTransform(scrollYProgress, [0, 1], [0, 260]);
  const stageScale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -220]);
  const copyFade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const nearX = useTransform(sx, [-0.5, 0.5], [70, -70]);
  const nearY = useTransform(sy, [-0.5, 0.5], [50, -50]);
  const midX = useTransform(sx, [-0.5, 0.5], [-36, 36]);
  const midY = useTransform(sy, [-0.5, 0.5], [-26, 26]);
  const ghostX = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);

  useEffect(() => {
    fine.current = window.matchMedia("(pointer: fine)").matches;
  }, []);

  const onMove = (event: PointerEvent<HTMLElement>) => {
    if (!fine.current || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    px.set((event.clientX - box.left) / box.width - 0.5);
    py.set((event.clientY - box.top) / box.height - 0.5);
  };
  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <section ref={ref} className="nx-hero" aria-label="Create your free digital business card" onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.span className="nx-ghost" style={{ x: ghostX }} aria-hidden="true">free free free</motion.span>

      <div className="nx-hero-persp">
        <motion.div className="nx-stage" style={{ rotateX: stageRotX, rotateY: stageRotY, y: stageY, scale: stageScale }}>
          <motion.div className="nx-stage-clip" initial={{ scale: 0.4, rotateZ: -18, opacity: 0 }} animate={{ scale: 1, rotateZ: 0, opacity: 1 }} transition={{ ...hit, stiffness: 260, damping: 22, delay: 0.1 }}>
            <LoopVideo
              playWhenReduced
              lazy={false}
              className="nx-stage-video"
              src={landingMedia.cardsLoop}
              fallback={<img className="nx-stage-poster" src={landingMedia.cardsPoster} alt="" fetchPriority="high" decoding="async" />}
            />
          </motion.div>
          <motion.div className="nx-float nx-float-a" style={{ x: nearX, y: nearY }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...hit, delay: 0.5 }} aria-hidden="true">
            <b>{formatPeso(0)}</b> to start
          </motion.div>
          <motion.div className="nx-float nx-float-b" style={{ x: midX, y: midY }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...hit, delay: 0.62 }} aria-hidden="true">
            <QrCode size={16} /> QR code included
          </motion.div>
          <motion.div className="nx-float nx-float-c" style={{ x: nearX, y: midY }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...hit, delay: 0.74 }} aria-hidden="true">
            <Nfc size={16} /> NFC-ready link
          </motion.div>
        </motion.div>
      </div>

      <motion.div className="nx-hero-copy" style={{ y: copyY, opacity: copyFade }}>
        <motion.p className="nx-eyebrow" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
          Digital business cards
        </motion.p>
        <h1 className="nx-h1">
          <span className="sr-only">Create your free digital business card.</span>
          <span aria-hidden="true">
            <Rise delay={0.04}>Your card.</Rise>
            <Rise delay={0.12} className="nx-gold">Free.</Rise>
          </span>
        </h1>
        <motion.p className="nx-lede" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.34 }}>
          Your name, work, and every way to reach you on one striking page. Share it by QR code, link, or NFC tap. Your card, QR code and link never expire.
        </motion.p>
        <motion.div className="nx-actions" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.42 }}>
          <button type="button" className="nx-btn nx-btn-gold nx-btn-xl" onClick={start}>
            {cta} <ArrowRight size={18} />
          </button>
          <a className="nx-btn nx-btn-line" href="/c/demo">View demo card</a>
        </motion.div>
        <motion.p className="nx-micro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.5 }}>
          Start free. Sign in with Google, then build your card.
        </motion.p>
      </motion.div>
    </section>
  );
}

const beats = [
  { kicker: "One page", title: "This is your card.", copy: "Your name, work, and every way to reach you, on a page that opens in any browser. Nothing to install." },
  { kicker: "Flip it", title: "Share it anywhere.", copy: "A QR code for the room, a personal link for the chat, SMS and email helpers for everything else." },
  { kicker: "Hand it over", title: "Tap. Your page opens.", copy: "The NFC card carries your link. Dark gold for the room, light marble for the desk." },
];

function Beat({ progress, index, kicker, title, copy }: { progress: MotionValue<number>; index: number } & (typeof beats)[number]) {
  const a = index / 3;
  const range = index === 0 ? [0, 0.24, 0.32] : index === 2 ? [a - 0.04, a + 0.06, 1] : [a - 0.04, a + 0.06, a + 0.26, a + 0.32];
  const opacity = useTransform(progress, range, index === 0 ? [1, 1, 0] : index === 2 ? [0, 1, 1] : [0, 1, 1, 0]);
  const y = useTransform(progress, range, index === 0 ? [0, 0, -90] : index === 2 ? [90, 0, 0] : [90, 0, 0, -90]);
  return (
    <motion.div className="nx-beat" style={{ opacity, y }}>
      <span className="nx-kicker">0{index + 1} / {kicker}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </motion.div>
  );
}

/** Pinned 3D scene. Scroll position drives the cards through depth, so it never moves on its own. */
function Deck() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 160, damping: 28, mass: 0.5 });

  const darkRotY = useTransform(p, [0, 0.3, 0.5, 0.72, 1], [-28, -8, 180, 196, 222]);
  const darkRotX = useTransform(p, [0, 0.4, 1], [14, 0, 10]);
  const darkZ = useTransform(p, [0, 0.4, 0.66, 1], [-520, 120, 60, -380]);
  const darkX = useTransform(p, [0, 0.66, 1], ["0%", "0%", "-34%"]);
  const darkY = useTransform(p, [0, 0.66, 1], ["0%", "0%", "-16%"]);
  const lightRotY = useTransform(p, [0.56, 1], [-200, -14]);
  const lightZ = useTransform(p, [0.56, 0.9, 1], [-1600, 160, 120]);
  const lightX = useTransform(p, [0.56, 1], ["90%", "22%"]);
  const lightY = useTransform(p, [0.56, 1], ["40%", "14%"]);
  const lightOpacity = useTransform(p, [0.56, 0.64], [0, 1]);
  const ringRot = useTransform(p, [0, 1], [0, 300]);
  const ringScale = useTransform(p, [0, 0.5, 1], [0.7, 1.15, 0.9]);
  const qrZ = useTransform(p, [0.3, 0.5, 0.66], [-1200, 220, 900]);
  const qrOpacity = useTransform(p, [0.3, 0.4, 0.6, 0.66], [0, 1, 1, 0]);
  const qrRot = useTransform(p, [0.3, 0.66], [-60, 40]);
  const meter = useTransform(p, [0, 1], [0, 1]);

  return (
    <section ref={ref} id="card" className="nx-deck" aria-labelledby="deck-title">
      <h2 id="deck-title" className="sr-only">Your card, in three moves</h2>
      <div className="nx-deck-pin">
        <motion.div className="nx-deck-meter" style={{ scaleY: meter }} aria-hidden="true" />
        <div className="nx-deck-scene">
          <motion.div className="nx-deck-ring" style={{ rotateZ: ringRot, scale: ringScale }} aria-hidden="true" />
          <motion.div className="nx-deck-ring nx-deck-ring-b" style={{ rotateZ: useTransform(ringRot, (v) => -v * 1.6), scale: ringScale }} aria-hidden="true" />
          <FlipCard
            className="nx-deck-dark"
            front="/media/cards/nfc-dark-front.webp"
            back="/media/cards/nfc-dark-back.webp"
            label="Dark gold NFC business card with the heyitsme mark and heyitsme.fyi on the back"
            style={{ rotateY: darkRotY, rotateX: darkRotX, z: darkZ, x: darkX, y: darkY }}
          />
          <motion.div className="nx-deck-qr" style={{ z: qrZ, opacity: qrOpacity, rotateZ: qrRot }} aria-hidden="true">
            <QRCodeSVG value="https://heyitsme.fyi/c/demo" size={132} level="M" bgColor="transparent" fgColor="#0a0908" />
          </motion.div>
          <FlipCard
            className="nx-deck-light"
            front="/media/cards/nfc-light-front.webp"
            back="/media/cards/nfc-light-back.webp"
            label="Light marble NFC business card with the heyitsme mark"
            style={{ rotateY: lightRotY, z: lightZ, x: lightX, y: lightY, opacity: lightOpacity }}
          />
        </div>
        <div className="nx-beats">
          {beats.map((beat, index) => <Beat key={beat.title} progress={p} index={index} {...beat} />)}
        </div>
      </div>
    </section>
  );
}

function Compare() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  // Same rule as the how-it-works film: client-only, loaded when the section is close.
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="nx-compare">
      <motion.div
        ref={ref}
        className="nx-film nx-compare-film"
        initial={{ rotateX: 28, y: 120, scale: 0.86, opacity: 0 }}
        whileInView={{ rotateX: 0, y: 0, scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ ...hit, stiffness: 220, damping: 26 }}
      >
        {near ? (
          <Suspense fallback={<div className="nx-film-hold" aria-hidden="true" />}>
            <PlansFilm plans={planColumns} rows={planRows} />
          </Suspense>
        ) : (
          <div className="nx-film-hold" aria-hidden="true" />
        )}
      </motion.div>
      {/* The real table. Wide screens show the film and keep this for screen readers; phones show this. */}
      <div className="nx-table-wrap">
        <table className="nx-table">
          <caption>Free, Pro and Teams compared</caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              {planColumns.map((plan) => <th scope="col" key={plan.name}>{plan.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Price</th>
              {planColumns.map((plan) => <td key={plan.name}><b>{formatPeso(plan.priceMinor)}</b> {plan.per}</td>)}
            </tr>
            {planRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, index) => (
                  <td key={planColumns[index].name}>
                    {typeof cell === "string" ? cell : cell ? <><Check size={16} aria-hidden="true" /><span className="sr-only">Included</span></> : <><i aria-hidden="true">-</i><span className="sr-only">Not included</span></>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function How() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [step, setStep] = useState(0);
  const [seek, setSeek] = useState<{ step: number; nonce: number } | null>(null);
  const onStep = useCallback((next: number) => setStep(next), []);

  // The film is client-only and loads when the section is close, so its code never blocks the first paint.
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how" className="nx-section nx-how" aria-labelledby="how-title">
      <span className="nx-kicker">How it works</span>
      <Cut id="how-title">Three moves. <em>Ten seconds.</em></Cut>
      <div className="nx-how-grid">
        <motion.div
          ref={ref}
          className="nx-film"
          initial={{ rotateX: 28, y: 120, scale: 0.86, opacity: 0 }}
          whileInView={{ rotateX: 0, y: 0, scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ ...hit, stiffness: 220, damping: 26 }}
        >
          {near ? (
            <Suspense fallback={<div className="nx-film-hold" aria-hidden="true" />}>
              <HowFilm onStep={onStep} seekTo={seek} autoPlay />
            </Suspense>
          ) : (
            <div className="nx-film-hold" aria-hidden="true" />
          )}
        </motion.div>
        <ol className="nx-steps">
          {steps.map((item, index) => (
            <li key={item.title}>
              <button
                type="button"
                className={`nx-step${step === index ? " is-on" : ""}`}
                aria-current={step === index ? "step" : undefined}
                onClick={() => setSeek({ step: index, nonce: Date.now() })}
              >
                <span className="nx-step-num">0{index + 1}</span>
                <span className="nx-step-body">
                  <strong>{item.title}</strong>
                  <span>{item.copy}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function Landing() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });

  usePageMeta({ title: "Free Digital Business Card with QR Code | heyitsme", canonicalPath: "/" });

  const start = () => (isAuthenticated ? navigate("/app/cards/new") : startGoogleLogin("/app/cards/new"));
  const openApp = () => navigate("/app");
  const primary = isAuthenticated ? openApp : start;
  const cta = isAuthenticated ? "Open my cards" : "Create your free card";
  const closeAnd = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const free = PLAN_LIMITS.free;
  const pro = PLAN_LIMITS.pro;
  const links = [
    { href: "#card", label: "The card" },
    { href: "#how", label: "How it works" },
    { href: "#inside", label: "What's inside" },
    { href: "#pricing", label: "Pricing" },
  ];

  return (
    <div className="nx">
      {/* Gold clouds drift behind the whole page. A HyperFrames clip; without it the ground is plain ink. */}
      <LoopVideo playWhenReduced lazy={false} className="nx-clouds" src={landingMedia.cloudsLoop} />
      <motion.div className="nx-progress" style={{ scaleX: progress }} aria-hidden="true" />

      <header className="nx-nav">
        <a className="brand-lockup" href="/" aria-label="heyitsme home"><BrandMark /><span>heyitsme</span></a>
        <nav className="nx-nav-links" aria-label="Page sections">
          {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="nx-nav-actions">
          {isAuthenticated ? null : <button type="button" className="nx-signin" onClick={() => startGoogleLogin()}>Sign in</button>}
          <button type="button" className="nx-btn nx-btn-gold nx-nav-cta" onClick={primary}>{cta}</button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button type="button" className="nx-menu" aria-label="Open navigation menu" aria-expanded={menuOpen} aria-controls="nx-menu">
                <Menu size={18} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" id="nx-menu" className="nx-sheet">
              <div>
                <SheetHeader>
                  <SheetTitle className="brand-lockup"><BrandMark /><span>heyitsme</span></SheetTitle>
                </SheetHeader>
                <nav className="nx-sheet-links" aria-label="Mobile page sections">
                  {links.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
                </nav>
                <div className="nx-sheet-actions">
                  {isAuthenticated ? null : <button type="button" className="nx-signin" onClick={() => closeAnd(() => startGoogleLogin())}>Sign in</button>}
                  <button type="button" className="nx-btn nx-btn-gold" onClick={() => closeAnd(primary)}>{cta} <ArrowRight size={15} /></button>
                </div>
              </div>
              <LegalLinks className="legal-links-dark" />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Hero start={primary} cta={cta} />

        {/* The tapes are a HyperFrames clip; the CSS tapes stay as the fallback until it plays. */}
        <LoopVideo
          playWhenReduced
          className="nx-band-film"
          src={landingMedia.bandLoop}
          fallback={
            <>
              <div className="nx-band" aria-hidden="true">
                <div className="nx-band-track">
                  {[0, 1].map((copy) => band.map((word) => <span key={`${copy}-${word}`}>{word}<i /></span>))}
                </div>
              </div>
              <div className="nx-band nx-band-b" aria-hidden="true">
                <div className="nx-band-track">
                  {[0, 1].map((copy) => band.map((word) => <span key={`${copy}-${word}`}>{word}<i /></span>))}
                </div>
              </div>
            </>
          }
        />

        <Deck />
        <How />

        <section id="inside" className="nx-section" aria-labelledby="inside-title">
          <span className="nx-kicker">What's inside</span>
          <Cut id="inside-title">More than a card. <em>A home page.</em></Cut>
          <div className="nx-tiles">
            {inside.map((item, index) => (
              <motion.article
                key={item.title}
                className="nx-tile"
                initial={{ rotateX: -70, y: 90, opacity: 0 }}
                whileInView={{ rotateX: 0, y: 0, opacity: 1 }}
                viewport={{ once: true, margin: "-8% 0px" }}
                transition={{ ...hit, stiffness: 300, delay: (index % 4) * 0.06 }}
              >
                <span className="nx-tile-icon"><item.icon size={20} /></span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section id="pricing" className="nx-section nx-pricing" aria-labelledby="pricing-title">
          <span className="nx-kicker">Pricing</span>
          <Cut id="pricing-title">Start free. <em>Upgrade when it pays.</em></Cut>
          <p className="nx-section-lede">The basic profile, QR code, and NFC-ready link stay free. Upgrade when networking starts creating opportunities.</p>
          <div className="nx-plans">
            <motion.article
              className="nx-plan nx-plan-free"
              initial={{ rotateY: 50, x: -120, opacity: 0 }}
              whileInView={{ rotateY: 0, x: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ ...hit, stiffness: 240, damping: 24 }}
            >
              <span className="nx-plan-tag">Free stays free</span>
              <h3>Free</h3>
              <p className="nx-price"><Peso minor={0} /></p>
              <ul>
                <li><Check size={16} /> {free.cards} digital card with your own link</li>
                <li><Check size={16} /> QR code and NFC-ready link</li>
                <li><Check size={16} /> One-tap contact save</li>
                <li><Check size={16} /> {free.monthlyLeads} new leads a month</li>
                <li><Check size={16} /> {free.analyticsDays} days of insights</li>
              </ul>
              <button type="button" className="nx-btn nx-btn-dark nx-btn-xl" onClick={primary}>{cta} <ArrowRight size={18} /></button>
            </motion.article>
            <motion.article
              className="nx-plan"
              initial={{ rotateY: -50, x: 120, opacity: 0 }}
              whileInView={{ rotateY: 0, x: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ ...hit, stiffness: 240, damping: 24, delay: 0.08 }}
            >
              <h3>Pro</h3>
              <p className="nx-price"><Peso minor={PRICES_MINOR.pro.monthly} /><span>/month</span></p>
              <ul>
                <li><Check size={16} /> Up to {pro.cards} cards</li>
                <li><Check size={16} /> Unlimited leads, CSV export</li>
                <li><Check size={16} /> A year of insights</li>
                <li><Check size={16} /> Up to {pro.portfolioImages} portfolio photos per card</li>
                <li><Check size={16} /> Branding removable</li>
              </ul>
              <a className="nx-btn nx-btn-line" href="/pricing">See plans and prices <ArrowUpRight size={16} aria-hidden="true" /></a>
            </motion.article>
            <motion.article
              className="nx-plan"
              initial={{ rotateY: -50, x: 120, opacity: 0 }}
              whileInView={{ rotateY: 0, x: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ ...hit, stiffness: 240, damping: 24, delay: 0.16 }}
            >
              <h3>Teams</h3>
              <p className="nx-price"><Peso minor={TEAMS_PLAN.priceMinor} /><span>/month for each team</span></p>
              <ul>
                <li><Check size={16} /> {TEAMS_PLAN.seats} seats included</li>
                <li><Check size={16} /> Company cards managed in one place</li>
                <li><Check size={16} /> Shared branding, locked company details</li>
                <li><Check size={16} /> Team contacts and team analytics</li>
                <li><Check size={16} /> Event pages with RSVP and check-in</li>
              </ul>
              <a className="nx-btn nx-btn-line" href="/app/team">Start a team <ArrowRight size={16} aria-hidden="true" /></a>
            </motion.article>
          </div>
          <Compare />
          <p className="nx-teams">Teams is paid by the team's owner, one month at a time, and is separate from your own Free or Pro plan. If a team's plan ends, nothing is deleted.</p>
        </section>

        <section className="nx-final" aria-labelledby="final-title">
          <LoopVideo playWhenReduced className="nx-final-video" src={landingMedia.cardsLoop} fallback={<img className="nx-stage-poster" src={landingMedia.cardsPoster} alt="" loading="lazy" decoding="async" />} />
          <div className="nx-final-veil" aria-hidden="true" />
          <motion.h2
            id="final-title"
            initial={{ scale: 2.4, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-20% 0px" }}
            transition={{ ...hit, stiffness: 300, damping: 24 }}
          >
            Make yours. <em>Free.</em>
          </motion.h2>
          <p>Next time someone asks how to reach you, send them your page.</p>
          <button type="button" className="nx-btn nx-btn-gold nx-btn-xl" onClick={primary}>{cta} <ArrowUpRight size={18} /></button>
        </section>
      </main>

      <footer className="nx-footer">
        <a className="brand-lockup" href="/" aria-label="heyitsme home"><BrandMark /><span>heyitsme</span></a>
        <span>Start free</span>
        <LegalLinks className="legal-links-dark" />
      </footer>
    </div>
  );
}
