import { useAuth } from "@/_core/hooks/useAuth";
import { startGoogleLogin } from "@/const";
import { CardVisual, Field } from "@/components/CardVisual";
import type { ContactPatch, ContactRow } from "@/components/ContactsView";
import { LegalLinks } from "@/components/LegalLinks";
import { isVideoUrl } from "@/components/LoopVideo";
import { ShareSheet } from "@/components/ShareSheet";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  channelOptions,
  emptyCard,
  parseChannels,
  parseLinks,
  parsePortfolio,
  PREVIEW_CARD_STORAGE_KEY,
  readPreviewCard,
  themeOptions,
  toDraft,
  type CardDraft,
  type ChannelItem,
  type PortfolioItem,
  type ReferenceRow,
} from "@/lib/card";
import { copyToClipboard, formatDate, getInitials } from "@/lib/cardKit";
import { prepareUpload } from "@/lib/image";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleUserRound,
  Copy,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Play,
  Quote,
  QrCode,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Contacts and Insights are only needed on their own tabs, so they load on demand.
const ContactsView = lazy(() => import("@/components/ContactsView").then((m) => ({ default: m.ContactsView })));
const InsightsView = lazy(() => import("@/components/InsightsView").then((m) => ({ default: m.InsightsView })));

// Contacts page size; the list keeps fetching pages until it has them all.
const CONTACTS_PAGE = { limit: 200 } as const;

const SIDEBAR_HIDDEN_KEY = "heyitsme.sidebar.hidden";

function readSidebarHidden() {
  try {
    return window.localStorage.getItem(SIDEBAR_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function ViewLoading() {
  return <div className="loading-screen view-loading" role="status" aria-label="Loading"><div className="loading-orb" /></div>;
}

function GlassButton({ children, onClick, variant = "primary", type = "button", className = "", disabled = false }: any) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`glass-button glass-button-${variant} ${className}`}>
      {children}
    </button>
  );
}

