import { EventAnswerInput, type EventAnswer } from "@/components/EventAnswerInput";
import { EventBuilder } from "@/components/EventBuilder";
import { eventGuestWorkbook } from "@/lib/eventGuestExport";
import { failed, logoData, readBase64, save } from "@/lib/teamFiles";
import { trpc } from "@/lib/trpc";
import {
  CHOICE_FIELD_TYPES,
  EVENT_FIELD_TYPES,
  EVENT_FIELD_TYPE_LABELS,
  EVENT_STATUS_LABELS,
  MAX_EVENT_FIELDS,
  RSVP_STATUSES,
  RSVP_STATUS_LABELS,
  answerText,
  formatEventTime,
  instantToWall,
  type EventFieldMode,
  type EventFieldType,
  type EventStatus,
  type RsvpStatus,
} from "@shared/events";
import type { inferRouterOutputs } from "@trpc/server";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";
import "./event.css";

type Outputs = inferRouterOutputs<AppRouter>["teamEvents"];
type EventData = Outputs["get"];
type FieldRow = EventData["fields"][number];
type RsvpRow = Outputs["rsvps"]["rows"][number];

const when = (date: Date | null, zone: string) => (date ? formatEventTime(date, zone, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "No date yet");
const eventUrl = (slug: string) => `${window.location.origin}/event/${slug}`;

/** Team events. Admins create events and read responses; members see the events that are public. */
export function TeamEvents({ workspaceId, admin }: { workspaceId: number; admin: boolean }) {
  const list = trpc.teamEvents.list.useQuery({ workspaceId });
  const [open, setOpen] = useState<number | null>(null);
  // The builder is its own screen: null makes a new event, a number edits that one.
  const [building, setBuilding] = useState<{ eventId: number | null } | null>(null);

  if (admin && building) return <EventBuilder workspaceId={workspaceId} eventId={building.eventId} onClose={eventId => { setOpen(eventId); setBuilding(null); }} />;
  if (admin && open !== null) return <EventManager workspaceId={workspaceId} eventId={open} onBack={() => setOpen(null)} onEdit={() => setBuilding({ eventId: open })} />;
  if (list.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Events could not be loaded."}</p></section>;

  const { events, timezone } = list.data;
  return <section className="gr-panel">
    <h2>Events</h2>
    <p>{admin ? "Make an event page with an RSVP form, share its link or QR code, and see who is coming." : "Events your team is running. Share the link with people you want to invite."}</p>
    {admin ? <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => setBuilding({ eventId: null })}>Create event</button></div> : null}
    {events.length === 0 ? <p>{admin ? "No events yet." : "There are no open events right now."}</p> : <ul className="team-people">
      {events.map(event => <li key={event.id}>
        <div className="team-person">
          <strong>{event.title}</strong>
          <span>{when(event.startAt, timezone)}{event.venue ? ` · ${event.venue}` : ""}</span>
          <div className="team-badges">
            <span className={`team-status event-status-${event.status}`}>{EVENT_STATUS_LABELS[event.status]}</span>
            {event.stats ? <span className="team-chip">{event.stats.responses === 1 ? "1 response" : `${event.stats.responses} responses`}</span> : null}
            {event.stats ? <span className="team-chip">{event.stats.attending + event.stats.guests} coming</span> : null}
          </div>
        </div>
        <div className="team-person-actions">
          {admin ? <button type="button" className="gr-secondary" onClick={() => setOpen(event.id)}>Manage</button> : null}
          {event.status !== "draft" && event.status !== "archived" ? <>
            <a className="gr-secondary" href={`/event/${event.slug}`} target="_blank" rel="noopener noreferrer">Open page</a>
            <button type="button" className="gr-secondary" onClick={() => void navigator.clipboard.writeText(eventUrl(event.slug)).then(() => toast.success("Link copied."), failed)}>Copy link</button>
          </> : null}
        </div>
      </li>)}
    </ul>}
  </section>;
}

const SECTIONS = ["Responses", "Guests", "Share"] as const;
type Section = (typeof SECTIONS)[number];
const NEXT_STATUS: Record<EventStatus, [EventStatus, string][]> = {
  draft: [["published", "Publish"], ["archived", "Archive"]],
  published: [["closed", "Close RSVPs"], ["ended", "Mark as ended"], ["draft", "Unpublish"]],
  closed: [["published", "Reopen RSVPs"], ["ended", "Mark as ended"]],
  ended: [["published", "Reopen"], ["archived", "Archive"]],
  archived: [["draft", "Move back to drafts"]],
};
const STATUS_HELP: Record<EventStatus, string> = {
  draft: "Only team admins can see this event.",
  published: "Anyone with the link can see the page and RSVP.",
  closed: "The page is up, and the RSVP form is closed.",
  ended: "The page is up and says the event has ended.",
  archived: "The page is hidden. Responses are kept.",
};

function EventManager({ workspaceId, eventId, onBack, onEdit }: { workspaceId: number; eventId: number; onBack: () => void; onEdit: () => void }) {
  const utils = trpc.useUtils();
  const target = { workspaceId, eventId };
  const detail = trpc.teamEvents.get.useQuery(target, { retry: false });
  const setStatus = trpc.teamEvents.setStatus.useMutation();
  const [section, setSection] = useState<Section>("Responses");

  const refresh = () => Promise.all([utils.teamEvents.get.invalidate(target), utils.teamEvents.list.invalidate({ workspaceId }), utils.teams.activity.invalidate({ workspaceId })]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (error) {
      failed(error);
    }
  };

  const back = <button type="button" className="gr-back event-back" onClick={onBack}>← All events</button>;
  if (detail.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!detail.data) return <section className="gr-panel">{back}<p role="alert" className="gr-error">{detail.error?.message ?? "This event could not be loaded."}</p></section>;

  const { event, timezone, stats, rsvpState } = detail.data;
  const isPublic = event.status !== "draft" && event.status !== "archived";
  return <>
    <section className="gr-panel">
      {back}
      <h2>{event.title}</h2>
      <p>{when(event.startAt, timezone)}{event.venue ? ` · ${event.venue}` : ""}</p>
      <div className="team-badges">
        <span className={`team-status event-status-${event.status}`}>{EVENT_STATUS_LABELS[event.status]}</span>
        {event.status === "published" && rsvpState === "full" ? <span className="team-status team-status-invited">Registration is full</span> : null}
        {event.status === "published" && rsvpState === "closed" ? <span className="team-status team-status-invited">Reply-by date has passed</span> : null}
        {event.status === "published" && rsvpState === "ended" ? <span className="team-status team-status-invited">End time has passed</span> : null}
      </div>
      <p className="gr-attribution">{STATUS_HELP[event.status]}</p>
      <div className="gr-actions">
        <button type="button" className="gr-secondary" onClick={onEdit}>Edit event</button>
        {NEXT_STATUS[event.status].map(([status, label], index) => <button key={status} type="button" className={index === 0 ? "gr-primary" : "gr-secondary"} disabled={setStatus.isPending} onClick={() => void run(() => setStatus.mutateAsync({ ...target, status }), `Event is now: ${EVENT_STATUS_LABELS[status].toLowerCase()}.`)}>{label}</button>)}
        {isPublic ? <a className="gr-secondary" href={`/event/${event.slug}`} target="_blank" rel="noopener noreferrer">Open page</a> : null}
      </div>
      <div className="team-ranges" role="group" aria-label="Event sections">
        {SECTIONS.map(name => <button key={name} type="button" aria-pressed={section === name} onClick={() => setSection(name)}>{name === "Responses" ? `Responses (${stats.responses})` : name}</button>)}
      </div>
    </section>

    {section === "Responses" ? <ResponseSummary stats={stats} /> : null}
    {section === "Guests" ? <Guests target={target} title={event.title} onChanged={refresh} /> : null}
    {section === "Share" ? <Share workspaceId={workspaceId} slug={event.slug} isPublic={isPublic} /> : null}
  </>;
}

function ResponseSummary({ stats }: { stats: EventData["stats"] }) {
  const metrics: [string, number][] = [["Responses", stats.responses], ["Attending", stats.attending], ["Maybe", stats.maybe], ["Not attending", stats.notAttending], ["Guests they bring", stats.guests], ["Checked in", stats.checkedIn]];
  return <section className="gr-panel"><h2>Responses</h2><div className="gr-metrics team-metrics">{metrics.map(([label, value]) => <div key={label}><strong>{value.toLocaleString()}</strong><span>{label}</span></div>)}</div></section>;
}

function Guests({ target, title, onChanged }: { target: { workspaceId: number; eventId: number }; title: string; onChanged: () => Promise<unknown> }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RsvpStatus | "">("");
  const [checked, setChecked] = useState<"" | "yes" | "no">("");
  const [viewing, setViewing] = useState<number | null>(null);
  const table = trpc.teamEvents.rsvps.useQuery(
    { ...target, search: search.trim() || undefined, status: status || undefined, checkedIn: checked === "" ? undefined : checked === "yes" },
    { placeholderData: previous => previous }
  );
  const checkIn = trpc.teamEvents.checkIn.useMutation();
  const exportCsv = trpc.teamEvents.exportCsv.useMutation();
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const fileName = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "event";

  const changed = () => Promise.all([utils.teamEvents.rsvps.invalidate(target), onChanged()]);
  const toggle = async (row: RsvpRow) => {
    try {
      await checkIn.mutateAsync({ ...target, rsvpId: row.id, checkedIn: !row.checkedInAt });
      await changed();
    } catch (error) {
      failed(error);
    }
  };
  const download = async () => {
    try {
      const file = await exportCsv.mutateAsync(target);
      if (file.count === 0) { toast.message("There are no responses to download yet."); return; }
      save(new Blob(["\uFEFF", file.csv], { type: "text/csv;charset=utf-8" }), `${fileName}-guests.csv`);
    } catch (error) {
      failed(error);
    }
  };
  const downloadExcel = async () => {
    setDownloadingExcel(true);
    try {
      const guests = await utils.teamEvents.rsvps.fetch(target, { staleTime: 0 });
      if (guests.total === 0) { toast.message("There are no guests to download yet."); return; }
      const buffer = await eventGuestWorkbook(guests.fields, guests.rows);
      save(new Blob([new Uint8Array(buffer as unknown as ArrayBuffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileName}-guests.xlsx`);
    } catch (error) {
      failed(error);
    } finally {
      setDownloadingExcel(false);
    }
  };

  const fields = table.data?.fields ?? [];
  const rows = table.data?.rows ?? [];
  const open = rows.find(row => row.id === viewing) ?? null;

  return <>
    <section className="gr-panel">
      <h2>Guests</h2>
      <p>See each RSVP and the details guests gave. Exports include every response, even when the table is filtered.</p>
      <div className="team-contact-filters">
        <label className="gr-field">Search<input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="gr-field">Response<select value={status} onChange={event => setStatus(event.target.value as RsvpStatus | "")}><option value="">All</option>{RSVP_STATUSES.map(option => <option key={option} value={option}>{RSVP_STATUS_LABELS[option]}</option>)}</select></label>
        <label className="gr-field">Check-in<select value={checked} onChange={event => setChecked(event.target.value as "" | "yes" | "no")}><option value="">All</option><option value="yes">Checked in</option><option value="no">Not checked in</option></select></label>
      </div>
      <div className="gr-actions event-guest-export">
        <button type="button" className="gr-primary" disabled={downloadingExcel} onClick={() => void downloadExcel()}>{downloadingExcel ? "Preparing Excel file..." : "Download Excel (.xlsx)"}</button>
        <button type="button" className="gr-secondary" disabled={exportCsv.isPending} onClick={() => void download()}>{exportCsv.isPending ? "Preparing CSV..." : "Download for Google Sheets (.csv)"}</button>
      </div>
      <p className="gr-attribution">To use the CSV in Google Sheets, open a sheet and select File, Import, then Upload.</p>
      {table.isLoading ? <p role="status">Loading...</p> : !table.data ? <p role="alert" className="gr-error">{table.error?.message ?? "Responses could not be loaded."}</p> : rows.length === 0 ? <p>{table.data.total === 0 ? "No responses yet." : "No responses match."}</p> : <div className="team-table-wrap" aria-busy={table.isFetching}>
        <table className="team-table event-table">
          <caption className="sr-only">Event guests and RSVP responses</caption>
          <thead><tr><th scope="col">Response</th>{fields.map(field => <th key={field.id} scope="col">{field.label}</th>)}<th scope="col">Check-in</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <th scope="row">{RSVP_STATUS_LABELS[row.status]}</th>
            {fields.map(field => <td key={field.id}>{answerText(row.answers[String(field.id)])}</td>)}
            <td><span className={row.checkedInAt ? "team-status" : "team-status team-status-invited"}>{row.checkedInAt ? "Checked In" : "Not Checked In"}</span></td>
            <td><div className="team-person-actions">
              <button type="button" className="gr-secondary" disabled={checkIn.isPending} onClick={() => void toggle(row)}>{row.checkedInAt ? "Undo check-in" : "Check in"}</button>
              <button type="button" className="gr-secondary" onClick={() => setViewing(row.id)}>View</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    {open ? <ResponseEditor key={open.id} target={target} row={open} fields={fields} onClose={() => setViewing(null)} onChanged={changed} /> : null}
  </>;
}

function ResponseEditor({ target, row, fields, onClose, onChanged }: { target: { workspaceId: number; eventId: number }; row: RsvpRow; fields: FieldRow[]; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const updateRsvp = trpc.teamEvents.updateRsvp.useMutation();
  const deleteRsvp = trpc.teamEvents.deleteRsvp.useMutation();
  const [status, setStatus] = useState<RsvpStatus>(row.status);
  const [confirming, setConfirming] = useState(false);
  const [answers, setAnswers] = useState<Record<string, EventAnswer>>(() =>
    Object.fromEntries(Object.entries(row.answers).map(([key, value]) => [key, typeof value === "number" ? String(value) : (value as EventAnswer)]))
  );
  const act = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await onChanged();
      onClose();
    } catch (error) {
      failed(error);
    }
  };

  return <section className="gr-panel event-rsvp event-edit" aria-label="Response">
    <h2>Response</h2>
    <p className="gr-attribution">Sent {row.submittedAt.toLocaleString()}{row.checkedInAt ? ` · Checked in ${row.checkedInAt.toLocaleString()}` : ""}</p>
    <label className="gr-field">Response<select value={status} onChange={event => setStatus(event.target.value as RsvpStatus)}>{RSVP_STATUSES.map(option => <option key={option} value={option}>{RSVP_STATUS_LABELS[option]}</option>)}</select></label>
    {fields.map(field => <EventAnswerInput key={field.id} field={field} required={false} value={answers[String(field.id)]} onChange={value => setAnswers(current => ({ ...current, [String(field.id)]: value }))} />)}
    <div className="gr-actions">
      <button type="button" className="gr-primary" disabled={updateRsvp.isPending} onClick={() => void act(() => updateRsvp.mutateAsync({ ...target, rsvpId: row.id, status, answers }), "Response saved.")}>{updateRsvp.isPending ? "Saving..." : "Save changes"}</button>
      <button type="button" className="gr-secondary" onClick={onClose}>Close</button>
      {confirming
        ? <button type="button" className="gr-secondary team-danger" disabled={deleteRsvp.isPending} onClick={() => void act(() => deleteRsvp.mutateAsync({ ...target, rsvpId: row.id }), "Response deleted.")}>Yes, delete this response</button>
        : <button type="button" className="gr-secondary team-danger" onClick={() => setConfirming(true)}>Delete response</button>}
    </div>
  </section>;
}

const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
const isDark = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
};

/** The QR code in a branded frame: company color, logo in the middle, and a line that says what to do. */
function qrSvg(url: string, color: string, cta: string, logo: string | null) {
  const modules = QRCode.create(url, { errorCorrectionLevel: "H" }).modules;
  const count = modules.size;
  const cell = 10;
  const quiet = 4 * cell;
  const pad = 28;
  const white = count * cell + quiet * 2;
  const width = white + pad * 2;
  const bar = cta ? 92 : 0;
  const height = width + bar;
  const origin = pad + quiet;
  const logoCells = logo ? Math.floor(count * 0.22) : 0;
  const logoStart = Math.floor((count - logoCells) / 2);
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!modules.get(row, col)) continue;
      if (logoCells && row >= logoStart && row < logoStart + logoCells && col >= logoStart && col < logoStart + logoCells) continue;
      path += `M${origin + col * cell} ${origin + row * cell}h${cell}v${cell}h-${cell}z`;
    }
  }
  const logoAt = origin + logoStart * cell;
  const logoSize = logoCells * cell;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="QR code for the event page">`,
    `<rect width="${width}" height="${height}" rx="36" fill="${color}"/>`,
    `<rect x="${pad}" y="${pad}" width="${white}" height="${white}" rx="20" fill="#ffffff"/>`,
    `<path d="${path}" fill="#111827"/>`,
    logo ? `<image href="${escapeXml(logo)}" x="${logoAt + cell / 2}" y="${logoAt + cell / 2}" width="${logoSize - cell}" height="${logoSize - cell}" preserveAspectRatio="xMidYMid meet"/>` : "",
    cta ? `<text x="${width / 2}" y="${width + bar / 2 - 4}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" fill="${isDark(color) ? "#ffffff" : "#111827"}">${escapeXml(cta)}</text>` : "",
    "</svg>",
  ].join("");
}

function Share({ workspaceId, slug, isPublic }: { workspaceId: number; slug: string; isPublic: boolean }) {
  const brand = trpc.teamBrand.get.useQuery({ workspaceId });
  const url = eventUrl(slug);
  const [cta, setCta] = useState("Scan to RSVP");
  const [withLogo, setWithLogo] = useState(true);
  const [logo, setLogo] = useState<string | null>(null);
  const logoUrl = brand.data?.logoUrl ?? null;
  const primary = brand.data?.primary;
  const color = primary && /^#[0-9a-fA-F]{6}$/.test(primary) ? primary : "#234bad";

  useEffect(() => {
    let live = true;
    if (logoUrl) void logoData(logoUrl).then(data => { if (live) setLogo(data); });
    else setLogo(null);
    return () => { live = false; };
  }, [logoUrl]);

  const svg = useMemo(() => qrSvg(`${url}?source=qr`, color, cta.trim(), withLogo ? logo : null), [url, color, cta, withLogo, logo]);
  const png = () => {
    const image = new Image();
    const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const scale = 1200 / image.width;
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(source);
      canvas.toBlob(blob => (blob ? save(blob, `event-qr-${slug}.png`) : toast.error("The picture could not be made. Try the SVG file.")), "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(source); toast.error("The picture could not be made. Try the SVG file."); };
    image.src = source;
  };

  return <section className="gr-panel">
    <h2>Share</h2>
    {isPublic ? null : <p className="event-notice">This event is not published, so the link and QR code do not open yet.</p>}
    <label className="gr-field">Event link<input type="text" readOnly value={url} onFocus={event => event.target.select()} /></label>
    <div className="gr-actions"><button type="button" className="gr-secondary" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Link copied."), failed)}>Copy link</button></div>
    <h2 className="event-subhead">QR code</h2>
    <p>Uses your company color{logoUrl ? " and logo" : ""} from Brand.</p>
    <div className="event-qr" dangerouslySetInnerHTML={{ __html: svg }} />
    <label className="gr-field">Line under the code<input type="text" maxLength={24} value={cta} onChange={event => setCta(event.target.value)} /></label>
    {logoUrl ? <label className="team-toggle"><input type="checkbox" checked={withLogo} disabled={!logo} onChange={event => setWithLogo(event.target.checked)} /> Show the company logo in the middle</label> : null}
    {logoUrl && !logo ? <p className="gr-attribution">The logo could not be added to the code.</p> : null}
    <div className="gr-actions">
      <button type="button" className="gr-primary" onClick={png}>Download PNG</button>
      <button type="button" className="gr-secondary" onClick={() => save(new Blob([svg], { type: "image/svg+xml" }), `event-qr-${slug}.svg`)}>Download SVG</button>
    </div>
  </section>;
}
