import { CardVisual, Field, TiltCard } from "@/components/CardVisual";
import { GalleryLightbox } from "@/components/GalleryLightbox";
import { LegalLinks } from "@/components/LegalLinks";
import { LoopVideo, isVideoUrl } from "@/components/LoopVideo";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  buildVCard,
  channelLabel,
  channelHref,
  parseChannels,
  parseLinks,
  parsePortfolio,
  readPreviewCard,
  splitHeading,
  themeOptions,
  toDraft,
  toHref,
  websiteShotFrom,
  websiteShotRequest,
  type CardDraft,
  type PortfolioItem,
  type ReferenceRow,
} from "@/lib/card";
import { copyToClipboard, downloadBlob, getInitials, safeFileName } from "@/lib/cardKit";
import { trpc } from "@/lib/trpc";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
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
  QrCode,
  Quote,
  Send,
  Share2,
  UserRoundPlus,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

function downloadVCard(card: CardDraft) {
  downloadBlob(new Blob([buildVCard(card, window.location.href, window.location.origin)], { type: "text/vcard;charset=utf-8" }), `${safeFileName(card.displayName, "contact")}.vcf`);
  toast.success("Contact file (.vcf) downloaded.");
}

function ChannelIcon({ provider }: { provider: string }) {
  if (provider === "linkedin") return <Linkedin size={16} />;
  if (provider === "instagram") return <Instagram size={16} />;
  if (provider === "facebook") return <Facebook size={16} />;
  if (provider === "whatsapp" || provider === "telegram" || provider === "viber" || provider === "signal") return <MessageCircle size={16} />;
  return <Link2 size={16} />;
}

const revealUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 140, damping: 20 } },
};

const staggerChildren = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
};

function PublicSection({ kicker, icon: Icon, title, emphasis, className = "", children }: any) {
  return (
    <motion.section
      className={`pl-section ${className}`}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={staggerChildren}
    >
      <motion.div className="pl-section-heading" variants={revealUp}>
        <span className="section-kicker"><Icon size={13} /> {kicker}</span>
        <h2>{title} <em>{emphasis}</em></h2>
      </motion.div>
      {children}
    </motion.section>
  );
}

/** A website tile: the plain tile until a screenshot of the site loads, and for good if the site can't be shown. */
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
    <div className="pl-work-file pl-work-site">
      <span><Globe2 size={22} /></span>
      <small>Website</small>
      {src ? (
        <img
          src={src}
          alt={`Screenshot of ${title}`}
          className={ready ? "is-ready" : undefined}
          onLoad={() => setReady(true)}
          onError={() => setSrc(null)}
        />
      ) : null}
    </div>
  );
}

