import { EventAnswerInput, type EventAnswer } from "@/components/EventAnswerInput";
import { EventLanding } from "@/components/EventLanding";
import { trpc } from "@/lib/trpc";
import { RSVP_STATUS_LABELS, formatEventTime, type RsvpStatus } from "@shared/events";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import "./google-reviews.css";
import "./event.css";

/** "?preview=<workspaceId>-<eventId>": a team admin looking at the page before it is public. */
function previewTarget() {
  const match = /^(\d{1,9})-(\d{1,9})$/.exec(new URLSearchParams(window.location.search).get("preview") ?? "");
  return match ? { workspaceId: Number(match[1]), eventId: Number(match[2]) } : null;
}

/** /event/:slug: the public event page with its RSVP form. Shows the event, never who is coming. */
export default function PublicEvent() {
  const { slug = "" } = useParams<{ slug: string }>();
  const valid = /^[a-z0-9]{6,40}$/.test(slug);
  const [target] = useState(previewTarget);
  const live = trpc.publicEvent.get.useQuery({ slug }, { retry: false, enabled: valid && !target });
  const draft = trpc.teamEvents.preview.useQuery(target ?? { workspaceId: 0, eventId: 0 }, { retry: false, enabled: valid && Boolean(target) });
  const page = target ? draft : live;
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
  // A preview link only shows the event it was made for.
  if (!page.data || page.data.slug !== slug) {
    return (
      <main className="gr-public" id="main">
        <h1>Event unavailable</h1>
        <p>{target ? "Sign in as a team admin to preview this event." : "This link is not active."}</p>
        <Link href="/">Go to heyitsme</Link>
      </main>
    );
  }

  const event = page.data;
  const zone = event.timezone;
  const full = event.rsvpState === "full";
  const formOpen = event.rsvpState === "open" || full;
  const choices = (["attending", "maybe", "not_attending"] as const).filter(choice => (choice !== "maybe" || event.allowMaybe) && !(full && choice === "attending"));

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setError("");
    if (target) { setError("Replies are turned off in the preview."); return; }
    if (!status) { setError("Choose whether you are coming."); return; }
    try {
      await rsvp.mutateAsync({ slug, status, answers, website: website || undefined });
      setSent(status);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work. Please try again.");
      void page.refetch();
    }
  };

  return (
    <EventLanding event={event} pageUrl={`${window.location.origin}/event/${slug}`} preview={Boolean(target)}>
      <header className="lx-section-head"><h2 id="rsvp-title">RSVP</h2></header>
      {sent ? <div className="event-done" role="status">
        <h3>{sent === "attending" ? "You're on the list" : "Thank you for letting us know"}</h3>
        <p>{sent === "attending" ? `We look forward to seeing you at ${event.title}.` : sent === "maybe" ? "We have noted that you might come." : "We have noted that you cannot make it."}</p>
      </div> : event.rsvpState === "ended" ? <p className="event-notice">This event has ended.</p> : !formOpen ? <p className="event-notice">{target ? "Replies are not open. Publish the event and check its reply deadline." : "RSVP registration has closed."}</p> : <form onSubmit={submit}>
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
          <button type="submit" className="lx-btn lx-btn-primary ev-send" disabled={rsvp.isPending}>{rsvp.isPending ? "Sending..." : "Send RSVP"}</button>
        </> : null}
      </form>}
    </EventLanding>
  );
}
