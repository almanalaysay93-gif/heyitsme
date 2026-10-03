import { EventAnswerInput, type EventAnswer } from "@/components/EventAnswerInput";
import { trpc } from "@/lib/trpc";
import { RSVP_STATUS_LABELS, formatEventTime, type RsvpStatus } from "@shared/events";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import "./google-reviews.css";
import "./event.css";

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (value: unknown, fallback: string) => (typeof value === "string" && HEX.test(value) ? value : fallback);
const safeImage = (value: unknown) => (typeof value === "string" && /^(https:\/\/|\/(?!\/))/.test(value) ? value : null);
/** Whether text on this color should be light. */
const isDark = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
};

/** /event/:slug: the public event page with its RSVP form. Shows the event, never who is coming. */
export default function PublicEvent() {
  const { slug = "" } = useParams<{ slug: string }>();
  const valid = /^[a-z0-9]{6,40}$/.test(slug);
  const page = trpc.publicEvent.get.useQuery({ slug }, { retry: false, enabled: valid });
  const rsvp = trpc.publicEvent.rsvp.useMutation();
  const [status, setStatus] = useState<RsvpStatus | "">("");
  const [answers, setAnswers] = useState<Record<string, EventAnswer>>({});
  const [website, setWebsite] = useState("");
  const [sent, setSent] = useState<RsvpStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (page.data) document.title = `${page.data.title} · ${page.data.company.name}`;
  }, [page.data]);

  if (valid && page.isLoading) return <main className="gr-public" role="status">Loading event...</main>;
  if (!page.data) return <main className="gr-public" id="main"><h1>Event unavailable</h1><p>This link is not active.</p><Link href="/">Go to heyitsme</Link></main>;

  const event = page.data;
  const background = safeColor(event.design.background, "#f1f4fa");
  const button = safeColor(event.design.button, safeColor(event.company.colors?.primary, "#234bad"));
  const style = { "--event-bg": background, "--event-ink": isDark(background) ? "#ffffff" : "#17213a", "--event-button": button, "--event-button-ink": isDark(button) ? "#ffffff" : "#17213a" } as CSSProperties;
  const cover = safeImage(event.coverImageUrl);
  const logo = safeImage(event.company.logoUrl);
  const zone = event.timezone;
  const day = event.startAt ? formatEventTime(event.startAt, zone, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : null;
  const clock = (date: Date, withZone = false) => formatEventTime(date, zone, { hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}) });
  const sameDay = event.startAt && event.endAt && formatEventTime(event.startAt, zone, { dateStyle: "short" }) === formatEventTime(event.endAt, zone, { dateStyle: "short" });
  const time = event.startAt
    ? event.endAt
      ? sameDay
        ? `${clock(event.startAt)} to ${clock(event.endAt, true)}`
        : `${clock(event.startAt, true)}, until ${formatEventTime(event.endAt, zone, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}`
      : clock(event.startAt, true)
    : null;
  const full = event.rsvpState === "full";
  const formOpen = event.rsvpState === "open" || full;
  const choices = (["attending", "maybe", "not_attending"] as const).filter(choice => (choice !== "maybe" || event.allowMaybe) && !(full && choice === "attending"));

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setError("");
    if (!status) { setError("Choose whether you are coming."); return; }
    try {
      await rsvp.mutateAsync({ slug, status, answers, website: website || undefined });
      setSent(status);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work. Please try again.");
      void page.refetch();
    }
  };

  return <main className={`event-page event-font-${event.design.font ?? "modern"}`} id="main" style={style}>
    <article className="event-card">
      {cover ? <img className="event-cover" src={cover} alt="" /> : null}
      <div className="event-body">
        <header className="event-head">
          {logo ? <img className="event-logo" src={logo} alt={`${event.company.name} logo`} /> : null}
          <p className="event-company">{event.company.name}</p>
          <h1>{event.title}</h1>
        </header>
        <dl className="event-facts">
          {day ? <div><dt>Date</dt><dd>{day}</dd></div> : null}
          {time ? <div><dt>Time</dt><dd>{time}</dd></div> : null}
          {event.venue || event.address ? <div><dt>Venue</dt><dd>{event.venue ? <strong>{event.venue}</strong> : null}{event.address ? <span>{event.address}</span> : null}{event.mapUrl ? <a href={event.mapUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a> : null}</dd></div> : event.mapUrl ? <div><dt>Venue</dt><dd><a href={event.mapUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a></dd></div> : null}
          {event.organizerName || event.organizerContact ? <div><dt>Organizer</dt><dd>{event.organizerName ? <strong>{event.organizerName}</strong> : null}{event.organizerContact ? <span>{event.organizerContact}</span> : null}</dd></div> : null}
        </dl>
        {formOpen && !sent ? <a className="event-button" href="#rsvp">RSVP</a> : null}
        {event.description ? <p className="event-description">{event.description}</p> : null}

        <section id="rsvp" className="event-rsvp" aria-labelledby="rsvp-title">
          <h2 id="rsvp-title">RSVP</h2>
          {sent ? <div className="event-done" role="status">
            <h3>{sent === "attending" ? "You're on the list" : "Thank you for letting us know"}</h3>
            <p>{sent === "attending" ? `We look forward to seeing you at ${event.title}.` : sent === "maybe" ? "We have noted that you might come." : "We have noted that you cannot make it."}</p>
          </div> : event.rsvpState === "ended" ? <p className="event-notice">This event has ended.</p> : event.rsvpState === "closed" ? <p className="event-notice">RSVP registration has closed.</p> : <form onSubmit={submit}>
            {full ? <p className="event-notice">Registration is full.{choices.length ? " You can still tell the organizer if you cannot come." : ""}</p> : null}
            {event.rsvpDeadline && !full ? <p className="event-deadline">Please reply by {formatEventTime(event.rsvpDeadline, zone, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}.</p> : null}
            {choices.length ? <>
              <fieldset className="event-choice event-status">
                <legend>Will you come?<span className="event-required" aria-hidden="true"> *</span></legend>
                {choices.map(choice => <label key={choice}><input type="radio" name="status" value={choice} checked={status === choice} required onChange={() => setStatus(choice)} /> {RSVP_STATUS_LABELS[choice]}</label>)}
              </fieldset>
              {event.fields.map(field => <EventAnswerInput key={field.id} field={field} value={answers[String(field.id)]} onChange={value => setAnswers(current => ({ ...current, [String(field.id)]: value }))} />)}
              <div className="event-trap" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={inputEvent => setWebsite(inputEvent.target.value)} /></label></div>
              {error ? <p role="alert" className="gr-error">{error}</p> : null}
              <button type="submit" className="event-button" disabled={rsvp.isPending}>{rsvp.isPending ? "Sending..." : "Send RSVP"}</button>
            </> : null}
          </form>}
        </section>
      </div>
    </article>
    <footer><Link href="/">Powered by heyitsme.fyi</Link></footer>
  </main>;
}