function PublicPortfolio({
  items,
  galleryHeading,
  portfolioHeading,
  onOpen,
}: {
  items: PortfolioItem[];
  galleryHeading?: string | null;
  portfolioHeading?: string | null;
  onOpen?: (item: PortfolioItem) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (!items.length) return null;

  const photoItems = items.filter((item) => item.kind === "image");
  const otherItems = items.filter((item) => item.kind !== "image");
  const gallery = splitHeading(galleryHeading, "Moments & work in", "focus.");
  const portfolio = splitHeading(portfolioHeading, "A little proof of", "the practice.");

  return (
    <>
      {photoItems.length > 0 && (
        <PublicSection
          kicker="Visual Gallery"
          icon={BriefcaseBusiness}
          title={gallery.title}
          emphasis={gallery.emphasis}
          className="pl-portfolio-gallery-section"
        >
          <PhotoCarousel
            items={photoItems}
            onSelectPhoto={(index) => {
              setLightboxIndex(index);
              onOpen?.(photoItems[index]);
            }}
          />
        </PublicSection>
      )}

      {otherItems.length > 0 && (
        <PublicSection
          kicker="Selected work"
          icon={BriefcaseBusiness}
          title={portfolio.title}
          emphasis={portfolio.emphasis}
          className="pl-portfolio"
        >
          <div className="pl-portfolio-grid">
            {otherItems.map((item, index) => {
              const href = toHref(item.url);
              const linkProps = href === "#" ? {} : { href, target: "_blank", rel: "noreferrer", onClick: () => onOpen?.(item) };
              const shot = item.kind === "link" ? websiteShotRequest(item.url) : null;
              return (
                <motion.a
                  variants={revealUp}
                  whileHover={{ y: -6 }}
                  className={`pl-work ${index === 0 && otherItems.length > 2 ? "is-featured" : ""}`}
                  key={item.id}
                  {...linkProps}
                >
                  {item.kind === "video" ? (
                    <video
                      src={item.url}
                      muted
                      playsInline
                      loop
                      preload="metadata"
                      onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                      onMouseLeave={(event) => event.currentTarget.pause()}
                    />
                  ) : shot ? (
                    <WebsiteShot request={shot} title={item.title} />
                  ) : (
                    <div className="pl-work-file">
                      <span>{item.kind === "file" ? <FileText size={22} /> : <Globe2 size={22} />}</span>
                      <small>{item.kind === "file" ? "Document" : "Website"}</small>
                    </div>
                  )}
                  <div className="pl-work-caption">
                    <div>
                      <strong>{item.title}</strong>
                      {item.description && <small className="pl-work-desc">{item.description}</small>}
                    </div>
                    <span className="pl-work-arrow"><ArrowUpRight size={15} /></span>
                  </div>
                </motion.a>
              );
            })}
          </div>
        </PublicSection>
      )}

      <GalleryLightbox
        items={photoItems}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={(index) => setLightboxIndex(index)}
      />
    </>
  );
}

function PublicReferences({ references }: { references: ReferenceRow[] }) {
  if (!references.length) return null;
  return (
    <PublicSection kicker="Kind words" icon={Quote} title="What past clients" emphasis="remember." className="pl-references">
      <div className="pl-reference-grid">
        {references.map((reference) => (
          <motion.figure variants={revealUp} className="pl-reference" key={reference.id}>
            <span className="pl-quote-mark" aria-hidden="true">“</span>
            <blockquote>{reference.quote}</blockquote>
            <figcaption>
              <span className="reference-avatar">{getInitials(reference.clientName)}</span>
              <span><strong>{reference.clientName}</strong><small>{reference.clientRole || "Client"}{reference.company ? ` · ${reference.company}` : ""}</small></span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </PublicSection>
  );
}

export default function PublicCardPage() {
  const [location] = useLocation();
  const slug = location.split("/c/")[1]?.split("/")[0] ?? "";
  // One view per page load: refetching on focus would log a new view each time the visitor switches tabs.
  const cardQuery = trpc.publicCard.bySlug.useQuery({ slug }, { enabled: Boolean(slug), retry: false, refetchOnWindowFocus: false, staleTime: Infinity });
  const exchange = trpc.publicCard.exchange.useMutation();
  const trackEvent = trpc.publicCard.track.useMutation();
  const [showForm, setShowForm] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", title: "", notes: "", website: "" });
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const coverY = useTransform(scrollY, [0, 500], [0, reduceMotion ? 0 : 160]);
  const coverScale = useTransform(scrollY, [0, 500], [1, reduceMotion ? 1 : 1.12]);
  const coverFade = useTransform(scrollY, [0, 420], [1, 0.35]);
  const rawCard = cardQuery.data as any;
  const previewCard = !rawCard && slug === "new-card" ? readPreviewCard() : null;
  const card = rawCard ? toDraft(rawCard) : previewCard;
  const links = parseLinks(card?.links);
  const portfolio = parsePortfolio(card?.portfolio);
  const channels = parseChannels(card?.channels);
  const references = rawCard?.references ?? [];

  useEffect(() => {
    if (!showForm) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setShowForm(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm]);

  // The server already rendered these tags for crawlers; this keeps them right after client-side navigation.
  usePageMeta({
    title: card?.displayName ? `${card.displayName}${card.title ? ` · ${card.title}` : ""} — heyitsme` : "heyitsme",
    description: card ? (card.bio || `${card.displayName}${card.title ? `, ${card.title}` : ""}${card.company ? ` at ${card.company}` : ""}. Save my contact or exchange details.`).slice(0, 200) : undefined,
    canonicalPath: rawCard ? `/c/${rawCard.slug}` : undefined,
    noindex: !rawCard,
  });

  if (cardQuery.isLoading) {
    return (
      <div className="public-loading">
        <div className="loading-orb" />
        <span>Opening a little context…</span>
      </div>
    );
  }
  // A guest preview lives in this browser, so it still opens when the lookup fails.
  if (cardQuery.isError && !card) {
    return (
      <main className="public-loading" id="main" tabIndex={-1}>
        <div className="not-found-mark">!</div>
        <h1>Could not load this card.</h1>
        <p>Something went wrong loading this card. Please try again.</p>
        <button className="outline-button" onClick={() => void cardQuery.refetch()}>Try again</button>
        <a href="/">Visit heyitsme</a>
      </main>
    );
  }
  if (!card) {
    return (
      <main className="public-loading" id="main" tabIndex={-1}>
        <div className="not-found-mark">?</div>
        <h1>This card moved.</h1>
        <p>Ask for an updated link or head back to heyitsme.</p>
        <a href="/">Visit heyitsme</a>
      </main>
    );
  }

  const theme = themeOptions.find((item) => item.id === card.theme) ?? themeOptions[0];
  const firstName = card.displayName.split(" ")[0] || card.displayName;
  // Guest previews live in this browser only (their id is a timestamp), so nothing about them reaches the server.
  const canExchange = Boolean(rawCard);

  // Best-effort counters for the owner's Insights; a failed ping never interrupts the visitor.
  const track = (type: "vcard" | "link" | "share", target?: string) => {
    if (!canExchange) return;
    trackEvent.mutate({ cardId: card.id, type, target: target?.slice(0, 80) || null }, { onError: () => undefined });
  };

  const saveContact = () => {
    downloadVCard(card);
    track("vcard");
  };

  const copyLink = async () => {
    track("share", "copy");
    if (await copyToClipboard(window.location.href)) toast.success("Link copied.");
    else toast.info(window.location.href);
  };

  const shareLink = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: card.displayName, url: window.location.href });
        track("share", "native");
        return;
      } catch (error: any) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyLink();
  };

  const openForm = () => { setShowForm(true); setSent(false); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error("Please add your name.");
      return;
    }
    const trimmedEmail = form.email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("That email doesn't look right.");
      return;
    }
    if (!canExchange) {
      toast.error("Cannot exchange details on a preview card.");
      return;
    }
    try {
      await exchange.mutateAsync({
        cardId: card.id,
        name: trimmedName,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        title: form.title.trim() || null,
        notes: form.notes.trim() || null,
        website: form.website || null,
      });
      setSent(true);
      toast.success("Details exchanged.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not send your details.");
    }
  };

  const contactRows = [
    card.email ? { key: "email", icon: Mail, label: "Email", value: card.email, href: `mailto:${card.email}`, target: "Email" } : null,
    card.phone ? { key: "phone", icon: Phone, label: "Call or text", value: card.phone, href: `tel:${card.phone.replace(/\s+/g, "")}`, target: "Phone" } : null,
    ...links.map((link: string) => {
      const value = link.replace(/^https?:\/\//, "").replace(/\/$/, "");
      return { key: `link-${link}`, icon: Globe2, label: "Website", value, href: toHref(link), external: true, target: value.replace(/^www\./, "") };
    }),
  ].filter(Boolean) as { key: string; icon: any; label: string; value: string; href: string; external?: boolean; target: string }[];

  const contactHeading = splitHeading(card.contactHeading, "Pick the easiest", "way in.");

  return (
    <div
      className={`pl-page theme-${theme.id}`}
      style={{ ["--pl-a" as string]: theme.colors[0], ["--pl-b" as string]: theme.colors[1], ["--pl-c" as string]: theme.colors[2] }}
    >
      {card.backgroundUrl ? <div className="pl-bg" aria-hidden="true"><img src={card.backgroundUrl} alt="" decoding="async" /></div> : null}
      <div className="pl-backdrop" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="pl-cover-wrap" aria-hidden="true">
        <motion.div className="pl-cover" style={{ y: coverY, scale: coverScale, opacity: coverFade }}>
          {isVideoUrl(card.coverUrl) ? (
            <LoopVideo className="pl-cover-video" src={card.coverUrl} lazy={false} fallback={<div className="pl-cover-mesh"><i /><i /><i /></div>} />
          ) : card.coverUrl ? <img src={card.coverUrl} alt="" /> : <div className="pl-cover-mesh"><i /><i /><i /></div>}
        </motion.div>
      </div>

      <header className="pl-nav">
        <a className="brand-lockup" href="/"><span className="brand-mark"><span /></span><span>heyitsme</span></a>
        <motion.button whileTap={{ scale: 0.94 }} type="button" className="pl-nav-share" onClick={() => void shareLink()}>
          <Share2 size={15} /> Share
        </motion.button>
      </header>

      <main className="pl-main" id="main" tabIndex={-1}>
        <motion.section className="pl-hero" initial="hidden" animate="show" variants={staggerChildren}>
          <motion.div
            className="pl-avatar"
            initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.05 }}
          >
            {card.avatarUrl ? <img src={card.avatarUrl} alt={card.displayName} /> : <span>{getInitials(card.displayName)}</span>}
            {card.published ? <span className="pl-avatar-live" title="Live card" /> : null}
          </motion.div>
          <motion.span className="pl-hello" variants={revealUp}>Hey, it’s</motion.span>
          <motion.h1 variants={revealUp}>{card.displayName}</motion.h1>
          <motion.p className="pl-role" variants={revealUp}>
            {card.title}
            {card.company ? <> <span>at</span> {card.company}</> : null}
          </motion.p>
          {card.location ? <motion.p className="pl-location" variants={revealUp}><MapPin size={14} /> {card.location}</motion.p> : null}
          <motion.p className="pl-bio" variants={revealUp}>{card.bio || "Nice to meet you. Let’s keep the conversation going."}</motion.p>

          <motion.div className="pl-actions" variants={revealUp}>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} type="button" className="pl-btn pl-btn-primary" onClick={saveContact}>
              <Download size={16} /> Save contact
            </motion.button>
            {canExchange ? (
              <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} type="button" className="pl-btn pl-btn-ghost" onClick={openForm}>
                <UserRoundPlus size={16} /> Exchange details
              </motion.button>
            ) : null}
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} type="button" className="pl-btn pl-btn-icon" onClick={() => void copyLink()} aria-label="Copy link to this page">
              <Copy size={16} />
            </motion.button>
          </motion.div>

          {channels.length ? (
            <motion.div className="pl-socials" variants={staggerChildren}>
              {channels.map((channel, index) => (
                <motion.a
                  variants={revealUp}
                  whileHover={{ y: -4, rotate: -4 }}
                  whileTap={{ scale: 0.9 }}
                  href={channelHref(channel)}
                  target="_blank"
                  rel="noreferrer"
                  key={`${channel.provider}-${index}`}
                  aria-label={channelLabel(channel)}
                  title={channelLabel(channel)}
                  onClick={() => track("link", channelLabel(channel))}
                >
                  <ChannelIcon provider={channel.provider} />
                </motion.a>
              ))}
            </motion.div>
          ) : null}
        </motion.section>

        <div className="pl-body">
          <div className="pl-column">
            {contactRows.length || channels.length ? (
              <PublicSection kicker="Reach me" icon={MessageCircle} title={contactHeading.title} emphasis={contactHeading.emphasis} className="pl-links">
                <div className="pl-link-list">
                  {contactRows.map((row) => (
                    <motion.a variants={revealUp} whileTap={{ scale: 0.98 }} className="pl-link" href={row.href} key={row.key} onClick={() => track("link", row.target)} {...(row.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                      <span className="pl-link-icon"><row.icon size={17} /></span>
                      <span className="pl-link-copy"><small>{row.label}</small><strong>{row.value}</strong></span>
                      <ArrowUpRight size={16} className="pl-link-arrow" />
                    </motion.a>
                  ))}
                  {channels.map((channel, index) => (
                    <motion.a variants={revealUp} whileTap={{ scale: 0.98 }} className="pl-link" href={channelHref(channel)} target="_blank" rel="noreferrer" key={`row-${channel.provider}-${index}`} onClick={() => track("link", channelLabel(channel))}>
                      <span className="pl-link-icon"><ChannelIcon provider={channel.provider} /></span>
                      <span className="pl-link-copy"><small>{channel.provider === "calendly" ? "Book time" : "Message"}</small><strong>{channelLabel(channel)}</strong></span>
                      <ArrowUpRight size={16} className="pl-link-arrow" />
                    </motion.a>
                  ))}
                </div>
              </PublicSection>
            ) : null}
            <PublicPortfolio
              items={portfolio}
              galleryHeading={card.galleryHeading}
              portfolioHeading={card.portfolioHeading}
              onOpen={(item) => track("link", `Work: ${item.title}`)}
            />
            <PublicReferences references={references} />
          </div>

          <aside className="pl-aside">
            <motion.div
              className="pl-card-stage"
              initial={{ opacity: 0, y: 40, rotate: 4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.35 }}
            >
              <span className="section-kicker">Take my card</span>
              <TiltCard><CardVisual card={card} onClick={saveContact} label={`Save ${card.displayName} to your contacts`} /></TiltCard>
              {canExchange ? (
                <div className="pl-qr">
                  <QRCodeSVG value={window.location.href} size={104} bgColor="transparent" fgColor="#10152a" />
                  <p><QrCode size={14} /> Scan to open this page on another phone.</p>
                </div>
              ) : null}
            </motion.div>
          </aside>
        </div>
      </main>

      <footer className="pl-footer">
        <span>{firstName}’s page on heyitsme</span>
        <LegalLinks />
        <a href="/">Make yours — it’s free <ArrowUpRight size={13} /></a>
      </footer>

      <div className="pl-dock" role="toolbar" aria-label="Quick actions">
        <button type="button" className="pl-btn pl-btn-primary" onClick={saveContact}><Download size={16} /> Save contact</button>
        {canExchange ? <button type="button" className="pl-btn pl-btn-ghost" onClick={openForm} aria-label="Exchange details"><UserRoundPlus size={16} /></button> : null}
        <button type="button" className="pl-btn pl-btn-ghost" onClick={() => void shareLink()} aria-label="Share this page"><Share2 size={16} /></button>
      </div>

      <AnimatePresence>
        {showForm ? (
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Exchange details with ${card.displayName}`}
              className="exchange-sheet glass-panel"
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(event) => event.stopPropagation()}
            >
              {sent ? (
                <div className="success-state">
                  <div className="success-check"><Check size={25} /></div>
                  <h2>Nice. You’re in.</h2>
                  <p>Your details were sent to {card.displayName}. Keep the good conversation going.</p>
                  <button className="outline-button" onClick={() => setShowForm(false)}>Close</button>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="sheet-header">
                    <div>
                      <span className="mini-label">Exchange details</span>
                      <h2>Make it easy to find you too.</h2>
                    </div>
                    <button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X size={17} /></button>
                  </div>
                  <div className="field-grid">
                    <Field label="Your name" value={form.name} onChange={(value: string) => setForm({ ...form, name: value })} placeholder="Jordan Lee" required />
                    <Field label="Email" type="email" value={form.email} onChange={(value: string) => setForm({ ...form, email: value })} placeholder="you@example.com" />
                    <Field label="Company" value={form.company} onChange={(value: string) => setForm({ ...form, company: value })} placeholder="Your company" />
                    <Field label="Role / title" value={form.title} onChange={(value: string) => setForm({ ...form, title: value })} placeholder="What you do" />
                  </div>
                  <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                  <label className="field-label">
                    A note <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Where did we meet?" />
                  </label>
                  <button className="glass-button glass-button-primary full-width" disabled={exchange.isPending}>
                    {exchange.isPending ? "Sending…" : <><Send size={16} /> Exchange details</>}
                  </button>
                  <p className="privacy-note">Your details are shared only with {card.displayName}. No app download required. <Link href="/privacy">How we handle your details</Link></p>
                </form>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
