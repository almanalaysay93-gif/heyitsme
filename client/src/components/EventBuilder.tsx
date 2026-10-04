import { EventAnswerInput } from "@/components/EventAnswerInput";
import { EventLanding, type EventView } from "@/components/EventLanding";
import { EventImagePicker, EventPageLook, EventPageSections, eventPageProblem, type EventPageChange } from "@/components/EventPageEditor";
import { Fold } from "@/components/Fold";
import { SortList, moveTo } from "@/components/SortList";
import { failed, readBase64 } from "@/lib/teamFiles";
import { trpc } from "@/lib/trpc";
import { defaultEventPage, normalizeEventPage, resolveEventSections, type EventPage, type EventSectionId } from "@shared/eventPage";
import {
  CHOICE_FIELD_TYPES,
  EVENT_FIELD_TYPES,
  EVENT_FIELD_TYPE_LABELS,
  EVENT_STATUS_LABELS,
  MAX_EVENT_FIELDS,
  RSVP_STATUS_LABELS,
  STANDARD_EVENT_FIELDS,
  WALL_TIME,
  instantToWall,
  wallToInstant,
  type EventFieldMode,
  type EventFieldType,
  type EventStatus,
} from "@shared/events";
import type { inferRouterOutputs } from "@trpc/server";
import { motion } from "framer-motion";
import { CalendarDays, Check, ClipboardList, Eye, LayoutList, Palette, Share2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";
import "./pageDesigner.css";
import "./eventBuilder.css";

type EventData = inferRouterOutputs<AppRouter>["teamEvents"]["get"];
type Company = EventView["company"];

type Details = {
  title: string; description: string; startAt: string; endAt: string; rsvpDeadline: string; venue: string; address: string; mapUrl: string;
  organizerName: string; organizerContact: string; capacity: string; allowMaybe: boolean;
};
type Question = { key: string; id?: number; standardKey: string | null; label: string; fieldType: EventFieldType; mode: EventFieldMode; options: string };
type Draft = { details: Details; page: EventPage; questions: Question[] };
type ErrorKey = "title" | "capacity" | "startAt";

const BLANK: Details = { title: "", description: "", startAt: "", endAt: "", rsvpDeadline: "", venue: "", address: "", mapUrl: "", organizerName: "", organizerContact: "", capacity: "", allowMaybe: true };
const MODE_LABELS: Record<EventFieldMode, string> = { required: "Required", optional: "Optional", hidden: "Hidden" };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const isChoice = (type: EventFieldType) => CHOICE_FIELD_TYPES.includes(type);
const optionLines = (text: string) => text.split("\n").map(option => option.trim()).filter(Boolean);
const stamp = (value: unknown) => JSON.stringify(value);

const TABS = [
  { id: "details", label: "Details", icon: CalendarDays },
  { id: "page", label: "Page", icon: LayoutList },
  { id: "rsvp", label: "RSVP form", icon: ClipboardList },
  { id: "design", label: "Design", icon: Palette },
] as const;
type Tab = (typeof TABS)[number]["id"];

function toDetails(event: EventData["event"], zone: string): Details {
  const wall = (date: Date | null) => (date ? instantToWall(date, zone) : "");
  return {
    title: event.title, description: event.description ?? "", startAt: wall(event.startAt), endAt: wall(event.endAt), rsvpDeadline: wall(event.rsvpDeadline),
    venue: event.venue ?? "", address: event.address ?? "", mapUrl: event.mapUrl ?? "", organizerName: event.organizerName ?? "", organizerContact: event.organizerContact ?? "",
    capacity: event.capacity ? String(event.capacity) : "", allowMaybe: event.allowMaybe,
  };
}

/** The limit as a number, or the words to show when it is not one. */
function readCapacity(text: string): { capacity: number | null } | { error: string } {
  if (text.trim() === "") return { capacity: null };
  const capacity = Number(text);
  return Number.isInteger(capacity) && capacity >= 1 ? { capacity } : { error: "The limit must be a whole number, 1 or more." };
}

function toQuestions(fields: EventData["fields"]): Question[] {
  return fields.map(field => ({
    key: `saved-${field.id}`, id: field.id, standardKey: field.standardKey, label: field.label, fieldType: field.fieldType as EventFieldType,
    mode: !field.enabled ? "hidden" : field.required ? "required" : "optional", options: (field.options ?? []).join("\n"),
  }));
}

/** The questions a new event starts with, before the server has made them. */
function standardQuestions(): Question[] {
  return STANDARD_EVENT_FIELDS.map(field => ({
    key: `standard-${field.key}`, standardKey: field.key, label: field.label, fieldType: field.fieldType, mode: field.mode,
    options: "options" in field ? field.options.join("\n") : "",
  }));
}

function questionProblem(questions: Question[]): string | null {
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    if (!question.label.trim()) return `RSVP form, question ${index + 1}: type the question.`;
    if (isChoice(question.fieldType) && question.mode !== "hidden" && optionLines(question.options).length < 2) return `RSVP form, "${question.label}": add at least 2 options, one per line.`;
  }
  return null;
}

