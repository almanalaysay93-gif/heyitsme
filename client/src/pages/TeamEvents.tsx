import { EventAnswerInput, type EventAnswer } from "@/components/EventAnswerInput";
import { EventPageEditor } from "@/components/EventPageEditor";
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
  const [open, setOpen] = useState<number | "new" | null>(null);

  if (admin && open === "new") return <CreateEvent workspaceId={workspaceId} onDone={eventId => setOpen(eventId)} />;
  if (admin && typeof open === "number") return <EventManager workspaceId={workspaceId} eventId={open} onBack={() => setOpen(null)} />;
  if (list.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Events could not be loaded."}</p></section>;

  const { events, timezone } = list.data;
  return <section className="gr-panel">
    <h2>Events</h2>
    <p>{admin ? "Make an event page with an RSVP form, share its link or QR code, and see who is coming." : "Events your team is running. Share the link with people you want to invite."}</p>
    {admin ? <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => setOpen("new")}>Create event</button></div> : null}
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

type Details = {
  title: string; description: string; startAt: string; endAt: string; rsvpDeadline: string; venue: string; address: string; mapUrl: string;
  organizerName: string; organizerContact: string; capacity: string; allowMaybe: boolean;
};
const BLANK: Details = { title: "", description: "", startAt: "", endAt: "", rsvpDeadline: "", venue: "", address: "", mapUrl: "", organizerName: "", organizerContact: "", capacity: "", allowMaybe: true };

function toDetails(event: EventData["event"], zone: string): Details {
  const wall = (date: Date | null) => (date ? instantToWall(date, zone) : "");
  return {
    title: event.title, description: event.description ?? "", startAt: wall(event.startAt), endAt: wall(event.endAt), rsvpDeadline: wall(event.rsvpDeadline),
    venue: event.venue ?? "", address: event.address ?? "", mapUrl: event.mapUrl ?? "", organizerName: event.organizerName ?? "", organizerContact: event.organizerContact ?? "",
    capacity: event.capacity ? String(event.capacity) : "", allowMaybe: event.allowMaybe,
  };
}

function fromDetails(details: Details) {
  const capacity = details.capacity.trim() === "" ? null : Number(details.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) throw new Error("The limit must be a whole number, 1 or more.");
  return {
    title: details.title, description: details.description, startAt: details.startAt || null, endAt: details.endAt || null, rsvpDeadline: details.rsvpDeadline || null,
    venue: details.venue, address: details.address, mapUrl: details.mapUrl, organizerName: details.organizerName, organizerContact: details.organizerContact,
    capacity, allowMaybe: details.allowMaybe,
  };
}

function DetailsForm({ initial, zone, busy, submitLabel, onSubmit, onCancel }: { initial: Details; zone: string | null; busy: boolean; submitLabel: string; onSubmit: (details: Details) => void; onCancel?: () => void }) {
  const [details, setDetails] = useState(initial);
  const set = <K extends keyof Details>(key: K, value: Details[K]) => setDetails(current => ({ ...current, [key]: value }));
  const text = (key: "title" | "venue" | "address" | "mapUrl" | "organizerName" | "organizerContact", label: string, max: number, extra: { required?: boolean; type?: string; placeholder?: string } = {}) =>
    <label className="gr-field">{label}<input type={extra.type ?? "text"} maxLength={max} required={extra.required} placeholder={extra.placeholder} value={details[key]} onChange={event => set(key, event.target.value)} /></label>;
  const time = (key: "startAt" | "endAt" | "rsvpDeadline", label: string) =>
    <label className="gr-field">{label}<input type="datetime-local" value={details[key]} onChange={event => set(key, event.target.value)} /></label>;
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(details); };

  return <form onSubmit={submit} className="event-edit">
    {text("title", "Event title", 160, { required: true })}
    <label className="gr-field">Description<textarea rows={5} maxLength={5000} value={details.description} onChange={event => set("description", event.target.value)} /></label>
    <div className="team-form-grid">
      {time("startAt", "Starts")}
      {time("endAt", "Ends")}
      {time("rsvpDeadline", "Reply by (optional)")}
      <label className="gr-field">Limit on people coming (optional)<input type="number" inputMode="numeric" min={1} max={100000} value={details.capacity} onChange={event => set("capacity", event.target.value)} /></label>
    </div>
    {zone ? <p className="gr-attribution">Times are in your team's time zone ({zone.replaceAll("_", " ")}). The limit counts each person coming and the guests they bring.</p> : null}
    <div className="team-form-grid">
      {text("venue", "Venue", 200)}
      {text("address", "Address", 300)}
      {text("mapUrl", "Google Maps link", 500, { type: "url", placeholder: "https://" })}
      {text("organizerName", "Organizer", 160)}
      {text("organizerContact", "Organizer contact (email or phone)", 200)}
    </div>
    <label className="team-toggle"><input type="checkbox" checked={details.allowMaybe} onChange={event => set("allowMaybe", event.target.checked)} /> Let people answer "Maybe"</label>
    <div className="gr-actions">
      <button type="submit" className="gr-primary" disabled={busy}>{busy ? "Saving..." : submitLabel}</button>
      {onCancel ? <button type="button" className="gr-secondary" onClick={onCancel}>Cancel</button> : null}
    </div>
  </form>;
}

