import { failed, logoData, readBase64, save } from "@/lib/teamFiles";
import { trpc } from "@/lib/trpc";
import { instantToWall } from "@shared/events";
import {
  BACKGROUND_CTA_MAX,
  BACKGROUND_PARTS,
  BACKGROUND_PART_LABELS,
  BACKGROUND_SIZES,
  BANNER_TARGETS,
  BANNER_TARGET_LABELS,
  SIGNATURE_NOTE_MAX,
  SIGNATURE_PARTS,
  SIGNATURE_PART_LABELS,
  isDarkColor,
  signatureHtml,
  signatureText,
  type BackgroundPart,
  type BackgroundSettings,
  type BackgroundSide,
  type BannerTarget,
  type SignaturePart,
  type SignatureSettings,
} from "@shared/teamKit";
import type { inferRouterOutputs } from "@trpc/server";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";

type Outputs = inferRouterOutputs<AppRouter>;
type AssetRow = Outputs["teamAssets"]["list"]["assets"][number];
type Kit = Outputs["teamKit"]["get"];
type KitCard = Kit["cards"][number];
type BannerList = Outputs["teamBanners"]["list"];
type BannerRow = BannerList["banners"][number];

const SECTIONS = ["Files", "Email signature", "Meeting background", "Banners"] as const;
type Section = (typeof SECTIONS)[number];
const DEFAULT_COLOR = "#234bad";
const fileSize = (bytes: number | null) => (bytes === null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const loading = <section className="gr-panel" role="status">Loading...</section>;

/** Company files, the email signature, the meeting background and scheduled banners. */
export function TeamAssets({ workspaceId, admin }: { workspaceId: number; admin: boolean }) {
  const [section, setSection] = useState<Section>("Files");
  const sections = SECTIONS.filter(name => admin || name !== "Banners");
  return <>
    <div className="team-ranges" role="group" aria-label="Assets">
      {sections.map(name => <button key={name} type="button" aria-pressed={section === name} onClick={() => setSection(name)}>{name}</button>)}
    </div>
    {section === "Files" ? <Files workspaceId={workspaceId} /> : null}
    {section === "Email signature" ? <Signature workspaceId={workspaceId} /> : null}
    {section === "Meeting background" ? <Background workspaceId={workspaceId} /> : null}
    {section === "Banners" && admin ? <Banners workspaceId={workspaceId} /> : null}
  </>;
}

// ---- Files ----

function Files({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.teamAssets.list.useQuery({ workspaceId });
  const refresh = () => utils.teamAssets.list.invalidate({ workspaceId });
  const done = (message: string) => ({ onSuccess: () => { toast.success(message); void refresh(); }, onError: failed });
  const addLink = trpc.teamAssets.addLink.useMutation(done("Link added."));
  const upload = trpc.teamAssets.upload.useMutation(done("File added."));
  const update = trpc.teamAssets.update.useMutation(done("Saved."));
  const replaceFile = trpc.teamAssets.replaceFile.useMutation(done("New version saved. Cards now show it."));
  const setArchived = trpc.teamAssets.setArchived.useMutation(done("Saved."));
  const setOnCard = trpc.teamAssets.setOnCard.useMutation(done("Card updated."));
  const [cardId, setCardId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  if (list.isLoading) return loading;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Files could not be loaded."}</p></section>;
  const { assets, cards, canManage, perCard } = list.data;
  const card = cards.find(candidate => candidate.id === cardId) ?? cards[0] ?? null;
  const onCard = card ? assets.filter(asset => asset.cardIds.includes(card.id)).length : 0;

  const submitLink = (event: FormEvent) => {
    event.preventDefault();
    addLink.mutate({ workspaceId, title: linkTitle, url: linkUrl }, { onSuccess: () => { setLinkTitle(""); setLinkUrl(""); } });
  };
  const submitFile = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    try {
      await upload.mutateAsync({ workspaceId, title: fileTitle || file.name, fileName: file.name, contentType: file.type, dataBase64: await readBase64(file) });
      setFileTitle("");
      setFile(null);
    } catch { /* the mutation already told the person */ }
  };
  const replace = async (asset: AssetRow, picked: File | undefined) => {
    if (!picked) return;
    try {
      await replaceFile.mutateAsync({ workspaceId, assetId: asset.id, fileName: picked.name, contentType: picked.type, dataBase64: await readBase64(picked) });
    } catch { /* the mutation already told the person */ }
  };

  return <>
    <section className="gr-panel">
      <h2>Company files</h2>
      <p>{canManage ? "Brochures, catalogs, price lists and links your team may share. People add them to their company card, and a new version reaches every card at once." : "Files and links your company approved. Add the ones you want visitors to see on your card."}</p>
      {cards.length > 1 ? <label className="gr-field">Card<select value={card?.id ?? ""} onChange={event => setCardId(Number(event.target.value))}>
        {cards.map(option => <option key={option.id} value={option.id}>{option.displayName}{option.title ? `, ${option.title}` : ""}</option>)}
      </select></label> : null}
      {card ? <p className="gr-attribution">{card.displayName}'s card shows {onCard} of up to {perCard} company files.</p> : <p className="gr-attribution">{canManage ? "Create a company card to show files on it." : "You do not have an active company card yet."}</p>}
      {assets.length === 0 ? <p>{canManage ? "No files yet. Add the first one below." : "Your company has not added any files yet."}</p> : <ul className="team-people">
        {assets.map(asset => {
          const shown = card ? asset.cardIds.includes(card.id) : false;
          return <li key={asset.id}>
            <div className="team-person">
              <strong>{asset.title}</strong>
              <span>{asset.kind === "link" ? asset.url : [asset.fileName, fileSize(asset.sizeBytes)].filter(Boolean).join(" · ")}</span>
              <div className="team-badges">
                <span className="team-chip">{asset.kind === "link" ? "Link" : "File"}</span>
                {asset.archived ? <span className="team-status team-status-suspended">Archived</span> : null}
                {shown ? <span className="team-status">On this card</span> : null}
                {asset.cardCount !== null ? <span className="team-chip">{asset.cardCount === 1 ? "On 1 card" : `On ${asset.cardCount} cards`}</span> : null}
              </div>
            </div>
            <div className="team-person-actions">
              <a className="gr-secondary" href={asset.url} target="_blank" rel="noopener noreferrer">Open</a>
              {card && !asset.archived ? <button type="button" className={shown ? "gr-secondary" : "gr-primary"} disabled={setOnCard.isPending} onClick={() => setOnCard.mutate({ workspaceId, assetId: asset.id, cardId: card.id, shown: !shown })}>{shown ? "Remove from card" : "Add to card"}</button> : null}
              {canManage ? <>
                <button type="button" className="gr-secondary" onClick={() => setEditing(editing === asset.id ? null : asset.id)}>{editing === asset.id ? "Close" : "Edit"}</button>
                {asset.kind === "file" ? <label className="gr-secondary team-file">{replaceFile.isPending ? "Saving..." : "Upload new version"}<input type="file" disabled={replaceFile.isPending} onChange={event => { void replace(asset, event.target.files?.[0]); event.target.value = ""; }} /></label> : null}
                <button type="button" className="gr-secondary" disabled={setArchived.isPending} onClick={() => setArchived.mutate({ workspaceId, assetId: asset.id, archived: !asset.archived })}>{asset.archived ? "Restore" : "Archive"}</button>
              </> : null}
            </div>
            {canManage && editing === asset.id ? <EditAsset asset={asset} busy={update.isPending} onSave={values => update.mutate({ workspaceId, assetId: asset.id, ...values }, { onSuccess: () => setEditing(null) })} /> : null}
          </li>;
        })}
      </ul>}
    </section>
    {canManage ? <section className="gr-panel">
      <h2>Add a file or link</h2>
      <form className="team-inline-form" onSubmit={event => void submitFile(event)}>
        <label className="gr-field">Name<input type="text" maxLength={160} value={fileTitle} placeholder="Product brochure" onChange={event => setFileTitle(event.target.value)} /></label>
        <label className="gr-field">File<input type="file" required onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <div className="gr-actions"><button type="submit" className="gr-primary" disabled={!file || upload.isPending}>{upload.isPending ? "Uploading..." : "Upload file"}</button></div>
      </form>
      <p className="gr-attribution">PDF, pictures, video, Word, PowerPoint, Excel or ZIP, up to 3MB. For anything larger, add it as a link.</p>
      <form className="team-inline-form" onSubmit={submitLink}>
        <label className="gr-field">Name<input type="text" required maxLength={160} value={linkTitle} placeholder="Online catalog" onChange={event => setLinkTitle(event.target.value)} /></label>
        <label className="gr-field">Link<input type="url" required maxLength={500} value={linkUrl} placeholder="https://" onChange={event => setLinkUrl(event.target.value)} /></label>
        <div className="gr-actions"><button type="submit" className="gr-secondary" disabled={addLink.isPending}>Add link</button></div>
      </form>
      <p className="gr-attribution">Archiving takes a file off every card. Nothing is deleted, and you can restore it.</p>
    </section> : null}
  </>;
}

function EditAsset({ asset, busy, onSave }: { asset: AssetRow; busy: boolean; onSave: (values: { title: string; url?: string }) => void }) {
  const [title, setTitle] = useState(asset.title);
  const [url, setUrl] = useState(asset.url);
  return <form className="team-inline-form" onSubmit={event => { event.preventDefault(); onSave(asset.kind === "link" ? { title, url } : { title }); }}>
    <label className="gr-field">Name<input type="text" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
    {asset.kind === "link" ? <label className="gr-field">Link<input type="url" required maxLength={500} value={url} onChange={event => setUrl(event.target.value)} /></label> : null}
    <div className="gr-actions"><button type="submit" className="gr-primary" disabled={busy}>Save</button></div>
  </form>;
}

// ---- Shared by signature and background ----

function useKit(workspaceId: number) {
  const kit = trpc.teamKit.get.useQuery({ workspaceId });
  const [cardId, setCardId] = useState<number | null>(null);
  const cards = kit.data?.cards ?? [];
  const card = cards.find(candidate => candidate.id === cardId) ?? cards[0] ?? null;
  return { kit, cards, card, setCardId };
}

function CardPicker({ cards, card, onPick }: { cards: KitCard[]; card: KitCard | null; onPick: (cardId: number) => void }) {
  if (cards.length < 2 || !card) return null;
  return <label className="gr-field">Card<select value={card.id} onChange={event => onPick(Number(event.target.value))}>
    {cards.map(option => <option key={option.id} value={option.id}>{option.name}{option.title ? `, ${option.title}` : ""}</option>)}
  </select></label>;
}

function Parts<T extends string>({ legend, all, labels, value, onChange }: { legend: string; all: readonly T[]; labels: Record<T, string>; value: T[]; onChange: (next: T[]) => void }) {
  return <fieldset className="team-choice">
    <legend>{legend}</legend>
    {all.map(part => <label key={part}><input type="checkbox" checked={value.includes(part)} onChange={event => onChange(all.filter(item => (item === part ? event.target.checked : value.includes(item))))} /> {labels[part]}</label>)}
  </fieldset>;
}

const noCard = (canManage: boolean) => <p>{canManage ? "Publish a company card first. The details come from the card." : "You need a published company card first. Ask your team admin."}</p>;

// ---- Email signature ----

function Signature({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const { kit, cards, card, setCardId } = useKit(workspaceId);
  const [draft, setDraft] = useState<SignatureSettings | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const saveSignature = trpc.teamKit.saveSignature.useMutation({
    onSuccess: () => { toast.success("Signature design saved for the team."); setDraft(null); void utils.teamKit.get.invalidate({ workspaceId }); },
    onError: failed,
  });

  if (kit.isLoading) return loading;
  if (!kit.data) return <section className="gr-panel"><p role="alert" className="gr-error">{kit.error?.message ?? "The signature could not be loaded."}</p></section>;
  const { canManage, company } = kit.data;
  const settings = draft ?? kit.data.signature;
  const html = card ? signatureHtml(settings, card, company) : "";
  const text = card ? signatureText(settings, card, company) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      toast.success("Signature copied. Paste it into your mail app's signature settings.");
    } catch {
      // Older browsers: copy what is shown on the page, formatting included.
      const node = preview.current;
      const selection = window.getSelection();
      if (!node || !selection) return void toast.error("Could not copy. Select the signature and copy it yourself.");
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      const copied = document.execCommand("copy");
      selection.removeAllRanges();
      if (copied) toast.success("Signature copied.");
      else toast.error("Could not copy. Select the signature and copy it yourself.");
    }
  };

  return <>
    <section className="gr-panel">
      <h2>Email signature</h2>
      <p>One signature design for the whole company, filled in from each person's company card.</p>
      <CardPicker cards={cards} card={card} onPick={setCardId} />
      {card ? <>
        <div className="kit-signature" ref={preview} dangerouslySetInnerHTML={{ __html: html }} />
        <div className="gr-actions">
          <button type="button" className="gr-primary" onClick={() => void copy()}>Copy signature</button>
          <button type="button" className="gr-secondary" onClick={() => void navigator.clipboard.writeText(html).then(() => toast.success("HTML copied."), failed)}>Copy HTML</button>
          <button type="button" className="gr-secondary" onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success("Text copied."), failed)}>Copy as plain text</button>
        </div>
        <p className="gr-attribution">Gmail: Settings, See all settings, Signature, then paste. Outlook: Settings, Mail, Signatures, then paste. If your mail app shows the code instead of the signature, use Copy signature, not Copy HTML.</p>
        {draft ? <p className="gr-attribution">This preview shows changes that are not saved yet.</p> : null}
      </> : noCard(canManage)}
    </section>
    {canManage ? <section className="gr-panel">
      <h2>Signature design</h2>
      <p>The person's name is always shown. Choose what else every signature includes.</p>
      <form onSubmit={event => { event.preventDefault(); saveSignature.mutate({ workspaceId, ...settings }); }}>
        <Parts<SignaturePart> legend="Show" all={SIGNATURE_PARTS} labels={SIGNATURE_PART_LABELS} value={settings.parts} onChange={parts => setDraft({ ...settings, parts })} />
        <label className="gr-field">Accent color<input type="color" value={settings.color ?? company.color ?? DEFAULT_COLOR} onChange={event => setDraft({ ...settings, color: event.target.value })} /></label>
        {settings.color ? <div className="gr-actions"><button type="button" className="gr-secondary" onClick={() => setDraft({ ...settings, color: null })}>Use the company color</button></div> : null}
        <label className="gr-field">Small print under the signature (optional)<textarea rows={3} maxLength={SIGNATURE_NOTE_MAX} value={settings.note} onChange={event => setDraft({ ...settings, note: event.target.value })} /></label>
        <div className="gr-actions"><button type="submit" className="gr-primary" disabled={!draft || saveSignature.isPending}>Save for the team</button></div>
      </form>
      {settings.parts.includes("logo") && !company.logoUrl ? <p className="gr-attribution">Add a company logo under Brand to show it here.</p> : null}
      {settings.parts.includes("website") && !company.website ? <p className="gr-attribution">Add the company website under Settings to show it here.</p> : null}
    </section> : null}
  </>;
}

