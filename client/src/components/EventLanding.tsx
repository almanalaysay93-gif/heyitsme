import { BrandMark } from "@/components/BrandMark";
import { GalleryLightbox } from "@/components/GalleryLightbox";
import { LegalLinks } from "@/components/LegalLinks";
import { copyToClipboard, getInitials, safeFileName } from "@/lib/cardKit";
import { save } from "@/lib/teamFiles";
import {
  EVENT_PALETTES,
  agendaByDay,
  eventAccent,
  eventCountdown,
  eventIcs,
  googleCalendarLink,
  orderSpeakers,
  resolveEventSections,
  rowSpeakers,
  sponsorsByTier,
  type CalendarEvent,
  type EventSectionId,
  type EventSpeaker,
} from "@shared/eventPage";
import { formatEventTime } from "@shared/events";
import { contrastRatio, mapLink, readableOn } from "@shared/pageConfig";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CalendarPlus, Clock, Globe2, MapPin, Share2 } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";
import { GlassPanel, useHeroEntrance, useMotionOn } from "./cardMotion";
import "./cardLanding.css";
import "./eventLanding.css";

export type EventView = inferRouterOutputs<AppRouter>["publicEvent"]["get"];

// Only files this app stored or https links. Anything else is dropped rather than shown.
const safeImage = (value?: string | null) => (value && /^(https:\/\/|\/(?!\/))/.test(value) ? value : null);
const external = (url: string) => (/^https?:/i.test(url) ? { target: "_blank", rel: "noopener noreferrer" } : {});
const fitTitle = (text: string) => ({ ["--longest" as string]: Math.max(6, ...text.split(/\s+/).map((word) => word.length)) });

/** When the event runs, in the venue's time zone: the day, then the hours. */
export function eventWhen(event: Pick<EventView, "startAt" | "endAt" | "timezone">) {
  if (!event.startAt) return null;
  const zone = event.timezone;
  const day = (date: Date | string) => formatEventTime(date, zone, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const clock = (date: Date | string, withZone = false) =>
    formatEventTime(date, zone, { hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}) });
  const sameDay = !event.endAt || formatEventTime(event.startAt, zone, { dateStyle: "short" }) === formatEventTime(event.endAt, zone, { dateStyle: "short" });
  const time = !event.endAt
    ? clock(event.startAt, true)
    : sameDay
      ? `${clock(event.startAt)} to ${clock(event.endAt, true)}`
      : `${clock(event.startAt)}, until ${day(event.endAt)} ${clock(event.endAt, true)}`;
  return { day: day(event.startAt), time };
}

/** Counts down to the start. Under reduced motion it shows days and hours and does not tick. */
function Countdown({ startAt, endAt }: { startAt: Date | string | null; endAt: Date | string | null }) {
  const still = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [still]);
  const left = eventCountdown(startAt, endAt, now);
  if (!left || left.state === "over") return null;
  if (left.state === "live") return <p className="ev-live"><span aria-hidden="true" /> Happening now</p>;
  const parts: [number, string][] = [[left.days, "days"], [left.hours, "hours"], ...(still ? [] : ([[left.minutes, "min"], [left.seconds, "sec"]] as [number, string][]))];
  return (
    <div className="ev-countdown" role="timer" aria-label={`Starts in ${left.days} days and ${left.hours} hours`}>
      {parts.map(([value, label]) => (
        <span key={label} aria-hidden="true"><strong>{String(value).padStart(2, "0")}</strong>{label}</span>
      ))}
    </div>
  );
}

function SpeakerPhoto({ speaker, size }: { speaker: EventSpeaker; size: "large" | "small" | "tiny" }) {
  const photo = safeImage(speaker.photoUrl);
  return photo ? (
    <img className={`ev-face ev-face-${size}`} src={photo} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className={`ev-face ev-face-${size} ev-face-initials`} aria-hidden="true">{getInitials(speaker.name)}</span>
  );
}

type Props = {
  event: EventView;
  pageUrl: string;
  /** Admin preview of a page that may not be public yet. */
  preview?: boolean;
  /** The RSVP block. It is always the last section and has the id "rsvp". */
  children: ReactNode;
};

