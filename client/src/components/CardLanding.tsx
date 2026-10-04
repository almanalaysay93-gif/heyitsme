import { phoneHref } from "@shared/phone";
import { isValidEmail, normalizeWebsiteUrl } from "@shared/cardValidation";
import { BrandMark } from "@/components/BrandMark";
import { GalleryLightbox } from "@/components/GalleryLightbox";
import { LegalLinks } from "@/components/LegalLinks";
import { LoopVideo, isVideoUrl } from "@/components/LoopVideo";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import {
  channelHref,
  channelLabel,
  parseChannels,
  parseLinks,
  parsePortfolio,
  splitHeading,
  toHref,
  websiteShotFrom,
  websiteShotRequest,
  type CardDraft,
  type ChannelItem,
  type PortfolioItem,
  type ReferenceRow,
} from "@/lib/card";
import { copyToClipboard, getInitials } from "@/lib/cardKit";
import { contrastRatio, mapLink, parsePageConfig, readableOn, resolveFrame, resolveSections, type PageConfig, type SectionId } from "@shared/pageConfig";
import { CountUp, GlassPanel, useHeroEntrance, useHeroParallax, useMotionOn, usePressProps } from "./cardMotion";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowUpRight,
  Copy,
  Download,
  Facebook,
  FileText,
  Globe2,
  Instagram,
  Link2,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  CalendarDays,
  UserRoundPlus,
} from "lucide-react";
import type { CardTeamExtras } from "@shared/teamKit";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import "./cardLanding.css";
import { fontStack, renderedBackground } from "@shared/design";
import { QrPreview } from "./QrPreview";
import { ReviewForm, type ReviewInput } from "./ReviewForm";
import "./proDesign.css";
import "./proFonts.css";

// Paper, ink and a default accent per palette. Accents here pass 4.5:1 on their paper.
const PALETTES: Record<string, { paper: string; accent: string }> = {
  midnight: { paper: "#0b0c18", accent: "#5446e6" },
  tide: { paper: "#eef5f3", accent: "#0e7469" },
  sunset: { paper: "#f9f1ee", accent: "#a8432f" },
};
const INK: Record<string, string> = { midnight: "#f2f1fb", tide: "#0b2a2d", sunset: "#2b1b22" };

/** The accent a palette uses when the owner has not picked one. */
export function themeAccent(theme: string): string {
  return (PALETTES[theme] ?? PALETTES.midnight).accent;
}

type Track = (type: "vcard" | "link" | "share", target?: string) => void;

export type CardLandingProps = {
  card: CardDraft;
  config: PageConfig;
  references: ReferenceRow[];
  googleReview?: { slug: string; businessName?: string | null; rating?: string | null; reviewCount?: number | null; showOnCard?: boolean } | null;
  /** false = builder preview: no nav, dock, QR or motion, and nothing inside can be focused or clicked. */
  interactive: boolean;
  canExchange: boolean;
  /** False when the owner's free lead quota is used up: the page drops the exchange form and keeps direct contact. */
  acceptsDetails?: boolean;
  pageUrl: string;
  onSaveContact: () => void;
  onExchange: () => void;
  onShare: () => void;
  shareLabel?: string;
  onCopyLink: () => void;
  /** Demo card only: booking and phone actions explain themselves instead of leaving the page. */
  onDemoAction?: (kind: "booking" | "phone" | "link") => void;
  /** Sends a visitor's review to the owner. Business and Services cards only; without it no review form shows. */
  onReview?: (review: ReviewInput) => Promise<void>;
  track: Track;
  /** Company cards only: the banners running now and the files the company approved for this card. */
  team?: CardTeamExtras | null;
};

function ChannelIcon({ provider }: { provider: string }) {
  if (provider === "linkedin") return <Linkedin size={16} />;
  if (provider === "instagram") return <Instagram size={16} />;
  if (provider === "facebook") return <Facebook size={16} />;
  if (provider === "telegram") return <Send size={16} />;
  if (provider === "viber") return <Phone size={16} />;
  if (provider === "signal") return <ShieldCheck size={16} />;
  if (provider === "calendly") return <CalendarDays size={16} />;
  if (provider === "whatsapp") return <MessageCircle size={16} />;
  return <Link2 size={16} />;
}

const PROVIDER_NAMES: Record<string, string> = {
  linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", x: "X", whatsapp: "WhatsApp",
  telegram: "Telegram", viber: "Viber", signal: "Signal", calendly: "Calendly", tiktok: "TikTok", youtube: "YouTube",
};
const MESSAGING = new Set(["whatsapp", "telegram", "viber", "signal", "calendly"]);