const fromServer = (data: EventData): Draft => ({ details: toDetails(data.event, data.timezone), page: normalizeEventPage(data.page), questions: toQuestions(data.fields) });

/**
 * Makes or edits a team event, laid out like the card builder: tabs, folds and a live preview of the public page.
 * `eventId` null starts a new event. `onClose` gets the event to return to, or null when nothing was created.
 */
export function EventBuilder({ workspaceId, eventId, onClose }: { workspaceId: number; eventId: number | null; onClose: (eventId: number | null) => void }) {
  const team = trpc.teams.get.useQuery({ workspaceId }, { retry: false });
  const detail = trpc.teamEvents.get.useQuery({ workspaceId, eventId: eventId ?? 0 }, { retry: false, enabled: eventId !== null });

  if (team.isLoading || (eventId !== null && detail.isLoading)) return <section className="gr-panel" role="status">Loading...</section>;
  const workspace = team.data?.workspace;
  if (!workspace || (eventId !== null && !detail.data)) {
    return <section className="gr-panel">
      <button type="button" className="gr-back event-back" onClick={() => onClose(eventId)}>← Back</button>
      <p role="alert" className="gr-error">{detail.error?.message ?? team.error?.message ?? "This event could not be loaded."}</p>
    </section>;
  }
  const company: Company = { name: workspace.name, logoUrl: workspace.logoUrl ?? null, colors: workspace.brandColors ?? null };
  return <Builder workspaceId={workspaceId} initial={eventId === null ? null : detail.data ?? null} company={company} zone={detail.data?.timezone ?? workspace.timezone} onClose={onClose} />;
}

