import { trpc } from "@/lib/trpc";
import { THEMES, contrast, renderedBackground, type CardDesign } from "@shared/design";
import { FIELD_LABELS, LOCKABLE_FIELDS, type LockableField } from "@shared/teams";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : "That did not work. Please try again.");
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });

function LockChoices({ legend, value, onChange }: { legend: string; value: LockableField[]; onChange: (value: LockableField[]) => void }) {
  return <fieldset className="team-choice team-locks">
    <legend>{legend}</legend>
    {LOCKABLE_FIELDS.map(field => <label key={field}>
      <input type="checkbox" checked={value.includes(field)} onChange={event => onChange(event.target.checked ? [...value, field] : value.filter(item => item !== field))} />
      <span>{FIELD_LABELS[field]}</span>
    </label>)}
  </fieldset>;
}

function ColorChoice({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string | null) => void }) {
  return <div className="gr-field team-color">
    <span>{label}</span>
    <div className="team-color-row">
      <input type="color" aria-label={label} value={value ?? "#1D4ED8"} onChange={event => onChange(event.target.value.toUpperCase())} />
      <span>{value ?? "Not set"}</span>
      {value ? <button type="button" className="gr-secondary" onClick={() => onChange(null)}>Clear</button> : null}
    </div>
  </div>;
}

/** The company logo, colors and the details members cannot change. Admins only; the server checks each action. */
export function TeamBrand({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const brand = trpc.teamBrand.get.useQuery({ workspaceId });
  const save = trpc.teamBrand.save.useMutation();
  const uploadLogo = trpc.teamBrand.uploadLogo.useMutation();
  const removeLogo = trpc.teamBrand.removeLogo.useMutation();
  const [form, setForm] = useState<{ primary: string | null; accent: string | null; lockedFields: LockableField[] } | null>(null);

  useEffect(() => {
    if (brand.data) setForm({ primary: brand.data.primary, accent: brand.data.accent, lockedFields: brand.data.lockedFields });
  }, [brand.data]);

  const refresh = () => Promise.all([utils.teamBrand.get.invalidate({ workspaceId }), utils.teamCards.list.invalidate({ workspaceId }), utils.teams.activity.invalidate({ workspaceId })]);

  if (brand.isLoading || !form) {
    return brand.error ? <section className="gr-panel"><p role="alert" className="gr-error">{brand.error.message}</p></section> : <section className="gr-panel" role="status">Loading...</section>;
  }

  const pickLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) return void toast.error("Logo is larger than 3MB. Upload a smaller image.");
    try {
      await uploadLogo.mutateAsync({ workspaceId, fileName: file.name, contentType: file.type || "image/png", dataBase64: await readBase64(file) });
      toast.success("Logo saved. It now shows on every company card.");
      await refresh();
    } catch (error) {
      failed(error);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync({ workspaceId, ...form });
      toast.success("Brand saved.");
      await refresh();
    } catch { /* The error shows under the button. */ }
  };

  return <>
    <section className="gr-panel">
      <h2>Company logo</h2>
      <p>The logo shows on every company card. Use a JPG, PNG or WebP image up to 3MB.</p>
      {brand.data?.logoUrl ? <img className="team-logo" src={brand.data.logoUrl} alt="Company logo" /> : <p className="gr-attribution">No logo yet.</p>}
      <div className="gr-actions">
        <label className="gr-secondary team-file">{uploadLogo.isPending ? "Uploading..." : brand.data?.logoUrl ? "Replace logo" : "Upload logo"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadLogo.isPending} onChange={pickLogo} /></label>
        {brand.data?.logoUrl ? <button type="button" className="gr-secondary team-danger" disabled={removeLogo.isPending} onClick={() => { if (window.confirm("Remove the logo from every company card?")) void removeLogo.mutateAsync({ workspaceId }).then(() => { toast.success("Logo removed."); return refresh(); }, failed); }}>Remove logo</button> : null}
      </div>
    </section>
    <section className="gr-panel">
      <h2>Brand colors and locked details</h2>
      <form onSubmit={submit}>
        <p>Brand colors are offered when you build a template. They do not change existing cards on their own.</p>
        <div className="team-form-grid">
          <ColorChoice label="Main color" value={form.primary} onChange={primary => setForm({ ...form, primary })} />
          <ColorChoice label="Second color" value={form.accent} onChange={accent => setForm({ ...form, accent })} />
        </div>
        <LockChoices legend="Details members cannot change on any company card" value={form.lockedFields} onChange={lockedFields => setForm({ ...form, lockedFields })} />
        <p className="gr-attribution">A member who needs a locked detail changed sends a request. An admin approves or declines it on the Cards tab.</p>
        <div className="gr-actions"><button className="gr-primary" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save brand"}</button></div>
        {save.error ? <p role="alert" className="gr-error">{save.error.message}</p> : null}
      </form>
    </section>
  </>;
}