// ---- Meeting background ----

const loadImage = (source: string) =>
  new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });

const hexToRgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const shade = (hex: string, by: number) => `rgb(${hexToRgb(hex).map(value => Math.max(0, Math.min(255, Math.round(value + by)))).join(",")})`;

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && context.measureText(`${cut}...`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

/**
 * Draws the background: company color, and in one top corner the logo, the person's name and title, and a QR code
 * to their card. The middle stays empty, because that is where the person sits.
 */
async function drawBackground(canvas: HTMLCanvasElement, width: number, height: number, settings: BackgroundSettings, person: KitCard, color: string, logo: string | null) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const unit = height / 1080;
  const dark = isDarkColor(color);
  const ink = dark ? "#ffffff" : "#111827";
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, shade(color, dark ? 18 : 0));
  gradient.addColorStop(1, shade(color, dark ? -28 : -22));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const has = (part: BackgroundPart) => settings.parts.includes(part);
  const right = settings.side === "right";
  const margin = 72 * unit;
  const column = 520 * unit;
  const edge = right ? width - margin : margin;
  const at = (size: number) => (right ? edge - size : edge);
  let y = margin;
  context.textAlign = right ? "right" : "left";
  context.textBaseline = "top";
  context.fillStyle = ink;

  const logoImage = has("logo") && logo ? await loadImage(logo) : null;
  if (logoImage) {
    const size = 132 * unit;
    context.save();
    context.beginPath();
    context.roundRect(at(size), y, size, size, 24 * unit);
    context.clip();
    context.drawImage(logoImage, at(size), y, size, size);
    context.restore();
    y += size + 30 * unit;
  }
  if (has("name")) {
    context.font = `700 ${Math.round(60 * unit)}px Arial, Helvetica, sans-serif`;
    context.fillText(fitText(context, person.name, column), edge, y);
    y += 74 * unit;
  }
  if (has("title") && person.title) {
    context.font = `400 ${Math.round(36 * unit)}px Arial, Helvetica, sans-serif`;
    context.globalAlpha = 0.86;
    context.fillText(fitText(context, person.title, column), edge, y);
    context.globalAlpha = 1;
    y += 52 * unit;
  }
  if (has("qr")) {
    y += 22 * unit;
    // Always dark on a white tile with a full quiet zone, so any phone reads it across a room or a screen share.
    const modules = QRCode.create(`${person.cardUrl}?source=meeting`, { errorCorrectionLevel: "M" }).modules;
    const tile = 268 * unit;
    const cell = Math.floor((tile * 0.84) / modules.size);
    const code = cell * modules.size;
    const left = at(tile);
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.roundRect(left, y, tile, tile, 22 * unit);
    context.fill();
    context.fillStyle = "#111827";
    const offset = (tile - code) / 2;
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) context.fillRect(Math.round(left + offset + col * cell), Math.round(y + offset + row * cell), cell, cell);
      }
    }
    y += tile + 18 * unit;
    if (settings.cta) {
      context.fillStyle = ink;
      context.font = `600 ${Math.round(30 * unit)}px Arial, Helvetica, sans-serif`;
      context.fillText(fitText(context, settings.cta, column), edge, y);
    }
  }
}