function NavItem({ label, icon: Icon, active, onClick, badge, badgeAlert = false, disabled = false }: any) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={`nav-item ${active ? "is-active" : ""} ${disabled ? "is-disabled" : ""}`}
      style={disabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
    >
      <Icon size={17} strokeWidth={1.8} />
      <span>{label}</span>
      {badge ? <span className={`nav-badge ${badgeAlert ? "is-alert" : ""}`}>{badge}</span> : null}
    </button>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Desktop only: on narrow screens the sidebar is a drawer behind the menu button.
  const [sidebarHidden, setSidebarHidden] = useState(readSidebarHidden);
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_HIDDEN_KEY, sidebarHidden ? "1" : "0");
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  }, [sidebarHidden]);
  // The button that toggled the sidebar disappears with it, so hand focus to its counterpart.
  const hideSidebarButton = useRef<HTMLButtonElement>(null);
  const showSidebarButton = useRef<HTMLButtonElement>(null);
  const sidebarToggled = useRef(false);
  useEffect(() => {
    if (!sidebarToggled.current) return;
    sidebarToggled.current = false;
    (sidebarHidden ? showSidebarButton : hideSidebarButton).current?.focus();
  }, [sidebarHidden]);
  const toggleSidebar = (hidden: boolean) => {
    // Narrow screens use the drawer, so "hide" just closes it.
    if (hidden && window.matchMedia("(max-width: 760px)").matches) {
      setMobileNavOpen(false);
      return;
    }
    sidebarToggled.current = true;
    setSidebarHidden(hidden);
  };
  const [localCards, setLocalCards] = useState<CardDraft[]>(() => {
    const saved = readPreviewCard();
    return saved ? [saved] : [];
  });
  const [localContacts, setLocalContacts] = useState<ContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<number>(() => readPreviewCard()?.id ?? 0);
  const [draft, setDraft] = useState<CardDraft>(() => readPreviewCard() ?? emptyCard);
  const [showShare, setShowShare] = useState(false);
  const [sharingCard, setSharingCard] = useState<CardDraft | null>(null);
  const [undoCard, setUndoCard] = useState<CardDraft | null>(null);

  const cardsQuery = trpc.cards.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const contactsQuery = trpc.contacts.list.useInfiniteQuery(CONTACTS_PAGE, {
    enabled: isAuthenticated,
    retry: false,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const serverContacts = useMemo(
    () => (contactsQuery.data ? contactsQuery.data.pages.flatMap((page) => page.items) : undefined),
    [contactsQuery.data],
  );
  const createCard = trpc.cards.create.useMutation();
  const updateCard = trpc.cards.update.useMutation();
  const publishCard = trpc.cards.publish.useMutation();
  const deleteCardMutation = trpc.cards.delete.useMutation();
  const restoreCardMutation = trpc.cards.restore.useMutation();
  const uploadMedia = trpc.media.upload.useMutation();
  const createReference = trpc.references.create.useMutation();
  const deleteReferenceMutation = trpc.references.delete.useMutation();
  const deleteContactMutation = trpc.contacts.delete.useMutation();
  const updateContactMutation = trpc.contacts.update.useMutation();
  const markContactsSeen = trpc.contacts.markSeen.useMutation();
  const weekInsights = trpc.insights.summary.useQuery({ days: 7 }, { enabled: isAuthenticated, retry: false });
  const utils = trpc.useUtils();
  const [newContactIds, setNewContactIds] = useState<Set<number>>(() => new Set());
  const markingSeen = useRef(false);

  const cards = useMemo(() => {
    if (isAuthenticated && cardsQuery.data) return cardsQuery.data.map(toDraft);
    return localCards;
  }, [cardsQuery.data, isAuthenticated, localCards]);
  const contacts = useMemo(() => {
    if (isAuthenticated && serverContacts) return serverContacts as ContactRow[];
    return localContacts;
  }, [serverContacts, isAuthenticated, localContacts]);

  usePageMeta({ title: "Your workspace — heyitsme", noindex: true });

  // Pull the remaining contact pages in the background so search, export, and counts cover everyone.
  useEffect(() => {
    if (contactsQuery.hasNextPage && !contactsQuery.isFetchingNextPage && !contactsQuery.isError) void contactsQuery.fetchNextPage();
  }, [contactsQuery.hasNextPage, contactsQuery.isFetchingNextPage, contactsQuery.isError]);
  const activeCard = cards.find((card) => card.id === selectedId) ?? cards[0] ?? draft;
  const path = window.location.pathname;
  const mode = path.includes("/contacts") ? "contacts" : path.includes("/insights") ? "insights" : path.includes("/cards") ? "cards" : "overview";
  const unseenCount = contacts.filter((contact) => !contact.seenAt).length;

  // Opening Contacts marks everyone as seen, but keeps this visit's arrivals flagged "New" until you leave the page.
  useEffect(() => {
    if (mode !== "contacts") {
      setNewContactIds((current) => (current.size ? new Set() : current));
      return;
    }
    if (!isAuthenticated || !serverContacts || markingSeen.current) return;
    const unseen = serverContacts.filter((contact) => !contact.seenAt).map((contact) => contact.id);
    if (!unseen.length) return;
    setNewContactIds((current) => new Set([...Array.from(current), ...unseen]));
    markingSeen.current = true;
    markContactsSeen.mutate(undefined, {
      onSettled: () => {
        void utils.contacts.list.invalidate().finally(() => { markingSeen.current = false; });
      },
    });
  }, [mode, isAuthenticated, serverContacts]);
  const isBuilder = path.includes("/new") || path.includes("/edit");

  const editMatch = path.match(/^\/app\/cards\/(\d+)\/edit/);
  const editId = editMatch ? Number(editMatch[1]) : 0;

  useEffect(() => {
    if (editId > 0) {
      const found = cards.find((c) => c.id === editId);
      if (found && draft.id !== editId) {
        setSelectedId(found.id);
        setDraft(found);
      } else if (!found && (!isAuthenticated || cardsQuery.isFetched)) {
        toast.error("Card not found.");
        navigate("/app/cards");
      }
    } else if (activeCard && !isBuilder) {
      setDraft(activeCard);
    }
  }, [editId, cards, activeCard?.id, isBuilder, isAuthenticated, cardsQuery.isFetched]);

  const openBuilder = (card?: CardDraft) => {
    const next = card ?? { ...emptyCard, updatedAt: new Date() };
    setSelectedId(next.id);
    setDraft(next);
    navigate(card ? `/app/cards/${card.id}/edit` : "/app/cards/new");
  };

  const saveDraft = async (options?: { publish?: boolean; redirect?: boolean }) => {
    const rawEmail = draft.email.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
    const payload = {
      displayName: draft.displayName.trim() || "Untitled card",
      title: draft.title.trim() || "Professional",
      company: draft.company.trim() || null,
      email: isValidEmail ? rawEmail : null,
      phone: draft.phone.trim() || null,
      location: draft.location.trim() || null,
      bio: draft.bio.trim() || null,
      links: JSON.stringify(parseLinks(draft.links)),
      portfolio: JSON.stringify(parsePortfolio(draft.portfolio)),
      channels: JSON.stringify(parseChannels(draft.channels)),
      theme: draft.theme,
      avatarUrl: draft.avatarUrl || null,
      coverUrl: draft.coverUrl || null,
    };
    const shouldRedirect = options?.redirect ?? true;

    if (isAuthenticated) {
      try {
        let savedCard: CardDraft | null = null;
        if (draft.id > 0) {
          const updated = await updateCard.mutateAsync({
            id: draft.id,
            ...payload,
            ...(options?.publish !== undefined ? { published: options.publish } : {}),
          });
          savedCard = updated ? toDraft(updated) : ({ ...draft, ...payload } as CardDraft);
          setDraft(savedCard);
        } else {
          const created = await createCard.mutateAsync({
            ...payload,
            ...(options?.publish !== undefined ? { published: options.publish } : {}),
          });
          if (created) {
            const next = toDraft(created);
            savedCard = next;
            setSelectedId(next.id);
            setDraft(next);
          }
        }
        await utils.cards.list.invalidate();
        toast.success(options?.publish ? "Your card is live." : "Your card is in sync.");
        if (shouldRedirect) {
          navigate("/app/cards");
        }
        return savedCard;
      } catch (error: any) {
        toast.error(error?.message ?? "Could not save that card.");
        return null;
      }
    }
    const next = {
      ...draft,
      ...payload,
      published: options?.publish !== undefined ? options.publish : draft.published,
      updatedAt: new Date(),
      id: draft.id || Date.now(),
    } as CardDraft;
    setLocalCards((current) =>
      current.some((item) => item.id === draft.id)
        ? current.map((item) => (item.id === draft.id ? next : item))
        : [next, ...current]
    );
    window.localStorage.setItem(PREVIEW_CARD_STORAGE_KEY, JSON.stringify(next));
    setSelectedId(next.id);
    setDraft(next);
    toast.success("Saved in preview mode — sign in to sync it.");
    if (shouldRedirect) {
      navigate("/app/cards");
    }
    return next;
  };

  const copyPublicLink = async (card = activeCard): Promise<boolean> => {
    if (!card) return false;
    if (!isAuthenticated || card.id <= 0 || card.slug === "new-card") {
      toast.error("Sign in to publish this card and get a shareable link.");
      return false;
    }
    if (!card.published) {
      toast.error("Publish this card before copying its public link.");
      return false;
    }
    const url = `${window.location.origin}/c/${card.slug}`;
    const copied = await copyToClipboard(url);
    if (copied) {
      toast.success("Public link copied to clipboard!");
    } else {
      toast.info(`Public link: ${url}`);
    }
    return copied;
  };

  const saveAndCopyLink = async () => {
    const saved = await saveDraft({ publish: true, redirect: false });
    if (saved) {
      await copyPublicLink(saved);
      navigate("/app/cards");
    }
  };

  const togglePublish = async (card: CardDraft) => {
    const published = !card.published;
    try {
      if (isAuthenticated && card.id > 0) {
        await publishCard.mutateAsync({ id: card.id, published });
        await utils.cards.list.invalidate();
      } else {
        setLocalCards((current) => current.map((item) => item.id === card.id ? { ...item, published } : item));
        if (draft.id === card.id) setDraft({ ...draft, published });
      }
      toast.success(published ? "Your card is live." : "Your card is hidden.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update that card.");
    }
  };

  const removeCard = async (card: CardDraft) => {
    if (!window.confirm(`Delete "${card.displayName || "this card"}"? You can undo this for a few seconds.`)) return;
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

  const updateContact = async (id: number, patch: ContactPatch): Promise<boolean> => {
    try {
      if (isAuthenticated) {
        const updated = await updateContactMutation.mutateAsync({ id, ...patch });
        utils.contacts.list.setInfiniteData(CONTACTS_PAGE, (current) => current && {
          ...current,
          pages: current.pages.map((page) => ({ ...page, items: page.items.map((contact) => (contact.id === id ? updated : contact)) })),
        });
      } else {
        setLocalContacts((current) => current.map((contact) => contact.id === id ? {
          ...contact,
          ...(patch.tags ? { tags: JSON.stringify(patch.tags) } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.followedUp !== undefined ? { followedUp: patch.followedUp } : {}),
        } : contact));
      }
      if (patch.followedUp !== undefined && patch.tags === undefined && patch.notes === undefined) {
        toast.success(patch.followedUp ? "Marked as followed up." : "Moved back to needs follow-up.");
      } else {
        toast.success("Contact updated.");
      }
      return true;
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update that contact.");
      return false;
    }
  };

  const deleteContact = async (id: number) => {
    try {
      if (isAuthenticated) {
        await deleteContactMutation.mutateAsync({ id });
        await utils.contacts.list.invalidate();
      } else {
        setLocalContacts((current) => current.filter((c) => c.id !== id));
      }
      toast.success("Contact deleted.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not delete that contact.");
    }
  };

  const addMediaFile = async (original: File) => {
    // Phone photos are often 4-8 MB; shrink images before the size checks below.
    const file = await prepareUpload(original);
    // Base64 inflates ~33% and Vercel rejects request bodies over ~4.5 MB.
    if (isAuthenticated && file.size > 3_000_000) {
      throw new Error("File is larger than 3MB. Upload a smaller file or add it as a link.");
    }
    if (!isAuthenticated) {
      if (file.size > 1_000_000) {
        toast.error("File is larger than 1MB. Sign in to upload larger files.");
        throw new Error("File too large for preview mode");
      }
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
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
      <aside id="app-sidebar" className={`app-sidebar ${mobileNavOpen ? "is-open" : ""} ${sidebarHidden ? "is-collapsed" : ""}`}>
        <div className="brand-lockup"><span className="brand-mark"><span /></span><span>heyitsme</span></div>
        <div className="sidebar-profile" style={{ position: "relative" }}>
          <div className="profile-orb">{getInitials(user?.name || (isAuthenticated ? "You" : "Guest"))}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{user?.name || (isAuthenticated ? "You" : "Guest")}</strong>
            <span>{isAuthenticated ? "All access · free" : "Preview mode"}</span>
          </div>
          <button
            ref={hideSidebarButton}
            className="icon-button"
            type="button"
            onClick={() => toggleSidebar(true)}
            title="Hide sidebar"
            aria-label="Hide sidebar"
            aria-controls="app-sidebar"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="nav-section-label">Workspace</div>
        <nav>
          <NavItem label="Overview" icon={LayoutGrid} active={mode === "overview"} onClick={() => { navigate("/app"); setMobileNavOpen(false); }} />
          <NavItem label="My cards" icon={CircleUserRound} active={mode === "cards"} badge={cards.length} onClick={() => { navigate("/app/cards"); setMobileNavOpen(false); }} />
          <NavItem
            label="Contacts"
            icon={UsersRound}
            active={mode === "contacts"}
            badge={unseenCount > 0 ? `${unseenCount} new` : contacts.length}
            badgeAlert={unseenCount > 0}
            onClick={() => { navigate("/app/contacts"); setMobileNavOpen(false); }}
          />
          <NavItem label="Insights" icon={BarChart3} active={mode === "insights"} onClick={() => { navigate("/app/insights"); setMobileNavOpen(false); }} />
        </nav>
        <div className="nav-section-label nav-section-spaced">Keep exploring</div>
        <nav>
          <NavItem label="Share moments" icon={Share2} badge="Soon" disabled />
          <NavItem label="Profile settings" icon={Settings2} badge="Soon" disabled />
        </nav>
        <div className="sidebar-bottom">
          <div className="free-pod">
            <Sparkles size={15} />
            <div>
              <strong>Everything is free</strong>
              <span>No plans. No limits.</span>
            </div>
          </div>
          {isAuthenticated ? (
            <NavItem label="Sign out" icon={LogOut} onClick={() => logout()} />
          ) : (
            <div className="auth-actions">
              <button className="google-button" onClick={startGoogleLogin}>
                <span className="google-glyph">G</span> Continue with Google
              </button>
            </div>
          )}
          <LegalLinks className="sidebar-legal" />
        </div>
      </aside>
      <main className="app-main" id="main" tabIndex={-1}>
        <header className="app-topbar">
          <button
            className="mobile-menu-button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
          >
            <Menu size={20} />
          </button>
          {sidebarHidden && (
            <button
              ref={showSidebarButton}
              type="button"
              className="icon-button sidebar-toggle"
              onClick={() => toggleSidebar(false)}
              aria-label="Show sidebar"
              aria-controls="app-sidebar"
              aria-expanded={false}
              title="Show sidebar"
            >
              <PanelLeftOpen size={17} />
            </button>
          )}
          <div className="crumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{isBuilder ? "Card builder" : mode === "contacts" ? "Contacts" : mode === "insights" ? "Insights" : mode === "cards" ? "My cards" : "Overview"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="live-pill"><span className="pulse-dot" /> all systems lovely</span>
            {isAuthenticated ? (
              <button
                className="topbar-avatar"
                onClick={() => {
                  if (window.confirm("Sign out of heyitsme?")) void logout();
                }}
                title="Click to sign out"
              >
                {getInitials(user?.name || "You")}
              </button>
            ) : (
              <button className="topbar-avatar" onClick={startGoogleLogin} title="Click to sign in with Google">
                G
              </button>
            )}
          </div>
        </header>
        <div className="content-wrap">
          {isBuilder ? (
            <BuilderView
              draft={draft}
              setDraft={setDraft}
              onSave={() => saveDraft()}
              onPublishAndCopy={saveAndCopyLink}
              onCancel={() => navigate("/app/cards")}
              saving={createCard.isPending || updateCard.isPending || publishCard.isPending}
              onUpload={addMediaFile}
              isAuthenticated={isAuthenticated}
              onAddReference={async (reference: Omit<ReferenceRow, "id">) => {
                if (isAuthenticated && draft.id > 0) {
                  try {
                    await createReference.mutateAsync({ cardId: draft.id, ...reference });
                    toast.success("Reference added to your card.");
                  } catch (error: any) {
                    toast.error(error?.message ?? "Could not add that reference.");
                    throw error;
                  }
                }
              }}
              onDeleteReference={async (id: number) => {
                if (isAuthenticated && draft.id > 0) {
                  try {
                    await deleteReferenceMutation.mutateAsync({ id });
                    toast.success("Reference removed.");
                  } catch (error: any) {
                    toast.error(error?.message ?? "Could not remove that reference.");
                  }
                }
              }}
            />
          ) : mode === "contacts" ? (
            <Suspense fallback={<ViewLoading />}>
              <ContactsView
                contacts={contacts}
                cards={cards}
                newIds={newContactIds}
                onUpdate={updateContact}
                onDelete={deleteContact}
              />
            </Suspense>
          ) : mode === "insights" ? (
            <Suspense fallback={<ViewLoading />}>
              <InsightsView isAuthenticated={isAuthenticated} onSignIn={startGoogleLogin} />
            </Suspense>
          ) : mode === "cards" ? (
            <CardsView
              cards={cards}
              onNew={() => openBuilder()}
              onEdit={openBuilder}
              onShare={(card: CardDraft) => {
                setSelectedId(card.id);
                setDraft(card);
                setSharingCard(card);
                setShowShare(true);
              }}
              onPublish={togglePublish}
              onDelete={removeCard}
              onRestore={restoreDeletedCard}
            />
          ) : (
            <OverviewView
              cards={cards}
              contacts={contacts}
              activeCard={activeCard}
              onNew={() => openBuilder()}
              onEdit={() => openBuilder(activeCard)}
              onShare={() => {
                setSharingCard(activeCard);
                setShowShare(true);
              }}
              onCopy={() => copyPublicLink(activeCard)}
              weekViews={weekInsights.data?.daily}
              onInsights={() => navigate("/app/insights")}
            />
          )}
        </div>
        {undoCard ? <div className="undo-banner"><span><Trash2 size={15} /> “{undoCard.displayName || "Your card"}” deleted</span><button type="button" onClick={() => void restoreDeletedCard(undoCard)} disabled={restoreCardMutation.isPending}><Undo2 size={14} /> {restoreCardMutation.isPending ? "Restoring…" : "Undo"}</button><button type="button" className="undo-dismiss" onClick={() => setUndoCard(null)} aria-label="Dismiss undo message"><X size={14} /></button></div> : null}
      </main>
      {showShare && (sharingCard || activeCard) ? (
        <ShareSheet
          card={sharingCard ?? activeCard}
          accent={(themeOptions.find((theme) => theme.id === (sharingCard ?? activeCard).theme) ?? themeOptions[0]).colors[1]}
          onClose={() => {
            setShowShare(false);
            setSharingCard(null);
          }}
          onCopy={() => copyPublicLink(sharingCard ?? activeCard)}
          isAuthenticated={isAuthenticated}
          onPublish={() => togglePublish(sharingCard ?? activeCard)}
        />
      ) : null}
    </div>
  );
}

function WeekViews({ daily, onOpen }: { daily?: { day: string; views: number }[]; onOpen: () => void }) {
  const total = daily?.reduce((sum, point) => sum + point.views, 0) ?? 0;
  const max = Math.max(1, ...(daily ?? []).map((point) => point.views));
  return (
    <button type="button" className="week-views" onClick={onOpen} aria-label={daily ? `${total} views in the last 7 days. Open insights` : "Open insights"}>
      <span className="week-views-bars" aria-hidden="true">
        {(daily ?? Array.from({ length: 7 }, (_, index) => ({ day: String(index), views: 0 }))).map((point) => (
          <i key={point.day} style={{ height: point.views ? `${Math.max(12, (point.views / max) * 100)}%` : undefined }} className={point.views ? "" : "is-empty"} />
        ))}
      </span>
      <span className="week-views-copy">{daily ? `${total.toLocaleString()} view${total === 1 ? "" : "s"} · 7 days` : "Views · 7 days"}</span>
    </button>
  );
}

function OverviewView({ cards, contacts, activeCard, onNew, onEdit, onShare, onCopy, weekViews, onInsights }: any) {
  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="hero-row"><div><span className="section-kicker"><Sparkles size={14} /> Your presence, in motion</span><h1>Make the introduction<br /><em>feel like you.</em></h1><p className="hero-copy">Create a living professional card that carries your context into every room — no app, no awkward handoff.</p><div className="hero-actions"><GlassButton onClick={onNew}><Plus size={16} /> Create a new card</GlassButton><button className="text-button" onClick={onShare}><QrCode size={16} /> Share your card</button></div></div><div className="hero-note"><span>01</span><p>One link.<br />Every detail.</p><ArrowUpRight size={20} /></div></div>
      <div className="overview-grid">
        <div className="feature-panel glass-panel">
          <div className="panel-header">
            <div>
              <span className="mini-label">Your live card</span>
              <h2>{activeCard?.displayName || "Your first card"}</h2>
            </div>
            <button className="icon-button" onClick={onEdit}><Pencil size={16} /></button>
          </div>
          {activeCard ? <CardVisual card={activeCard} onClick={onEdit} /> : <div className="empty-card" onClick={onNew}><Plus size={22} /><span>Build your first card</span></div>}
          <div className="panel-footer">
            <span>
              <span className={`status-dot ${activeCard?.published ? "is-live" : ""}`} />
              {activeCard?.published ? "Live on the web" : "Not published yet"}
            </span>
            <button className="link-button" onClick={onCopy}><Copy size={14} /> Copy link</button>
          </div>
        </div>
        <div className="stats-column">
          <div className="stat-panel glass-panel">
            <span className="mini-label">Cards in orbit</span>
            <strong>{cards.length}</strong>
            <span className="stat-caption">All yours. Unlimited.</span>
            <WeekViews daily={weekViews} onOpen={onInsights} />
          </div>
          <div className="stat-panel glass-panel stat-panel-lilac">
            <span className="mini-label">People you met</span>
            <strong>{contacts.length}</strong>
            <span className="stat-caption">Captured from your shares.</span>
            <div className="avatar-stack">
              {contacts.length > 0 ? (
                <>
                  {contacts.slice(0, 2).map((c: ContactRow) => (
                    <span key={c.id}>{getInitials(c.name)}</span>
                  ))}
                  {contacts.length > 2 ? <span>+{contacts.length - 2}</span> : null}
                </>
              ) : (
                <span>0</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="lower-grid"><div className="recent-panel glass-panel"><div className="panel-header"><div><span className="mini-label">Recent introductions</span><h2>A little momentum</h2></div><button className="link-button" onClick={() => { window.history.pushState({}, "", "/app/contacts"); window.dispatchEvent(new PopStateEvent("popstate")); }}>View all <ArrowUpRight size={14} /></button></div><div className="activity-list">{contacts.slice(0, 3).map((contact: ContactRow, index: number) => <motion.div key={contact.id} className="activity-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }}><div className="activity-avatar">{getInitials(contact.name)}</div><div className="activity-copy"><strong>{contact.name}</strong><span>{contact.title || "New contact"}{contact.company ? ` · ${contact.company}` : ""}</span></div><div className="activity-meta"><span>{contact.source === "exchange_form" ? "Exchanged details" : "Saved your card"}</span><time>{formatDate(contact.createdAt)}</time></div></motion.div>)}{contacts.length === 0 ? <div className="empty-state"><UsersRound size={22} /><span>Your first introduction will land here.</span></div> : null}</div></div><div className="quote-panel"><span className="quote-mark">“</span><p>People remember how easy you made it to keep in touch.</p><span className="quote-credit">heyitsme / a better handoff</span></div></div>
    </motion.div>
  );
}

function CardsView({ cards, onNew, onEdit, onShare, onPublish, onDelete, onRestore }: any) {
  return <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="page-heading-row"><div><span className="section-kicker"><CircleUserRound size={14} /> Your cards</span><h1>Different room,<br /><em>different signal.</em></h1><p>Keep the right version of you close at hand.</p></div><GlassButton onClick={onNew}><Plus size={16} /> New card</GlassButton></div>{cards.length === 0 ? <div className="empty-state glass-panel"><CircleUserRound size={24} /><strong>No cards yet.</strong><span>Create your first card to share your details and portfolio.</span><GlassButton onClick={onNew}><Plus size={15} /> Create a card</GlassButton></div> : <div className="cards-grid">{cards.map((card: CardDraft, index: number) => { const archived = Boolean(card.deletedAt); const status = archived ? "Archived" : card.published ? "Live" : "Private"; return <motion.div key={card.id} className={`card-list-item glass-panel ${archived ? "is-archived" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}><CardVisual card={card} compact onClick={() => !archived && onEdit(card)} /><div className="card-list-meta"><div><strong>{card.displayName || "Untitled card"}</strong><span>{card.title}{card.company ? ` · ${card.company}` : ""}</span></div><span className={`tiny-status ${status.toLowerCase()}`}><span className="status-dot" />{status}</span></div><div className="card-list-actions">{archived ? <button onClick={() => onRestore(card)}><Undo2 size={14} /> Restore</button> : <><button onClick={() => onEdit(card)}><Pencil size={14} /> Edit</button><button onClick={() => onShare(card)}><Share2 size={14} /> Share</button><button onClick={() => onPublish(card)}><span className="publish-toggle" />{card.published ? "Unpublish" : "Publish"}</button></>}<button className="danger-action" onClick={() => onDelete(card)}><Trash2 size={14} /> Delete</button></div></motion.div>; })}<button className="new-card-tile" onClick={onNew}><span><Plus size={20} /></span><strong>Make another version</strong><small>Same you. New context.</small></button></div>}</motion.div>;
}

function BuilderView({ draft, setDraft, onSave, onPublishAndCopy, onCancel, saving, onUpload, onAddReference, onDeleteReference, isAuthenticated }: any) {
  const update = (key: keyof CardDraft, value: string) => setDraft((current: CardDraft) => ({ ...current, [key]: value }));
  return <motion.div className="builder-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="page-heading-row builder-heading"><div><button className="back-button" onClick={onCancel}>← Back to cards</button><span className="section-kicker"><Sparkles size={14} /> Card builder</span><h1>Make it<br /><em>unmistakably you.</em></h1></div><div className="builder-save-actions"><button className="text-button" onClick={onCancel}>Discard</button><button className="publish-copy-button" onClick={onPublishAndCopy} disabled={saving}><Share2 size={15} /> {saving ? "Publishing…" : "Publish & copy link"}</button><GlassButton onClick={onSave} disabled={saving}>{saving ? "Saving…" : <><Check size={16} /> Save card</>}</GlassButton></div></div><div className="builder-layout"><div className="builder-form glass-panel"><div className="form-section"><div className="form-section-heading"><span>01</span><div><h2>The essentials</h2><p>Enough context to make the hello feel natural.</p></div></div><div className="media-picker-row"><ImagePicker label="Profile photo" hint="Square works best" shape="round" value={draft.avatarUrl} onChange={(value) => update("avatarUrl", value)} onUpload={onUpload} /><ImagePicker label="Cover" hint="Wide image, or a muted video loop up to 3MB" shape="wide" allowVideo value={draft.coverUrl} onChange={(value) => update("coverUrl", value)} onUpload={onUpload} /></div><div className="field-grid"><Field label="Your name" value={draft.displayName} onChange={(value: string) => update("displayName", value)} placeholder="Alex Morgan" /><Field label="Role / title" value={draft.title} onChange={(value: string) => update("title", value)} placeholder="Creative director" /><Field label="Company" value={draft.company} onChange={(value: string) => update("company", value)} placeholder="Studio North" /><Field label="Location" value={draft.location} onChange={(value: string) => update("location", value)} placeholder="San Francisco, CA" /><Field label="Email" value={draft.email} onChange={(value: string) => update("email", value)} placeholder="hello@you.co" type="email" /><Field label="Phone" value={draft.phone} onChange={(value: string) => update("phone", value)} placeholder="+1 415 555 0183" /></div><label className="field-label">A little context<textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} placeholder="What do you want people to remember about you?" /></label></div><div className="form-section"><div className="form-section-heading"><span>02</span><div><h2>Your links</h2><p>Add a few places for the conversation to continue.</p></div></div><label className="field-label">Links <input value={parseLinks(draft.links).join(", ")} onChange={(event) => update("links", JSON.stringify(event.target.value.split(",").map((item) => item.trim()).filter(Boolean)))} placeholder="yourwebsite.com, linkedin.com/in/you" /></label></div><div className="form-section"><div className="form-section-heading"><span>03</span><div><h2>Portfolio, in motion</h2><p>Add images, videos, files, or a project link. Uploads are served from secure storage.</p></div></div><PortfolioEditor raw={draft.portfolio} onChange={(value: string) => update("portfolio", value)} onUpload={onUpload} /></div><div className="form-section"><div className="form-section-heading"><span>04</span><div><h2>Make it easy to reach you</h2><p>Add social profiles and direct channels — Viber, WhatsApp, Telegram, and more.</p></div></div><ChannelsEditor raw={draft.channels} onChange={(value: string) => update("channels", value)} /></div><div className="form-section"><div className="form-section-heading"><span>05</span><div><h2>Client references</h2><p>Show the thoughtful words people remember after the work is done.</p></div></div><ReferencesEditor cardId={draft.id} onAddReference={onAddReference} onDeleteReference={onDeleteReference} isAuthenticated={isAuthenticated} /></div><div className="form-section"><div className="form-section-heading"><span>06</span><div><h2>Set the tone</h2><p>Choose a palette that feels like your current chapter.</p></div></div><div className="theme-picker">{themeOptions.map((theme) => <button type="button" key={theme.id} onClick={() => update("theme", theme.id)} className={`theme-swatch theme-${theme.id} ${draft.theme === theme.id ? "is-selected" : ""}`}><span className="swatch-colors"><i style={{ background: theme.colors[0] }} /><i style={{ background: theme.colors[1] }} /><i style={{ background: theme.colors[2] }} /></span><span>{theme.label}</span>{draft.theme === theme.id ? <Check size={14} /> : null}</button>)}</div></div></div><div className="builder-preview-column"><div className="preview-sticky"><div className="preview-label"><span>Live preview</span><span><span className="status-dot" /> updates as you type</span></div><CardVisual card={{ ...draft, displayName: draft.displayName || "Your name", title: draft.title || "Your title" }} /><div className="preview-tip"><Sparkles size={15} /><span>Keep it light. Your card can do the talking.</span></div></div></div></div></motion.div>;
}

function ImagePicker({ label, hint, shape, value, onChange, onUpload, allowVideo = false }: { label: string; hint: string; shape: "round" | "wide"; value: string; onChange: (value: string) => void; onUpload: (file: File) => Promise<string>; allowVideo?: boolean }) {
  const [busy, setBusy] = useState(false);
  const handleFile = async (file: File) => {
    const isVideo = file.type.startsWith("video/");
    if (!file.type.startsWith("image/") && !(allowVideo && isVideo)) {
      toast.error(allowVideo ? "Choose an image or a video file." : "Choose an image file.");
      return;
    }
    setBusy(true);
    try {
      onChange(await onUpload(file));
    } catch (error: any) {
      toast.error(error?.message ?? "Could not upload that image.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`image-picker image-picker-${shape}`}>
      <label className="image-picker-drop">
        {value ? (isVideoUrl(value) ? <video src={value} muted loop autoPlay playsInline /> : <img src={value} alt="" />) : <span className="image-picker-empty"><ImageIcon size={18} /></span>}
        <input type="file" accept={allowVideo ? "image/*,video/mp4,video/webm,video/quicktime" : "image/*"} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = ""; }} />
        <span className="sr-only">{value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</span>
      </label>
      <div className="image-picker-copy">
        <strong>{label}</strong>
        <span>{busy ? "Uploading…" : hint}</span>
        {value ? <button type="button" className="link-button" onClick={() => onChange("")}><Trash2 size={12} /> Remove</button> : null}
      </div>
    </div>
  );
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
  const channels = parseChannels(raw, { keepEmpty: true });
  const [selectedProvider, setSelectedProvider] = useState("");
  const update = (index: number, patch: Partial<ChannelItem>) => onChange(JSON.stringify(channels.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)));
  const addChannel = () => { if (!selectedProvider) return; onChange(JSON.stringify([...channels, { provider: selectedProvider, url: "" }])); setSelectedProvider(""); };
  return <div className="channels-editor"><div className="channel-add-grid"><select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)}><option value="">Choose a provider…</option>{channelOptions.filter((provider) => !channels.some((item) => item.provider === provider)).map((provider) => <option value={provider} key={provider}>{provider[0].toUpperCase() + provider.slice(1)}</option>)}</select><button className="outline-button" type="button" onClick={addChannel} disabled={!selectedProvider}><Plus size={14} /> Add channel</button><span>Choose a provider, then add a new conversation door.</span></div>{channels.map((channel, index) => <div className="channel-row" key={`${channel.provider}-${index}`}><strong>{channel.provider}</strong><input value={channel.label ?? ""} onChange={(event) => update(index, { label: event.target.value })} placeholder="Custom label, e.g. Message me" /><input value={channel.url} onChange={(event) => update(index, { url: event.target.value })} placeholder={`https://${channel.provider}.com/you`} /><button className="icon-button" type="button" onClick={() => onChange(JSON.stringify(channels.filter((_, itemIndex) => itemIndex !== index)))}><Trash2 size={14} /></button></div>)}{channels.length === 0 ? <p className="editor-empty">Add your social profiles and direct messaging links.</p> : null}</div>;
}

function ReferencesEditor({
  cardId,
  onAddReference,
  onDeleteReference,
  isAuthenticated,
}: {
  cardId: number;
  onAddReference: (reference: Omit<ReferenceRow, "id">) => Promise<void>;
  onDeleteReference?: (id: number) => Promise<void>;
  isAuthenticated?: boolean;
}) {
  const referencesQuery = trpc.references.list.useQuery(
    { cardId },
    { enabled: Boolean(isAuthenticated && cardId > 0), retry: false }
  );
  const [localReferences, setLocalReferences] = useState<ReferenceRow[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientRole, setClientRole] = useState("");
  const [company, setCompany] = useState("");
  const [quote, setQuote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const references = useMemo(() => {
    if (isAuthenticated && cardId > 0 && referencesQuery.data) {
      return referencesQuery.data as ReferenceRow[];
    }
    return localReferences;
  }, [isAuthenticated, cardId, referencesQuery.data, localReferences]);

  const add = async () => {
    if (cardId <= 0) {
      toast.error("Save the card first to add references.");
      return;
    }
    if (!clientName.trim() || quote.trim().length < 8) return;
    setSubmitting(true);
    const reference = {
      clientName: clientName.trim(),
      clientRole: clientRole.trim() || null,
      company: company.trim() || null,
      quote: quote.trim(),
    };
    try {
      await onAddReference(reference);
      if (!isAuthenticated || cardId <= 0) {
        setLocalReferences((current) => [{ id: Date.now(), ...reference }, ...current]);
      } else {
        await referencesQuery.refetch();
      }
      setClientName("");
      setClientRole("");
      setCompany("");
      setQuote("");
    } catch {
      // Error handled by parent or mutation
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    if (onDeleteReference && isAuthenticated && cardId > 0) {
      await onDeleteReference(id);
      await referencesQuery.refetch();
    } else {
      setLocalReferences((current) => current.filter((r) => r.id !== id));
      toast.success("Reference removed.");
    }
  };

  return (
    <div className="references-editor">
      <div className="reference-form">
        <div className="field-grid">
          <Field label="Client name" value={clientName} onChange={setClientName} placeholder="Mina Park" />
          <Field label="Role" value={clientRole} onChange={setClientRole} placeholder="Founder" />
          <Field label="Company" value={company} onChange={setCompany} placeholder="Field Notes" />
        </div>
        <label className="field-label">
          Their words
          <textarea
            value={quote}
            onChange={(event) => setQuote(event.target.value)}
            placeholder="What did they say about working with you?"
          />
        </label>
        <button
          className="outline-button"
          type="button"
          onClick={() => void add()}
          disabled={submitting || cardId <= 0}
        >
          <Quote size={14} /> {submitting ? "Adding…" : "Add reference"}
        </button>
        {cardId <= 0 && <small style={{ color: "var(--muted-foreground, #888)", display: "block", marginTop: "4px" }}>Save card first to attach references.</small>}
      </div>
      <div className="reference-mini-list">
        {references.slice(0, 5).map((reference) => (
          <div className="reference-mini" key={reference.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: "10px" }}>
              <Quote size={14} />
              <div>
                <p>“{reference.quote}”</p>
                <span>{reference.clientName}{reference.company ? ` · ${reference.company}` : ""}</span>
              </div>
            </div>
            <button className="icon-button" type="button" onClick={() => void remove(reference.id)} title="Delete reference">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {references.length === 0 && <p className="editor-empty">No references added yet.</p>}
      </div>
    </div>
  );
}