type TemplateForm = { name: string; look: number; useBrand: boolean; company: string; location: string; lockedFields: LockableField[] };
const EMPTY_TEMPLATE: TemplateForm = { name: "", look: 0, useBrand: false, company: "", location: "", lockedFields: [] };
type Brand = { primary: string | null; accent: string | null };

// The look is one of the ready-made card looks, optionally with the brand colors on buttons and highlights.
function designOf(form: TemplateForm, brand: Brand): CardDesign {
  const base = THEMES[form.look]?.design ?? THEMES[0].design;
  if (!form.useBrand || !brand.primary) return base;
  return {
    ...base,
    button: brand.primary,
    buttonText: contrast(brand.primary, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#111111",
    accent: brand.accent ?? brand.primary,
  };
}

function formOf(template: { name: string; design: CardDesign; company: string | null; location: string | null; lockedFields: LockableField[] }): TemplateForm {
  const look = Math.max(0, THEMES.findIndex(theme => theme.design.theme === template.design.theme));
  return { name: template.name, look, useBrand: template.design.button !== THEMES[look].design.button, company: template.company ?? "", location: template.location ?? "", lockedFields: template.lockedFields };
}

function Swatch({ design }: { design: CardDesign }) {
  return <div className="team-swatch" aria-hidden="true" style={{ background: renderedBackground(design), color: design.text }}>
    <strong>Name</strong>
    <small style={{ color: design.accent }}>Job title</small>
    <span style={{ background: design.button, color: design.buttonText }}>Save contact</span>
  </div>;
}

function TemplateFields({ form, brand, onChange }: { form: TemplateForm; brand: Brand; onChange: (form: TemplateForm) => void }) {
  return <>
    <div className="team-form-grid">
      <label className="gr-field">Template name<input required maxLength={80} value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} /></label>
      <label className="gr-field">Look
        <select value={form.look} onChange={event => onChange({ ...form, look: Number(event.target.value) })}>
          {THEMES.map((theme, index) => <option key={theme.name} value={index}>{theme.name}</option>)}
        </select>
      </label>
      <label className="gr-field">Company name on the card (optional)<input maxLength={160} value={form.company} onChange={event => onChange({ ...form, company: event.target.value })} /></label>
      <label className="gr-field">Location on the card (optional)<input maxLength={160} value={form.location} onChange={event => onChange({ ...form, location: event.target.value })} /></label>
    </div>
    <div className="team-choice">
      <label><input type="checkbox" checked={form.useBrand && Boolean(brand.primary)} disabled={!brand.primary} onChange={event => onChange({ ...form, useBrand: event.target.checked })} /><span>{brand.primary ? "Use the brand colors on buttons and highlights" : "Set a main color on the Brand tab to use brand colors here"}</span></label>
    </div>
    <Swatch design={designOf(form, brand)} />
    <LockChoices legend="Details members cannot change on cards with this template" value={form.lockedFields} onChange={lockedFields => onChange({ ...form, lockedFields })} />
  </>;
}

