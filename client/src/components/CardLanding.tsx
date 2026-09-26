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
import { contrastRatio, mapLink, parsePageConfig, readableOn, resolveSections, type PageConfig, type SectionId } from "@shared/pageConfig";
import { motion, useReducedMotion } from "framer-motion";
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
  Share2,
  UserRoundPlus,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import "./cardLanding.css";

// Paper, ink and a default accent per palette. Accents here pass 4.5:1 on their paper.
const PALETTES: Record<string, { paper: string; accent: string }> = {
  midnight: { paper: "#f4f4f7", accent: "#5446e6" },
  tide: { paper: "#eef5f3", accent: "#0e7469" },
  sunset: { paper: "#f9f1ee", accent: "#a8432f" },
};
const INK: Record<string, string> = { midnight: "#15162b", tide: "#0b2a2d", sunset: "#2b1b22" };

/** The accent a palette uses when the owner has not picked one. */
export function themeAccent(theme: string): string {
  return (PALETTES[theme] ?? PALETTES.midnight).accent;
}

type Track = (type: "vcard" | "link" | "share", target?: string) => void;

export type CardLandingProps = {
  card: CardDraft;
  config: PageConfig;
  references: ReferenceRow[];
  /** false = builder preview: no nav, dock, QR or motion, and nothing inside can be focused or clicked. */
  interactive: boolean;
  canExchange: boolean;
  pageUrl: string;
  onSaveContact: () => void;
  onExchange: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  track: Track;
};

function ChannelIcon({ provider }: { provider: string }) {
  if (provider === "linkedin") return <Linkedin size={16} />;
  if (provider === "instagram") return <Instagram size={16} />;
  if (provider === "facebook") return <Facebook size={16} />;
  if (["whatsapp", "telegram", "viber", "signal"].includes(provider)) return <MessageCircle size={16} />;
  return <Link2 size={16} />;
}

function channelKind(provider: string) {
  if (provider === "calendly") return "Book time";
  return ["whatsapp", "telegram", "viber", "signal"].includes(provider) ? "Message" : "Profile";
}

function external(href: string) {
  return /^https?:/i.test(href) ? { target: "_blank", rel: "noreferrer" } : {};
}