function CreateEvent({ workspaceId, onDone }: { workspaceId: number; onDone: (eventId: number | null) => void }) {
  const utils = trpc.useUtils();
  const zone = utils.teamEvents.list.getData({ workspaceId })?.timezone ?? null;
  const create = trpc.teamEvents.create.useMutation();
  const submit = async (details: Details) => {
    try {
      const created = await create.mutateAsync({ workspaceId, ...fromDetails(details) });
      toast.success("Event created as a draft. Publish it when it is ready.");
      await utils.teamEvents.list.invalidate({ workspaceId });
      onDone(created.id);
    } catch (error) {
      failed(error);
    }
  };
  return <section className="gr-panel">
    <h2>Create event</h2>
    <p>Start with the basics. You can add a banner, build the page, set up the RSVP form and publish on the next screen.</p>
    <DetailsForm initial={BLANK} zone={zone} busy={create.isPending} submitLabel="Create event" onSubmit={submit} onCancel={() => onDone(null)} />
  </section>;
}

const SECTIONS = ["Details", "Page", "RSVP form", "Responses", "Share"] as const;
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

function EventManager({ workspaceId, eventId, onBack }: { workspaceId: number; eventId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const target = { workspaceId, eventId };
  const detail = trpc.teamEvents.get.useQuery(target, { retry: false });
  const update = trpc.teamEvents.update.useMutation();
  const setStatus = trpc.teamEvents.setStatus.useMutation();
  const uploadCover = trpc.teamEvents.uploadCover.useMutation();
  const removeCover = trpc.teamEvents.removeCover.useMutation();
  const [section, setSection] = useState<Section>("Details");

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

  const { event, page, timezone, fields, stats, rsvpState } = detail.data;
  const isPublic = event.status !== "draft" && event.status !== "archived";
  const cover = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error("Image is larger than 3MB. Upload a smaller one."); return; }
    await run(async () => uploadCover.mutateAsync({ ...target, fileName: file.name, contentType: file.type || "image/png", dataBase64: await readBase64(file) }), "Banner saved.");
  };

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
        {NEXT_STATUS[event.status].map(([status, label], index) => <button key={status} type="button" className={index === 0 ? "gr-primary" : "gr-secondary"} disabled={setStatus.isPending} onClick={() => void run(() => setStatus.mutateAsync({ ...target, status }), `Event is now: ${EVENT_STATUS_LABELS[status].toLowerCase()}.`)}>{label}</button>)}
        {isPublic ? <a className="gr-secondary" href={`/event/${event.slug}`} target="_blank" rel="noopener noreferrer">Open page</a> : null}
      </div>
      <div className="team-ranges" role="group" aria-label="Event sections">
        {SECTIONS.map(name => <button key={name} type="button" aria-pressed={section === name} onClick={() => setSection(name)}>{name === "Responses" ? `Responses (${stats.responses})` : name}</button>)}
      </div>
    </section>

    {section === "Details" ? <>
      <section className="gr-panel">
        <h2>Banner</h2>
        {event.coverImageUrl ? <img className="event-cover event-cover-preview" src={event.coverImageUrl} alt="Event banner" /> : <p>No banner yet. A wide picture works best.</p>}
        <div className="gr-actions">
          <label className="gr-secondary team-file">{uploadCover.isPending ? "Uploading..." : event.coverImageUrl ? "Replace banner" : "Upload banner"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadCover.isPending} onChange={change => { void cover(change.target.files?.[0]); change.target.value = ""; }} /></label>
          {event.coverImageUrl ? <button type="button" className="gr-secondary team-danger" disabled={removeCover.isPending} onClick={() => void run(() => removeCover.mutateAsync(target), "Banner removed.")}>Remove banner</button> : null}
        </div>
        <p className="gr-attribution">JPG, PNG or WebP, up to 3MB. The page also shows your company logo from Brand.</p>
      </section>
      <section className="gr-panel">
        <h2>Details</h2>
        <DetailsForm key={String(event.updatedAt)} initial={toDetails(event, timezone)} zone={timezone} busy={update.isPending} submitLabel="Save details" onSubmit={details => void run(async () => update.mutateAsync({ ...target, ...fromDetails(details) }), "Event saved.")} />
      </section>
    </> : null}
    {section === "Page" ? <EventPageEditor target={target} slug={event.slug} initial={page} onSaved={refresh} /> : null}
    {section === "RSVP form" ? <FormBuilder key={fields.map(field => field.id).join("-")} target={target} fields={fields} onSaved={refresh} /> : null}
    {section === "Responses" ? <Responses target={target} stats={stats} title={event.title} onChanged={refresh} /> : null}
    {section === "Share" ? <Share workspaceId={workspaceId} slug={event.slug} isPublic={isPublic} /> : null}
  </>;
}

