import { useAuth } from "@/_core/hooks/useAuth";
import { startGoogleLogin, startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  AtSign,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleUserRound,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  FileText,
  Globe2,
  Image as ImageIcon,
  Instagram,
  LayoutGrid,
  Link2,
  Linkedin,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Play,
  Quote,
  QrCode,
  Send,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type CardDraft = {
  id: number;
  displayName: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  bio: string;
  links: string;
  portfolio: string;
  channels: string;
  theme: string;
  slug: string;
  published: boolean;
  deletedAt?: string | Date | null;
  updatedAt?: string | Date;
};

type PortfolioItem = { id: string; kind: "image" | "video" | "file" | "link"; title: string; url: string; description?: string; mimeType?: string };
type ChannelItem = { provider: string; url: string; label?: string };
type ReferenceRow = { id: number; clientName: string; clientRole?: string | null; company?: string | null; quote: string; approved?: boolean };

type ContactRow = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  tags?: string | null;
  notes?: string | null;
  source: string;
  createdAt?: string | Date;
};

const emptyCard: CardDraft = {
  id: 0,
  displayName: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  location: "",
  bio: "",
  links: "[]",
  portfolio: "[]",
  channels: "[]",
  theme: "midnight",
  slug: "new-card",
  published: false,
  updatedAt: new Date(),
};

const themeOptions = [
  { id: "midnight", label: "Midnight", colors: ["#11152b", "#6b5cff", "#c2b7ff"] },
  { id: "tide", label: "Tide", colors: ["#062c31", "#28c2b3", "#b9fff5"] },
  { id: "sunset", label: "Sunset", colors: ["#301d34", "#f4816b", "#ffd5a7"] },
];

function parseLinks(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [];
  }
}

function parsePortfolio(raw: string | null | undefined): PortfolioItem[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.url) : [];
  } catch {
    return [];
  }
}

function parseChannels(raw: string | null | undefined): ChannelItem[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.url) : [];
  } catch {
    return [];
  }
}

const channelOptions = ["linkedin", "instagram", "facebook", "x", "whatsapp", "telegram", "viber", "signal", "calendly"];
const PREVIEW_CARD_STORAGE_KEY = "heyitsme.preview.card";

function readPreviewCard(): CardDraft | null {
  try {
    const raw = window.localStorage.getItem(PREVIEW_CARD_STORAGE_KEY);
    return raw ? JSON.parse(raw) as CardDraft : null;
  } catch {
    return null;
  }
}

function toDraft(card: any): CardDraft {
  return {
    id: Number(card.id ?? 0),
    displayName: card.displayName ?? "",
    title: card.title ?? "",
    company: card.company ?? "",
    email: card.email ?? "",
    phone: card.phone ?? "",
    location: card.location ?? "",
    bio: card.bio ?? "",
    links: card.links ?? "[]",
    portfolio: card.portfolio ?? "[]",
    channels: card.channels ?? "[]",
    theme: card.theme ?? "midnight",
    slug: card.slug ?? "new-card",
    published: Boolean(card.published),
    deletedAt: card.deletedAt ?? null,
    updatedAt: card.updatedAt,
  };
}

function getInitials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "HM";
}

function formatDate(value?: string | Date) {
  if (!value) return "just now";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function GlassButton({ children, onClick, variant = "primary", type = "button", className = "", disabled = false }: any) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`glass-button glass-button-${variant} ${className}`}>
      {children}
    </button>
  );
}

function CardVisual({ card, compact = false, onClick }: { card: CardDraft; compact?: boolean; onClick?: () => void }) {
  const theme = themeOptions.find((item) => item.id === card.theme) ?? themeOptions[0];
  const links = parseLinks(card.links);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -7, rotateX: 2, rotateY: -2 }}
      whileTap={{ scale: 0.985 }}
      className={`card-visual theme-${theme.id} ${compact ? "card-visual-compact" : ""}`}
      style={{ ["--card-a" as string]: theme.colors[0], ["--card-b" as string]: theme.colors[1], ["--card-c" as string]: theme.colors[2] }}
    >
      <span className="card-glow" />
      <span className="card-topline"><span className="eyebrow">heyitsme</span><span className={`status-dot ${card.published ? "is-live" : ""}`} /></span>
      <span className="card-avatar">{getInitials(card.displayName)}</span>
      <span className="card-name">{card.displayName || "Your name"}</span>
      <span className="card-role">{card.title || "Your title"}{card.company ? ` · ${card.company}` : ""}</span>
      {!compact && <span className="card-bio">{card.bio || "A little context makes a great introduction."}</span>}
      <span className="card-bottomline"><span>{card.location || "Anywhere, really"}</span><span>{links[0] || "your.link"}</span></span>
    </motion.button>
  );
}

