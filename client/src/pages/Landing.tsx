import { useAuth } from "@/_core/hooks/useAuth";
import { LoopVideo } from "@/components/LoopVideo";
import { ShareDemo } from "@/components/ShareDemo";
import { startGoogleLogin } from "@/const";
import { landingMedia } from "@/lib/media";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Download,
  FileSpreadsheet,
  Link2,
  MessageCircle,
  Palette,
  PenLine,
  QrCode,
  Quote,
  Send,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CardVisual, TiltCard, themeOptions, type CardDraft } from "./Home";

const demoCard: CardDraft = {
  id: -1,
  displayName: "Alex Morgan",
  title: "Creative director",
  company: "Studio North",
  email: "hello@studionorth.co",
  phone: "",
  location: "San Francisco, CA",
  bio: "I help small teams find the one sentence that makes their brand click.",
  links: JSON.stringify(["studionorth.co"]),
  portfolio: "[]",
  channels: "[]",
  theme: "midnight",
  avatarUrl: "",
  coverUrl: "",
  slug: "alex-morgan",
  published: true,
};

const channels = ["LinkedIn", "Instagram", "WhatsApp", "Telegram", "Viber", "Signal", "Calendly", "Facebook", "X"];

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
  return (
    <>
      {words.map((word, index) => (
        <span className="lp-word" key={`${word}-${index}`}>
          <motion.span
            initial={{ y: "115%", rotate: 7 }}
            animate={{ y: "0%", rotate: 0 }}
            transition={{ type: "spring", stiffness: 110, damping: 16, delay: delay + index * 0.08 }}
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
        <ShareDemo />
      </motion.div>
    </section>
  );
}

const reveal = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 20 } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };

function HeroStage({ theme }: { theme: string }) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const backRotate = useTransform(scrollY, [0, 600], [-9, reduceMotion ? -9 : -22]);
  const backX = useTransform(scrollY, [0, 600], [0, reduceMotion ? 0 : -60]);
  const frontY = useTransform(scrollY, [0, 600], [0, reduceMotion ? 0 : -70]);
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
      <div className="lp-rings" aria-hidden="true"><i /><i /><i /></div>
      <motion.div className="lp-stage-back" style={{ rotate: backRotate, x: backX }} aria-hidden="true">
        <CardVisual card={{ ...demoCard, theme: theme === "sunset" ? "tide" : "sunset", displayName: "Mina Park", title: "Founder", company: "Field Notes" }} compact />
      </motion.div>
      <motion.div
        className="lp-stage-front"
        style={{ y: frontY }}
        initial={{ opacity: 0, y: 80, rotate: 8 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.25 }}
      >
        <TiltCard><CardVisual card={{ ...demoCard, theme }} /></TiltCard>
      </motion.div>
      <div className="lp-chip-slot" aria-live="polite">
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
        initial={{ opacity: 0, scale: 0.6, rotate: -14 }}
        animate={{ opacity: 1, scale: 1, rotate: 6 }}
        transition={{ type: "spring", stiffness: 160, damping: 12, delay: 0.7 }}
        aria-hidden="true"
      >
        <QrCode size={30} />
        <small>scan me</small>
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [theme, setTheme] = useState("midnight");
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });
  const howRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = "heyitsme — your introduction, one link away";
  }, []);

  const start = () => navigate("/app/cards/new");
  const openApp = () => navigate("/app");

  return (
    <div className="lp">
      <motion.div className="lp-progress" style={{ scaleX: progress }} aria-hidden="true" />
      <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="ambient ambient-three" />

      <header className="lp-nav">
        <a className="brand-lockup" href="/"><span className="brand-mark"><span /></span><span>heyitsme</span></a>
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
              <motion.button whileTap={{ scale: 0.95 }} className="lp-btn lp-btn-dark" onClick={start}>Make your card</motion.button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <motion.div className="lp-hero-copy" initial="hidden" animate="show" variants={stagger}>
            <motion.span className="lp-pill" variants={reveal}><Sparkles size={13} /> Free for everyone · No app to install</motion.span>
            <h1 className="lp-kinetic">
              <span className="sr-only">Your introduction, one link away.</span>
              <span aria-hidden="true">
                <KineticLine words={["Your", "introduction,"]} delay={0.1} />
                <br />
                <em><KineticLine words={["one", "link", "away."]} delay={0.32} /></em>
              </span>
            </h1>
            <motion.p className="lp-lede" variants={reveal}>
              heyitsme turns your name, your work, and the ways to reach you into a personal page. People open it from a QR code or a link, save you in one tap, and send their details back.
            </motion.p>
            <motion.div className="lp-hero-actions" variants={reveal}>
              <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} className="lp-btn lp-btn-primary" onClick={start}>
                Create your page <ArrowRight size={16} />
              </motion.button>
              <button className="lp-btn lp-btn-ghost" onClick={() => howRef.current?.scrollIntoView({ behavior: "smooth" })}>See how it works</button>
            </motion.div>
            <motion.p className="lp-micro" variants={reveal}>Try it in preview mode. Sign in with Google when you’re ready to publish.</motion.p>
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
        </section>

        <section className="lp-marquee" aria-label="Supported channels">
          <span className="lp-marquee-label">Link the places you already talk</span>
          <div className="lp-marquee-track">
            <div className="lp-marquee-row">
              {[...channels, ...channels].map((name, index) => <span key={`${name}-${index}`} aria-hidden={index >= channels.length}>{name}<i /></span>)}
            </div>
          </div>
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
            <motion.article className="lp-tile lp-tile-wide lp-tile-share" variants={reveal}>
              <div>
                <QrCode size={20} />
                <h3>Share it your way</h3>
                <p>A QR code, a personal link, and SMS and email helpers.</p>
              </div>
              <div className="lp-share-pills" aria-hidden="true">
                <span><QrCode size={13} /> QR code</span>
                <span><Link2 size={13} /> heyitsme/c/you</span>
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

        <motion.section id="free" className="lp-free" initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ type: "spring", stiffness: 80, damping: 18 }}>
          <div>
            <span className="section-kicker">Pricing</span>
            <h2>Everything is free.<br /><em>No plans. No limits.</em></h2>
            <p>No trial, no upgrade screen, no card on file. Every feature is included.</p>
          </div>
          <ul>
            {["Unlimited cards", "Portfolio uploads", "Client references", "QR and share helpers", "Contact exchange", "CSV export"].map((item, index) => (
              <motion.li key={item} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 + index * 0.06 }}>
                <Check size={15} /> {item}
              </motion.li>
            ))}
          </ul>
        </motion.section>

        <section className="lp-final">
          <LoopVideo className="lp-final-video" src={landingMedia.finalLoop} />
          <div className="lp-final-veil" aria-hidden="true" />
          <motion.h2 initial={{ opacity: 0, scale: 0.94 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 100, damping: 16 }}>
            Next time someone asks<br /><em>“how do I reach you?”</em>
          </motion.h2>
          <p>Send them your page.</p>
          <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} className="lp-btn lp-btn-primary" onClick={isAuthenticated ? openApp : start}>
            {isAuthenticated ? "Open my cards" : "Create your page"} <ArrowUpRight size={16} />
          </motion.button>
        </section>
      </main>

      <footer className="lp-footer">
        <a className="brand-lockup" href="/"><span className="brand-mark"><span /></span><span>heyitsme</span></a>
        <span>Free for everyone</span>
      </footer>
    </div>
  );
}