function Background({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const { kit, cards, card, setCardId } = useKit(workspaceId);
  const [draft, setDraft] = useState<BackgroundSettings | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState<string>(BACKGROUND_SIZES[0].id);
  const canvas = useRef<HTMLCanvasElement>(null);
  const saveBackground = trpc.teamKit.saveBackground.useMutation({
    onSuccess: () => { toast.success("Background design saved for the team."); setDraft(null); void utils.teamKit.get.invalidate({ workspaceId }); },
    onError: failed,
  });
  const logoUrl = kit.data?.company.logoUrl ?? null;
  const stored = kit.data?.background ?? null;
  const settings = draft ?? stored;
  const color = settings?.color ?? kit.data?.company.color ?? DEFAULT_COLOR;
  const partsKey = settings?.parts.join(",");

  useEffect(() => {
    let live = true;
    if (logoUrl) void logoData(logoUrl).then(data => { if (live) setLogo(data); });
    else setLogo(null);
    return () => { live = false; };
  }, [logoUrl]);

  useEffect(() => {
    if (canvas.current && settings && card) void drawBackground(canvas.current, 1280, 720, settings, card, color, logo);
    // partsKey stands in for settings.parts, so the picture is redrawn when a part changes and not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, color, logo, partsKey, settings?.side, settings?.cta]);

  const sizes = useMemo(() => BACKGROUND_SIZES.map(size => ({ ...size })), []);
  if (kit.isLoading) return loading;
  if (!kit.data) return <section className="gr-panel"><p role="alert" className="gr-error">{kit.error?.message ?? "The background could not be loaded."}</p></section>;
  if (!settings) return <section className="gr-panel"><h2>Meeting background</h2><p>Meeting backgrounds are not part of your team's plan.</p></section>;
  const { canManage } = kit.data;

  const download = async () => {
    if (!card) return;
    const size = sizes.find(option => option.id === sizeId) ?? sizes[0];
    const full = document.createElement("canvas");
    await drawBackground(full, size.width, size.height, settings, card, color, logo);
    full.toBlob(blob => (blob ? save(blob, `meeting-background-${card.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "card"}-${size.id}.png`) : toast.error("The picture could not be made. Please try again.")), "image/png");
  };

  return <>
    <section className="gr-panel">
      <h2>Meeting background</h2>
      <p>A background for video calls with the person's name and a QR code to their company card.</p>
      <CardPicker cards={cards} card={card} onPick={setCardId} />
      {card ? <>
        <canvas ref={canvas} className="kit-background" role="img" aria-label={`Meeting background for ${card.name}`} />
        <label className="gr-field">Size<select value={sizeId} onChange={event => setSizeId(event.target.value)}>
          {sizes.map(size => <option key={size.id} value={size.id}>{size.label}</option>)}
        </select></label>
        <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => void download()}>Download picture</button></div>
        <p className="gr-attribution">Zoom: Settings, Background and effects, then add the picture. Google Meet: Apply visual effects, then upload. Microsoft Teams: Video effects, then Add new. If the words look backwards to you, turn off "Mirror my video". Other people see them the right way round.</p>
        {settings.parts.includes("logo") && logoUrl && !logo ? <p className="gr-attribution">The logo could not be added to the picture.</p> : null}
        {draft ? <p className="gr-attribution">This preview shows changes that are not saved yet.</p> : null}
      </> : noCard(canManage)}
    </section>
    {canManage ? <section className="gr-panel">
      <h2>Background design</h2>
      <form onSubmit={event => { event.preventDefault(); saveBackground.mutate({ workspaceId, ...settings }); }}>
        <Parts<BackgroundPart> legend="Show" all={BACKGROUND_PARTS} labels={BACKGROUND_PART_LABELS} value={settings.parts} onChange={parts => setDraft({ ...settings, parts })} />
        <label className="gr-field">Corner<select value={settings.side} onChange={event => setDraft({ ...settings, side: event.target.value as BackgroundSide })}>
          <option value="right">Top right</option>
          <option value="left">Top left</option>
        </select></label>
        <label className="gr-field">Color<input type="color" value={color} onChange={event => setDraft({ ...settings, color: event.target.value })} /></label>
        {settings.color ? <div className="gr-actions"><button type="button" className="gr-secondary" onClick={() => setDraft({ ...settings, color: null })}>Use the company color</button></div> : null}
        <label className="gr-field">Line under the QR code<input type="text" maxLength={BACKGROUND_CTA_MAX} value={settings.cta} onChange={event => setDraft({ ...settings, cta: event.target.value })} /></label>
        <div className="gr-actions"><button type="submit" className="gr-primary" disabled={!draft || saveBackground.isPending}>Save for the team</button></div>
      </form>
    </section> : null}
  </>;
}

// ---- Banners ----

const BANNER_STATE_LABELS: Record<BannerRow["state"], string> = { scheduled: "Scheduled", live: "Showing now", ended: "Ended" };
const bannerWhen = (date: Date, zone: string) => new Intl.DateTimeFormat(undefined, { timeZone: zone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);

function Banners({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.teamBanners.list.useQuery({ workspaceId });
  const [open, setOpen] = useState<number | "new" | null>(null);
  const remove = trpc.teamBanners.remove.useMutation({ onSuccess: () => { toast.success("Banner removed."); void utils.teamBanners.list.invalidate({ workspaceId }); }, onError: failed });

  if (list.isLoading) return loading;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Banners could not be loaded."}</p></section>;
  const { banners, timezone } = list.data;
  const editing = typeof open === "number" ? banners.find(banner => banner.id === open) ?? null : null;

  return <>
    <section className="gr-panel">
      <h2>Banners</h2>
      <p>A short announcement on company cards, such as a job opening or a product launch. It appears and disappears on its own at the times you set ({timezone.replace(/_/g, " ")} time).</p>
      {open === null ? <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => setOpen("new")}>Create banner</button></div> : null}
      {banners.length === 0 ? <p>No banners yet.</p> : <ul className="team-people">
        {banners.map(banner => <li key={banner.id}>
          <div className="team-person">
            <strong>{banner.title}</strong>
            <span>{bannerWhen(banner.startAt, timezone)} to {bannerWhen(banner.endAt, timezone)}</span>
            <div className="team-badges">
              <span className={`team-status${banner.state === "live" ? "" : banner.state === "scheduled" ? " team-status-invited" : " team-status-suspended"}`}>{BANNER_STATE_LABELS[banner.state]}</span>
              <span className="team-chip">{banner.target === "department" ? list.data.departments.find(department => department.id === banner.departmentId)?.name ?? "A department" : banner.target === "cards" ? (banner.cardIds.length === 1 ? "1 card" : `${banner.cardIds.length} cards`) : BANNER_TARGET_LABELS.all}</span>
            </div>
          </div>
          <div className="team-person-actions">
            <button type="button" className="gr-secondary" onClick={() => setOpen(banner.id)}>Edit</button>
            <button type="button" className="gr-secondary team-danger" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove the banner "${banner.title}"? It comes off every card.`)) remove.mutate({ workspaceId, bannerId: banner.id }); }}>Remove</button>
          </div>
        </li>)}
      </ul>}
    </section>
    {open !== null ? <BannerForm key={String(open)} workspaceId={workspaceId} data={list.data} banner={editing} onDone={() => setOpen(null)} /> : null}
  </>;
}

function BannerForm({ workspaceId, data, banner, onDone }: { workspaceId: number; data: BannerList; banner: BannerRow | null; onDone: () => void }) {
  const utils = trpc.useUtils();
  const zone = data.timezone;
  const [title, setTitle] = useState(banner?.title ?? "");
  const [description, setDescription] = useState(banner?.description ?? "");
  const [ctaLabel, setCtaLabel] = useState(banner?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(banner?.ctaUrl ?? "");
  const [startAt, setStartAt] = useState(() => instantToWall(banner?.startAt ?? new Date(), zone));
  const [endAt, setEndAt] = useState(() => instantToWall(banner?.endAt ?? new Date(Date.now() + 7 * 24 * 3_600_000), zone));
  const [target, setTarget] = useState<BannerTarget>(banner?.target ?? "all");
  const [departmentId, setDepartmentId] = useState<number | null>(banner?.departmentId ?? data.departments[0]?.id ?? null);
  const [cardIds, setCardIds] = useState<number[]>(banner?.cardIds ?? []);
  const saveBanner = trpc.teamBanners.save.useMutation({
    onSuccess: () => { toast.success(banner ? "Banner saved." : "Banner created."); void utils.teamBanners.list.invalidate({ workspaceId }); onDone(); },
    onError: failed,
  });
  const targets = BANNER_TARGETS.filter(option => option !== "department" || data.departments.length > 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    saveBanner.mutate({ workspaceId, bannerId: banner?.id, title, description, ctaLabel, ctaUrl, startAt, endAt, target, departmentId: target === "department" ? departmentId : null, cardIds: target === "cards" ? cardIds : undefined });
  };

  return <section className="gr-panel">
    <h2>{banner ? "Edit banner" : "New banner"}</h2>
    <form onSubmit={submit}>
      <label className="gr-field">Title<input type="text" required maxLength={120} value={title} placeholder="Now hiring" onChange={event => setTitle(event.target.value)} /></label>
      <label className="gr-field">Description (optional)<textarea rows={3} maxLength={400} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <div className="team-form-grid">
        <label className="gr-field">Button words (optional)<input type="text" maxLength={40} value={ctaLabel} placeholder="See open roles" onChange={event => setCtaLabel(event.target.value)} /></label>
        <label className="gr-field">Button link<input type="url" maxLength={500} value={ctaUrl} placeholder="https://" required={Boolean(ctaLabel.trim())} onChange={event => setCtaUrl(event.target.value)} /></label>
        <label className="gr-field">Starts<input type="datetime-local" required value={startAt} onChange={event => setStartAt(event.target.value)} /></label>
        <label className="gr-field">Ends<input type="datetime-local" required value={endAt} min={startAt} onChange={event => setEndAt(event.target.value)} /></label>
      </div>
      <fieldset className="team-choice">
        <legend>Show on</legend>
        {targets.map(option => <label key={option}><input type="radio" name="banner-target" checked={target === option} onChange={() => setTarget(option)} /> {BANNER_TARGET_LABELS[option]}</label>)}
      </fieldset>
      {target === "department" ? <label className="gr-field">Department<select value={departmentId ?? ""} onChange={event => setDepartmentId(Number(event.target.value))}>
        {data.departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select></label> : null}
      {target === "cards" ? <fieldset className="team-choice">
        <legend>Cards</legend>
        {data.cards.length === 0 ? <p>There are no company cards yet.</p> : data.cards.map(card => <label key={card.id}><input type="checkbox" checked={cardIds.includes(card.id)} onChange={event => setCardIds(event.target.checked ? [...cardIds, card.id] : cardIds.filter(value => value !== card.id))} /> {card.displayName}</label>)}
      </fieldset> : null}
      <div className="gr-actions">
        <button type="submit" className="gr-primary" disabled={saveBanner.isPending}>{banner ? "Save banner" : "Create banner"}</button>
        <button type="button" className="gr-secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  </section>;
}