function NavItem({ label, icon: Icon, active, onClick, badge }: any) {
  return (
    <button type="button" onClick={onClick} className={`nav-item ${active ? "is-active" : ""}`}>
      <Icon size={17} strokeWidth={1.8} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </button>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [localCards, setLocalCards] = useState<CardDraft[]>(() => {
    const saved = readPreviewCard();
    return saved ? [saved] : [];
  });
  const [localContacts, setLocalContacts] = useState<ContactRow[]>([
    { id: 1, name: "Mina Park", email: "mina@fieldnotes.studio", company: "Field Notes", title: "Founder", source: "share", createdAt: new Date() },
    { id: 2, name: "Jordan Lee", email: "jordan@loop.so", company: "Loop", title: "Partnerships", source: "exchange_form", createdAt: new Date(Date.now() - 86400000 * 2) },
  ]);
  const [selectedId, setSelectedId] = useState<number>(() => readPreviewCard()?.id ?? 0);
  const [draft, setDraft] = useState<CardDraft>(() => readPreviewCard() ?? emptyCard);
  const [search, setSearch] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [undoCard, setUndoCard] = useState<CardDraft | null>(null);

  const cardsQuery = trpc.cards.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const contactsQuery = trpc.contacts.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const createCard = trpc.cards.create.useMutation();
  const updateCard = trpc.cards.update.useMutation();
  const publishCard = trpc.cards.publish.useMutation();
  const deleteCardMutation = trpc.cards.delete.useMutation();
  const restoreCardMutation = trpc.cards.restore.useMutation();
  const uploadMedia = trpc.media.upload.useMutation();
  const createReference = trpc.references.create.useMutation();
  const utils = trpc.useUtils();

  const cards = useMemo(() => {
    if (isAuthenticated && cardsQuery.data) return cardsQuery.data.map(toDraft);
    return localCards;
  }, [cardsQuery.data, isAuthenticated, localCards]);
  const contacts = useMemo(() => {
    if (isAuthenticated && contactsQuery.data) return contactsQuery.data as ContactRow[];
    return localContacts;
  }, [contactsQuery.data, isAuthenticated, localContacts]);
  const activeCard = cards.find((card) => card.id === selectedId) ?? cards[0] ?? draft;
  const path = window.location.pathname;
  const mode = path.includes("/contacts") ? "contacts" : path.includes("/cards") ? "cards" : "overview";
  const isBuilder = path.includes("/new") || path.includes("/edit");

  useEffect(() => {
    if (activeCard && !isBuilder) setDraft(activeCard);
  }, [activeCard?.id, isBuilder]);

  const openBuilder = (card?: CardDraft) => {
    const next = card ?? { ...emptyCard, updatedAt: new Date() };
    setSelectedId(next.id);
    setDraft(next);
    navigate(card ? `/app/cards/${card.id}/edit` : "/app/cards/new");
  };

  const saveDraft = async () => {
    const payload = {
      displayName: draft.displayName.trim() || "Untitled card",
      title: draft.title.trim() || "Professional",
      company: draft.company.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      location: draft.location.trim() || null,
      bio: draft.bio.trim() || null,
      links: JSON.stringify(parseLinks(draft.links)),
      portfolio: JSON.stringify(parsePortfolio(draft.portfolio)),
      channels: JSON.stringify(parseChannels(draft.channels)),
      theme: draft.theme,
    };
    if (isAuthenticated) {
      try {
        let savedCard: CardDraft | null = null;
        if (draft.id > 0) {
          const updated = await updateCard.mutateAsync({ id: draft.id, ...payload });
          savedCard = updated ? toDraft(updated) : { ...draft, ...payload } as CardDraft;
          setDraft(savedCard);
        }
        else {
          const created = await createCard.mutateAsync(payload);
          if (created) {
            const next = toDraft(created);
            savedCard = next;
            setSelectedId(next.id);
            setDraft(next);
          }
        }
        await utils.cards.list.invalidate();
        toast.success("Your card is in sync.");
        navigate("/app/cards");
        return savedCard;
      } catch (error: any) {
        toast.error(error?.message ?? "Could not save that card.");
        return null;
      }
    }
    const next = { ...draft, ...payload, updatedAt: new Date(), id: draft.id || Date.now() } as CardDraft;
    setLocalCards((current) => current.some((item) => item.id === draft.id) ? current.map((item) => item.id === draft.id ? next : item) : [next, ...current]);
    window.localStorage.setItem(PREVIEW_CARD_STORAGE_KEY, JSON.stringify(next));
    setSelectedId(next.id);
    setDraft(next);
    toast.success("Saved in preview mode — sign in to sync it.");
    navigate("/app/cards");
    return next;
  };

  const saveAndCopyLink = async () => {
    const saved = await saveDraft();
    if (saved) await copyPublicLink(saved);
  };

  const togglePublish = async (card: CardDraft) => {
    const published = !card.published;
    if (isAuthenticated && card.id > 0) {
      await publishCard.mutateAsync({ id: card.id, published });
      await utils.cards.list.invalidate();
    } else {
      setLocalCards((current) => current.map((item) => item.id === card.id ? { ...item, published } : item));
      if (draft.id === card.id) setDraft({ ...draft, published });
    }
    toast.success(published ? "Your card is live." : "Your card is hidden.");
  };

  const removeCard = async (card: CardDraft) => {
    if (!window.confirm(`Delete ${card.displayName || "this card"}? This cannot be undone.`)) return;
    try {
      if (isAuthenticated && card.id > 0) {
        await deleteCardMutation.mutateAsync({ id: card.id });
        await utils.cards.list.invalidate();
      } else {
        setLocalCards((current) => current.filter((item) => item.id !== card.id));
        if (readPreviewCard()?.id === card.id) window.localStorage.removeItem(PREVIEW_CARD_STORAGE_KEY);
      }
      if (selectedId === card.id) {
        setSelectedId(0);
        setDraft({ ...emptyCard, updatedAt: new Date() });
      }
      setUndoCard(card);
      window.setTimeout(() => setUndoCard((current) => current?.id === card.id ? null : current), 8000);
      toast.success("Card deleted.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not delete that card.");
    }
  };

  const restoreDeletedCard = async (card: CardDraft) => {
    try {
      if (isAuthenticated && card.id > 0) {
        await restoreCardMutation.mutateAsync({ id: card.id });
        await utils.cards.list.invalidate();
      } else {
        setLocalCards((current) => current.some((item) => item.id === card.id) ? current : [card, ...current]);
        window.localStorage.setItem(PREVIEW_CARD_STORAGE_KEY, JSON.stringify(card));
      }
      setSelectedId(card.id);
      setDraft(card);
      setUndoCard(null);
      toast.success("Card restored.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not restore that card.");
    }
  };

  const copyPublicLink = async (card = activeCard) => {
    if (!card) return;
    if (!isAuthenticated || card.id <= 0 || card.slug === "new-card") {
      toast.error("Sign in to publish this card and get a shareable link.");
      return;
    }
    if (!card.published) {
      toast.error("Publish this card before copying its public link.");
      return;
    }
    const url = `${window.location.origin}/c/${card.slug}`;
    await navigator.clipboard?.writeText(url);
    toast.success("Public link copied.");
  };

  const exportContacts = () => {
    const header = "name,email,phone,company,title,source\n";
    const rows = contacts.map((contact) => [contact.name, contact.email, contact.phone, contact.company, contact.title, contact.source].map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "heyitsme-contacts.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const addMediaFile = async (file: File) => {
    if (!isAuthenticated) return URL.createObjectURL(file);
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await uploadMedia.mutateAsync({ fileName: file.name, contentType: file.type || "application/octet-stream", dataBase64 });
    return result.url;
  };

  if (loading) return <div className="loading-screen"><div className="loading-orb" /><p>Warming up your presence…</p></div>;

  return (
    <div className="app-frame">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="ambient ambient-three" />
      <aside className={`app-sidebar ${mobileNavOpen ? "is-open" : ""}`}>
        <div className="brand-lockup"><span className="brand-mark"><span /></span><span>heyitsme</span></div>
        <div className="sidebar-profile"><div className="profile-orb">{getInitials(user?.name ?? "Alex Morgan")}</div><div><strong>{user?.name ?? "Alex Morgan"}</strong><span>{isAuthenticated ? "All access · free" : "Preview mode"}</span></div><MoreHorizontal size={17} /></div>
        <div className="nav-section-label">Workspace</div>
        <nav>
          <NavItem label="Overview" icon={LayoutGrid} active={mode === "overview"} onClick={() => { navigate("/app"); setMobileNavOpen(false); }} />
          <NavItem label="My cards" icon={CircleUserRound} active={mode === "cards"} badge={cards.length} onClick={() => { navigate("/app/cards"); setMobileNavOpen(false); }} />
          <NavItem label="Contacts" icon={UsersRound} active={mode === "contacts"} badge={contacts.length} onClick={() => { navigate("/app/contacts"); setMobileNavOpen(false); }} />
        </nav>
        <div className="nav-section-label nav-section-spaced">Keep exploring</div>
        <nav><NavItem label="Share moments" icon={Share2} onClick={() => toast("Share moments is coming next.")} /><NavItem label="Profile settings" icon={Settings2} onClick={() => toast("Settings are coming next.")} /></nav>
        <div className="sidebar-bottom"><div className="free-pod"><Sparkles size={15} /><div><strong>Everything is free</strong><span>No plans. No limits.</span></div></div>{isAuthenticated ? <button className="signout-button" onClick={() => logout()}>Sign out</button> : <div className="auth-actions"><button className="google-button" onClick={startGoogleLogin}><span className="google-glyph">G</span> Continue with Google</button><button className="signout-button" onClick={() => startLogin()}>Use email instead</button></div>}</div>
      </aside>
      <main className="app-main">
        <header className="app-topbar"><button className="mobile-menu-button" onClick={() => setMobileNavOpen((open) => !open)}><Menu size={20} /></button><div className="crumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{isBuilder ? "Card builder" : mode === "contacts" ? "Contacts" : mode === "cards" ? "My cards" : "Overview"}</strong></div><div className="topbar-actions"><span className="live-pill"><span className="pulse-dot" /> all systems lovely</span><button className="topbar-avatar">{getInitials(user?.name ?? "Alex Morgan")}</button></div></header>
        <div className="content-wrap">
          {isBuilder ? <BuilderView draft={draft} setDraft={setDraft} onSave={saveDraft} onPublishAndCopy={async () => { await saveDraft(); }} onCancel={() => navigate("/app/cards")} saving={createCard.isPending || updateCard.isPending} onUpload={addMediaFile} onAddReference={async (reference: Omit<ReferenceRow, "id">) => { if (isAuthenticated && draft.id > 0) await createReference.mutateAsync({ cardId: draft.id, ...reference }); toast.success("Reference added to your card."); }} /> : mode === "contacts" ? <ContactsView contacts={contacts.filter((contact) => `${contact.name} ${contact.company ?? ""} ${contact.email ?? ""}`.toLowerCase().includes(search.toLowerCase()))} search={search} setSearch={setSearch} onExport={exportContacts} /> : mode === "cards" ? <CardsView cards={cards} onNew={() => openBuilder()} onEdit={openBuilder} onShare={(card: CardDraft) => { setSelectedId(card.id); setDraft(card); setShowShare(true); }} onPublish={togglePublish} onDelete={removeCard} onRestore={restoreDeletedCard} /> : <OverviewView cards={cards} contacts={contacts} activeCard={activeCard} onNew={() => openBuilder()} onEdit={() => openBuilder(activeCard)} onShare={() => setShowShare(true)} onCopy={() => copyPublicLink(activeCard)} />}
        </div>
        {undoCard ? <div className="undo-banner"><span><Trash2 size={15} /> “{undoCard.displayName || "Your card"}” deleted</span><button type="button" onClick={() => void restoreDeletedCard(undoCard)} disabled={restoreCardMutation.isPending}><Undo2 size={14} /> {restoreCardMutation.isPending ? "Restoring…" : "Undo"}</button><button type="button" className="undo-dismiss" onClick={() => setUndoCard(null)} aria-label="Dismiss undo message"><X size={14} /></button></div> : null}
      </main>
      {showShare && activeCard ? <ShareSheet card={activeCard} onClose={() => setShowShare(false)} onCopy={() => copyPublicLink(activeCard)} /> : null}
    </div>
  );
}

function OverviewView({ cards, contacts, activeCard, onNew, onEdit, onShare, onCopy }: any) {
  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="hero-row"><div><span className="section-kicker"><Sparkles size={14} /> Your presence, in motion</span><h1>Make the introduction<br /><em>feel like you.</em></h1><p className="hero-copy">Create a living professional card that carries your context into every room — no app, no awkward handoff.</p><div className="hero-actions"><GlassButton onClick={onNew}><Plus size={16} /> Create a new card</GlassButton><button className="text-button" onClick={onShare}><QrCode size={16} /> Share your card</button></div></div><div className="hero-note"><span>01</span><p>One link.<br />Every detail.</p><ArrowUpRight size={20} /></div></div>
      <div className="overview-grid"><div className="feature-panel glass-panel"><div className="panel-header"><div><span className="mini-label">Your live card</span><h2>{activeCard?.displayName || "Your first card"}</h2></div><button className="icon-button" onClick={onEdit}><Pencil size={16} /></button></div>{activeCard ? <CardVisual card={activeCard} onClick={onEdit} /> : <div className="empty-card" onClick={onNew}><Plus size={22} /><span>Build your first card</span></div>}<div className="panel-footer"><span><span className={`status-dot ${activeCard?.published ? "is-live" : ""}`} />{activeCard?.published ? "Live on the web" : "Not published yet"}</span><button className="link-button" onClick={onCopy}><Copy size={14} /> Copy link</button></div></div><div className="stats-column"><div className="stat-panel glass-panel"><span className="mini-label">Cards in orbit</span><strong>{cards.length}</strong><span className="stat-caption">All yours. Unlimited.</span><div className="stat-sparkline"><i /><i /><i /><i /><i /><i /><i /></div></div><div className="stat-panel glass-panel stat-panel-lilac"><span className="mini-label">People you met</span><strong>{contacts.length}</strong><span className="stat-caption">Captured from your shares.</span><div className="avatar-stack"><span>MP</span><span>JL</span><span>+</span></div></div></div></div>
      <div className="lower-grid"><div className="recent-panel glass-panel"><div className="panel-header"><div><span className="mini-label">Recent introductions</span><h2>A little momentum</h2></div><button className="link-button" onClick={() => { window.history.pushState({}, "", "/app/contacts"); window.dispatchEvent(new PopStateEvent("popstate")); }}>View all <ArrowUpRight size={14} /></button></div><div className="activity-list">{contacts.slice(0, 3).map((contact: ContactRow, index: number) => <motion.div key={contact.id} className="activity-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }}><div className="activity-avatar">{getInitials(contact.name)}</div><div className="activity-copy"><strong>{contact.name}</strong><span>{contact.title || "New contact"}{contact.company ? ` · ${contact.company}` : ""}</span></div><div className="activity-meta"><span>{contact.source === "exchange_form" ? "Exchanged details" : "Saved your card"}</span><time>{formatDate(contact.createdAt)}</time></div></motion.div>)}{contacts.length === 0 ? <div className="empty-state"><UsersRound size={22} /><span>Your first introduction will land here.</span></div> : null}</div></div><div className="quote-panel"><span className="quote-mark">“</span><p>People remember how easy you made it to keep in touch.</p><span className="quote-credit">heyitsme / a better handoff</span></div></div>
    </motion.div>
  );
}

function CardsView({ cards, onNew, onEdit, onShare, onPublish, onDelete, onRestore }: any) {
  return <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="page-heading-row"><div><span className="section-kicker"><CircleUserRound size={14} /> Your cards</span><h1>Different room,<br /><em>different signal.</em></h1><p>Keep the right version of you close at hand.</p></div><GlassButton onClick={onNew}><Plus size={16} /> New card</GlassButton></div>{cards.length === 0 ? <div className="empty-state glass-panel"><CircleUserRound size={24} /><strong>No cards yet.</strong><span>Create your first card to share your details and portfolio.</span><GlassButton onClick={onNew}><Plus size={15} /> Create a card</GlassButton></div> : <div className="cards-grid">{cards.map((card: CardDraft, index: number) => { const archived = Boolean(card.deletedAt); const status = archived ? "Archived" : card.published ? "Live" : "Private"; return <motion.div key={card.id} className={`card-list-item glass-panel ${archived ? "is-archived" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}><CardVisual card={card} compact onClick={() => !archived && onEdit(card)} /><div className="card-list-meta"><div><strong>{card.displayName || "Untitled card"}</strong><span>{card.title}{card.company ? ` · ${card.company}` : ""}</span></div><span className={`tiny-status ${status.toLowerCase()}`}><span className="status-dot" />{status}</span></div><div className="card-list-actions">{archived ? <button onClick={() => onRestore(card)}><Undo2 size={14} /> Restore</button> : <><button onClick={() => onEdit(card)}><Pencil size={14} /> Edit</button><button onClick={() => onShare(card)}><Share2 size={14} /> Share</button><button onClick={() => onPublish(card)}><span className="publish-toggle" />{card.published ? "Unpublish" : "Publish"}</button></>}<button className="danger-action" onClick={() => onDelete(card)}><Trash2 size={14} /> Delete</button></div></motion.div>; })}<button className="new-card-tile" onClick={onNew}><span><Plus size={20} /></span><strong>Make another version</strong><small>Same you. New context.</small></button></div>}</motion.div>;
}

function BuilderView({ draft, setDraft, onSave, onPublishAndCopy, onCancel, saving, onUpload, onAddReference }: any) {
  const update = (key: keyof CardDraft, value: string) => setDraft((current: CardDraft) => ({ ...current, [key]: value }));
  return <motion.div className="builder-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="page-heading-row builder-heading"><div><button className="back-button" onClick={onCancel}>← Back to cards</button><span className="section-kicker"><Sparkles size={14} /> Card builder</span><h1>Make it<br /><em>unmistakably you.</em></h1></div><div className="builder-save-actions"><button className="text-button" onClick={onCancel}>Discard</button><button className="publish-copy-button" onClick={onPublishAndCopy} disabled={saving}><Share2 size={15} /> {saving ? "Publishing…" : "Publish & copy link"}</button><GlassButton onClick={onSave} disabled={saving}>{saving ? "Saving…" : <><Check size={16} /> Save card</>}</GlassButton></div></div><div className="builder-layout"><div className="builder-form glass-panel"><div className="form-section"><div className="form-section-heading"><span>01</span><div><h2>The essentials</h2><p>Enough context to make the hello feel natural.</p></div></div><div className="field-grid"><Field label="Your name" value={draft.displayName} onChange={(value: string) => update("displayName", value)} placeholder="Alex Morgan" /><Field label="Role / title" value={draft.title} onChange={(value: string) => update("title", value)} placeholder="Creative director" /><Field label="Company" value={draft.company} onChange={(value: string) => update("company", value)} placeholder="Studio North" /><Field label="Location" value={draft.location} onChange={(value: string) => update("location", value)} placeholder="San Francisco, CA" /><Field label="Email" value={draft.email} onChange={(value: string) => update("email", value)} placeholder="hello@you.co" type="email" /><Field label="Phone" value={draft.phone} onChange={(value: string) => update("phone", value)} placeholder="+1 415 555 0183" /></div><label className="field-label">A little context<textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} placeholder="What do you want people to remember about you?" /></label></div><div className="form-section"><div className="form-section-heading"><span>02</span><div><h2>Your links</h2><p>Add a few places for the conversation to continue.</p></div></div><label className="field-label">Links <input value={parseLinks(draft.links).join(", ")} onChange={(event) => update("links", JSON.stringify(event.target.value.split(",").map((item) => item.trim()).filter(Boolean)))} placeholder="yourwebsite.com, linkedin.com/in/you" /></label></div><div className="form-section"><div className="form-section-heading"><span>03</span><div><h2>Portfolio, in motion</h2><p>Add images, videos, files, or a project link. Uploads are served from secure storage.</p></div></div><PortfolioEditor raw={draft.portfolio} onChange={(value: string) => update("portfolio", value)} onUpload={onUpload} /></div><div className="form-section"><div className="form-section-heading"><span>04</span><div><h2>Make it easy to reach you</h2><p>Add social profiles and direct channels — Viber, WhatsApp, Telegram, and more.</p></div></div><ChannelsEditor raw={draft.channels} onChange={(value: string) => update("channels", value)} /></div><div className="form-section"><div className="form-section-heading"><span>05</span><div><h2>Client references</h2><p>Show the thoughtful words people remember after the work is done.</p></div></div><ReferencesEditor cardId={draft.id} onAddReference={onAddReference} /></div><div className="form-section"><div className="form-section-heading"><span>06</span><div><h2>Set the tone</h2><p>Choose a palette that feels like your current chapter.</p></div></div><div className="theme-picker">{themeOptions.map((theme) => <button type="button" key={theme.id} onClick={() => update("theme", theme.id)} className={`theme-swatch theme-${theme.id} ${draft.theme === theme.id ? "is-selected" : ""}`}><span className="swatch-colors"><i style={{ background: theme.colors[0] }} /><i style={{ background: theme.colors[1] }} /><i style={{ background: theme.colors[2] }} /></span><span>{theme.label}</span>{draft.theme === theme.id ? <Check size={14} /> : null}</button>)}</div></div></div><div className="builder-preview-column"><div className="preview-sticky"><div className="preview-label"><span>Live preview</span><span><span className="status-dot" /> updates as you type</span></div><CardVisual card={{ ...draft, displayName: draft.displayName || "Your name", title: draft.title || "Your title" }} /><div className="preview-tip"><Sparkles size={15} /><span>Keep it light. Your card can do the talking.</span></div></div></div></div></motion.div>;
}

function PortfolioEditor({ raw, onChange, onUpload }: { raw: string; onChange: (value: string) => void; onUpload: (file: File) => Promise<string> }) {
  const items = parsePortfolio(raw);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<PortfolioItem["kind"]>("link");
  const [busy, setBusy] = useState(false);
  const addItem = (item: PortfolioItem) => onChange(JSON.stringify([...items, item]));
  const addLink = () => { if (!url.trim()) return; addItem({ id: crypto.randomUUID(), kind, title: title.trim() || url.trim(), url: url.trim() }); setTitle(""); setUrl(""); };
  const handleFile = async (file: File) => { setBusy(true); try { const uploadedUrl = await onUpload(file); const fileKind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file"; addItem({ id: crypto.randomUUID(), kind: fileKind, title: title.trim() || file.name, url: uploadedUrl, mimeType: file.type }); setTitle(""); } catch (error: any) { toast.error(error?.message ?? "Could not upload that file."); } finally { setBusy(false); } };
  return <div className="portfolio-editor"><div className="portfolio-add-row"><select value={kind} onChange={(event) => setKind(event.target.value as PortfolioItem["kind"])}><option value="link">Website link</option><option value="video">Video URL</option><option value="file">Document URL</option></select><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Project title" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /><button className="outline-button" type="button" onClick={addLink}><Plus size={14} /> Add</button></div><label className="upload-drop"><Upload size={17} /><span>{busy ? "Uploading…" : "Upload image, video, PDF, or other file"}</span><input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.zip" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = ""; }} /></label><div className="portfolio-list">{items.map((item) => <div className="portfolio-item" key={item.id}>{item.kind === "image" ? <img src={item.url} alt="" /> : item.kind === "video" ? <span className="portfolio-item-icon"><Play size={15} /></span> : item.kind === "file" ? <span className="portfolio-item-icon"><FileText size={15} /></span> : <span className="portfolio-item-icon"><Link2 size={15} /></span>}<div><strong>{item.title}</strong><span>{item.kind} · {item.url.replace(/^https?:\/\//, "").slice(0, 42)}</span></div><button className="icon-button" type="button" onClick={() => onChange(JSON.stringify(items.filter((candidate) => candidate.id !== item.id)))}><Trash2 size={14} /></button></div>)}{items.length === 0 ? <p className="editor-empty">Your work will appear here as a visual, a link, or a downloadable file.</p> : null}</div></div>;
}

function ChannelsEditor({ raw, onChange }: { raw: string; onChange: (value: string) => void }) {
  const channels = parseChannels(raw);
  const [selectedProvider, setSelectedProvider] = useState("");
  const update = (index: number, patch: Partial<ChannelItem>) => onChange(JSON.stringify(channels.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)));
  const addChannel = () => { if (!selectedProvider) return; onChange(JSON.stringify([...channels, { provider: selectedProvider, url: "" }])); setSelectedProvider(""); };
  return <div className="channels-editor"><div className="channel-add-grid"><select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)}><option value="">Choose a provider…</option>{channelOptions.filter((provider) => !channels.some((item) => item.provider === provider)).map((provider) => <option value={provider} key={provider}>{provider[0].toUpperCase() + provider.slice(1)}</option>)}</select><button className="outline-button" type="button" onClick={addChannel} disabled={!selectedProvider}><Plus size={14} /> Add channel</button><span>Choose a provider, then add a new conversation door.</span></div>{channels.map((channel, index) => <div className="channel-row" key={`${channel.provider}-${index}`}><strong>{channel.provider}</strong><input value={channel.label ?? ""} onChange={(event) => update(index, { label: event.target.value })} placeholder="Custom label, e.g. Message me" /><input value={channel.url} onChange={(event) => update(index, { url: event.target.value })} placeholder={`https://${channel.provider}.com/you`} /><button className="icon-button" type="button" onClick={() => onChange(JSON.stringify(channels.filter((_, itemIndex) => itemIndex !== index)))}><Trash2 size={14} /></button></div>)}{channels.length === 0 ? <p className="editor-empty">Add your social profiles and direct messaging links.</p> : null}</div>;
}

function ReferencesEditor({ onAddReference }: { cardId: number; onAddReference: (reference: Omit<ReferenceRow, "id">) => Promise<void> }) {
  const [references, setReferences] = useState<ReferenceRow[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientRole, setClientRole] = useState("");
  const [company, setCompany] = useState("");
  const [quote, setQuote] = useState("");
  const add = async () => { if (!clientName.trim() || quote.trim().length < 8) return; const reference = { clientName: clientName.trim(), clientRole: clientRole.trim() || null, company: company.trim() || null, quote: quote.trim() }; await onAddReference(reference); setReferences((current) => [{ id: Date.now(), ...reference }, ...current]); setClientName(""); setClientRole(""); setCompany(""); setQuote(""); };
  return <div className="references-editor"><div className="reference-form"><div className="field-grid"><Field label="Client name" value={clientName} onChange={setClientName} placeholder="Mina Park" /><Field label="Role" value={clientRole} onChange={setClientRole} placeholder="Founder" /><Field label="Company" value={company} onChange={setCompany} placeholder="Field Notes" /></div><label className="field-label">Their words<textarea value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="What did they say about working with you?" /></label><button className="outline-button" type="button" onClick={() => void add()}><Quote size={14} /> Add reference</button></div><div className="reference-mini-list">{references.slice(0, 3).map((reference) => <div className="reference-mini" key={reference.id}><Quote size={14} /><div><p>“{reference.quote}”</p><span>{reference.clientName}{reference.company ? ` · ${reference.company}` : ""}</span></div></div>)}</div></div>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: any) { return <label className="field-label">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }

function ContactsView({ contacts, search, setSearch, onExport }: any) {
  return <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="page-heading-row"><div><span className="section-kicker"><UsersRound size={14} /> Your people</span><h1>Keep the<br /><em>good ones close.</em></h1><p>Every saved card becomes a relationship you can return to.</p></div><button className="outline-button" onClick={onExport}><Download size={15} /> Export CSV</button></div><div className="contacts-toolbar glass-panel"><div className="search-field"><AtSign size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, companies, notes…" />{search ? <button onClick={() => setSearch("")}><X size={15} /></button> : null}</div><span>{contacts.length} contact{contacts.length === 1 ? "" : "s"}</span></div><div className="contacts-list glass-panel">{contacts.map((contact: ContactRow, index: number) => <motion.div className="contact-row" key={contact.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}><div className="contact-avatar">{getInitials(contact.name)}</div><div className="contact-main"><strong>{contact.name}</strong><span>{contact.title || "Contact"}{contact.company ? ` · ${contact.company}` : ""}</span></div><div className="contact-detail"><span>{contact.email || "No email added"}</span><small>{contact.source === "exchange_form" ? "Exchanged details" : "Saved from your card"}</small></div><div className="contact-date">{formatDate(contact.createdAt)}</div><button className="icon-button"><MoreHorizontal size={16} /></button></motion.div>)}{contacts.length === 0 ? <div className="empty-state"><UserRoundPlus size={24} /><strong>No matches yet.</strong><span>Share your card to start collecting warm introductions.</span></div> : null}</div></motion.div>;
}

function ShareSheet({ card, onClose, onCopy }: { card: CardDraft; onClose: () => void; onCopy: () => void }) {
  const url = `${window.location.origin}/c/${card.slug}`;
  return <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="share-sheet glass-panel" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 360, damping: 30 }} onClick={(event) => event.stopPropagation()}><div className="sheet-header"><div><span className="mini-label">Share your card</span><h2>Make the handoff easy.</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="qr-frame"><QRCodeSVG value={url} size={176} bgColor="transparent" fgColor="#10152a" includeMargin /></div><div className="share-link"><Link2 size={15} /><span>{url.replace(window.location.origin, "")}</span><button onClick={onCopy}><Copy size={15} /></button></div><div className="share-actions"><a href={`sms:?body=${encodeURIComponent(`Here’s my heyitsme card: ${url}`)}`}><MessageCircle size={16} /> Text it</a><a href={`mailto:?subject=${encodeURIComponent(`${card.displayName} shared a card`) }&body=${encodeURIComponent(url)}`}><Mail size={16} /> Email it</a><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open page</a></div><p className="sheet-footnote"><span className="status-dot is-live" /> Anyone with the link can view it. No app needed.</p></motion.div></motion.div>;
}

function ChannelIcon({ provider }: { provider: string }) {
  if (provider === "linkedin") return <Linkedin size={16} />;
  if (provider === "instagram") return <Instagram size={16} />;
  if (provider === "facebook") return <Facebook size={16} />;
  if (provider === "whatsapp" || provider === "telegram" || provider === "viber" || provider === "signal") return <MessageCircle size={16} />;
  return <Link2 size={16} />;
}

function PublicPortfolio({ items }: { items: PortfolioItem[] }) {
  if (!items.length) return null;
  return <section className="public-extra-card public-portfolio"><div className="public-section-heading"><span className="section-kicker"><BriefcaseBusiness size={14} /> Selected work</span><h2>A little proof of <em>the practice.</em></h2></div><div className="public-portfolio-grid">{items.map((item) => <a className="public-portfolio-item" href={item.url} target="_blank" rel="noreferrer" key={item.id}>{item.kind === "image" ? <img src={item.url} alt={item.title} /> : item.kind === "video" ? <video src={item.url} muted playsInline /> : <div className="public-file-card"><span>{item.kind === "file" ? <FileText size={22} /> : <Link2 size={22} />}</span><strong>{item.title}</strong><small>{item.kind === "file" ? "Open file" : "Visit project"}</small></div>}<div className="public-portfolio-caption"><strong>{item.title}</strong><ArrowUpRight size={14} /></div></a>)}</div></section>;
}

function PublicChannels({ channels }: { channels: ChannelItem[] }) {
  if (!channels.length) return null;
  return <section className="public-extra-card public-channels"><div className="public-section-heading"><span className="section-kicker"><MessageCircle size={14} /> Stay connected</span><h2>Choose your <em>conversation.</em></h2></div><div className="public-channel-list">{channels.map((channel, index) => <a href={channel.url.startsWith("http") ? channel.url : `https://${channel.url}`} target="_blank" rel="noreferrer" key={`${channel.provider}-${index}`}><ChannelIcon provider={channel.provider} /><span>{channel.label || channel.provider[0].toUpperCase() + channel.provider.slice(1)}</span><ArrowUpRight size={14} /></a>)}</div></section>;
}

function PublicReferences({ references }: { references: ReferenceRow[] }) {
  if (!references.length) return null;
  return <section className="public-extra-card public-references"><div className="public-section-heading"><span className="section-kicker"><Quote size={14} /> Kind words</span><h2>What past clients <em>remember.</em></h2></div><div className="public-reference-grid">{references.map((reference) => <article className="public-reference" key={reference.id}><Quote size={19} /><p>“{reference.quote}”</p><footer><span className="reference-avatar">{getInitials(reference.clientName)}</span><span><strong>{reference.clientName}</strong><small>{reference.clientRole || "Client"}{reference.company ? ` · ${reference.company}` : ""}</small></span></footer></article>)}</div></section>;
}

export function PublicCardPage() {
  const [location] = useLocation();
  const slug = location.split("/c/")[1]?.split("/")[0] ?? "";
  const cardQuery = trpc.publicCard.bySlug.useQuery({ slug }, { enabled: Boolean(slug), retry: false });
  const exchange = trpc.publicCard.exchange.useMutation();
  const [showForm, setShowForm] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", title: "", notes: "" });
  const rawCard = cardQuery.data as any;
  const previewCard = !rawCard && slug === "new-card" ? readPreviewCard() : null;
  const card = rawCard ? toDraft(rawCard) : previewCard;
  const links = parseLinks(card?.links);
  const portfolio = parsePortfolio(card?.portfolio);
  const channels = parseChannels(card?.channels);
  const references = rawCard?.references ?? [];
  if (cardQuery.isLoading) return <div className="public-loading"><div className="loading-orb" /><span>Opening a little context…</span></div>;
  if (!card) return <div className="public-loading"><div className="not-found-mark">?</div><h1>This card moved.</h1><p>Ask for an updated link or head back to heyitsme.</p><a href="/">Visit heyitsme</a></div>;
  const submit = async (event: React.FormEvent) => { event.preventDefault(); try { if (card.id > 0) await exchange.mutateAsync({ cardId: card.id, ...form, email: form.email || null, phone: form.phone || null, company: form.company || null, title: form.title || null, notes: form.notes || null }); setSent(true); toast.success("Details exchanged."); } catch (error: any) { toast.error(error?.message ?? "Could not send your details."); } };
  return <div className={`public-card-page theme-${card.theme}`}><div className="public-orb orb-a" /><div className="public-orb orb-b" /><header className="public-nav"><a className="brand-lockup" href="/"><span className="brand-mark"><span /></span><span>heyitsme</span></a><span className="public-note">a better handoff</span></header><main className="public-card-layout"><motion.div className="public-card-copy" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}><span className="section-kicker">{card.published ? <><span className="status-dot is-live" /> Digital card</> : "Digital card"}</span><h1>{card.displayName}</h1><p className="public-title">{card.title}{card.company ? ` · ${card.company}` : ""}</p><p className="public-bio">{card.bio || "Nice to meet you. Let’s keep the conversation going."}</p><div className="public-details">{card.email ? <a href={`mailto:${card.email}`}><Mail size={16} />{card.email}</a> : null}{card.phone ? <a href={`tel:${card.phone}`}><Phone size={16} />{card.phone}</a> : null}{card.location ? <span><Globe2 size={16} />{card.location}</span> : null}</div><div className="public-links">{links.map((link: string) => <a key={link} href={link.startsWith("http") ? link : `https://${link}`} target="_blank" rel="noreferrer"><Link2 size={15} />{link}<ArrowUpRight size={14} /></a>)}</div><div className="public-cta-row"><GlassButton onClick={() => { setShowForm(true); setSent(false); }}><UserRoundPlus size={16} /> Exchange details</GlassButton><button className="text-button" onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => toast.success("Card link copied."))}><Copy size={16} /> Copy link</button></div></motion.div><motion.div className="public-card-stage" initial={{ opacity: 0, scale: 0.95, rotate: 2 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 180, damping: 22 }}><CardVisual card={card} /><div className="scan-hint"><QrCode size={16} /><span>Scan to save this card</span></div></motion.div></main><div className="public-extra-grid"><PublicPortfolio items={portfolio} /><PublicChannels channels={channels} /><PublicReferences references={references} /></div><footer className="public-footer"><span>Made with heyitsme</span><span>Free for everyone</span></footer>{showForm ? <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowForm(false)}><motion.div className="exchange-sheet glass-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={(event) => event.stopPropagation()}>{sent ? <div className="success-state"><div className="success-check"><Check size={25} /></div><h2>Nice. You’re in.</h2><p>Your details were sent to {card.displayName}. Keep the good conversation going.</p><button className="outline-button" onClick={() => setShowForm(false)}>Close</button></div> : <form onSubmit={submit}><div className="sheet-header"><div><span className="mini-label">Exchange details</span><h2>Make it easy to find you too.</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={17} /></button></div><div className="field-grid"><Field label="Your name" value={form.name} onChange={(value: string) => setForm({ ...form, name: value })} placeholder="Jordan Lee" /><Field label="Email" type="email" value={form.email} onChange={(value: string) => setForm({ ...form, email: value })} placeholder="you@example.com" /><Field label="Company" value={form.company} onChange={(value: string) => setForm({ ...form, company: value })} placeholder="Your company" /><Field label="Role / title" value={form.title} onChange={(value: string) => setForm({ ...form, title: value })} placeholder="What you do" /></div><label className="field-label">A note <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Where did we meet?" /></label><button className="glass-button glass-button-primary full-width" disabled={exchange.isPending}>{exchange.isPending ? "Sending…" : <><Send size={16} /> Exchange details</>}</button><p className="privacy-note">Your details are shared only with {card.displayName}. No app download required.</p></form>}</motion.div></motion.div> : null}</div>;
}
