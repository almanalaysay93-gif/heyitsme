import { useAuth } from "@/_core/hooks/useAuth";
import { BrandMark } from "@/components/BrandMark";
import { LoopVideo } from "@/components/LoopVideo";
import { VelocityMarquee } from "@/components/VelocityMarquee";
import { startGoogleLogin } from "@/const";
import { landingMedia } from "@/lib/media";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  Download,
  FileSpreadsheet,
  Link2,
  Mail,
  Menu,
  MessageCircle,
  Palette,
  PenLine,
  QrCode,
  Quote,
  Send,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation } from "wouter";
import { CardVisual, TiltCard } from "@/components/CardVisual";
import { LegalLinks } from "@/components/LegalLinks";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePageMeta } from "@/hooks/usePageMeta";
import { themeOptions, type CardDraft } from "@/lib/card";
import { formatPeso, PLAN_LIMITS, PRICES_MINOR } from "@shared/plans";
import "./landing3d.css";

const ShareDemo = lazy(() => import("@/components/ShareDemo").then((m) => ({ default: m.ShareDemo })));

const demoCard: CardDraft = {
  id: -1,
  displayName: "Alex Morgan",
  title: "Creative director",
  company: "Studio North",
  email: "alex@example.com",
  phone: "+1 555-0100",
  location: "San Francisco, CA",
  bio: "I help small teams find the one sentence that makes their brand click.",
  links: JSON.stringify(["https://heyitsme.fyi"]),
  portfolio: "[]",
  channels: "[]",
  theme: "midnight",
  avatarUrl: "",
  coverUrl: "",
  backgroundUrl: "",
  slug: "demo",
  published: true,
  contactHeading: "",
  galleryHeading: "",
  portfolioHeading: "",
};

const channels = ["LinkedIn", "Instagram", "WhatsApp", "Telegram", "Viber", "Signal", "Calendly", "Facebook", "X"];
const actions = ["Save contact", "Scan the code", "Tap to call", "Book a time", "Send a DM", "Swap details", "Share your page"];

const steps = [
  { icon: PenLine, art: "build", video: landingMedia.stepBuild, title: "Build your page", copy: "Name, role, a little context, a photo. Add work, links, and the channels you actually answer." },
  { icon: Send, art: "share", video: landingMedia.stepShare, title: "Share it anywhere", copy: "A QR code for the room, a link for the chat, SMS and email helpers for everything else." },
  { icon: UserRoundPlus, art: "keep", video: landingMedia.stepKeep, title: "Keep the good ones close", copy: "People save your contact in one tap — or send theirs back. It all lands in your contact list." },
] as const;

// Looping code-made art each step shows until (or instead of) its Flow clip.
function StepArt({ kind }: { kind: (typeof steps)[number]["art"] }) {
  if (kind === "build") {
    return <div className="art art-build"><span className="art-avatar" /><i /><i /><i /><b /></div>;
  }
  if (kind === "share") {
    return <div className="art art-share"><i /><i /><i /><span><QrCode size={26} /></span></div>;
  }
  return <div className="art art-keep"><i><Check size={11} /></i><i><Check size={11} /></i><i><Check size={11} /></i></div>;
}

function KineticLine({ words, delay = 0 }: { words: string[]; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <>
      {words.map((word, index) => (
        <span className="lp-word" key={`${word}-${index}`}>
          <motion.span
            initial={reduceMotion ? false : { y: "45%", rotate: 4 }}
            animate={reduceMotion ? undefined : { y: "0%", rotate: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1], delay: delay + index * 0.025 }}
          >
            {word}
          </motion.span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

function FilmSection() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [nearView, setNearView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduceMotion ? 1 : 0.86, 1]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduceMotion ? 0 : 16, 0]);
  const radius = useTransform(scrollYProgress, [0, 1], [64, 32]);
  return (
    <section ref={ref} id="film" className="lp-film-section" aria-labelledby="film-title">
      <motion.div className="lp-section-head lp-film-head" initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
        <motion.span className="section-kicker" variants={reveal}>In motion</motion.span>
        <motion.h2 id="film-title" variants={reveal}>The whole hello, <em>in ten seconds.</em></motion.h2>
      </motion.div>
      <motion.div className="lp-film" style={{ scale, rotateX, borderRadius: radius }}>
        <LoopVideo className="lp-film-backdrop" src={landingMedia.filmBackdrop} fallback={<div className="lp-aurora"><i /><i /><i /></div>} />
        <div className="lp-film-veil" aria-hidden="true" />
        {nearView ? (
          <Suspense fallback={<div className="sd-placeholder" aria-hidden="true" />}>
            <ShareDemo />
          </Suspense>
        ) : (
          <div className="sd-placeholder" aria-hidden="true" />
        )}
      </motion.div>
    </section>
  );
}

const reveal = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 20 } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.055 } } };