type Question = { key: string; id?: number; standardKey: string | null; label: string; fieldType: EventFieldType; mode: EventFieldMode; options: string };
const MODE_LABELS: Record<EventFieldMode, string> = { required: "Required", optional: "Optional", hidden: "Hidden" };
const isChoice = (type: EventFieldType) => CHOICE_FIELD_TYPES.includes(type);

function FormBuilder({ target, fields, onSaved }: { target: { workspaceId: number; eventId: number }; fields: FieldRow[]; onSaved: () => Promise<unknown> }) {
  const saveFields = trpc.teamEvents.saveFields.useMutation();
  const [questions, setQuestions] = useState<Question[]>(() => fields.map(field => ({
    key: `saved-${field.id}`, id: field.id, standardKey: field.standardKey, label: field.label, fieldType: field.fieldType as EventFieldType,
    mode: !field.enabled ? "hidden" : field.required ? "required" : "optional", options: (field.options ?? []).join("\n"),
  })));
  const [newType, setNewType] = useState<EventFieldType>("short_text");
  const change = (key: string, patch: Partial<Question>) => setQuestions(current => current.map(question => (question.key === key ? { ...question, ...patch } : question)));
  const move = (index: number, by: number) => setQuestions(current => {
    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    return next;
  });
  const add = () => setQuestions(current => [...current, { key: `new-${Date.now()}`, standardKey: null, label: "", fieldType: newType, mode: "optional", options: "" }]);

  const submit = async () => {
    try {
      await saveFields.mutateAsync({
        ...target,
        fields: questions.map(question => ({
          id: question.id, label: question.label, fieldType: question.fieldType, mode: question.mode,
          options: isChoice(question.fieldType) ? question.options.split("\n").map(option => option.trim()).filter(Boolean) : undefined,
        })),
      });
      toast.success("RSVP form saved.");
      await onSaved();
    } catch (error) {
      failed(error);
    }
  };

  return <section className="gr-panel">
    <h2>RSVP form</h2>
    <p>Choose what to ask. Everyone is always asked whether they are coming. Hidden questions are not shown on the form.</p>
    <ol className="event-questions">
      {questions.map((question, index) => <li key={question.key}>
        <div className="event-question-main">
          {question.standardKey ? <strong>{question.label}</strong> : <label className="gr-field">Question<input type="text" maxLength={160} value={question.label} onChange={event => change(question.key, { label: event.target.value })} /></label>}
          <span className="gr-attribution">{question.standardKey ? "Ready-made" : "Your question"} · {EVENT_FIELD_TYPE_LABELS[question.fieldType]}</span>
          {isChoice(question.fieldType) ? <label className="gr-field">Options, one per line<textarea rows={3} value={question.options} onChange={event => change(question.key, { options: event.target.value })} /></label> : null}
        </div>
        <div className="team-person-actions">
          {question.standardKey === "fullName" ? <span className="team-chip">Always required</span> : <select aria-label={`How "${question.label || "this question"}" appears`} value={question.mode} onChange={event => change(question.key, { mode: event.target.value as EventFieldMode })}>
            {(["required", "optional", "hidden"] as const).map(mode => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
          </select>}
          <button type="button" className="gr-secondary" disabled={index === 0} aria-label={`Move "${question.label}" up`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className="gr-secondary" disabled={index === questions.length - 1} aria-label={`Move "${question.label}" down`} onClick={() => move(index, 1)}>↓</button>
          {question.standardKey ? null : <button type="button" className="gr-secondary team-danger" onClick={() => setQuestions(current => current.filter(item => item.key !== question.key))}>Remove</button>}
        </div>
      </li>)}
    </ol>
    {questions.length < MAX_EVENT_FIELDS ? <div className="event-add">
      <label className="gr-field">Add your own question<select value={newType} onChange={event => setNewType(event.target.value as EventFieldType)}>{EVENT_FIELD_TYPES.map(type => <option key={type} value={type}>{EVENT_FIELD_TYPE_LABELS[type]}</option>)}</select></label>
      <button type="button" className="gr-secondary" onClick={add}>Add question</button>
    </div> : null}
    <p className="gr-attribution">Removing a question that people have already answered hides it and keeps their answers.</p>
    <div className="gr-actions"><button type="button" className="gr-primary" disabled={saveFields.isPending} onClick={() => void submit()}>{saveFields.isPending ? "Saving..." : "Save form"}</button></div>
  </section>;
}

function Responses({ target, stats, title, onChanged }: { target: { workspaceId: number; eventId: number }; stats: EventData["stats"]; title: string; onChanged: () => Promise<unknown> }) {
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
      save(new Blob(["﻿", file.csv], { type: "text/csv;charset=utf-8" }), `${title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}-responses.csv`);
    } catch (error) {
      failed(error);
    }
  };

  const metrics: [string, number][] = [["Responses", stats.responses], ["Attending", stats.attending], ["Maybe", stats.maybe], ["Not attending", stats.notAttending], ["Guests they bring", stats.guests], ["Checked in", stats.checkedIn]];
  const fields = table.data?.fields ?? [];
  const rows = table.data?.rows ?? [];
  const open = rows.find(row => row.id === viewing) ?? null;

  return <>
    <section className="gr-panel">
      <h2>Responses</h2>
      <div className="gr-metrics team-metrics">{metrics.map(([label, value]) => <div key={label}><strong>{value.toLocaleString()}</strong><span>{label}</span></div>)}</div>
      <div className="team-contact-filters">
        <label className="gr-field">Search<input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="gr-field">Response<select value={status} onChange={event => setStatus(event.target.value as RsvpStatus | "")}><option value="">All</option>{RSVP_STATUSES.map(option => <option key={option} value={option}>{RSVP_STATUS_LABELS[option]}</option>)}</select></label>
        <label className="gr-field">Check-in<select value={checked} onChange={event => setChecked(event.target.value as "" | "yes" | "no")}><option value="">All</option><option value="yes">Checked in</option><option value="no">Not checked in</option></select></label>
        <div className="gr-actions"><button type="button" className="gr-secondary" disabled={exportCsv.isPending} onClick={() => void download()}>{exportCsv.isPending ? "Preparing..." : "Download spreadsheet"}</button></div>
      </div>
      {table.isLoading ? <p role="status">Loading...</p> : !table.data ? <p role="alert" className="gr-error">{table.error?.message ?? "Responses could not be loaded."}</p> : rows.length === 0 ? <p>{table.data.total === 0 ? "No responses yet." : "No responses match."}</p> : <div className="team-table-wrap" aria-busy={table.isFetching}>
        <table className="team-table event-table">
          <caption className="sr-only">RSVP responses</caption>
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
