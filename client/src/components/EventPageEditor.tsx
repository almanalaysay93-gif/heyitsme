import { Fold } from "@/components/Fold";
import { SortList, moveTo, movedPosition } from "@/components/SortList";
import { eventQrSvg } from "@/lib/eventQr";
import { failed, logoData, readBase64 } from "@/lib/teamFiles";
import { trpc } from "@/lib/trpc";
import {
  EVENT_MOTIONS,
  EVENT_MOTION_LABELS,
  EVENT_PAGE_LIMITS,
  EVENT_PALETTES,
  EVENT_SECTION_LABELS,
  EVENT_STYLES,
  EVENT_STYLE_LABELS,
  EVENT_THEMES,
  EVENT_THEME_LABELS,
  eventLook,
  eventQr,
  newSpeakerId,
  resolveEventSections,
  type EventMotion,
  type EventPage,
  type EventSectionId,
  type EventStyle,
} from "@shared/eventPage";
import { EVENT_FONTS, EVENT_FONT_LABELS, type EventFont } from "@shared/events";
import { Check, Eye, EyeOff, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

type Target = { workspaceId: number; eventId: number };
export type EventPageChange = (change: (current: EventPage) => EventPage) => void;
type ListKey = "agenda" | "speakers" | "gallery" | "sponsors" | "faq" | "links";
/** Schedule days and sponsor tiers work the same way: a list of names, and each row holds the position of its name. */
const GROUPS = {
  agendaDays: { rows: "agenda", at: "day", section: "schedule", one: "day", title: "Days", add: "Add a day", name: (n: number) => `Day ${n}`, help: "For an event that runs longer than one day. Leave this empty and the schedule is one list." },
  sponsorTiers: { rows: "sponsors", at: "tier", section: "sponsors", one: "tier", title: "Tiers", add: "Add a tier", name: (n: number) => `Tier ${n}`, help: "For example Gold, Silver, Partner. The first tier is shown largest. Leave this empty for one list." },
} as const;
type GroupKey = keyof typeof GROUPS;

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const FEATURED_FULL = `Up to ${EVENT_PAGE_LIMITS.featured} featured speakers. Unfeature one first.`;
const NEEDS_EVENT = "Pictures can be added once the event is created. Create the event, then come back here.";
const SECTION_HELP: Record<EventSectionId, string> = {
  details: "Shows the description, date, place and organizer from the Details tab.",
  schedule: "What happens and when. Type the time the way you want it shown, for example 9:00 AM.",
  speakers: "Featured speakers get a large block with their bio. The others sit in a grid below.",
  gallery: `Up to ${EVENT_PAGE_LIMITS.gallery} photos. Visitors can open each one full size.`,
  sponsors: "A name, and a logo if you have one. Add a link to make the logo open the sponsor's site.",
  faq: "Short answers to what guests ask most: parking, dress code, what to bring.",
  links: "Tickets, a map, a livestream, a brochure. Each link needs a title.",
};

/** The first thing that would stop a save, in words the admin can act on, and the section it is in. */
export function eventPageProblem(page: EventPage): { section: EventSectionId; text: string } | null {
  const row = (section: EventSectionId, index: number, what: string) => ({ section, text: `${EVENT_SECTION_LABELS[section]}, row ${index + 1}: ${what}` });
  const first = <T,>(list: T[], bad: (item: T) => boolean) => list.findIndex(bad);
  let at = first(page.agendaDays, name => !name.trim());
  if (at >= 0) return { section: "schedule", text: `${EVENT_SECTION_LABELS.schedule}: give day ${at + 1} a name, or remove it.` };
  at = first(page.sponsorTiers, name => !name.trim());
  if (at >= 0) return { section: "sponsors", text: `${EVENT_SECTION_LABELS.sponsors}: give tier ${at + 1} a name, or remove it.` };
  at = first(page.agenda, item => !item.title.trim());
  if (at >= 0) return row("schedule", at, "add a title.");
  at = first(page.speakers, item => !item.name.trim());
  if (at >= 0) return row("speakers", at, "add a name.");
  at = first(page.sponsors, item => !item.name.trim());
  if (at >= 0) return row("sponsors", at, "add a name.");
  at = first(page.faq, item => !item.question.trim() || !item.answer.trim());
  if (at >= 0) return row("faq", at, "add a question and an answer.");
  at = first(page.links, item => !item.title.trim() || !item.url.trim());
  if (at >= 0) return row("links", at, "add a title and a link.");
  if (page.speakers.filter(speaker => speaker.featured).length > EVENT_PAGE_LIMITS.featured) return { section: "speakers", text: FEATURED_FULL };
  return null;
}

/** A picture tile, the same one the card builder uses: press it to choose a file. The picture is shown inside it. */
export function EventImagePicker({ label, hint, shape, url, busy, disabled, contain, onPick, onClear }: { label: string; hint: string; shape: "round" | "wide"; url: string; busy: boolean; disabled?: boolean; contain?: boolean; onPick: (file: File | undefined) => void; onClear: () => void }) {
  return <div className={`image-picker image-picker-${shape}${contain ? " image-picker-logo" : ""}${disabled ? " is-disabled" : ""}`}>
    <label className="image-picker-drop">
      {url ? <img src={url} alt="" /> : <span className="image-picker-empty"><ImageIcon size={18} aria-hidden="true" /></span>}
      <input type="file" accept={IMAGE_ACCEPT} disabled={busy || disabled} onChange={change => { onPick(change.target.files?.[0]); change.target.value = ""; }} />
      <span className="sr-only">{url ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</span>
    </label>
    <div className="image-picker-copy">
      <strong>{label}</strong>
      <span>{busy ? "Uploading..." : hint}</span>
      {url && !disabled ? <button type="button" className="link-button" disabled={busy} onClick={onClear}><Trash2 size={12} aria-hidden="true" /> Remove</button> : null}
    </div>
  </div>;
}

/**
 * The Page tab of the event builder: sections in folds, dragged by their grips into the order the page shows them.
 * The builder owns the page and saves it; `target` is null until the event exists, and pictures need it.
 */
export function EventPageSections({ page, onChange, target, issue, onBusy }: { page: EventPage; onChange: EventPageChange; target: Target | null; issue: EventSectionId | null; onBusy: (busy: boolean) => void }) {
  const uploadImage = trpc.teamEvents.uploadImage.useMutation();
  const copyCardPhoto = trpc.teamEvents.copyCardPhoto.useMutation();
  const cards = trpc.teamEvents.speakerCards.useQuery(target ?? { workspaceId: 0, eventId: 0 }, { enabled: target !== null });
  const [uploading, setUploading] = useState("");
  useEffect(() => { onBusy(uploading !== ""); }, [uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = onChange;
  const setList = <K extends ListKey>(key: K, change: (list: EventPage[K]) => EventPage[K]) => edit(current => ({ ...current, [key]: change(current[key]) }));
  const setRow = <K extends ListKey>(key: K, index: number, patch: Partial<EventPage[K][number]>) =>
    setList(key, list => list.map((item, at) => (at === index ? { ...item, ...patch } : item)) as EventPage[K]);
  /** One section's rows: drag the grip to reorder, Remove on the right. */
  const rows = <K extends ListKey>(key: K, name: (item: EventPage[K][number], index: number) => string, main: (item: EventPage[K][number], index: number) => ReactNode) =>
    <SortList className="event-questions" count={page[key].length} name={index => name(page[key][index], index)} onMove={(from, to) => setList(key, list => moveTo(list as unknown[], from, to) as never)}>
      {(index, grip) => <li key={index}>
        {grip}
        <div className="event-question-main">{main(page[key][index], index)}</div>
        <div className="event-row-tools"><button type="button" className="outline-button event-danger" aria-label={`Remove ${name(page[key][index], index)}`} onClick={() => setList(key, list => (list as unknown[]).filter((_, at) => at !== index) as never)}>Remove</button></div>
      </li>}
    </SortList>;

  const field = (label: string, value: string, max: number, onInput: (value: string) => void, extra: { type?: string; placeholder?: string } = {}) =>
    <label className="field-label"><span>{label}</span><input type={extra.type ?? "text"} maxLength={max} placeholder={extra.placeholder} value={value} onChange={event => onInput(event.target.value)} /></label>;
  const area = (label: string, value: string, max: number, rows: number, onInput: (value: string) => void) =>
    <label className="field-label"><span>{label}</span><textarea rows={rows} maxLength={max} value={value} onChange={event => onInput(event.target.value)} /></label>;

  // Rows follow their day or tier when it moves. Rows of a removed one go to the first that is left; nothing is deleted.
  const remap = (key: GroupKey, change: (names: string[]) => string[], to: (at: number) => number) => edit(current => {
    const { rows, at } = GROUPS[key];
    return { ...current, [key]: change(current[key]), [rows]: (current[rows] as Record<string, unknown>[]).map(row => ({ ...row, [at]: to(row[at] as number) })) };
  });
  const groupEditor = (key: GroupKey) => {
    const names = page[key];
    const { one, title, add, name, help } = GROUPS[key];
    return <div className="event-groups">
      <h3>{title}</h3>
      <p className="field-hint">{help}</p>
      <SortList as="div" className="event-group-rows" count={names.length} name={index => names[index] || `${one} ${index + 1}`} onMove={(from, to) => remap(key, list => moveTo(list, from, to), at => movedPosition(at, from, to))}>
        {(index, grip) => <div className="event-group-row" key={index}>
          {grip}
          {field(`Name of ${one} ${index + 1}`, names[index], 40, next => edit(current => ({ ...current, [key]: current[key].map((item, at) => (at === index ? next : item)) })))}
          <div className="event-row-tools"><button type="button" className="outline-button event-danger" aria-label={`Remove ${names[index] || `${one} ${index + 1}`}`} onClick={() => remap(key, list => list.filter((_, at) => at !== index), at => (at > index ? at - 1 : at === index ? 0 : at))}>Remove</button></div>
        </div>}
      </SortList>
      {names.length < EVENT_PAGE_LIMITS[key]
        ? <div className="event-row-tools"><button type="button" className="outline-button" onClick={() => edit(current => ({ ...current, [key]: [...current[key], name(current[key].length + 1)] }))}>{add}</button></div>
        : <p className="field-hint">Up to {EVENT_PAGE_LIMITS[key]} {one}s.</p>}
    </div>;
  };
  /** Which day or tier a row belongs to. Hidden until there are two to choose from. */
  const groupPick = (key: GroupKey, label: string, value: number, onPick: (at: number) => void) =>
    page[key].length > 1 ? <label className="field-label"><span>{label}</span><select value={Math.min(value, page[key].length - 1)} onChange={event => onPick(Number(event.target.value))}>
      {page[key].map((name, at) => <option key={at} value={at}>{name || GROUPS[key].name(at + 1)}</option>)}
    </select></label> : null;

  const speakerName = (id: string) => {
    const at = page.speakers.findIndex(speaker => speaker.id === id);
    return at < 0 ? null : page.speakers[at].name || `Speaker ${at + 1}`;
  };
  const rowSpeakerPick = (index: number, ids: string[]) => {
    if (page.speakers.length === 0) return null;
    const on = ids.filter(id => speakerName(id) !== null);
    const free = page.speakers.filter(speaker => !on.includes(speaker.id));
    return <fieldset className="event-row-speakers">
      <legend>Speakers on this row (optional)</legend>
      {on.length > 0 ? <div className="event-chips">
        {on.map(id => <button type="button" key={id} className="outline-button" aria-label={`Take ${speakerName(id)} off this row`} onClick={() => setRow("agenda", index, { speakerIds: on.filter(item => item !== id) })}>{speakerName(id)} <span aria-hidden="true">×</span></button>)}
      </div> : null}
      {on.length >= EVENT_PAGE_LIMITS.rowSpeakers ? <p className="field-hint">Up to {EVENT_PAGE_LIMITS.rowSpeakers} speakers on one row.</p>
        : free.length > 0 ? <label className="field-label"><span>Add a speaker to this row</span><select value="" onChange={event => { if (event.target.value) setRow("agenda", index, { speakerIds: [...on, event.target.value] }); }}>
          <option value="">Choose a speaker...</option>
          {free.map(speaker => <option key={speaker.id} value={speaker.id}>{speakerName(speaker.id)}</option>)}
        </select></label> : null}
    </fieldset>;
  };

  const sections = resolveEventSections(page);
  const setSections = (change: (list: typeof sections) => typeof sections) => edit(current => ({ ...current, sections: change(resolveEventSections(current)) }));

  const upload = async (file: File | undefined, slot: string): Promise<string | null> => {
    if (!file || !target) return null;
    if (file.size > MAX_IMAGE_BYTES) { toast.error("Image is larger than 3MB. Upload a smaller one."); return null; }
    setUploading(slot);
    try {
      return (await uploadImage.mutateAsync({ ...target, fileName: file.name, contentType: file.type || "image/png", dataBase64: await readBase64(file) })).url;
    } catch (error) {
      failed(error);
      return null;
    } finally {
      setUploading("");
    }
  };

  const addFromCard = async (cardSlug: string) => {
    const card = cards.data?.find(item => item.slug === cardSlug);
    if (!card || !target) return;
    if (page.speakers.length >= EVENT_PAGE_LIMITS.speakers) { toast.error(`Up to ${EVENT_PAGE_LIMITS.speakers} speakers.`); return; }
    setList("speakers", list => [...list, { id: newSpeakerId(), name: (card.name ?? "").slice(0, 80), role: (card.role ?? "").slice(0, 80), bio: (card.bio ?? "").slice(0, 400), photoUrl: "", cardSlug: card.slug, featured: false }]);
    if (!card.hasPhoto) return;
    setUploading(`card-${card.slug}`);
    try {
      const { url } = await copyCardPhoto.mutateAsync({ ...target, cardSlug: card.slug });
      if (url) setList("speakers", list => list.map(speaker => (speaker.cardSlug === card.slug && !speaker.photoUrl ? { ...speaker, photoUrl: url } : speaker)));
      else toast.message("The card's photo could not be copied. You can upload one.");
    } catch (error) {
      failed(error);
    } finally {
      setUploading("");
    }
  };
  const toggleFeatured = (index: number, featured: boolean) => {
    if (featured && page.speakers.filter(speaker => speaker.featured).length >= EVENT_PAGE_LIMITS.featured) { toast.error(FEATURED_FULL); return; }
    setRow("speakers", index, { featured });
  };
  const addPhotos = async (files: FileList | null) => {
    let room = EVENT_PAGE_LIMITS.gallery - page.gallery.length;
    for (const file of Array.from(files ?? [])) {
      if (room <= 0) { toast.error(`Up to ${EVENT_PAGE_LIMITS.gallery} photos.`); break; }
      const url = await upload(file, "gallery");
      if (!url) continue;
      room -= 1;
      setList("gallery", list => [...list, { url, alt: "" }]);
    }
  };

  const addRow = (key: ListKey, label: string, blank: () => void) =>
    page[key].length < EVENT_PAGE_LIMITS[key] ? <div className="event-row-tools"><button type="button" className="outline-button" onClick={blank}>{label}</button></div> : <p className="field-hint">This section is full ({EVENT_PAGE_LIMITS[key]}).</p>;
  const needsEvent = <p className="field-hint">{NEEDS_EVENT}</p>;

  const body: Record<EventSectionId, () => ReactNode> = {
    details: () => null,
    schedule: () => <>
      {groupEditor("agendaDays")}
      {rows("agenda", (item, index) => item.title || `row ${index + 1}`, (item, index) => <>
            {field("Time", item.time, 40, time => setRow("agenda", index, { time }), { placeholder: "9:00 AM" })}
            {field("Title", item.title, 120, title => setRow("agenda", index, { title }))}
            {area("Note (optional)", item.note, 300, 2, note => setRow("agenda", index, { note }))}
            {groupPick("agendaDays", "Day", item.day, day => setRow("agenda", index, { day }))}
            {rowSpeakerPick(index, item.speakerIds)}
      </>)}
      {addRow("agenda", "Add schedule row", () => setList("agenda", list => [...list, { time: "", title: "", note: "", day: list.at(-1)?.day ?? 0, speakerIds: [] }]))}
      {page.speakers.length === 0 ? <p className="field-hint">Add people in the Speakers section to show who is on each row.</p> : null}
    </>,
    speakers: () => <>
      {rows("speakers", (speaker, index) => speaker.name || `speaker ${index + 1}`, (speaker, index) => <>
            {field("Name", speaker.name, 80, name => setRow("speakers", index, { name }))}
            {field("Role or title", speaker.role, 80, role => setRow("speakers", index, { role }))}
            {area("Bio (shown for featured speakers)", speaker.bio, 400, 3, bio => setRow("speakers", index, { bio }))}
            {target ? <EventImagePicker label="Photo" hint="Square works best. Up to 3MB" shape="round" url={speaker.photoUrl} busy={uploading === `speaker-${index}` || uploading === `card-${speaker.cardSlug}`} onPick={file => void upload(file, `speaker-${index}`).then(url => { if (url) setRow("speakers", index, { photoUrl: url }); })} onClear={() => setRow("speakers", index, { photoUrl: "" })} /> : null}
            <label className="team-toggle"><input type="checkbox" checked={speaker.featured} onChange={event => toggleFeatured(index, event.target.checked)} /> Featured speaker</label>
            {speaker.cardSlug ? <label className="team-toggle"><input type="checkbox" checked onChange={() => setRow("speakers", index, { cardSlug: "" })} /> Link to their heyitsme card</label> : null}
      </>)}
      {page.speakers.length < EVENT_PAGE_LIMITS.speakers ? <div className="event-add">
        {cards.data?.length ? <label className="field-label"><span>Add from a team card</span><select value="" disabled={uploading !== ""} onChange={event => void addFromCard(event.target.value)}>
          <option value="">Choose a card...</option>
          {cards.data.map(card => <option key={card.slug} value={card.slug}>{card.name}{card.role ? ` · ${card.role}` : ""}</option>)}
        </select></label> : null}
        <button type="button" className="outline-button" onClick={() => setList("speakers", list => [...list, { id: newSpeakerId(), name: "", role: "", bio: "", photoUrl: "", cardSlug: "", featured: false }])}>Add speaker</button>
      </div> : <p className="field-hint">This section is full ({EVENT_PAGE_LIMITS.speakers}).</p>}
      {target
        ? <p className="field-hint">A team card fills in the name, role, bio and photo once. Later changes to the card do not change this page.</p>
        : <p className="field-hint">Speaker photos, and adding a speaker from a team card, come once the event is created.</p>}
    </>,
    gallery: () => <>
      {rows("gallery", (photo, index) => `photo ${index + 1}`, (photo, index) => <>
            <img className="event-thumb" src={photo.url} alt="" />
            {field("What the photo shows (for screen readers)", photo.alt, 120, alt => setRow("gallery", index, { alt }))}
      </>)}
      {!target ? needsEvent : page.gallery.length < EVENT_PAGE_LIMITS.gallery
        ? <div className="event-row-tools"><label className="outline-button team-file">{uploading === "gallery" ? "Uploading..." : "Upload photos"}<input type="file" accept={IMAGE_ACCEPT} multiple disabled={uploading !== ""} onChange={change => { void addPhotos(change.target.files); change.target.value = ""; }} /></label></div>
        : <p className="field-hint">This section is full ({EVENT_PAGE_LIMITS.gallery}).</p>}
    </>,
    sponsors: () => <>
      {groupEditor("sponsorTiers")}
      {rows("sponsors", (sponsor, index) => sponsor.name || `sponsor ${index + 1}`, (sponsor, index) => <>
            {field("Name", sponsor.name, 80, name => setRow("sponsors", index, { name }))}
            {field("Website (optional)", sponsor.url, 600, url => setRow("sponsors", index, { url }), { type: "url", placeholder: "https://" })}
            {groupPick("sponsorTiers", "Tier", sponsor.tier, tier => setRow("sponsors", index, { tier }))}
            {target ? <EventImagePicker label="Logo" hint="Shown whole, not cropped. Up to 3MB" shape="wide" contain url={sponsor.logoUrl} busy={uploading === `sponsor-${index}`} onPick={file => void upload(file, `sponsor-${index}`).then(url => { if (url) setRow("sponsors", index, { logoUrl: url }); })} onClear={() => setRow("sponsors", index, { logoUrl: "" })} /> : null}
      </>)}
      {addRow("sponsors", "Add sponsor", () => setList("sponsors", list => [...list, { name: "", logoUrl: "", url: "", tier: list.at(-1)?.tier ?? 0 }]))}
      {target ? null : <p className="field-hint">Sponsor logos come once the event is created.</p>}
    </>,
    faq: () => <>
      {rows("faq", (item, index) => item.question || `question ${index + 1}`, (item, index) => <>
            {field("Question", item.question, 160, question => setRow("faq", index, { question }))}
            {area("Answer", item.answer, 800, 3, answer => setRow("faq", index, { answer }))}
      </>)}
      {addRow("faq", "Add question", () => setList("faq", list => [...list, { question: "", answer: "" }]))}
    </>,
    links: () => <>
      {rows("links", (link, index) => link.title || `link ${index + 1}`, (link, index) => <>
            {field("Title", link.title, 80, title => setRow("links", index, { title }))}
            {field("Link", link.url, 600, url => setRow("links", index, { url }), { type: "url", placeholder: "https://" })}
            {field("Short description (optional)", link.description, 160, description => setRow("links", index, { description }))}
      </>)}
      {addRow("links", "Add link", () => setList("links", list => [...list, { title: "", url: "", description: "" }]))}
    </>,
  };
  const count = (id: EventSectionId) => (id === "details" ? 0 : id === "schedule" ? page.agenda.length : page[id].length);
  const unfinished = eventPageProblem(page)?.section ?? null;

  return <SortList as="div" className="fold-list" count={sections.length} name={index => EVENT_SECTION_LABELS[sections[index].id]} onMove={(from, to) => setSections(list => moveTo(list, from, to))}>
    {(index, grip) => {
      const section = sections[index];
      const label = EVENT_SECTION_LABELS[section.id];
      const items = count(section.id);
      return <div className={`event-sort-fold${section.hidden ? " is-hidden" : ""}`} key={section.id}>{grip}<Fold title={label} hint={SECTION_HELP[section.id]} attention={unfinished === section.id} forceOpen={issue === section.id}
        meta={section.hidden ? "Hidden" : items ? `${items} added` : section.id === "details" ? "On the page" : "Empty"}>
        {body[section.id]()}
      </Fold>
        <button type="button" className="icon-button" aria-pressed={!section.hidden} aria-label={`Show ${label} on page`} title={section.hidden ? "Hidden. Press to show on the page." : "Shown. Press to hide from the page."} onClick={() => setSections(list => list.map(item => (item.id === section.id ? { ...item, hidden: !item.hidden } : item)))}>
          {section.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>;
    }}
  </SortList>;
}

/** The Design tab of the event builder: theme, font and accent color. */
const STYLE_HELP: Record<EventStyle, string> = {
  glass: "Frosted panels over a soft backdrop that drifts.",
  flat: "Solid panels with a plain outline. No blur and no depth, like a printed poster.",
};
const MOTION_HELP: Record<EventMotion, string> = {
  full: "Sections glide in, the backdrop drifts and panels catch the pointer.",
  calm: "Sections glide in once. Nothing else moves.",
  off: "Nothing moves.",
};
const COLOR_FIELDS = [["background", "Background"], ["text", "Text"], ["button", "Button"], ["buttonText", "Button text"]] as const;
const QR_FIELDS = [["dots", "Dots"], ["background", "Background"], ["frame", "Frame"]] as const;

/** `brandColor` is the team's main color. `url` is the event link the QR preview points at. */
const STYLING_OFF = "Not available for this team right now. What is saved stays on the page, and you can still reset it.";

export function EventPageLook({ page, brandColor, companyLogoUrl, canStyle, canUpload, logoBusy, onPickLogo, url, onChange }: { page: EventPage; brandColor?: string | null; companyLogoUrl?: string | null; canStyle: boolean; canUpload: boolean; logoBusy: boolean; onPickLogo: (file: File | undefined) => void; url: string; onChange: EventPageChange }) {
  const look = eventLook(page, brandColor);
  const qr = eventQr(page, brandColor);
  const shown = { background: look.paper, text: look.ink, button: look.button, buttonText: look.onButton };
  const ownColors = COLOR_FIELDS.some(([key]) => page.colors[key]);
  const ownQr = QR_FIELDS.some(([key]) => page.qr[key]) || page.qr.rounded || Boolean(page.qr.logoUrl);
  // The event's own logo, or the company's: the same one the Share section puts in the download.
  const logoUrl = page.qr.logoUrl || companyLogoUrl || "";
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (logoUrl) void logoData(logoUrl).then(data => { if (live) setLogo(data); });
    else setLogo(null);
    return () => { live = false; };
  }, [logoUrl]);
  const code = useMemo(
    () => eventQrSvg(url, { dots: qr.dots, background: qr.background, frame: qr.frame, rounded: qr.rounded }, "Scan to RSVP", logo),
    [url, qr.dots, qr.background, qr.frame, qr.rounded, logo],
  );
  return <>
    <div className="form-section">
      <div className="pd-block-head"><h3>Theme</h3><p>Sets the page background, the text color and the default accent.</p></div>
      <div className="theme-picker" role="group" aria-label="Theme">
        {EVENT_THEMES.map(theme => <button type="button" key={theme} aria-pressed={page.theme === theme} className={`theme-swatch ${page.theme === theme ? "is-selected" : ""}`} onClick={() => onChange(current => ({ ...current, theme }))}>
          <span className="swatch-colors">
            <i style={{ background: EVENT_PALETTES[theme].paper }} />
            <i style={{ background: EVENT_PALETTES[theme].accent }} />
            <i style={{ background: EVENT_PALETTES[theme].ink }} />
          </span>
          <span>{EVENT_THEME_LABELS[theme]}</span>
          {page.theme === theme ? <Check size={14} aria-hidden="true" /> : null}
        </button>)}
      </div>
    </div>
    <div className="form-section">
      <div className="pd-block-head"><h3>Page style</h3><p>How the panels and buttons are drawn. Works with every theme and color.</p></div>
      <div className="theme-picker" role="group" aria-label="Page style">
        {EVENT_STYLES.map(style => <button type="button" key={style} aria-pressed={page.style === style} className={`theme-swatch ${page.style === style ? "is-selected" : ""}`} onClick={() => onChange(current => ({ ...current, style }))}>
          <span className={`event-style-chip event-style-chip-${style}`} aria-hidden="true" />
          <span>{EVENT_STYLE_LABELS[style]}</span>
          {page.style === style ? <Check size={14} aria-hidden="true" /> : null}
        </button>)}
      </div>
      <p className="field-hint">{STYLE_HELP[page.style]}</p>
    </div>
    <div className="form-section">
      <div className="pd-block-head"><h3>Font</h3><p>Used for every heading and line on the page.</p></div>
      <label className="field-label"><select aria-label="Font" value={page.font} onChange={event => onChange(current => ({ ...current, font: event.target.value as EventFont }))}>{EVENT_FONTS.map(font => <option key={font} value={font}>{EVENT_FONT_LABELS[font]}</option>)}</select></label>
    </div>
    <div className="form-section">
      <div className="pd-block">
        <div className="pd-block-head"><h3>Accent color</h3><p>The accent colors the buttons and highlights. Without one of your own, the page uses your company color from Brand. Reset goes back to it.</p></div>
        <div className="pd-accent">
          <label className="pd-swatch">
            <input type="color" aria-label="Accent color" value={page.accent || EVENT_PALETTES[page.theme].accent} onChange={event => onChange(current => ({ ...current, accent: event.target.value }))} />
            <span>{page.accent ? page.accent.toUpperCase() : "Company color"}</span>
          </label>
          {page.accent ? <button type="button" className="outline-button pd-small-button" onClick={() => onChange(current => ({ ...current, accent: "" }))}><RotateCcw size={13} aria-hidden="true" /> Reset</button> : null}
        </div>
      </div>
    </div>
    <div className="form-section">
      <div className="pd-block">
        <div className="pd-block-head"><h3>Custom colors</h3><p>Your own background, text and button colors. A color you leave alone follows the theme and the accent.</p></div>
        <div className="pd-accent">
          {COLOR_FIELDS.map(([key, label]) => <label className="pd-swatch" key={key}>
            <input type="color" aria-label={`${label} color`} disabled={!canStyle} value={page.colors[key] || shown[key]} onChange={event => onChange(current => ({ ...current, colors: { ...current.colors, [key]: event.target.value } }))} />
            <span>{label}: {page.colors[key] ? page.colors[key].toUpperCase() : "Theme"}</span>
          </label>)}
          {ownColors ? <button type="button" className="outline-button pd-small-button" onClick={() => onChange(current => ({ ...current, colors: { background: "", text: "", button: "", buttonText: "" } }))}><RotateCcw size={13} aria-hidden="true" /> Reset colors</button> : null}
        </div>
        {canStyle ? null : <p className="field-hint event-look-note">{STYLING_OFF}</p>}
        {look.notes.map(note => <p className="field-hint event-look-note" role="status" key={note}>{note}</p>)}
      </div>
    </div>
    <div className="form-section">
      <div className="pd-block-head"><h3>Animation</h3><p>How much the page moves. Visitors who ask their device for less motion always get the still page.</p></div>
      <div className="theme-picker" role="group" aria-label="Animation">
        {EVENT_MOTIONS.map(motion => <button type="button" key={motion} aria-pressed={page.motion === motion} className={`theme-swatch ${page.motion === motion ? "is-selected" : ""}`} onClick={() => onChange(current => ({ ...current, motion }))}>
          <span>{EVENT_MOTION_LABELS[motion]}</span>
          {page.motion === motion ? <Check size={14} aria-hidden="true" /> : null}
        </button>)}
      </div>
      <p className="field-hint">{MOTION_HELP[page.motion]}</p>
    </div>
    <div className="form-section">
      <div className="pd-block">
        <div className="pd-block-head"><h3>QR code</h3><p>The code people scan to open this page. Download it from the event's Share section after you save.</p></div>
        <div className="event-qr-preview" dangerouslySetInnerHTML={{ __html: code }} />
        <div className="pd-accent">
          {QR_FIELDS.map(([key, label]) => <label className="pd-swatch" key={key}>
            <input type="color" aria-label={`QR ${label.toLowerCase()} color`} disabled={!canStyle} value={page.qr[key] || qr[key]} onChange={event => onChange(current => ({ ...current, qr: { ...current.qr, [key]: event.target.value } }))} />
            <span>{label}: {page.qr[key] ? page.qr[key].toUpperCase() : key === "frame" ? "Company color" : "Standard"}</span>
          </label>)}
          {ownQr ? <button type="button" className="outline-button pd-small-button" onClick={() => onChange(current => ({ ...current, qr: { dots: "", background: "", frame: "", rounded: false, logoUrl: "" } }))}><RotateCcw size={13} aria-hidden="true" /> Reset code</button> : null}
        </div>
        <EventImagePicker label="Logo in the code" shape="wide" contain url={page.qr.logoUrl} busy={logoBusy} disabled={!canUpload || !canStyle}
          hint={!canUpload ? "Add it once the event is created." : companyLogoUrl ? "JPG, PNG or WebP, up to 3MB. Square logos fit best. Without one, the code uses your company logo from Brand." : "JPG, PNG or WebP, up to 3MB. Square logos fit best."}
          onPick={onPickLogo} onClear={() => onChange(current => ({ ...current, qr: { ...current.qr, logoUrl: "" } }))} />
        <label className="pd-check"><input type="checkbox" checked={page.qr.rounded} disabled={!canStyle && !page.qr.rounded} onChange={event => onChange(current => ({ ...current, qr: { ...current.qr, rounded: event.target.checked } }))} /> Rounded dots</label>
        {canStyle ? null : <p className="field-hint event-look-note">{STYLING_OFF}</p>}
        {qr.note ? <p className="field-hint event-look-note" role="status">{qr.note}</p> : null}
      </div>
    </div>
  </>;
}