function HeroStage({ theme }: { theme: string }) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const backY = useTransform(scrollY, [0, 600], [0, reduceMotion ? 0 : -110]);
  const frontY = useTransform(scrollY, [0, 600], [0, reduceMotion ? 0 : -75]);
  const [chip, setChip] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => setChip((value) => (value + 1) % 3), 2600);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);
  const chips = [
    { icon: Download, text: "Saved to contacts" },
    { icon: UserRoundPlus, text: "Jordan sent their details" },
    { icon: QrCode, text: "Opened from a QR scan" },
  ];
  const ChipIcon = chips[chip].icon;
  return (
    <div className="lp-stage">
      <div className="lp-stage-halo" aria-hidden="true"><i /><i /><i /></div>
      <div className="lp-stage-grid" aria-hidden="true" />
      <motion.div
        className="lp-stage-back"
        style={{ y: backY }}
        initial={reduceMotion ? false : { opacity: 0, x: 110, rotateY: -48, rotateZ: 24, scale: 0.76 }}
        animate={{ opacity: 1, x: 0, rotateY: -23, rotateZ: 17, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        aria-hidden="true"
      >
        <CardVisual card={{ ...demoCard, theme: theme === "sunset" ? "tide" : "sunset", displayName: "Mina Park", title: "Founder", company: "Field Notes" }} compact />
      </motion.div>
      <div className="lp-stage-edge" aria-hidden="true" />
      <motion.div
        className="lp-stage-front"
        style={{ y: frontY }}
        initial={reduceMotion ? false : { opacity: 0, x: 180, rotateY: -55, rotateX: 19, rotateZ: 12, scale: 0.7 }}
        animate={{ opacity: 1, x: 0, rotateY: -12, rotateX: 7, rotateZ: -6, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 26, delay: 0.04 }}
      >
        <TiltCard><CardVisual card={{ ...demoCard, theme }} /></TiltCard>
      </motion.div>
      <div className="lp-chip-slot" aria-hidden="true">
        <AnimatePresence mode="wait">
          <motion.div
            key={chip}
            className="lp-chip"
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
          >
            <span><ChipIcon size={14} /></span>
            {chips[chip].text}
          </motion.div>
        </AnimatePresence>
      </div>
      <motion.div
        className="lp-qr-float"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.6, rotate: -18 }}
        animate={{ opacity: 1, scale: 1, rotate: 9 }}
        transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.08 }}
        aria-hidden="true"
      >
        <QRCodeSVG value="https://heyitsme.fyi/c/demo" size={74} marginSize={0} />
        <small>Scan the demo</small>
      </motion.div>
      <span className="lp-stage-label" aria-hidden="true">HEYITSME / DIGITAL PRESENCE / 001</span>
    </div>
  );
}