/** Templates give company cards one look. Admins only; the server checks each action. */
export function TeamTemplates({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.teamTemplates.list.useQuery({ workspaceId });
  const brandQuery = trpc.teamBrand.get.useQuery({ workspaceId });
  const create = trpc.teamTemplates.create.useMutation();
  const update = trpc.teamTemplates.update.useMutation();
  const setArchived = trpc.teamTemplates.setArchived.useMutation();
  const setDefault = trpc.teamTemplates.setDefault.useMutation();
  const applyTo = trpc.teamTemplates.applyTo.useMutation();
  const [draft, setDraft] = useState<TemplateForm>(EMPTY_TEMPLATE);
  const [editing, setEditing] = useState<{ id: number; form: TemplateForm } | null>(null);

  const refresh = () => Promise.all([utils.teamTemplates.list.invalidate({ workspaceId }), utils.teamCards.list.invalidate({ workspaceId }), utils.teams.activity.invalidate({ workspaceId })]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (error) {
      failed(error);
    }
  };

  if (list.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Templates could not be loaded."}</p></section>;
  const brand: Brand = { primary: brandQuery.data?.primary ?? null, accent: brandQuery.data?.accent ?? null };
  const { templates, templateLimit } = list.data;
  const input = (form: TemplateForm) => ({ name: form.name, design: designOf(form, brand), company: form.company.trim() || null, location: form.location.trim() || null, lockedFields: form.lockedFields });

  const add = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ workspaceId, ...input(draft) });
      setDraft(EMPTY_TEMPLATE);
      toast.success("Template created.");
      await refresh();
    } catch { /* The error shows under the button. */ }
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      const result = await update.mutateAsync({ workspaceId, templateId: editing.id, ...input(editing.form) });
      setEditing(null);
      toast.success(result.cards === 0 ? "Template saved." : result.cards === 1 ? "Template saved. 1 card updated." : `Template saved. ${result.cards} cards updated.`);
      await refresh();
    } catch { /* The error shows under the button. */ }
  };

  return <>
    <section className="gr-panel">
      <h2>Create a template</h2>
      <p>A template sets the look of a company card and can fill in the company name and location. Choose a template for each card on the Cards tab.</p>
      <form onSubmit={add}>
        <TemplateFields form={draft} brand={brand} onChange={setDraft} />
        <div className="gr-actions"><button className="gr-primary" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create template"}</button></div>
        {create.error ? <p role="alert" className="gr-error">{create.error.message}</p> : null}
      </form>
    </section>
    <section className="gr-panel">
      <h2>Templates</h2>
      <p className="gr-attribution">{templates.length} of {templateLimit} templates.</p>
      {templates.length === 0 ? <p>No templates yet. Create the first one above.</p> : null}
      <ul className="team-people">
        {templates.map(template => <li key={template.id}>
          <div className="team-person">
            <strong>{template.name}</strong>
            <span>{template.cards === 1 ? "Used by 1 card" : `Used by ${template.cards} cards`}{template.lockedFields.length ? ` · Locks ${template.lockedFields.map(field => FIELD_LABELS[field]).join(", ")}` : ""}</span>
            <span className="team-badges">
              {template.isDefault ? <span className="team-status">Used for new cards</span> : null}
              {template.archived ? <span className="team-status team-card-archived">Archived</span> : null}
            </span>
          </div>
          <div className="team-person-actions">
            <button type="button" className="gr-secondary" onClick={() => setEditing(editing?.id === template.id ? null : { id: template.id, form: formOf(template) })}>{editing?.id === template.id ? "Close" : "Edit"}</button>
            {!template.archived ? <>
              <button type="button" className="gr-secondary" onClick={() => run(() => setDefault.mutateAsync({ workspaceId, templateId: template.isDefault ? null : template.id }), template.isDefault ? "New cards now start without a template." : "New cards now start with this template.")}>{template.isDefault ? "Stop using for new cards" : "Use for new cards"}</button>
              <button type="button" className="gr-secondary" onClick={() => { if (window.confirm(`Put "${template.name}" on every company card? Each card's look, and the company name and location this template sets, are replaced.`)) void run(() => applyTo.mutateAsync({ workspaceId, templateId: template.id }), "Template put on every company card."); }}>Put on all cards</button>
            </> : null}
            <button type="button" className="gr-secondary" onClick={() => run(() => setArchived.mutateAsync({ workspaceId, templateId: template.id, archived: !template.archived }), template.archived ? "Template restored." : "Template archived.")}>{template.archived ? "Restore" : "Archive"}</button>
          </div>
          {editing?.id === template.id ? <form className="team-inline-form" onSubmit={saveEdit}>
            <TemplateFields form={editing.form} brand={brand} onChange={form => setEditing({ id: template.id, form })} />
            <p className="gr-attribution">Saving updates every card that uses this template.</p>
            <div className="gr-actions"><button className="gr-primary" disabled={update.isPending}>{update.isPending ? "Saving..." : "Save template"}</button><button type="button" className="gr-secondary" onClick={() => setEditing(null)}>Cancel</button></div>
            {update.error ? <p role="alert" className="gr-error">{update.error.message}</p> : null}
          </form> : null}
        </li>)}
      </ul>
      <p className="gr-attribution">Archiving a template keeps the look of cards that already use it. It can no longer be chosen for other cards.</p>
    </section>
  </>;
}