export function EventLanding({ event, pageUrl, preview = false, children }: Props) {
  const { page, company } = event;
  const palette = EVENT_PALETTES[page.theme];
  const accent = eventAccent(page, company.colors?.primary);
  const motionOn = useMotionOn(true);
  const enter = useHeroEntrance(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [dockShown, setDockShown] = useState(false);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

  const when = eventWhen(event);
  const canReply = event.rsvpState === "open" || event.rsvpState === "full";
  const place = [event.venue, event.address].filter(Boolean).join(", ");
  const directions = event.mapUrl || (place ? mapLink(place) : null);
  const logo = safeImage(company.logoUrl);
  const cover = safeImage(event.coverImageUrl);
  const calendar: CalendarEvent | null = event.startAt
    ? { title: event.title, startAt: event.startAt, endAt: event.endAt, location: place, details: event.description?.slice(0, 600) ?? "", url: pageUrl, uid: event.slug }
    : null;

  // The aurora drifts only while the tab is visible, and never for reduced motion.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!motionOn) { root.style.setProperty("--aurora-play", "paused"); return; }
    const sync = () => root.style.setProperty("--aurora-play", document.hidden ? "paused" : "running");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [motionOn]);

  // The phone dock appears once the hero buttons have scrolled off the top.
  useEffect(() => {
    const target = actionsRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setDockShown(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: event.title, url: pageUrl }); } catch { /* The visitor closed the share sheet. */ }
      return;
    }
    if (await copyToClipboard(pageUrl)) toast.success("Link copied");
    else toast.error("Could not copy the link. Copy it from the address bar.");
  };
  const downloadIcs = () => {
    if (calendar) save(new Blob([eventIcs(calendar)], { type: "text/calendar;charset=utf-8" }), `${safeFileName(event.title, "event")}.ics`);
  };

  const { featured, rest } = orderSpeakers(page.speakers);
  const photos = page.gallery.map((photo) => ({ ...photo, url: safeImage(photo.url) })).filter((photo): photo is { url: string; alt: string } => Boolean(photo.url));
  const hasContent: Record<EventSectionId, boolean> = {
    details: Boolean(event.description || event.organizerName || event.organizerContact || place),
    schedule: page.agenda.length > 0,
    speakers: page.speakers.length > 0,
    gallery: photos.length > 0,
    sponsors: page.sponsors.length > 0,
    faq: page.faq.length > 0,
    links: page.links.some((link) => link.url),
  };
  const sections = resolveEventSections(page).filter((section) => !section.hidden && hasContent[section.id]);
  const heading = (text: string) => <header className="lx-section-head"><h2>{text}</h2></header>;
  const cardLink = (speaker: EventSpeaker) =>
    speaker.cardSlug ? <a className="lx-text-link" href={`/c/${speaker.cardSlug}`}>View card <ArrowUpRight size={14} aria-hidden="true" /></a> : null;

  const renderSection = (id: EventSectionId) => {
    switch (id) {
      case "details":
        return (
          <>
            {heading("About this event")}
            {event.description ? <p className="ev-prose">{event.description}</p> : null}
            <dl className="ev-facts">
              {when ? <div><dt>When</dt><dd>{when.day}<span>{when.time}</span></dd></div> : null}
              {place ? (
                <div>
                  <dt>Where</dt>
                  <dd>
                    {event.venue}
                    {event.address ? <span>{event.address}</span> : null}
                    {directions ? <a className="lx-text-link" href={directions} target="_blank" rel="noopener noreferrer">Get directions <ArrowUpRight size={14} aria-hidden="true" /></a> : null}
                  </dd>
                </div>
              ) : null}
              {event.organizerName || event.organizerContact ? (
                <div><dt>Organizer</dt><dd>{event.organizerName}{event.organizerContact ? <span>{event.organizerContact}</span> : null}</dd></div>
              ) : null}
            </dl>
          </>
        );
      case "schedule":
        return (
          <>
            {heading("Schedule")}
            {agendaByDay(page).map((day, at) => {
              // A day name takes the h3, so the rows under it step down to h4.
              const Title = day.label ? "h4" : "h3";
              return (
                <div key={at} className="ev-day">
                  {day.label ? <h3 className="ev-group-name">{day.label}</h3> : null}
                  <ol className="ev-agenda">
                    {day.items.map((item, index) => {
                      const who = rowSpeakers(page, item);
                      return (
                        <li key={index}>
                          <span className="ev-agenda-time">{item.time}</span>
                          <div>
                            <Title>{item.title}</Title>
                            {item.note ? <p>{item.note}</p> : null}
                            {who.length > 0 ? (
                              <ul className="ev-agenda-who" aria-label={who.length === 1 ? "Speaker" : "Speakers"}>
                                {who.map((speaker) => (
                                  <li key={speaker.id}><SpeakerPhoto speaker={speaker} size="tiny" /><span>{speaker.name}</span></li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </>
        );
      case "speakers":
        return (
          <>
            {heading(page.speakers.length === 1 ? "Speaker" : "Speakers")}
            {featured.length > 0 ? (
              <ul className="ev-featured">
                {featured.map((speaker, index) => (
                  <li key={index}>
                    <SpeakerPhoto speaker={speaker} size="large" />
                    <div>
                      <h3>{speaker.name}</h3>
                      {speaker.role ? <p className="ev-role">{speaker.role}</p> : null}
                      {speaker.bio ? <p className="ev-bio">{speaker.bio}</p> : null}
                      {cardLink(speaker)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {rest.length > 0 ? (
              <ul className="ev-speakers">
                {rest.map((speaker, index) => (
                  <li key={index}>
                    <SpeakerPhoto speaker={speaker} size="small" />
                    <h3>{speaker.name}</h3>
                    {speaker.role ? <p className="ev-role">{speaker.role}</p> : null}
                    {cardLink(speaker)}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        );
      case "gallery":
        return (
          <>
            {heading("Gallery")}
            <ul className="ev-gallery">
              {photos.map((photo, index) => (
                <li key={photo.url}>
                  <button type="button" onClick={() => setPhotoIndex(index)} aria-label={`Open photo ${index + 1} of ${photos.length}${photo.alt ? `: ${photo.alt}` : ""}`}>
                    <img src={photo.url} alt="" loading="lazy" decoding="async" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        );
      case "sponsors":
        return (
          <>
            {heading(page.sponsors.length === 1 ? "Sponsor" : "Sponsors")}
            {sponsorsByTier(page).map((tier, at) => (
              <div key={at} className="ev-tier">
                {tier.label ? <h3 className="ev-group-name">{tier.label}</h3> : null}
                {/* The first tier the admin listed is the top one, so its tiles are larger. */}
                <ul className={tier.top ? "ev-sponsors ev-sponsors-top" : "ev-sponsors"}>
                  {tier.items.map((sponsor, index) => {
                    const mark = safeImage(sponsor.logoUrl);
                    const body = mark ? <img src={mark} alt={sponsor.name} loading="lazy" decoding="async" /> : <strong>{sponsor.name}</strong>;
                    return (
                      <li key={index}>
                        {sponsor.url ? <a href={sponsor.url} {...external(sponsor.url)} aria-label={mark ? undefined : sponsor.name}>{body}</a> : <span>{body}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        );
      case "faq":
        return (
          <>
            {heading("Questions and answers")}
            <div className="ev-faq">
              {page.faq.map((item, index) => (
                <details key={index}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </>
        );
      case "links":
        return (
          <>
            {heading("Links")}
            <ul className="lx-contact lx-more-links">
              {page.links.filter((link) => link.url).map((link, index) => (
                <li key={index}>
                  <a href={link.url} {...external(link.url)}>
                    <Globe2 size={17} aria-hidden="true" />
                    <span>
                      <strong>{link.title}</strong>
                      <small>{link.description || link.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</small>
                    </span>
                    <ArrowUpRight className="lx-row-arrow" size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </>
        );
    }
  };

  return (
    <div
      ref={rootRef}
      className={`lx lx-business lx-event lx-theme-${page.theme} ev-font-${page.font}`}
      style={{
        ["--accent" as string]: accent,
        ["--on-accent" as string]: readableOn(accent),
        ["--accent-text" as string]: contrastRatio(accent, palette.paper) >= 4.5 ? accent : palette.ink,
      }}
    >
      <div className="lx-aurora" aria-hidden="true"><i /><i /><i /><i /></div>

      <header className="lx-nav">
        <a className="lx-brand" href="/"><BrandMark /><span>heyitsme</span></a>
        <span className="lx-nav-actions">
          <button type="button" className="lx-nav-share" onClick={share}><Share2 size={15} aria-hidden="true" /> Share</button>
        </span>
      </header>

      <main className="lx-main" id="main" tabIndex={-1}>
        {preview ? <p className="ev-preview" role="status">Preview. Only team admins can open this link. Replies are turned off here.</p> : null}

        <section className="lx-hero lx-hero-business">
          <motion.p className="lx-eyebrow" {...enter("eyebrow")}>
            {logo ? <img className="lx-logo" src={logo} alt="" /> : null}
            {company.name}
          </motion.p>
          <motion.h1 className="lx-masthead" style={fitTitle(event.title)} {...enter("name")}>{event.title}</motion.h1>
          <motion.div className="lx-glass lx-hero-panel" {...enter("lead")}>
            {when ? <p className="lx-lead ev-when"><Clock size={18} aria-hidden="true" /> <span>{when.day}<br />{when.time}</span></p> : null}
            {event.venue || event.address ? <p className="lx-place"><MapPin size={15} aria-hidden="true" /> {event.venue || event.address}</p> : null}
            <Countdown startAt={event.startAt} endAt={event.endAt} />
            {event.rsvpState === "ended" ? <p className="ev-ended">This event has ended.</p> : null}
            <div className="lx-actions" ref={actionsRef}>
              {canReply ? <a className="lx-btn lx-btn-primary" href="#rsvp">RSVP</a> : null}
              {calendar && event.rsvpState !== "ended" ? (
                <details className="ev-calendar">
                  <summary className="lx-btn lx-btn-ghost"><CalendarPlus size={16} aria-hidden="true" /> Add to calendar</summary>
                  <div>
                    <a href={googleCalendarLink(calendar)} target="_blank" rel="noopener noreferrer">Google Calendar</a>
                    <button type="button" onClick={downloadIcs}>Apple or Outlook (.ics file)</button>
                  </div>
                </details>
              ) : null}
              {directions ? <a className="lx-btn lx-btn-ghost" href={directions} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true" /> Directions</a> : null}
              <button type="button" className="lx-btn lx-btn-ghost" onClick={share}><Share2 size={16} aria-hidden="true" /> Share</button>
            </div>
          </motion.div>
        </section>

        {cover ? <div className="lx-band ev-band"><img className="lx-cover-media" src={cover} alt="" /></div> : null}

        {sections.map((section) => (
          <GlassPanel enabled key={section.id} className={`lx-section ev-section-${section.id}`}>
            {renderSection(section.id)}
          </GlassPanel>
        ))}

        <GlassPanel enabled light={false} className="lx-section ev-rsvp" id="rsvp" aria-labelledby="rsvp-title">
          {children}
        </GlassPanel>
      </main>

      <footer className="lx-footer">
        <span>{company.name} on heyitsme</span>
        <LegalLinks />
        <a href="/">Make your own page, free <ArrowUpRight size={13} aria-hidden="true" /></a>
      </footer>

      {canReply ? (
        <div className={`lx-dock${dockShown ? " is-shown" : ""}`} role="toolbar" aria-label="Quick actions">
          <a className="lx-btn lx-btn-primary" href="#rsvp" tabIndex={dockShown ? 0 : -1}>RSVP</a>
          <button type="button" className="lx-btn lx-btn-ghost" onClick={share} aria-label="Share this event" tabIndex={dockShown ? 0 : -1}><Share2 size={16} aria-hidden="true" /></button>
        </div>
      ) : null}

      <GalleryLightbox
        items={photos.map((photo, index) => ({ id: String(index), kind: "image" as const, title: photo.alt, url: photo.url, description: photo.alt }))}
        currentIndex={photoIndex}
        onClose={() => setPhotoIndex(null)}
        onNavigate={setPhotoIndex}
      />
    </div>
  );
}