export default function Landing() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [theme, setTheme] = useState("midnight");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });
  const howRef = useRef<HTMLElement>(null);

  usePageMeta({ title: "Free Digital Business Card with QR Code | heyitsme", canonicalPath: "/" });

  const start = () => navigate("/app/cards/new");
  const openApp = () => navigate("/app");

  return (
    <div className="lp">
      <motion.div className="lp-progress" style={{ scaleX: progress }} aria-hidden="true" />
      <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="ambient ambient-three" />

      <header className="lp-nav">
        <a className="brand-lockup" href="/"><BrandMark /><span>heyitsme</span></a>
        <nav className="lp-nav-links" aria-label="Page sections">
          <a href="#film">See it</a>
          <a href="#how">How it works</a>
          <a href="#inside">What’s inside</a>
          <a href="#free">Pricing</a>
        </nav>
        <div className="lp-nav-actions">
          {isAuthenticated ? (
            <motion.button whileTap={{ scale: 0.95 }} className="lp-btn lp-btn-dark" onClick={openApp}>Open my cards <ArrowRight size={15} /></motion.button>
          ) : (
            <>
              <button className="lp-signin" onClick={startGoogleLogin}>Sign in</button>
              <motion.button whileTap={{ scale: 0.95 }} className="lp-btn lp-btn-dark" onClick={start}>Create your card</motion.button>
            </>
          )}

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="lp-mobile-menu-trigger"
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="lp-mobile-menu"
              >
                <Menu size={18} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" id="lp-mobile-menu" className="lp-mobile-sheet-content">
              <div>
                <SheetHeader>
                  <SheetTitle className="brand-lockup" style={{ fontSize: "16px", marginBottom: "8px" }}>
                    <BrandMark />
                    <span>heyitsme</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="lp-mobile-links" aria-label="Mobile page sections">
                  <a href="#film" onClick={() => setMobileMenuOpen(false)}>See it</a>
                  <a href="#how" onClick={() => setMobileMenuOpen(false)}>How it works</a>
                  <a href="#inside" onClick={() => setMobileMenuOpen(false)}>What’s inside</a>
                  <a href="#free" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
                </nav>
                <div className="lp-mobile-actions">
                  {isAuthenticated ? (
                    <button
                      type="button"
                      className="lp-btn lp-btn-dark lp-mobile-cta"
                      onClick={() => { setMobileMenuOpen(false); openApp(); }}
                    >
                      Open my cards <ArrowRight size={15} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="lp-mobile-signin"
                        onClick={() => { setMobileMenuOpen(false); startGoogleLogin(); }}
                      >
                        Sign in
                      </button>
                      <button
                        type="button"
                        className="lp-btn lp-btn-dark lp-mobile-cta"
                        onClick={() => { setMobileMenuOpen(false); start(); }}
                      >
                        Create your card <ArrowRight size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ paddingTop: "20px", borderTop: "1px solid var(--line)" }}>
                <LegalLinks />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="lp-hero" aria-label="Create your digital business card">
          <LoopVideo className="lp-hero-video" src={landingMedia.heroLoop} lazy={false} fallback={<div className="lp-hero-poster" />} />
          <div className="lp-hero-scrim" aria-hidden="true" />
          <div className="lp-hero-grid">
          <motion.div className="lp-hero-copy" initial={reduceMotion ? false : "hidden"} animate="show" variants={stagger}>
            <motion.span className="lp-pill" variants={reveal}><Sparkles size={13} /> Digital business card / Free to start</motion.span>
            <h1 className="lp-kinetic">
              <span className="sr-only">Meet once. Stay in touch.</span>
              <span aria-hidden="true">
                <KineticLine words={["Meet", "once."]} delay={0.02} />
                <br />
                <em><KineticLine words={["Stay", "in", "touch."]} delay={0.1} /></em>
              </span>
            </h1>
            <motion.p className="lp-lede" variants={reveal}>
              Your name, work, and ways to connect in one striking page. Share a QR code or link. They save your contact in one tap and can send theirs back.
            </motion.p>
            <motion.div className="lp-hero-actions" variants={reveal}>
              <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} className="lp-btn lp-btn-primary" onClick={start}>
                Create your card <ArrowRight size={16} />
              </motion.button>
              <a className="lp-btn lp-btn-ghost" href="/c/demo" style={{ display: "inline-flex", alignItems: "center" }}>
                View demo card
              </a>
            </motion.div>
            <motion.p className="lp-micro" variants={reveal}>Build in preview mode. Sign in with Google to publish.</motion.p>
            <motion.div className="lp-theme-row" variants={reveal} role="radiogroup" aria-label="Preview card theme">
              <span>Try a palette</span>
              {themeOptions.map((option) => (
                <button
                  key={option.id}
                  role="radio"
                  aria-checked={theme === option.id}
                  aria-label={option.label}
                  className={`lp-swatch ${theme === option.id ? "is-active" : ""}`}
                  style={{ background: `linear-gradient(135deg, ${option.colors[0]}, ${option.colors[1]})` }}
                  onClick={() => setTheme(option.id)}
                />
              ))}
            </motion.div>
          </motion.div>
          <HeroStage theme={theme} />
          </div>
          <div className="lp-hero-footer" aria-hidden="true"><span>01 / INTRODUCE</span><span>THE NEXT HELLO STARTS HERE</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>

        <section className="lp-marquee" aria-label="Supported channels">
          <span className="lp-marquee-label">Link the places you already talk</span>
          <VelocityMarquee speed={3.2}>
            {channels.map((name) => <span key={name}>{name}<i /></span>)}
          </VelocityMarquee>
          <VelocityMarquee speed={-2.4} className="lp-marquee-alt">
            {actions.map((name) => <span key={name}>{name}<i /></span>)}
          </VelocityMarquee>
        </section>

        <FilmSection />

        <motion.section id="how" ref={howRef} className="lp-section lp-how" initial="hidden" whileInView="show" viewport={{ once: true, margin: "-120px" }} variants={stagger}>
          <motion.div className="lp-section-head" variants={reveal}>
            <span className="section-kicker">How it works</span>
            <h2>Three steps. <em>Zero awkward handoffs.</em></h2>
          </motion.div>
          <div className="lp-steps">
            {steps.map((step, index) => (
              <motion.article key={step.title} className="lp-step" variants={reveal} whileHover={{ y: -8 }}>
                <LoopVideo className="lp-step-media" src={step.video} fallback={<StepArt kind={step.art} />} />
                <span className="lp-step-num">0{index + 1}</span>
                <span className="lp-step-icon"><step.icon size={20} /></span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </motion.article>
            ))}
          </div>
        </motion.section>

        <motion.section id="inside" className="lp-section" initial="hidden" whileInView="show" viewport={{ once: true, margin: "-120px" }} variants={stagger}>
          <motion.div className="lp-section-head" variants={reveal}>
            <span className="section-kicker">What’s inside</span>
            <h2>More than a card. <em>A little home page.</em></h2>
          </motion.div>
          <div className="lp-bento">
            <motion.article className="lp-tile lp-tile-wide lp-tile-work" variants={reveal}>
              <BriefcaseBusiness size={20} />
              <h3>Show the work</h3>
              <p>Images, videos, PDFs, and project links sit right under your name.</p>
              <div className="lp-work-strip" aria-hidden="true"><i /><i /><i /><i /></div>
            </motion.article>
            <motion.article className="lp-tile lp-tile-ink" variants={reveal}>
              <Quote size={20} />
              <h3>Kind words</h3>
              <p>Add quotes from past clients. Proof, in their words.</p>
            </motion.article>
            <motion.article className="lp-tile" variants={reveal}>
              <Download size={20} />
              <h3>Save in one tap</h3>
              <p>Visitors download your contact as a .vcf file that opens straight into their phone’s contacts.</p>
            </motion.article>
            <motion.article className="lp-tile" variants={reveal}>
              <MessageCircle size={20} />
              <h3>Every channel</h3>
              <p>LinkedIn, WhatsApp, Telegram, Viber, Signal, Calendly and more, as tappable buttons.</p>
            </motion.article>
            <motion.article className="lp-tile lp-tile-aqua" variants={reveal}>
              <FileSpreadsheet size={20} />
              <h3>Contacts that stick</h3>
              <p>Exchanged details land in a searchable list. Export to CSV whenever you like.</p>
            </motion.article>
            <motion.article className="lp-tile" variants={reveal}>
              <BarChart3 size={20} />
              <h3>See what gets tapped</h3>
              <p>Track page views, contact saves, and link taps in aggregate. Zero third-party trackers.</p>
            </motion.article>
            <motion.article className="lp-tile" variants={reveal}>
              <Mail size={20} />
              <h3>Email signatures</h3>
              <p>Generate clean HTML and rich text email signatures that link directly to your card.</p>
            </motion.article>
            <motion.article className="lp-tile lp-tile-wide lp-tile-share" variants={reveal}>
              <div>
                <QrCode size={20} />
                <h3>Share it your way</h3>
                <p>A QR code, a personal link, and SMS and email helpers.</p>
              </div>
              <div className="lp-share-pills" aria-hidden="true">
                <span><QrCode size={13} /> QR code</span>
                <span><Link2 size={13} /> heyitsme.fyi/c/demo</span>
                <span><Send size={13} /> SMS · Email</span>
              </div>
            </motion.article>
            <motion.article className="lp-tile lp-tile-coral" variants={reveal}>
              <Palette size={20} />
              <h3>Your palette</h3>
              <p>Midnight, Tide, or Sunset. Pick the one that fits this chapter.</p>
            </motion.article>
          </div>
        </motion.section>

        <motion.section id="free" className="lp-free" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ type: "spring", stiffness: 180, damping: 24 }}>
          <div>
            <span className="section-kicker">Pricing</span>
            <h2>Start free.<br /><em>Upgrade when it pays.</em></h2>
            <p>Start free. Upgrade when networking starts creating opportunities. Your card, QR code and link never expire.</p>
            <a className="lp-free-link" href="/pricing">See plans and prices <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
          <ul>
            {[
              "Free: one card, QR code and NFC-ready link",
              "Free: 10 new leads a month, 7 days of insights",
              `Pro ${formatPeso(PRICES_MINOR.pro.monthly)}/month`,
              `Pro: up to ${PLAN_LIMITS.pro.cards} cards and unlimited leads`,
              "Pro: a year of insights, branding removable",
              "Teams: one brand across your whole team, coming soon",
            ].map((item, index) => (
              <motion.li key={item} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 + index * 0.06 }}>
                <Check size={15} /> {item}
              </motion.li>
            ))}
          </ul>
        </motion.section>

        <section className="lp-final">
          <LoopVideo className="lp-final-video" src={landingMedia.finalLoop} />
          <div className="lp-final-veil" aria-hidden="true" />
          <motion.h2 initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 200, damping: 24 }}>
            Next time someone asks<br /><em>“how do I reach you?”</em>
          </motion.h2>
          <p>Send them your page.</p>
          <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} className="lp-btn lp-btn-primary" onClick={isAuthenticated ? openApp : start}>
            {isAuthenticated ? "Open my cards" : "Create your card"} <ArrowUpRight size={16} />
          </motion.button>
        </section>
      </main>

      <footer className="lp-footer">
        <a className="brand-lockup" href="/"><BrandMark /><span>heyitsme</span></a>
        <span>Start free</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