function Builder({ workspaceId, initial, company, zone, onClose }: { workspaceId: number; initial: EventData | null; company: Company; zone: string; onClose: (eventId: number | null) => void }) {
  const utils = trpc.useUtils();
  const create = trpc.teamEvents.create.useMutation();
  const update = trpc.teamEvents.update.useMutation();
  const savePage = trpc.teamEvents.savePage.useMutation();
  const saveFields = trpc.teamEvents.saveFields.useMutation();
  const setStatus = trpc.teamEvents.setStatus.useMutation();
  const uploadCover = trpc.teamEvents.uploadCover.useMutation();
  const removeCover = trpc.teamEvents.removeCover.useMutation();
  const uploadImage = trpc.teamEvents.uploadImage.useMutation();

  // The builder keeps its own copy of the event so that creating it does not restart the screen.
  const [start] = useState<Draft>(() => (initial ? fromServer(initial) : { details: BLANK, page: defaultEventPage(), questions: standardQuestions() }));
  const [saved, setSaved] = useState(start);
  const [draft, setDraft] = useState(start);
  const [meta, setMeta] = useState<{ id: number | null; slug: string; status: EventStatus; cover: string | null }>(
    () => ({ id: initial?.event.id ?? null, slug: initial?.event.slug ?? "", status: (initial?.event.status ?? "draft") as EventStatus, cover: initial?.event.coverImageUrl ?? null }),
  );
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [pageIssue, setPageIssue] = useState<EventSectionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newType, setNewType] = useState<EventFieldType>("short_text");

  const [tab, setTab] = useState<Tab>("details");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [focusKey, setFocusKey] = useState<ErrorKey | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const selected = mobilePreview ? "preview" : tab;

  const target = meta.id === null ? null : { workspaceId, eventId: meta.id };
  const isNew = meta.id === null;
  const dirtyDetails = stamp(draft.details) !== stamp(saved.details);
  const dirtyPage = stamp(draft.page) !== stamp(saved.page);
  const dirtyQuestions = stamp(draft.questions) !== stamp(saved.questions);
  const dirty = dirtyDetails || dirtyPage || dirtyQuestions;

  const openTab = (next: Tab | "preview") => {
    if (next === "preview") setMobilePreview(true);
    else { setTab(next); setMobilePreview(false); }
    // A tab pressed far down a long panel would open the next one mid-scroll.
    requestAnimationFrame(() => {
      const layout = layoutRef.current;
      if (layout && layout.getBoundingClientRect().top < 96) layout.scrollIntoView({ block: "start" });
    });
  };
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = [...TABS.map(item => item.id as string), "preview"].filter(key => tabRefs.current[key]?.offsetParent);
    const at = keys.indexOf(selected);
    const to = event.key === "ArrowRight" ? at + 1 : event.key === "ArrowLeft" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : null;
    if (to === null || at < 0) return;
    event.preventDefault();
    const next = keys[(to + keys.length) % keys.length];
    openTab(next as Tab | "preview");
    tabRefs.current[next]?.focus();
  };
  useEffect(() => {
    if (!focusKey) return;
    const field = document.getElementById(`event-field-${focusKey}`);
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
    field?.focus({ preventScroll: true });
    setFocusKey(null);
  }, [focusKey, tab]);

  const setDetail = <K extends keyof Details>(key: K, value: Details[K]) => {
    setDraft(current => ({ ...current, details: { ...current.details, [key]: value } }));
    if (key === "title" || key === "capacity" || key === "startAt") setErrors(current => ({ ...current, [key]: undefined }));
  };
  const changePage: EventPageChange = change => setDraft(current => ({ ...current, page: change(current.page) }));
  const setQuestions = (change: (list: Question[]) => Question[]) => setDraft(current => ({ ...current, questions: change(current.questions) }));
  const changeQuestion = (key: string, patch: Partial<Question>) => setQuestions(list => list.map(question => (question.key === key ? { ...question, ...patch } : question)));

  const stop = (where: Tab, key: ErrorKey, text: string) => {
    setErrors(current => ({ ...current, [key]: text }));
    toast.error(text);
    openTab(where);
    setFocusKey(key);
    return null;
  };

  /** Saves everything that changed. Gives back the event's link name, or null when nothing was saved. */
  const save = async (publish: boolean): Promise<string | null> => {
    if (!draft.details.title.trim()) return stop("details", "title", "Give the event a title.");
    const limit = readCapacity(draft.details.capacity);
    if ("error" in limit) return stop("details", "capacity", limit.error);
    if (publish && !draft.details.startAt) return stop("details", "startAt", "Add a start date and time before you publish.");
    const issue = eventPageProblem(draft.page);
    if (issue) { toast.error(issue.text); setPageIssue(issue.section); openTab("page"); return null; }
    const formIssue = questionProblem(draft.questions);
    if (formIssue) { toast.error(formIssue); openTab("rsvp"); return null; }

    const { details, page } = draft;
    const fields = { ...details, title: details.title.trim(), startAt: details.startAt || null, endAt: details.endAt || null, rsvpDeadline: details.rsvpDeadline || null, capacity: limit.capacity };
    let id = meta.id;
    let done: string | null = null;
    setBusy(true);
    try {
      if (id === null) {
        const created = await create.mutateAsync({ workspaceId, ...fields });
        id = created.id;
        setMeta(current => ({ ...current, id: created.id, slug: created.slug }));
        setSaved(current => ({ ...current, details }));
      } else if (dirtyDetails) {
        await update.mutateAsync({ workspaceId, eventId: id, ...fields });
        setSaved(current => ({ ...current, details }));
      }
      const event = { workspaceId, eventId: id };
      if (dirtyPage) {
        await savePage.mutateAsync({ ...event, page: { ...page, sections: resolveEventSections(page) } });
        setSaved(current => ({ ...current, page }));
      }
      if (dirtyQuestions) {
        let questions = draft.questions;
        // A new event's ready-made questions are made by the server. Match them up before saving, so none is asked twice.
        if (questions.some(question => question.standardKey && !question.id)) {
          const made = await utils.teamEvents.get.fetch(event, { staleTime: 0 });
          questions = questions.map(question => (question.standardKey && !question.id ? { ...question, id: made.fields.find(field => field.standardKey === question.standardKey)?.id } : question));
        }
        await saveFields.mutateAsync({
          ...event,
          fields: questions.map(question => ({ id: question.id, label: question.label, fieldType: question.fieldType, mode: question.mode, options: isChoice(question.fieldType) ? optionLines(question.options) : undefined })),
        });
      }
      if (publish) await setStatus.mutateAsync({ ...event, status: "published" });

      const fresh = await utils.teamEvents.get.fetch(event, { staleTime: 0 });
      const next = fromServer(fresh);
      setSaved(next);
      setDraft(next);
      setMeta({ id: fresh.event.id, slug: fresh.event.slug, status: fresh.event.status as EventStatus, cover: fresh.event.coverImageUrl ?? null });
      setPageIssue(null);
      done = fresh.event.slug;
      toast.success(publish ? "Event published. Anyone with the link can see it." : meta.id === null ? "Event created as a draft. Publish it when it is ready." : "Event saved.");
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
      if (id !== null) void Promise.all([utils.teamEvents.list.invalidate({ workspaceId }), utils.teamEvents.get.invalidate({ workspaceId, eventId: id }), utils.teams.activity.invalidate({ workspaceId })]);
    }
    return done;
  };
  /** The card builder's second button: save, publish when still a draft, then put the public link on the clipboard. */
  const saveAndCopy = async () => {
    const slug = meta.status === "draft" || dirty ? await save(meta.status === "draft") : meta.slug;
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/event/${slug}`);
      toast.success("Link copied.");
    } catch {
      toast.message("The link could not be copied here. Copy it from Share on the event screen.");
    }
  };

  const pickCover = async (file: File | undefined) => {
    if (!file || !target) return;
    if (file.size > MAX_IMAGE_BYTES) { toast.error("Image is larger than 3MB. Upload a smaller one."); return; }
    try {
      const stored = await uploadCover.mutateAsync({ ...target, fileName: file.name, contentType: file.type || "image/png", dataBase64: await readBase64(file) });
      setMeta(current => ({ ...current, cover: stored.coverImageUrl }));
      toast.success("Banner saved.");
      void utils.teamEvents.get.invalidate(target);
    } catch (error) {
      failed(error);
    }
  };
  /** The page background is part of the page, so it goes out with the next save, unlike the banner. */
  const pickBackground = async (file: File | undefined) => {
    if (!file || !target) return;
    if (file.size > MAX_IMAGE_BYTES) { toast.error("Image is larger than 3MB. Upload a smaller one."); return; }
    try {
      const stored = await uploadImage.mutateAsync({ ...target, fileName: file.name, contentType: file.type || "image/png", dataBase64: await readBase64(file) });
      changePage(current => ({ ...current, backgroundUrl: stored.url }));
    } catch (error) {
      failed(error);
    }
  };
  const clearCover = async () => {
    if (!target) return;
    try {
      await removeCover.mutateAsync(target);
      setMeta(current => ({ ...current, cover: null }));
      toast.success("Banner removed.");
      void utils.teamEvents.get.invalidate(target);
    } catch (error) {
      failed(error);
    }
  };

  const leave = () => {
    if (dirty && !window.confirm("Leave without saving? Your changes will be lost.")) return;
    onClose(meta.id);
  };

  const text = (key: "title" | "venue" | "address" | "mapUrl" | "organizerName" | "organizerContact" | "capacity", label: string, max: number, extra: { required?: boolean; type?: string; placeholder?: string; inputMode?: "numeric" } = {}) => {
    const error = key === "title" || key === "capacity" ? errors[key] : undefined;
    return <label className="field-label" htmlFor={`event-field-${key}`}>
      <span>{label}{extra.required ? " *" : ""}</span>
      <input id={`event-field-${key}`} type={extra.type ?? "text"} inputMode={extra.inputMode} maxLength={max} required={extra.required} placeholder={extra.placeholder} value={draft.details[key]}
        aria-invalid={Boolean(error)} aria-describedby={error ? `event-field-${key}-error` : undefined} className={error ? "has-error" : undefined} onChange={event => setDetail(key, event.target.value)} />
      {error ? <span id={`event-field-${key}-error`} className="field-error-text" role="alert">{error}</span> : null}
    </label>;
  };
  const time = (key: "startAt" | "endAt" | "rsvpDeadline", label: string) => {
    const error = key === "startAt" ? errors.startAt : undefined;
    return <label className="field-label" htmlFor={`event-field-${key}`}>
      <span>{label}</span>
      <input id={`event-field-${key}`} type="datetime-local" value={draft.details[key]} aria-invalid={Boolean(error)} aria-describedby={error ? `event-field-${key}-error` : undefined} className={error ? "has-error" : undefined} onChange={event => setDetail(key, event.target.value)} />
      {error ? <span id={`event-field-${key}-error`} className="field-error-text" role="alert">{error}</span> : null}
    </label>;
  };

  const panelProps = (id: Tab) => ({ id: `event-panel-${id}`, role: "tabpanel", "aria-labelledby": `event-tab-${id}`, hidden: tab !== id, className: "builder-panel" });
  const stepNav = (id: Tab) => {
    const at = TABS.findIndex(item => item.id === id);
    const prev = TABS[at - 1];
    const next = TABS[at + 1];
    return <div className="builder-panel-nav">
      {prev ? <button type="button" className="text-button" onClick={() => openTab(prev.id)}>← {prev.label}</button> : <span />}
      {next ? <button type="button" className="outline-button" onClick={() => openTab(next.id)}>Next: {next.label} →</button> : null}
    </div>;
  };

  const details = draft.details;
  const wallDate = (wall: string) => (WALL_TIME.test(wall) ? wallToInstant(wall, zone) : null);
  const shown = draft.questions.filter(question => question.mode !== "hidden");
  const view = {
    slug: meta.slug, title: details.title.trim() || "Your event title", description: details.description, coverImageUrl: meta.cover,
    startAt: wallDate(details.startAt), endAt: wallDate(details.endAt), rsvpDeadline: wallDate(details.rsvpDeadline),
    venue: details.venue, address: details.address, mapUrl: details.mapUrl, organizerName: details.organizerName, organizerContact: details.organizerContact,
    allowMaybe: details.allowMaybe, page: { ...draft.page, sections: resolveEventSections(draft.page) }, timezone: zone, company, rsvpState: "open",
    fields: shown.map((question, index) => ({ id: -1 - index, label: question.label || "Your question", fieldType: question.fieldType, required: question.mode === "required", options: isChoice(question.fieldType) ? optionLines(question.options) : null, standardKey: question.standardKey })),
  } as EventView;
  const choices = (["attending", "maybe", "not_attending"] as const).filter(choice => choice !== "maybe" || details.allowMaybe);
  const zoneName = zone.replaceAll("_", " ");
  const saving = busy || uploading || uploadImage.isPending;
  // Shown on the tab as you type, the way the card builder marks a tab with a bad field.
  const pageUnfinished = eventPageProblem(draft.page) !== null;
  const formUnfinished = questionProblem(draft.questions) !== null;
  const live = meta.status === "published";

  return (
    <motion.div className="builder-page event-builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="builder-head">
        <button type="button" className="back-button" onClick={leave}>← {isNew ? "All events" : "Back to event"}</button>
        <h2 className="event-builder-title">{isNew ? "New event" : "Edit event"}</h2>
        <p className="field-hint">{isNew ? "Fill in the basics, build the page and choose the RSVP questions. Nothing is public until you publish." : `${EVENT_STATUS_LABELS[meta.status]}. Times are in your team's time zone (${zoneName}).`}</p>
      </div>

      <div className="builder-toolbar">
        <div className="builder-tabs" role="tablist" aria-label="Event builder sections" onKeyDown={onTabKey}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const alert = (id === "details" && (errors.title || errors.capacity || errors.startAt)) || (id === "page" && (pageIssue !== null || pageUnfinished)) || (id === "rsvp" && formUnfinished);
            return <button key={id} type="button" role="tab" id={`event-tab-${id}`} ref={node => { tabRefs.current[id] = node; }} className="builder-tab" aria-selected={selected === id} aria-controls={`event-panel-${id}`} tabIndex={selected === id ? 0 : -1} onClick={() => openTab(id)}>
              <Icon size={15} aria-hidden="true" />{label}
              {alert ? <span className="builder-tab-alert" role="img" aria-label="needs a fix" /> : null}
            </button>;
          })}
          <button type="button" role="tab" id="event-tab-preview" ref={node => { tabRefs.current.preview = node; }} className="builder-tab is-preview" aria-selected={selected === "preview"} aria-controls="event-preview-panel" tabIndex={selected === "preview" ? 0 : -1} onClick={() => openTab("preview")}>
            <Eye size={15} aria-hidden="true" />Preview
          </button>
        </div>
        <div className="builder-save-actions">
          {dirty
            ? <button type="button" className="text-button" disabled={saving} onClick={() => { setDraft(saved); setErrors({}); setPageIssue(null); }}>Discard changes</button>
            : isNew ? null : <span className="save-status-indicator" role="status" title="All changes saved to your team"><Check size={14} aria-hidden="true" /> Saved</span>}
          {meta.status === "draft" || live ? <button type="button" className="publish-copy-button" disabled={saving} onClick={() => void saveAndCopy()}>
            <Share2 size={15} aria-hidden="true" />
            <span className="label-long">{!live ? "Publish & copy link" : dirty ? "Save & copy public link" : "Copy public link"}</span><span className="label-short">{live ? "Copy link" : "Publish"}</span>
          </button> : null}
          <button type="button" className="glass-button glass-button-primary" disabled={saving || (!isNew && !dirty)} onClick={() => void save(false)}>
            {busy ? null : <Check size={16} aria-hidden="true" />}
            <span className="label-long">{busy ? "Saving..." : isNew ? "Create event" : live ? "Save live changes" : "Save draft"}</span>
            <span className="label-short">{busy ? "Saving..." : isNew ? "Create" : "Save"}</span>
          </button>
        </div>
      </div>

      <div className={`builder-layout ${mobilePreview ? "mobile-view-preview" : "mobile-view-edit"}`} ref={layoutRef}>
        <div className="builder-form glass-panel" id="event-form-panel">
          <section {...panelProps("details")}>
            <div className="builder-panel-head"><h2>Details</h2><p>What the event is, when it happens and where. Only the title is needed to start.</p></div>
            <div className="builder-panel-body">
              <div className="form-section">
                {text("title", "Event title", 160, { required: true })}
                <label className="field-label"><span>Description</span><textarea rows={5} maxLength={5000} value={details.description} onChange={event => setDetail("description", event.target.value)} /></label>
              </div>
              <div className="form-section">
                <div className="pd-block-head"><h3>Banner</h3><p>The wide picture at the top of the event page.</p></div>
                <EventImagePicker label="Event banner" shape="wide" url={meta.cover ?? ""} busy={uploadCover.isPending || removeCover.isPending} disabled={!target}
                  hint={target ? "JPG, PNG or WebP, up to 3MB. Saved as soon as you pick it." : "Add it once the event is created."}
                  onPick={file => void pickCover(file)} onClear={() => void clearCover()} />
              </div>
              <div className="form-section">
                <div className="pd-block-head"><h3>Background image</h3><p>A photo behind the whole page, softened so the text stays easy to read. Without one, the page uses the theme's background.</p></div>
                <EventImagePicker label="Page background" shape="wide" url={draft.page.backgroundUrl} busy={uploadImage.isPending} disabled={!target}
                  hint={target ? "JPG, PNG or WebP, up to 3MB. Shows on the page after you save." : "Add it once the event is created."}
                  onPick={file => void pickBackground(file)} onClear={() => changePage(current => ({ ...current, backgroundUrl: "" }))} />
              </div>
              <div className="fold-list">
                <Fold title="When" defaultOpen forceOpen={Boolean(errors.startAt)} attention={Boolean(errors.startAt)} attentionLabel="Needs a date" meta={details.startAt ? details.startAt.replace("T", " ") : "No date yet"} hint={`Times are in your team's time zone (${zoneName}).`}>
                  <div className="field-grid">{time("startAt", "Starts")}{time("endAt", "Ends")}</div>
                </Fold>
                <Fold title="Where" meta={details.venue || details.address ? "Set" : "Not set"}>
                  <div className="field-grid">{text("venue", "Venue", 200)}{text("address", "Address", 300)}</div>
                  {text("mapUrl", "Google Maps link", 500, { type: "url", placeholder: "https://" })}
                </Fold>
                <Fold title="Organizer" meta={details.organizerName ? "Set" : "Not set"}>
                  <div className="field-grid">{text("organizerName", "Organizer", 160)}{text("organizerContact", "Contact (email or phone)", 200)}</div>
                </Fold>
                <Fold title="Replies" forceOpen={Boolean(errors.capacity)} meta={details.capacity.trim() ? `Limit ${details.capacity.trim()}` : "No limit"} hint="The limit counts each person coming and the guests they bring.">
                  <div className="field-grid">{time("rsvpDeadline", "Reply by (optional)")}{text("capacity", "Limit on people coming (optional)", 6, { inputMode: "numeric" })}</div>
                  <label className="team-toggle"><input type="checkbox" checked={details.allowMaybe} onChange={event => setDetail("allowMaybe", event.target.checked)} /> Let people answer "Maybe"</label>
                </Fold>
              </div>
            </div>
            {stepNav("details")}
          </section>

          <section {...panelProps("page")}>
            <div className="builder-panel-head"><h2>Page</h2><p>Open a section to fill it in, and drag it by its grip to change the order. A section with nothing in it stays off the page. The RSVP form is always last.</p></div>
            <div className="builder-panel-body">
              <EventPageSections page={draft.page} onChange={changePage} target={target} issue={pageIssue} onBusy={setUploading} />
            </div>
            {stepNav("page")}
          </section>

          <section {...panelProps("rsvp")}>
            <div className="builder-panel-head"><h2>RSVP form</h2><p>Choose what to ask, and drag a question by its grip to change the order. Everyone is always asked whether they are coming. Hidden questions are not shown on the form.</p></div>
            <div className="builder-panel-body">
              <SortList className="event-questions" count={draft.questions.length} name={index => draft.questions[index].label || `question ${index + 1}`} onMove={(from, to) => setQuestions(list => moveTo(list, from, to))}>
                {(index, grip) => { const question = draft.questions[index]; return <li key={question.key}>
                  {grip}
                  <div className="event-question-main">
                    {question.standardKey ? <strong>{question.label}</strong> : <label className="field-label"><span>Question</span><input type="text" maxLength={160} value={question.label} onChange={event => changeQuestion(question.key, { label: event.target.value })} /></label>}
                    <span className="field-hint">{question.standardKey ? "Ready-made" : "Your question"} · {EVENT_FIELD_TYPE_LABELS[question.fieldType]}</span>
                    {isChoice(question.fieldType) ? <label className="field-label"><span>Options, one per line</span><textarea rows={3} value={question.options} onChange={event => changeQuestion(question.key, { options: event.target.value })} /></label> : null}
                  </div>
                  <div className="event-row-tools">
                    {question.standardKey === "fullName" ? <span className="event-fixed">Always required</span> : <select className="event-select" aria-label={`How "${question.label || "this question"}" appears`} value={question.mode} onChange={event => changeQuestion(question.key, { mode: event.target.value as EventFieldMode })}>
                      {(["required", "optional", "hidden"] as const).map(mode => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
                    </select>}
                    {question.standardKey ? null : <button type="button" className="outline-button event-danger" aria-label={`Remove "${question.label || "this question"}"`} onClick={() => setQuestions(list => list.filter(item => item.key !== question.key))}>Remove</button>}
                  </div>
                </li>; }}
              </SortList>
              {draft.questions.length < MAX_EVENT_FIELDS ? <div className="event-add">
                <label className="field-label"><span>Add your own question</span><select value={newType} onChange={event => setNewType(event.target.value as EventFieldType)}>{EVENT_FIELD_TYPES.map(type => <option key={type} value={type}>{EVENT_FIELD_TYPE_LABELS[type]}</option>)}</select></label>
                <button type="button" className="outline-button" onClick={() => setQuestions(list => [...list, { key: `new-${Date.now()}`, standardKey: null, label: "", fieldType: newType, mode: "optional", options: "" }])}>Add question</button>
              </div> : <p className="field-hint">The form is full ({MAX_EVENT_FIELDS} questions).</p>}
              <p className="field-hint">Removing a question that people have already answered hides it and keeps their answers.</p>
            </div>
            {stepNav("rsvp")}
          </section>

          <section {...panelProps("design")}>
            <div className="builder-panel-head"><h2>Design</h2><p>The page uses the same layout as a Business card page. Pick a theme, a font and an accent color.</p></div>
            <div className="builder-panel-body">
              <EventPageLook page={draft.page} brandColor={company.colors?.primary} url={`${window.location.origin}/event/${meta.slug || "your-event"}?source=qr`} onChange={changePage} />
            </div>
            {stepNav("design")}
          </section>
        </div>

        <div className="builder-preview-column" id="event-preview-panel" role="tabpanel" aria-labelledby="event-tab-preview">
          <div className="preview-sticky">
            <div className="preview-label"><span>Live preview</span><span><span className="status-dot" /> updates as you type</span></div>
            <div className="lx-preview" role="region" aria-label={`Preview of ${details.title.trim() || "your event page"}`} tabIndex={0}>
              {/* A picture of the page, not the page: nothing inside can be pressed or tabbed to. */}
              <div className="event-preview-still" inert>
                <EventLanding event={view} pageUrl="">
                  <header className="lx-section-head"><h2>RSVP</h2></header>
                  <form>
                    <fieldset className="event-choice event-status">
                      <legend>Will you come?<span className="event-required" aria-hidden="true"> *</span></legend>
                      {choices.map(choice => <label key={choice}><input type="radio" name="event-preview-status" readOnly /> {RSVP_STATUS_LABELS[choice]}</label>)}
                    </fieldset>
                    {view.fields.map(field => <EventAnswerInput key={field.id} field={field} value={undefined} onChange={() => undefined} />)}
                    <button type="button" className="lx-btn lx-btn-primary ev-send">Send RSVP</button>
                  </form>
                </EventLanding>
              </div>
            </div>
            <div className="preview-tip"><Sparkles size={14} aria-hidden="true" /> {target ? "Guests see this once you save." : "Guests see this once the event is created and published."}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