function providerName(provider: string) {
  return PROVIDER_NAMES[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** What goes under the provider name: the owner's label, else the number or link without its scheme. */
function channelValue(channel: ChannelItem) {
  const label = channel.label?.trim();
  if (label && label.toLowerCase() !== providerName(channel.provider).toLowerCase()) return label;
  return (channel.url || "").replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "").replace(/^www\./, "").replace(/\/$/, "") || providerName(channel.provider);
}

function external(href: string) {
  return /^https?:/i.test(href) ? { target: "_blank", rel: "noreferrer" } : {};
}

/** A website tile: the plain tile until a screenshot of the site loads, and for good if it can't be shown. */
function WebsiteShot({ request, title }: { request: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSrc(null); setFallback(null); setReady(false);
    const controller = new AbortController();
    fetch(request, { signal: controller.signal })
      .then((response) => response.json())
      .then((answer) => { if (active) {
        const image = answer?.data?.image?.url;
        const backup = typeof image === "string" && image.startsWith("https://") ? image : null;
        setFallback(backup); setSrc(websiteShotFrom(answer) || backup);
      } })
      .catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [request]);
  return (
    <div className="lx-work-media lx-work-file">
      <Globe2 size={22} aria-hidden="true" />
      {!ready ? <span className="lx-website-placeholder">{title}<small>Website preview</small></span> : null}
      {src ? <img src={src} alt={`Screenshot of ${title}`} className={ready ? "is-ready" : undefined} onLoad={() => setReady(true)} onError={() => { setReady(false); setSrc(src !== fallback ? fallback : null); }} /> : null}
    </div>
  );
}

export function CardLanding(props: CardLandingProps) {
  const { card, config, references, googleReview, interactive, canExchange, pageUrl, onSaveContact, onExchange, onShare, onCopyLink, track, onDemoAction, onReview } = props;
  // Only the form depends on the quota. Save contact, QR and links always work.
  const showExchange = canExchange && props.acceptsDetails !== false;
  const branded = !config.hideBranding;
  // On the demo, placeholder links and the fictional phone number open an explanation, not a blank tab or a call.
  const demoClick = (kind: "booking" | "phone" | "link") =>
    onDemoAction ? (event: { preventDefault: () => void }) => { event.preventDefault(); onDemoAction(kind); } : undefined;
  const design = config.design;
  const motionEnabled =
    !design ||
    (design.animation.preset !== "none" &&
      design.animation.intensity !== "off");
  const motionOn = useMotionOn(interactive && motionEnabled);
  const enter = useHeroEntrance(interactive && motionEnabled && !design) as (
    step: "eyebrow" | "name" | "lead" | "actions" | "photo"
  ) => any;

  const press = usePressProps(interactive) as any;
  const rootRef = useRef<HTMLDivElement>(null);
  // The phone dock repeats the hero buttons, so it stays away until those have scrolled off the top.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [dockShown, setDockShown] = useState(false);
  useEffect(() => {
    const node = actionsRef.current;
    if (!interactive || !node) return;
    if (typeof IntersectionObserver === "undefined") { setDockShown(true); return; }
    const observer = new IntersectionObserver(([entry]) => setDockShown(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, [interactive, config.template]);
  const heroRef = useRef<HTMLElement>(null);
  const parallax = useHeroParallax(
    heroRef,
    interactive && motionEnabled && !design
  );
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const play = () => setReplay(n => n + 1);
    window.addEventListener("replay-card-animation", play);
    return () => window.removeEventListener("replay-card-animation", play);
  }, []);
  useEffect(
    () => setReplay(n => n + 1),
    [design?.animation.preset, design?.animation.intensity]
  );

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const links = parseLinks(card.links).filter((link) => normalizeWebsiteUrl(link));
  const channels = parseChannels(card.channels);
  const portfolio = parsePortfolio(card.portfolio);
  const photos = portfolio.filter((item) => item.kind === "image");
  const works = portfolio.filter((item) => item.kind !== "image");

  const palette = PALETTES[card.theme] ?? PALETTES.midnight;
  const ink = design?.text ?? INK[card.theme] ?? INK.midnight;
  const accent = design?.accent ?? (config.accent || palette.accent);
  // A pale owner accent still works on buttons (text flips to dark); accent-colored text needs 4.5:1 or falls back to ink.
  const accentText =
    contrastRatio(accent, design?.colors[0] ?? palette.paper) >= 4.5
      ? accent
      : ink;
  const style: React.CSSProperties & Record<string, string> = {
    ...(design
      ? {
          "--design-background": renderedBackground(design),
          "--design-base": design.colors[0],
          "--design-ink": design.text,
          "--design-button": design.button,
          "--design-button-text": design.buttonText,
          "--design-heading": fontStack(design.headingFont ?? design.font),
          "--design-font": fontStack(design.font),
          "--design-radius":
            design.radius === "small"
              ? "8px"
              : design.radius === "medium"
                ? "16px"
                : "24px",
          ...(design.radius === "small"
            ? { "--radius-panel": "10px", "--radius-media": "8px" }
            : design.radius === "medium"
              ? { "--radius-panel": "18px", "--radius-media": "14px" }
              : {}),
        }
      : {}),
    ["--accent" as string]: accent,
    ["--on-accent" as string]: readableOn(accent),
    ["--accent-text" as string]: accentText,
  };

  const template = config.template;
  // Visitors can review a Business or Services card. The Professional page shows the owner's references only.
  const takesReviews = Boolean(interactive && onReview && template !== "professional");
  const address = config.address || card.location;
  // The builder preview sits inside the builder's own <main>: one main landmark per page.
  const MainTag = interactive ? "main" : "div";
  const firstName = card.displayName.split(" ")[0] || card.displayName;
  const cta = config.cta?.label && config.cta.url ? config.cta : null;

  const frame = resolveFrame(config);
  const { scrollY } = useScroll();
  const coverY = useTransform(scrollY, [0, 500], [0, 160]);
  const coverScale = useTransform(scrollY, [0, 500], [1, 1.12]);
  const coverFade = useTransform(scrollY, [0, 420], [1, 0.35]);
  const fitName = (text: string) => ({ ["--longest" as string]: Math.max(4, ...text.split(/\s+/).map((word) => word.length)) });

  // The aurora drifts only while the tab is visible; nothing moves in the builder preview or for reduced motion.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!motionOn) { root.style.setProperty("--aurora-play", "paused"); return; }
    const sync = () => root.style.setProperty("--aurora-play", document.hidden ? "paused" : "running");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [motionOn]);

  const contactRows = [
    card.email && isValidEmail(card.email) ? { key: "email", icon: Mail, label: "Email", value: card.email, href: `mailto:${encodeURIComponent(card.email)}`, copy: card.email, target: "Email" } : null,
    card.phone ? { key: "phone", icon: Phone, label: phoneHref(card.phone) ? "Call or text" : "Phone information (not dialable)", value: card.phone, href: phoneHref(card.phone) || "", copy: card.phone, target: "Phone" } : null,
    ...links.map((link) => {
      const value = link.replace(/^https?:\/\//, "").replace(/\/$/, "");
      // Insights groups website clicks by domain, so that stays the tracked target.
      return { key: `link-${link}`, icon: Globe2, label: "Website", value, href: toHref(link), copy: "", target: value.replace(/^www\./, "") };
    }),
  ].filter(Boolean) as { key: string; icon: any; label: string; value: string; href: string; copy: string; target: string }[];

  const hasContent: Record<SectionId, boolean> = {
    stats: config.stats.length > 0,
    services: config.services.length > 0,
    visit: config.hours.length > 0 || Boolean(address),
    portfolio: portfolio.length > 0,
    references: references.length > 0 || takesReviews || Boolean(googleReview && googleReview.showOnCard !== false),
    contact: contactRows.length > 0 || channels.length > 0,
    contactPersons: config.contactPersons.length > 0,
    resourceLinks: config.links.length > 0,
  };
  const sections = resolveSections(config).filter((section) => !section.hidden && hasContent[section.id]);

  // Plain headings by default; a heading the owner wrote keeps the italic last word they saw in the builder.
  const heading = (fallback: string, custom?: string | null) => {
    const own = custom?.trim() ? splitHeading(custom, "", "") : null;
    return (
      <header className="lx-section-head">
        <h2>{own ? <>{own.title} {own.emphasis ? <em>{own.emphasis}</em> : null}</> : fallback}</h2>
      </header>
    );
  };

  const actions = (
    <div className="lx-actions" ref={actionsRef}>
      {cta ? (
        <motion.a className="lx-btn lx-btn-primary" href={cta.url} {...external(cta.url)} onClick={demoClick("booking") ?? (() => track("link", `CTA: ${cta.label}`))} {...press}>
          {cta.label} <ArrowUpRight size={16} aria-hidden="true" />
        </motion.a>
      ) : null}
      <motion.button type="button" className={`lx-btn ${cta ? "lx-btn-ghost" : "lx-btn-primary"}`} onClick={onSaveContact} {...press}>
        <Download size={16} aria-hidden="true" /> Save contact
      </motion.button>
      {showExchange ? (
        <motion.button type="button" className="lx-btn lx-btn-ghost" onClick={onExchange} {...press}>
          <UserRoundPlus size={16} aria-hidden="true" /> Exchange details
        </motion.button>
      ) : null}
    </div>
  );

  const socials = channels.length && !resolveSections(config).find((section) => section.id === "contact")?.hidden ? (
    <div className="lx-socials">
      {channels.map((channel: ChannelItem, index: number) => (
        <a key={`${channel.provider}-${index}`} href={channelHref(channel)} target="_blank" rel="noreferrer" aria-label={`${providerName(channel.provider)}: ${channelValue(channel)}`} onClick={demoClick("link") ?? (() => track("link", channelLabel(channel)))}>
          <ChannelIcon provider={channel.provider} />
          <span>{providerName(channel.provider)}</span>
        </a>
      ))}
    </div>
  ) : null;

  // Parallax and entrance sit on separate elements so their transforms never fight.
  const portrait = () => (
    <motion.div className="lx-photo-wrap" style={parallax}>
      <motion.figure className={`lx-photo lx-frame-${frame}`} {...enter("photo")}>
        {card.avatarUrl ? <img src={card.avatarUrl} alt={card.displayName} /> : <span aria-hidden="true">{getInitials(card.displayName)}</span>}
      </motion.figure>
    </motion.div>
  );

  // Name and eyebrow float on the aurora; the bio and actions sit on one glass panel.
  const heroPanel = (children: ReactNode) => (
    <motion.div className="lx-glass lx-hero-panel" {...enter("lead")}>{children}</motion.div>
  );

  const cover = card.coverUrl ? (
    isVideoUrl(card.coverUrl) ? <LoopVideo className="lx-cover-media" src={card.coverUrl} lazy={false} fallback={null} /> : <img className="lx-cover-media" src={card.coverUrl} alt="" />
  ) : null;

  let hero: ReactNode;
  if (template === "business") {
    const brand = card.company || card.displayName;
    hero = (
      <>
        <section className="lx-hero lx-hero-business" ref={heroRef}>
          <motion.p className="lx-eyebrow" {...enter("eyebrow")}>
            {card.avatarUrl ? <img className="lx-logo" src={card.avatarUrl} alt="" /> : null}
            {address ? <a href={mapLink(address)} target="_blank" rel="noreferrer">{address}</a> : card.title}
          </motion.p>
          <motion.h1 className="lx-masthead" style={fitName(brand)} {...enter("name")}>{brand}</motion.h1>
          {heroPanel(
            <>
              {card.bio ? <p className="lx-lead">{card.bio}</p> : null}
              {actions}
              {card.company ? (
                <p className="lx-byline">
                  Ask for <strong>{card.displayName}</strong>{card.title ? `, ${card.title}` : ""}
                </p>
              ) : null}
              {socials}
            </>,
          )}
        </section>
      </>
    );
  } else if (template === "services") {
    hero = (
      <section className="lx-hero lx-hero-services" ref={heroRef}>
        <div className="lx-hero-copy">
          <motion.p className="lx-eyebrow" {...enter("eyebrow")}>
            {card.displayName}{config.headline && card.title ? ` · ${card.title}` : card.company ? ` · ${card.company}` : ""}
          </motion.p>
          <motion.h1 className="lx-masthead" style={fitName(config.headline || card.title || card.displayName)} {...enter("name")}>{config.headline || card.title || card.displayName}</motion.h1>
          {heroPanel(
            <>
              {card.bio ? <p className="lx-lead">{card.bio}</p> : null}
              {address ? <a className="lx-place" href={mapLink(address)} target="_blank" rel="noreferrer" onClick={() => track("link", "Directions")}><MapPin size={14} aria-hidden="true" /> {address}</a> : null}
              {actions}
              {socials}
            </>,
          )}
        </div>
        {portrait()}
      </section>
    );
  } else {
    hero = (
      <>
        <section className="lx-hero lx-hero-professional" ref={heroRef}>
          <div className="lx-hero-copy">
            <motion.p className="lx-eyebrow" {...enter("eyebrow")}>
              {card.title}{card.company ? <> <span>at</span> {card.company}</> : null}
            </motion.p>
            <motion.h1 className="lx-masthead" style={fitName(card.displayName)} {...enter("name")}>{card.displayName}</motion.h1>
            {heroPanel(
              <>
                {card.bio ? <p className="lx-lead">{card.bio}</p> : null}
                {address ? <a className="lx-place" href={mapLink(address)} target="_blank" rel="noreferrer" onClick={() => track("link", "Directions")}><MapPin size={14} aria-hidden="true" /> {address}</a> : null}
                {actions}
                {socials}
              </>,
            )}
          </div>
          {portrait()}
        </section>
      </>
    );
  }

  const renderSection = (id: SectionId): ReactNode => {
    switch (id) {
      case "stats":
        return (
          <dl className="lx-stats">
            {config.stats.map((stat, index) => (
              <div key={index}>
                <dt>{stat.label}</dt>
                <dd><CountUp value={stat.value} enabled={interactive} /></dd>
              </div>
            ))}
          </dl>
        );
      case "services":
        return (
          <>
            {heading(template === "services" ? "Services & prices" : "Services")}
            <ul className="lx-menu">
              {config.services.map((service, index) => (
                <li key={index}>
                  <div className="lx-menu-row">
                    <h3>{service.name}</h3>
                    <span className="lx-leader" aria-hidden="true" />
                    {service.price ? <span className="lx-price">{service.price}</span> : null}
                  </div>
                  {service.description ? <p>{service.description}</p> : null}
                  {service.url ? (
                    <a className="lx-menu-link" href={service.url} {...external(service.url)} onClick={demoClick("booking") ?? (() => track("link", `Service: ${service.name}`))}>
                      Book {service.name} <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        );
      case "visit":
        return (
          <>
            {heading(template === "business" ? "Visit us" : "Hours & location")}
            <div className="lx-visit">
              {config.hours.length ? (
                <dl className="lx-hours">
                  {config.hours.map((row, index) => (
                    <div key={index}><dt>{row.days}</dt><dd>{row.time}</dd></div>
                  ))}
                </dl>
              ) : null}
              {address ? (
                <div className="lx-address">
                  <p>{address}</p>
                  <a className="lx-text-link" href={mapLink(address)} target="_blank" rel="noreferrer" onClick={() => track("link", "Directions")}>
                    Get directions <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>
              ) : null}
            </div>
          </>
        );
      case "portfolio": {
        return (
          <>
            {photos.length ? (
              <div className="lx-gallery">
                {heading("Portfolio photos", card.galleryHeading)}
                <PhotoCarousel items={photos} onSelectPhoto={(index) => { setLightboxIndex(index); track("link", `Work: ${photos[index].title}`); }} />
              </div>
            ) : null}
            {works.length ? (
              <div>
                {heading("Portfolio projects", card.portfolioHeading)}
                <div className="lx-work-grid">
                  {works.map((item: PortfolioItem) => {
                    const href = toHref(item.url);
                    const shot = item.kind === "link" ? websiteShotRequest(item.url) : null;
                    return (
                      <a className="lx-work" key={item.id} {...(href === "#" ? {} : { href, target: "_blank", rel: "noreferrer", onClick: demoClick("link") ?? (() => track("link", `Work: ${item.title}`)) })}>
                        {item.kind === "video" ? (
                          <video className="lx-work-media" src={item.url} muted playsInline loop preload="metadata" onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
                        ) : shot && interactive ? (
                          <WebsiteShot request={shot} title={item.title} />
                        ) : (
                          <div className="lx-work-media lx-work-file">{item.kind === "file" ? <FileText size={22} aria-hidden="true" /> : <Globe2 size={22} aria-hidden="true" />}</div>
                        )}
                        <span className="lx-work-caption">
                          <strong>{item.title}</strong>
                          {item.description ? <small>{item.description}</small> : null}
                        </span>
                        <ArrowUpRight className="lx-work-arrow" size={16} aria-hidden="true" />
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        );
      }
      case "references":
        return (
          <>
            {heading(template === "professional" ? "Kind words" : "Client reviews", config.referencesHeading)}
            {references.length > 0 ? (
              <div className="lx-quotes">
                {references.map((reference) => (
                  <figure className="lx-quote" key={reference.id}>
                    {reference.rating ? (
                      <span className="lx-stars lx-quote-stars" style={{ "--fill": `${reference.rating * 20}%` } as React.CSSProperties} role="img" aria-label={`${reference.rating} out of 5 stars`}>★★★★★</span>
                    ) : null}
                    <blockquote>{reference.quote}</blockquote>
                    <figcaption>
                      <strong>{reference.clientName}</strong>
                      <span>{reference.clientRole || "Client"}{reference.company ? ` · ${reference.company}` : ""}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
            {takesReviews && onReview ? <ReviewForm onSubmit={onReview} /> : null}
            {googleReview && googleReview.showOnCard !== false ? (
              <div className={`lx-review${references.length > 0 ? " has-quotes" : ""}`}>
                <div className="lx-review-head">
                  <svg className="lx-review-mark" viewBox="0 0 48 48" width="28" height="28" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.500-4.800 7.200l7.700 6c4.500-4.200 6.900-10.300 6.900-17.700z" />
                    <path fill="#FBBC05" d="M10.500 28.700c-.5-1.500-.8-3.100-.8-4.700s.3-3.200.8-4.700l-7.900-6.100C.900 16.500 0 20.100 0 24s.9 7.500 2.600 10.800l7.900-6.100z" />
                    <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-5 2.300-8.200 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
                  </svg>
                  <div>
                    <strong>{googleReview.businessName || "Review us on Google"}</strong>
                    <span>Google reviews</span>
                  </div>
                </div>
                {googleReview.rating ? (
                  <p className="lx-review-score">
                    <b>{googleReview.rating}</b>
                    <span className="lx-stars" style={{ "--fill": `${Math.min(100, Number(googleReview.rating) / 5 * 100)}%` } as React.CSSProperties} role="img" aria-label={`${googleReview.rating} out of 5 stars`}>★★★★★</span>
                    {googleReview.reviewCount != null ? <span>{googleReview.reviewCount} {googleReview.reviewCount === 1 ? "review" : "reviews"}</span> : null}
                  </p>
                ) : (
                  <p className="lx-review-score"><span className="lx-stars" style={{ "--fill": "100%" } as React.CSSProperties} aria-hidden="true">★★★★★</span><span>Rate us on Google</span></p>
                )}
                <p className="lx-review-ask">Share your experience on Google.</p>
                <a
                  href={`/api/google-reviews/${encodeURIComponent(googleReview.slug)}/write?source=profile`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lx-btn lx-btn-primary"
                  onClick={(event) => {
                    if (!interactive || !window.matchMedia("(min-width: 700px)").matches) return;
                    const width = 520, height = 720;
                    const popup = window.open(event.currentTarget.href, "google-review", `popup=yes,width=${width},height=${height},left=${Math.max(0, window.screenX + (window.outerWidth - width) / 2)},top=${Math.max(0, window.screenY + (window.outerHeight - height) / 2)}`);
                    if (!popup) return;
                    popup.opener = null;
                    event.preventDefault();
                  }}
                >
                  Write a review
                </a>
                <small className="lx-review-note">Opens Google's review form.</small>
              </div>
            ) : null}
          </>
        );
      case "contactPersons":
        return <>{heading("Contact persons")}
            {config.contactPersons?.length ? (
              <div className="lx-contact-section-group">
                <h3 className="lx-contact-group">
                  {template === "business" ? "Contact persons & office in-charge" : "Key contacts"}
                </h3>
                <ul className="lx-officers-list">
                  {config.contactPersons.map((person, idx) => (
                    <li key={`officer-${idx}`} className="lx-officer-card">
                      <div className="lx-officer-info">
                        <span className="lx-officer-name">{person.name}</span>
                        {person.role ? <span className="lx-officer-badge">{person.role}</span> : null}
                      </div>
                      {(person.phone || person.email) ? (
                        <div className="lx-officer-actions">
                          {person.phone ? (
                            <a
                              href={phoneHref(person.phone) || undefined}
                              className="lx-officer-btn"
                              title={`Call ${person.name}`}
                              onClick={() => track("link", `Call: ${person.name}`)}
                            >
                              <Phone size={14} aria-hidden="true" />
                              <span>{person.phone}</span>
                            </a>
                          ) : null}
                          {person.email ? (
                            <a
                              href={`mailto:${encodeURIComponent(person.email)}`}
                              className="lx-officer-btn"
                              title={`Email ${person.name}`}
                              onClick={() => track("link", `Email: ${person.name}`)}
                            >
                              <Mail size={14} aria-hidden="true" />
                              <span>{person.email}</span>
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

        </>;
      case "resourceLinks":
        return <>{heading("Resource links")}
            {config.links?.length ? (
              <div className="lx-contact-section-group">
                <ul className="lx-contact lx-more-links">
                  {config.links.map((item, idx) => {
                    const clean = item.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
                    return (
                      <li key={`custom-link-${idx}`}>
                        <a href={item.url} {...external(item.url)} onClick={demoClick("link") ?? (() => track("link", item.title))}>
                          <Globe2 size={17} aria-hidden="true" />
                          <span>
                            <strong>{item.title}</strong>
                            {item.description ? <small>{item.description}</small> : <small>{clean}</small>}
                          </span>
                          <ArrowUpRight className="lx-row-arrow" size={16} aria-hidden="true" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
        </>;
      case "contact": {
        return (
          <>
            {heading(template === "business" ? "Contact & directory" : "Contact", card.contactHeading)}

            {contactRows.length ? (
              <h3 className="lx-contact-group">{template === "business" ? "General contact" : "Reach me directly"}</h3>
            ) : null}
            <ul className="lx-contact">
              {contactRows.map((row) => (
                <li key={row.key}>
                  <a href={row.href || undefined} {...external(row.href)} onClick={(row.key === "phone" && demoClick("phone")) || (row.key.startsWith("link-") && demoClick("link")) || (() => track("link", row.target))}>
                    <row.icon size={17} aria-hidden="true" />
                    <span><small>{row.label}</small><strong>{row.value}</strong></span>
                    <ArrowUpRight className="lx-row-arrow" size={16} aria-hidden="true" />
                  </a>
                  {row.copy ? (
                    <button
                      type="button"
                      className="lx-copy"
                      aria-label={`Copy ${row.value}`}
                      onClick={async () => { if (await copyToClipboard(row.copy)) toast.success(`${row.label} copied.`); }}
                    >
                      <Copy size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            {[
              { title: "Message or book", items: channels.filter((channel) => MESSAGING.has(channel.provider)) },
              { title: "Social profiles", items: channels.filter((channel) => !MESSAGING.has(channel.provider)) },
            ].map((group) =>
              group.items.length ? (
                <div key={group.title}>
                  <h3 className="lx-contact-group">{group.title}</h3>
                  <ul className="lx-contact">
                    {group.items.map((channel: ChannelItem, index: number) => (
                      <li key={`row-${channel.provider}-${index}`}>
                        <a href={channelHref(channel)} target="_blank" rel="noreferrer" onClick={demoClick("link") ?? (() => track("link", channelLabel(channel)))}>
                          <ChannelIcon provider={channel.provider} />
                          <span><small>{providerName(channel.provider)}</small><strong>{channelValue(channel)}</strong></span>
                          <ArrowUpRight className="lx-row-arrow" size={16} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </>
        );
      }
    }
  };

  return (
    <div
      key={replay}
      data-animation={design?.animation.preset}
      data-motion={design?.animation.intensity}
      data-background={design?.backgroundType}
      data-button={design?.buttonStyle}
      data-shadow={design?.shadow}
      onPointerMove={event => {
        if (
          !motionOn ||
          !design ||
          !["parallax", "spotlight"].includes(design.animation.preset) ||
          event.pointerType !== "mouse"
        )
          return;
        const r = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
          "--pointer-x",
          `${event.clientX - r.left}px`
        );
        event.currentTarget.style.setProperty(
          "--pointer-y",
          `${event.clientY - r.top}px`
        );
        event.currentTarget.style.setProperty(
          "--pointer-dx",
          `${(event.clientX - r.left - r.width / 2) * 0.01}px`
        );
        event.currentTarget.style.setProperty(
          "--pointer-dy",
          `${(event.clientY - r.top - r.height / 2) * 0.01}px`
        );
      }}
      className={`lx ${design ? "lx-designed" : ""} lx-${template}${cover ? " lx-has-cover" : ""} lx-theme-${PALETTES[card.theme] ? card.theme : "midnight"}`}
      style={style} ref={rootRef} inert={!interactive || undefined}>
      {card.backgroundUrl ? <div className="lx-bg" aria-hidden="true"><img src={card.backgroundUrl} alt="" decoding="async" /></div> : null}
      {cover ? (
        <div className="lx-cover-top" aria-hidden="true">
          <motion.div className="lx-cover-top-inner" style={motionOn ? { y: coverY, scale: coverScale, opacity: coverFade } : undefined}>
            {cover}
          </motion.div>
        </div>
      ) : null}
      {/* An explicit page background takes precedence over blurred cover/aurora effects. */}
      {!card.backgroundUrl ? (
        <div className="lx-aurora" aria-hidden="true">
          {card.coverUrl && !isVideoUrl(card.coverUrl) ? <div className="lx-aurora-photo"><img src={card.coverUrl} alt="" decoding="async" /></div> : null}
          <i /><i /><i /><i />
        </div>
      ) : null}

      {interactive ? (
        <header className="lx-nav">
          {branded ? <a className="lx-brand" href="/"><BrandMark /><span>heyitsme</span></a> : <span />}
          <span className="lx-nav-actions">
            <button type="button" className="lx-nav-share lx-nav-copy" onClick={onCopyLink} aria-label="Copy link to this page"><Copy size={15} aria-hidden="true" /></button>
            <button type="button" className="lx-nav-share" onClick={onShare}><Share2 size={15} aria-hidden="true" /> {props.shareLabel ?? "Share"}</button>
          </span>
        </header>
      ) : null}

      <MainTag className="lx-main" {...(interactive ? { id: "main", tabIndex: -1 } : {})}>
        {hero}
        {(props.team?.banners ?? []).map((banner) => (
          <GlassPanel enabled={interactive} key={`banner-${banner.id}`} className="lx-section lx-team-banner">
            <h2>{banner.title}</h2>
            {banner.description ? <p>{banner.description}</p> : null}
            {banner.ctaLabel && banner.ctaUrl ? (
              <a className="lx-btn lx-btn-primary" href={banner.ctaUrl} target="_blank" rel="noopener noreferrer" onClick={() => track("link", banner.ctaUrl ?? undefined)}>{banner.ctaLabel}</a>
            ) : null}
          </GlassPanel>
        ))}
        {sections.map((section) => (
          <GlassPanel enabled={interactive} light={section.id !== "stats" && section.id !== "references"} key={section.id} className={`lx-section lx-section-${section.id}`}>
            {renderSection(section.id)}
          </GlassPanel>
        ))}

        {props.team && props.team.files.length > 0 ? (
          <GlassPanel enabled={interactive} className="lx-section lx-team-files">
            {heading("From the company")}
            <ul>
              {props.team.files.map((file) => (
                <li key={file.id}>
                  <a className="lx-btn lx-btn-ghost" href={file.url} target="_blank" rel="noopener noreferrer" onClick={() => track("link", file.url)}>
                    {file.kind === "link" ? <ArrowUpRight size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} {file.title}
                  </a>
                </li>
              ))}
            </ul>
          </GlassPanel>
        ) : null}

        {interactive && canExchange ? (
          <GlassPanel enabled={interactive} className="lx-section lx-take">
            <div>
              <p>Scan to open this page on another phone, or save {firstName} straight to your contacts.</p>
              <div className="lx-take-actions">
                <button type="button" className="lx-btn lx-btn-primary" onClick={onSaveContact}><Download size={16} aria-hidden="true" /> Save contact</button>
                <button type="button" className="lx-btn lx-btn-ghost" onClick={onCopyLink}><Copy size={16} aria-hidden="true" /> Copy link</button>
              </div>
            </div>
            {/* Dark on the white tile in every theme so any camera reads it. */}
            <QrPreview value={pageUrl} design={config.qr} />
          </GlassPanel>
        ) : null}
      </MainTag>

      {interactive ? (
        <>
          <footer className="lx-footer">
            {branded ? <span>{firstName}’s page on heyitsme</span> : null}
            <LegalLinks />
            {branded ? <a href="/">Make yours, free <ArrowUpRight size={13} aria-hidden="true" /></a> : null}
          </footer>
          <div className={`lx-dock${dockShown ? " is-shown" : ""}`} role="toolbar" aria-label="Quick actions">
            {cta ? (
              <a className="lx-btn lx-btn-primary" href={cta.url} {...external(cta.url)} onClick={demoClick("booking") ?? (() => track("link", `CTA: ${cta.label}`))}>{cta.label}</a>
            ) : (
              <button type="button" className="lx-btn lx-btn-primary" onClick={onSaveContact}><Download size={16} aria-hidden="true" /> Save contact</button>
            )}
            {cta ? <button type="button" className="lx-btn lx-btn-ghost" onClick={onSaveContact} aria-label="Save contact"><Download size={16} aria-hidden="true" /></button> : null}
            {showExchange ? <button type="button" className="lx-btn lx-btn-ghost" onClick={onExchange} aria-label="Exchange details"><UserRoundPlus size={16} aria-hidden="true" /></button> : null}
            <button type="button" className="lx-btn lx-btn-ghost" onClick={onShare} aria-label={props.shareLabel ?? "Share this page"}><Share2 size={16} aria-hidden="true" /></button>
          </div>
          <GalleryLightbox items={photos} currentIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
        </>
      ) : null}
    </div>
  );
}

const noop = () => undefined;

/** Scaled, non-interactive render of the public landing page for the builder preview. */
export function LandingPreview({ card, references = [] }: { card: CardDraft; references?: ReferenceRow[] }) {
  return (
    <div className="lx-preview" role="region" aria-label={`Preview of ${card.displayName || "your page"}`}>
      <CardLanding
        card={card}
        config={parsePageConfig(card.page)}
        references={references}
        interactive={false}
        canExchange={false}
        pageUrl=""
        onSaveContact={noop}
        onExchange={noop}
        onShare={noop}
        onCopyLink={noop}
        track={noop}
      />
    </div>
  );
}