/** A website tile: the plain tile until a screenshot of the site loads, and for good if it can't be shown. */
function WebsiteShot({ request, title }: { request: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(request)
      .then((response) => response.json())
      .then((answer) => { if (active) setSrc(websiteShotFrom(answer)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [request]);
  return (
    <div className="lx-work-media lx-work-file">
      <Globe2 size={22} aria-hidden="true" />
      {src ? <img src={src} alt={`Screenshot of ${title}`} className={ready ? "is-ready" : undefined} onLoad={() => setReady(true)} onError={() => setSrc(null)} /> : null}
    </div>
  );
}

export function CardLanding(props: CardLandingProps) {
  const { card, config, references, interactive, canExchange, pageUrl, onSaveContact, onExchange, onShare, onCopyLink, track } = props;
  const reduceMotion = useReducedMotion();
  const animate = interactive && !reduceMotion;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const links = parseLinks(card.links);
  const channels = parseChannels(card.channels);
  const portfolio = parsePortfolio(card.portfolio);
  const photos = portfolio.filter((item) => item.kind === "image");
  const works = portfolio.filter((item) => item.kind !== "image");

  const palette = PALETTES[card.theme] ?? PALETTES.midnight;
  const ink = INK[card.theme] ?? INK.midnight;
  const accent = config.accent || palette.accent;
  // A pale owner accent still works on buttons (text flips to dark); accent-colored text needs 4.5:1 or falls back to ink.
  const accentText = contrastRatio(accent, palette.paper) >= 4.5 ? accent : ink;
  const style = {
    ["--accent" as string]: accent,
    ["--on-accent" as string]: readableOn(accent),
    ["--accent-text" as string]: accentText,
  };

  const template = config.template;
  // The builder preview sits inside the builder's own <main>: one main landmark per page.
  const MainTag = interactive ? "main" : "div";
  const firstName = card.displayName.split(" ")[0] || card.displayName;
  const cta = config.cta?.label && config.cta.url ? config.cta : null;

  const rise = (delay: number) =>
    animate ? { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const } } : {};

  const contactRows = [
    card.email ? { key: "email", icon: Mail, label: "Email", value: card.email, href: `mailto:${encodeURIComponent(card.email)}`, copy: card.email, target: "Email" } : null,
    card.phone ? { key: "phone", icon: Phone, label: "Call or text", value: card.phone, href: `tel:${encodeURIComponent(card.phone.replace(/\s+/g, ""))}`, copy: card.phone, target: "Phone" } : null,
    ...links.map((link) => {
      const value = link.replace(/^https?:\/\//, "").replace(/\/$/, "");
      // Insights groups website clicks by domain, so that stays the tracked target.
      return { key: `link-${link}`, icon: Globe2, label: "Website", value, href: toHref(link), copy: "", target: value.replace(/^www\./, "") };
    }),
  ].filter(Boolean) as { key: string; icon: any; label: string; value: string; href: string; copy: string; target: string }[];

  const hasContent: Record<SectionId, boolean> = {
    stats: config.stats.length > 0,
    services: config.services.length > 0,
    visit: config.hours.length > 0 || Boolean(config.address),
    portfolio: portfolio.length > 0,
    references: references.length > 0,
    contact: contactRows.length > 0 || channels.length > 0,
  };
  const sections = resolveSections(config).filter((section) => !section.hidden && hasContent[section.id]);
  const visitShown = sections.some((section) => section.id === "visit");

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
    <div className="lx-actions">
      {cta ? (
        <a className="lx-btn lx-btn-primary" href={cta.url} {...external(cta.url)} onClick={() => track("link", `CTA: ${cta.label}`)}>
          {cta.label} <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      ) : null}
      <button type="button" className={`lx-btn ${cta ? "lx-btn-ghost" : "lx-btn-primary"}`} onClick={onSaveContact}>
        <Download size={16} aria-hidden="true" /> Save contact
      </button>
      {canExchange ? (
        <button type="button" className="lx-btn lx-btn-ghost" onClick={onExchange}>
          <UserRoundPlus size={16} aria-hidden="true" /> Exchange details
        </button>
      ) : null}
    </div>
  );

  const socials = channels.length ? (
    <div className="lx-socials">
      {channels.map((channel: ChannelItem, index: number) => (
        <a key={`${channel.provider}-${index}`} href={channelHref(channel)} target="_blank" rel="noreferrer" aria-label={channelLabel(channel)} title={channelLabel(channel)} onClick={() => track("link", channelLabel(channel))}>
          <ChannelIcon provider={channel.provider} />
        </a>
      ))}
    </div>
  ) : null;

  const portrait = (className: string) => (
    <motion.figure className={className} {...rise(0.15)}>
      {card.avatarUrl ? <img src={card.avatarUrl} alt={card.displayName} /> : <span aria-hidden="true">{getInitials(card.displayName)}</span>}
    </motion.figure>
  );

  const cover = card.coverUrl ? (
    isVideoUrl(card.coverUrl) ? <LoopVideo className="lx-cover-media" src={card.coverUrl} lazy={false} fallback={null} /> : <img className="lx-cover-media" src={card.coverUrl} alt="" />
  ) : null;

  let hero: ReactNode;
  if (template === "business") {
    const brand = card.company || card.displayName;
    hero = (
      <>
        <section className="lx-hero lx-hero-business">
          <motion.p className="lx-eyebrow" {...rise(0)}>
            {card.avatarUrl ? <img className="lx-logo" src={card.avatarUrl} alt="" /> : null}
            {card.location || card.title}
          </motion.p>
          <h1 className="lx-masthead">{brand}</h1>
          {card.bio ? <p className="lx-lead">{card.bio}</p> : null}
          <motion.div {...rise(0.15)}>{actions}</motion.div>
          {card.company ? (
            <motion.p className="lx-byline" {...rise(0.2)}>
              Ask for <strong>{card.displayName}</strong>{card.title ? `, ${card.title}` : ""}
            </motion.p>
          ) : null}
          {socials}
        </section>
        {cover ? (
          <motion.div className="lx-band" {...rise(0.2)}>
            {cover}
            {/* A teaser of the Visit section, hidden with it so a hidden address never shows here. */}
            {visitShown ? (
              <div className="lx-ticket">
                {config.hours[0] ? <p><span>{config.hours[0].days}</span> {config.hours[0].time}</p> : null}
                {config.address ? (
                  <a href={mapLink(config.address)} target="_blank" rel="noreferrer" onClick={() => track("link", "Directions")}>
                    <MapPin size={14} aria-hidden="true" /> {config.address}
                  </a>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </>
    );
  } else if (template === "services") {
    hero = (
      <section className="lx-hero lx-hero-services">
        <div className="lx-hero-copy">
          <motion.p className="lx-eyebrow" {...rise(0)}>
            {card.displayName}{config.headline && card.title ? ` · ${card.title}` : card.company ? ` · ${card.company}` : ""}
          </motion.p>
          <h1 className="lx-masthead">{config.headline || card.title || card.displayName}</h1>
          {card.bio ? <p className="lx-lead">{card.bio}</p> : null}
          {card.location ? <motion.p className="lx-place" {...rise(0.12)}><MapPin size={14} aria-hidden="true" /> {card.location}</motion.p> : null}
          <motion.div {...rise(0.15)}>{actions}</motion.div>
          {socials}
        </div>
        {card.coverUrl && !isVideoUrl(card.coverUrl) ? (
          <motion.figure className="lx-services-image" {...rise(0.15)}><img src={card.coverUrl} alt="" /></motion.figure>
        ) : portrait("lx-round-portrait")}
      </section>
    );
  } else {
    hero = (
      <>
        <section className="lx-hero lx-hero-professional">
          <div className="lx-hero-copy">
            <motion.p className="lx-eyebrow" {...rise(0)}>
              {card.title}{card.company ? <> <span>at</span> {card.company}</> : null}
            </motion.p>
            <h1 className="lx-masthead">{card.displayName}</h1>
            {card.bio ? <p className="lx-lead">{card.bio}</p> : null}
            {card.location ? <motion.p className="lx-place" {...rise(0.12)}><MapPin size={14} aria-hidden="true" /> {card.location}</motion.p> : null}
            <motion.div {...rise(0.15)}>{actions}</motion.div>
            {socials}
          </div>
          {portrait("lx-arch")}
        </section>
        {cover ? <motion.div className="lx-band" {...rise(0.2)}>{cover}</motion.div> : null}
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
                <dd>{stat.value}</dd>
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
                    <a className="lx-menu-link" href={service.url} {...external(service.url)} onClick={() => track("link", `Service: ${service.name}`)}>
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
              {config.address ? (
                <div className="lx-address">
                  <p>{config.address}</p>
                  <a className="lx-text-link" href={mapLink(config.address)} target="_blank" rel="noreferrer" onClick={() => track("link", "Directions")}>
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
                {heading("Gallery", card.galleryHeading)}
                <PhotoCarousel items={photos} onSelectPhoto={(index) => { setLightboxIndex(index); track("link", `Work: ${photos[index].title}`); }} />
              </div>
            ) : null}
            {works.length ? (
              <div>
                {heading("Selected work", card.portfolioHeading)}
                <div className="lx-work-grid">
                  {works.map((item: PortfolioItem) => {
                    const href = toHref(item.url);
                    const shot = item.kind === "link" ? websiteShotRequest(item.url) : null;
                    return (
                      <a className="lx-work" key={item.id} {...(href === "#" ? {} : { href, target: "_blank", rel: "noreferrer", onClick: () => track("link", `Work: ${item.title}`) })}>
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
            {heading("Kind words")}
            <div className="lx-quotes">
              {references.map((reference) => (
                <figure className="lx-quote" key={reference.id}>
                  <blockquote>{reference.quote}</blockquote>
                  <figcaption>
                    <strong>{reference.clientName}</strong>
                    <span>{reference.clientRole || "Client"}{reference.company ? ` · ${reference.company}` : ""}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        );
      case "contact": {
        return (
          <>
            {heading("Contact", card.contactHeading)}
            <ul className="lx-contact">
              {contactRows.map((row) => (
                <li key={row.key}>
                  <a href={row.href} {...external(row.href)} onClick={() => track("link", row.target)}>
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
              {channels.map((channel: ChannelItem, index: number) => (
                <li key={`row-${channel.provider}-${index}`}>
                  <a href={channelHref(channel)} target="_blank" rel="noreferrer" onClick={() => track("link", channelLabel(channel))}>
                    <ChannelIcon provider={channel.provider} />
                    <span><small>{channelKind(channel.provider)}</small><strong>{channelLabel(channel)}</strong></span>
                    <ArrowUpRight className="lx-row-arrow" size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </>
        );
      }
    }
  };

  return (
    <div className={`lx lx-${template} lx-theme-${PALETTES[card.theme] ? card.theme : "midnight"}`} style={style} inert={!interactive || undefined}>
      {card.backgroundUrl ? <div className="lx-bg" aria-hidden="true"><img src={card.backgroundUrl} alt="" decoding="async" /></div> : null}

      {interactive ? (
        <header className="lx-nav">
          <a className="lx-brand" href="/"><BrandMark /><span>heyitsme</span></a>
          <button type="button" className="lx-nav-share" onClick={onShare}><Share2 size={15} aria-hidden="true" /> Share</button>
        </header>
      ) : null}

      <MainTag className="lx-main" {...(interactive ? { id: "main", tabIndex: -1 } : {})}>
        {hero}
        {sections.map((section) => (
          <motion.section key={section.id} className={`lx-section lx-section-${section.id}`}>
            {renderSection(section.id)}
          </motion.section>
        ))}

        {interactive && canExchange ? (
          <motion.section className="lx-section lx-take">
            <div>
              <span className="lx-kicker">Take my card</span>
              <p>Scan to open this page on another phone, or save {firstName} straight to your contacts.</p>
              <div className="lx-take-actions">
                <button type="button" className="lx-btn lx-btn-primary" onClick={onSaveContact}><Download size={16} aria-hidden="true" /> Save contact</button>
                <button type="button" className="lx-btn lx-btn-ghost" onClick={onCopyLink}><Copy size={16} aria-hidden="true" /> Copy link</button>
              </div>
            </div>
            <QRCodeSVG value={pageUrl} size={132} bgColor="transparent" fgColor={ink} aria-label="QR code for this page" role="img" />
          </motion.section>
        ) : null}
      </MainTag>

      {interactive ? (
        <>
          <footer className="lx-footer">
            <span>{firstName}’s page on heyitsme</span>
            <LegalLinks />
            <a href="/">Make yours, free <ArrowUpRight size={13} aria-hidden="true" /></a>
          </footer>
          <div className="lx-dock" role="toolbar" aria-label="Quick actions">
            {cta ? (
              <a className="lx-btn lx-btn-primary" href={cta.url} {...external(cta.url)} onClick={() => track("link", `CTA: ${cta.label}`)}>{cta.label}</a>
            ) : (
              <button type="button" className="lx-btn lx-btn-primary" onClick={onSaveContact}><Download size={16} aria-hidden="true" /> Save contact</button>
            )}
            {cta ? <button type="button" className="lx-btn lx-btn-ghost" onClick={onSaveContact} aria-label="Save contact"><Download size={16} aria-hidden="true" /></button> : null}
            {canExchange ? <button type="button" className="lx-btn lx-btn-ghost" onClick={onExchange} aria-label="Exchange details"><UserRoundPlus size={16} aria-hidden="true" /></button> : null}
            <button type="button" className="lx-btn lx-btn-ghost" onClick={onShare} aria-label="Share this page"><Share2 size={16} aria-hidden="true" /></button>
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
