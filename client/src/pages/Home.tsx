import { useAuth } from "@/_core/hooks/useAuth";
import { startGoogleLogin, SUPPORT_EMAIL } from "@/const";
import { BrandMark, LogoLoader } from "@/components/BrandMark";
import { CardVisual, Field } from "@/components/CardVisual";
import type { ContactPatch, ContactRow } from "@/components/ContactsView";
import { LegalLinks } from "@/components/LegalLinks";
import { isVideoUrl } from "@/components/LoopVideo";
import { ShareSheet } from "@/components/ShareSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  executeBatchUpload,
  MAX_PORTFOLIO_ITEMS,
  MAX_PORTFOLIO_LENGTH,
  cardPayload,
  channelOptions,
  createClientDraft,
  emptyCard,
  channelPlaceholder,
  parseChannels,
  parseLinks,
  parsePortfolio,
  portfolioStoredLength,
  PREVIEW_CARD_STORAGE_KEY,
  readPreviewCard,
  resolveActiveCard,
  themeOptions,
  toDraft,
  uploadInlineMedia,
  validateCardData,
  type CardDraft,
  type ChannelItem,
  type PortfolioItem,
  type ReferenceRow,
} from "@/lib/card";
import { copyToClipboard, downloadBlob, formatDate, getInitials } from "@/lib/cardKit";
import { prepareUpload } from "@/lib/image";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
  Copy,
  Eye,
  FileText,
  HelpCircle,
  Home as HomeIcon,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  LogIn,
  Download,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PenLine,
  Plus,
  Play,
  Quote,
  QrCode,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  UsersRound,
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
  return <div className="loading-screen view-loading" role="status" aria-label="Loading"><LogoLoader /></div>;
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
  const [draft, setDraft] = useState<CardDraft>(() => readPreviewCard() ?? createClientDraft());
  const [initialDraftBaseline, setInitialDraftBaseline] = useState<string>(() => JSON.stringify(readPreviewCard() ?? createClientDraft()));
  const [showShare, setShowShare] = useState(false);
  const [sharingCard, setSharingCard] = useState<CardDraft | null>(null);
  const [showGuestPublishModal, setShowGuestPublishModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isSavingRef = useRef(false);
  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

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
  const uploadMedia = trpc.media.upload.useMutation();
  const createReference = trpc.references.create.useMutation();
  const deleteReferenceMutation = trpc.references.delete.useMutation();
  const deleteContactMutation = trpc.contacts.delete.useMutation();
  const updateContactMutation = trpc.contacts.update.useMutation();
  const markContactsSeen = trpc.contacts.markSeen.useMutation();
  const weekInsights = trpc.insights.summary.useQuery({ days: 7 }, { enabled: isAuthenticated, retry: false });
  const utils = trpc.useUtils();
  const exportCardData = async () => {
    try {
      const data = await utils.cards.export.fetch();
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `heyitsme-cards-${data.exportedAt.slice(0, 10)}.json`);
      toast.success("Card data downloaded. Photos and files are listed as links.");
    } catch {
      toast.error("Could not download your card data. Try again.");
    }
  };
  const [newContactIds, setNewContactIds] = useState<Set<number>>(() => new Set());
  const markingSeen = useRef(false);

  const isCardsLoading = isAuthenticated && cardsQuery.isLoading && !cardsQuery.data;
  const isCardsError = isAuthenticated && cardsQuery.isError && !cardsQuery.data;
  const cardsErrorMessage = cardsQuery.error?.message ?? "Could not load cards.";

  const cards = useMemo(() => {
    if (isAuthenticated) return cardsQuery.data ? cardsQuery.data.map(toDraft) : [];
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

  // T09: Respect valid explicit user selection; otherwise select non-deleted published card, then non-deleted draft, then draft
  const activeCard = useMemo(() => resolveActiveCard(cards, selectedId, draft), [cards, selectedId, draft]);

  const path = window.location.pathname;
  const mode = path.includes("/contacts") ? "contacts" : path.includes("/insights") ? "insights" : path.includes("/cards") ? "cards" : "overview";
  const isBuilder = path.includes("/new") || path.includes("/edit");

  // T08: Track dirty state against saved baseline and prompt on browser unload
  const isDirty = useMemo(() => {
    if (!isBuilder) return false;
    return JSON.stringify(draft) !== initialDraftBaseline;
  }, [draft, initialDraftBaseline, isBuilder]);

  useEffect(() => {
    if (!isBuilder || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBuilder, isDirty]);
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

  const editMatch = path.match(/^\/app\/cards\/(\d+)\/edit/);
  const editId = editMatch ? Number(editMatch[1]) : 0;

  useEffect(() => {
    if (editId > 0) {
      if (isAuthenticated && cardsQuery.isLoading && !cardsQuery.data) return;
      if (isAuthenticated && cardsQuery.isError && !cardsQuery.data) return;
      const found = cards.find((c) => c.id === editId);
      if (found && draft.id !== editId) {
        setSelectedId(found.id);
        setDraft(found);
        setInitialDraftBaseline(JSON.stringify(found));
      } else if (!found && (!isAuthenticated || cardsQuery.isSuccess)) {
        toast.error("Card not found.");
        navigate("/app/cards");
      }
    } else if (activeCard && !isBuilder) {
      setDraft(activeCard);
    }
  }, [editId, cards, activeCard?.id, isBuilder, isAuthenticated, cardsQuery.isLoading, cardsQuery.isError, cardsQuery.isSuccess, cardsQuery.data]);

  // Preview mode promises "sign in to sync it", so the first signed-in visit moves that card into the account.
  const importingPreview = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !cardsQuery.isSuccess || importingPreview.current || isSavingRef.current) return;
    const preview = readPreviewCard();
    if (!preview) return;
    importingPreview.current = true;
    isSavingRef.current = true;
    void (async () => {
      try {
        const uploaded = await uploadInlineMedia(preview, async (file) => (await uploadMedia.mutateAsync(file)).url);
        const created = await createCard.mutateAsync(cardPayload(uploaded));
        if (created) {
          const next = toDraft(created);
          setSelectedId((current) => (current === preview.id ? next.id : current));
          setDraft((current) => (current.id === preview.id ? next : current));
          setInitialDraftBaseline(JSON.stringify(next));
          if (window.location.pathname.includes("/new") || window.location.pathname.includes("/edit")) {
            navigate(`/app/cards/${next.id}/edit`);
          }
        }
        window.localStorage.removeItem(PREVIEW_CARD_STORAGE_KEY);
        setLocalCards([]);
        await utils.cards.list.invalidate();
        toast.success("Your draft is now in your account. Ready to publish whenever you are.");
      } catch (error: any) {
        // Kept in storage, so the next visit tries again.
        toast.error(`Could not move your preview card into your account. ${error?.message ?? "Please try again."}`);
      } finally {
        importingPreview.current = false;
        isSavingRef.current = false;
      }
    })();
  }, [isAuthenticated, cardsQuery.isSuccess]);

  const openBuilder = (card?: CardDraft) => {
    const next = card ?? createClientDraft({ updatedAt: new Date() });
    setFieldErrors({});
    setSelectedId(next.id);
    setDraft(next);
    setInitialDraftBaseline(JSON.stringify(next));
    navigate(card ? `/app/cards/${card.id}/edit` : "/app/cards/new");
  };

  const saveDraft = async (options?: { publish?: boolean; redirect?: boolean; silent?: boolean }) => {
    if (isSavingRef.current || importingPreview.current) return null;
    isSavingRef.current = true;
    try {
      const validation = validateCardData(draft);
      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        const firstError = Object.values(validation.errors)[0];
        toast.error(firstError);
        const firstKey = Object.keys(validation.errors)[0];
        const el = document.getElementById(`field-${firstKey.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`) ||
                   document.getElementById(firstKey);
        if (el) (el as HTMLElement).focus();
        return null;
      }
      setFieldErrors({});

      const payload = cardPayload(draft);
      const shouldRedirect = options?.redirect ?? true;

      if (isAuthenticated) {
        let savedCard: CardDraft | null = null;
        // A preview card lives in this browser and is not a row in this account, so it is created, not updated.
        // Checked against the preview cards, not the card list: the list reloads after a create, and saving again
        // before it arrives would otherwise create the card a second time.
        if (draft.id > 0 && !localCards.some((card) => card.id === draft.id)) {
          const updated = await updateCard.mutateAsync({
            id: draft.id,
            ...payload,
            ...(options?.publish !== undefined ? { published: options.publish } : {}),
          });
          savedCard = toDraft(updated ?? { ...draft, ...payload });
          setDraft(savedCard);
          setSelectedId(savedCard.id);
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
            window.localStorage.removeItem(PREVIEW_CARD_STORAGE_KEY);
            setLocalCards([]);
          }
        }
        await utils.cards.list.invalidate();
        setInitialDraftBaseline(JSON.stringify(savedCard));
        toast.success(options?.publish ? "Your card is live." : "Your card is in sync.");
        if (shouldRedirect) {
          navigate("/app/cards");
        }
        return savedCard;
      }
      // toDraft turns the payload's nulls back into "", which the share sheet, vCard, and builder inputs expect.
      const next = toDraft({
        ...draft,
        ...payload,
        // A preview has no public URL. Keep it unpublished until the owner signs in.
        published: false,
        updatedAt: new Date(),
        id: draft.id || Date.now(),
      });
      // Preview photos are stored inline, so a few large ones can fill the browser's ~5MB storage.
      try {
        window.localStorage.setItem(PREVIEW_CARD_STORAGE_KEY, JSON.stringify(next));
      } catch {
        toast.error("This browser has no room left for preview photos. Remove a photo or sign in to save it.");
        return null;
      }
      setLocalCards((current) =>
        current.some((item) => item.id === draft.id)
          ? current.map((item) => (item.id === draft.id ? next : item))
          : [next, ...current]
      );
      setSelectedId(next.id);
      setDraft(next);
      setInitialDraftBaseline(JSON.stringify(next));
      if (!options?.silent) toast.success("Saved on this browser. Sign in to publish and sync.");
      if (shouldRedirect) {
        navigate("/app/cards");
      }
      return next;
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save that card.");
      return null;
    } finally {
      isSavingRef.current = false;
    }
  };

  const copyPublicLink = async (card = activeCard): Promise<boolean> => {
    if (!card) return false;
    if (!isAuthenticated) {
      toast.error("Sign in to publish this card and get a shareable link.");
      return false;
    }
    if (card.id <= 0 || card.slug === "new-card") {
      toast.error("Save this card first to get its link.");
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
    if (!isAuthenticated) {
      const saved = await saveDraft({ redirect: false, silent: true });
      if (!saved) return;
      setShowGuestPublishModal(true);
      return;
    }
    const saved = await saveDraft({ publish: true, redirect: false });
    if (saved) {
      await copyPublicLink(saved);
      navigate("/app/cards");
    }
  };

  const handleDiscardOrCancel = () => {
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Discard them and return to cards?")) {
        return;
      }
    }
    navigate("/app/cards");
  };

  const handleNewCard = () => {
    if (!isAuthenticated && localCards.length > 0) {
      if (!window.confirm("Guest mode keeps one draft card in this browser. Creating a new card will replace your current draft. Continue?")) {
        return;
      }
      window.localStorage.removeItem(PREVIEW_CARD_STORAGE_KEY);
      setLocalCards([]);
    }
    openBuilder();
  };

  const handleShareCard = (card = activeCard) => {
    if (!card) {
      toast.info("Build your card first, then share it from here.");
      openBuilder();
      return;
    }
    setSelectedId(card.id);
    setDraft(card);
    setSharingCard(card);
    setShowShare(true);
  };

  const handlePublishCard = (card: CardDraft) => {
    if (!isAuthenticated) {
      setSelectedId(card.id);
      setDraft(card);
      setShowGuestPublishModal(true);
      return;
    }
    void togglePublish(card);
  };

  const handleCopyLink = (card = activeCard) => {
    if (!isAuthenticated) {
      toast.info("This card is saved on this browser. Sign in to publish and get a public link.");
      return;
    }
    void copyPublicLink(card);
  };

  const togglePublish = async (card: CardDraft) => {
    // Repeat clicks while the first request runs would all read the old state.
    if (publishCard.isPending) return;
    const published = !card.published;
    if (!isAuthenticated) {
      if (!card.published) {
        toast.error("Sign in to publish this card and get a shareable link.");
        return;
      }
      const next = { ...card, published: false };
      setLocalCards((current) => current.map((item) => (item.id === card.id ? next : item)));
      if (draft.id === card.id) setDraft(next);
      if (readPreviewCard()?.id === card.id) window.localStorage.setItem(PREVIEW_CARD_STORAGE_KEY, JSON.stringify(next));
      toast.success("Your card is hidden.");
      return;
    }
    if (card.id <= 0) {
      toast.error("Save this card first, then publish it.");
      return;
    }
    try {
      const updated = await publishCard.mutateAsync({ id: card.id, published });
      if (updated) {
        const next = toDraft(updated);
        if (draft.id === card.id) setDraft(next);
        if (sharingCard?.id === card.id) setSharingCard(next);
      }
      await Promise.all([
        utils.cards.list.invalidate(),
        utils.insights.summary.invalidate(),
      ]);
      toast.success(published ? "Your card is live." : "Your card is hidden.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update that card.");
    }
  };

  const removeCard = async (card: CardDraft) => {
    if (!window.confirm(`Delete "${card.displayName || "this card"}" for good? Its link, references, stats, and uploaded files are erased. Contacts it collected stay.`)) return;
    try {
      if (isAuthenticated && card.id > 0) {
        await deleteCardMutation.mutateAsync({ id: card.id });
        await Promise.all([
          utils.cards.list.invalidate(),
          utils.insights.summary.invalidate(),
        ]);
      } else {
        setLocalCards((current) => current.filter((item) => item.id !== card.id));
        if (readPreviewCard()?.id === card.id) window.localStorage.removeItem(PREVIEW_CARD_STORAGE_KEY);
      }
      if (sharingCard?.id === card.id) {
        setShowShare(false);
        setSharingCard(null);
      }
      if (selectedId === card.id) {
        setSelectedId(0);
        setDraft(createClientDraft({ updatedAt: new Date() }));
      }
      toast.success("Card deleted.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not delete that card.");
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
          ...(patch.followUpOn !== undefined ? { followUpOn: patch.followUpOn ? `${patch.followUpOn}T00:00:00.000Z` : null } : {}),
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

  if (loading) return <div className="loading-screen" role="status"><LogoLoader /><p>Warming up your presence…</p></div>;

  return (
    <div className="app-frame">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="ambient ambient-three" />
      <aside id="app-sidebar" className={`app-sidebar ${mobileNavOpen ? "is-open" : ""} ${sidebarHidden ? "is-collapsed" : ""}`}>
        <a className="brand-lockup" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} title="heyitsme home"><BrandMark /><span>heyitsme</span></a>
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
        <div className="sidebar-bottom">
          <div className="free-pod">
            <Sparkles size={15} />
            <div>
              <strong>Everything is free</strong>
              <span>All current features are free.</span>
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
            <button
              type="button"
              className="icon-button topbar-home"
              onClick={() => navigate("/")}
              title="Home"
              aria-label="Home"
            >
              <HomeIcon size={17} />
            </button>
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="topbar-avatar"
                    aria-label={`Account menu for ${user?.name || "you"}`}
                    type="button"
                  >
                    {getInitials(user?.name || "You")}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="account-dropdown-content">
                  <div className="account-dropdown-identity">
                    <strong>{user?.name || "You"}</strong>
                    {user?.email ? <span className="account-dropdown-email">{user.email}</span> : null}
                    <span className="account-dropdown-badge">All access · free</span>
                  </div>
                  <DropdownMenuSeparator />
                  {SUPPORT_EMAIL ? (
                    <DropdownMenuItem asChild>
                      <a href={`mailto:${SUPPORT_EMAIL}?subject=heyitsme%20Support`} className="account-menu-link">
                        <Mail size={14} /> Help & support
                      </a>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem asChild>
                      <a href="/faq" className="account-menu-link">
                        <HelpCircle size={14} /> Help & FAQ
                      </a>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => void exportCardData()} className="account-menu-link">
                    <Download size={14} /> Download my card data
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void logout()}
                    className="account-menu-signout"
                  >
                    <LogOut size={14} /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </header>
        <div className="content-wrap">
          {isBuilder ? (
            editId > 0 && isCardsLoading ? (
              <ViewLoading />
            ) : editId > 0 && isCardsError ? (
              <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="empty-state glass-panel">
                  <CircleUserRound size={24} />
                  <strong>Could not load this card.</strong>
                  <span>{cardsErrorMessage}</span>
                  <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                    <GlassButton onClick={() => cardsQuery.refetch()}>Try again</GlassButton>
                    <button type="button" className="text-button" onClick={() => navigate("/app/cards")}>Back to cards</button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <BuilderView
                draft={draft}
                setDraft={setDraft}
                onSave={() => saveDraft()}
                onPublishAndCopy={saveAndCopyLink}
                onCancel={handleDiscardOrCancel}
                saving={createCard.isPending || updateCard.isPending || publishCard.isPending}
                onUpload={addMediaFile}
                isAuthenticated={isAuthenticated}
                fieldErrors={fieldErrors}
                onClearError={clearFieldError}
                isDirty={isDirty}
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
            )
          ) : mode === "contacts" ? (
            <Suspense fallback={<ViewLoading />}>
              <ContactsView
                contacts={contacts}
                cards={cards}
                newIds={newContactIds}
                onUpdate={updateContact}
                onDelete={deleteContact}
                isAuthenticated={isAuthenticated}
                onSignIn={startGoogleLogin}
              />
            </Suspense>
          ) : mode === "insights" ? (
            <Suspense fallback={<ViewLoading />}>
              <InsightsView isAuthenticated={isAuthenticated} onSignIn={startGoogleLogin} />
            </Suspense>
          ) : mode === "cards" ? (
            <CardsView
              cards={cards}
              isAuthenticated={isAuthenticated}
              isLoading={isCardsLoading}
              isError={isCardsError}
              errorMessage={cardsErrorMessage}
              onRetry={() => cardsQuery.refetch()}
              onNew={handleNewCard}
              onEdit={openBuilder}
              onShare={handleShareCard}
              onPublish={handlePublishCard}
              publishing={publishCard.isPending}
              onDelete={removeCard}
            />
          ) : (
            <OverviewView
              cards={cards}
              contacts={contacts}
              cardsLoading={isCardsLoading}
              cardsError={isCardsError}
              cardsErrorMessage={cardsErrorMessage}
              onRetryCards={() => cardsQuery.refetch()}
              activeCard={cards.length ? activeCard : null}
              onNew={handleNewCard}
              onEdit={() => openBuilder(activeCard)}
              onShare={() => handleShareCard(activeCard)}
              onViewContacts={() => navigate("/app/contacts")}
              onCopy={() => handleCopyLink(activeCard)}
              weekViews={weekInsights.data?.daily}
              onInsights={() => navigate("/app/insights")}
            />
          )}
        </div>
      </main>
      {showGuestPublishModal ? (
        <div
          className="guest-modal-backdrop"
          onClick={() => setShowGuestPublishModal(false)}
          role="presentation"
        >
          <div
            className="guest-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="guest-modal-title">Sign in to publish your card</h2>
            <p>
              Your card draft is safely saved on this browser. Sign in with Google to get your permanent public link, generate your live QR code, and sync your card across devices.
            </p>
            <div className="guest-modal-actions">
              <button
                type="button"
                className="google-button"
                onClick={() => startGoogleLogin(window.location.pathname)}
                style={{ justifyContent: "center" }}
              >
                <span className="google-glyph">G</span> Continue with Google
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setShowGuestPublishModal(false)}
                style={{ textAlign: "center", padding: "10px" }}
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

function OverviewView({
  cards,
  contacts,
  cardsLoading,
  cardsError,
  cardsErrorMessage,
  onRetryCards,
  activeCard,
  onNew,
  onEdit,
  onShare,
  onCopy,
  onViewContacts,
  weekViews,
  onInsights,
}: any) {
  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="hero-row"><div><span className="section-kicker"><Sparkles size={14} /> Your presence, in motion</span><h1>Make the introduction<br /><em>feel like you.</em></h1><p className="hero-copy">Create a living professional card that carries your context into every room — no app, no awkward handoff.</p><div className="hero-actions"><GlassButton onClick={onNew}><Plus size={16} /> Create your card</GlassButton><button className="text-button" onClick={onShare}><QrCode size={16} /> Share your card</button></div></div><div className="hero-note"><span>01</span><p>One link.<br />Every detail.</p><ArrowUpRight size={20} /></div></div>
      <div className="overview-grid">
        <div className="feature-panel glass-panel">
          <div className="panel-header">
            <div>
              <span className="mini-label">{activeCard?.published ? "Your live card" : "Your card"}</span>
              <h2>{cardsLoading ? "Loading card…" : activeCard?.displayName || "Your first card"}</h2>
            </div>
            {activeCard && !cardsLoading ? <button type="button" className="icon-button" onClick={onEdit} aria-label="Edit card" title="Edit card"><Pencil size={16} /></button> : null}
          </div>
          {cardsLoading ? (
            <div className="empty-state" style={{ minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LogoLoader />
            </div>
          ) : cardsError ? (
            <div className="empty-state" style={{ minHeight: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <CircleUserRound size={24} />
              <span>Could not load card.</span>
              <GlassButton onClick={onRetryCards} variant="secondary">Try again</GlassButton>
            </div>
          ) : activeCard ? (
            <CardVisual card={activeCard} onClick={onEdit} label={`Edit ${activeCard.displayName || "your card"}`} />
          ) : (
            <button type="button" className="new-card-tile" onClick={onNew}><span><Plus size={20} /></span><strong>Create your first card</strong><small>It takes about a minute.</small></button>
          )}
          <div className="panel-footer">
            <span>
              <span className={`status-dot ${activeCard?.published ? "is-live" : ""}`} />
              {cardsLoading ? "Loading…" : cardsError ? "Unavailable" : activeCard?.published ? "Live on the web" : "Not published yet"}
            </span>
            {activeCard && !cardsLoading ? (
              activeCard.published ? (
                <button type="button" className="link-button" onClick={onCopy}><Copy size={14} /> Copy link</button>
              ) : (
                <button type="button" className="link-button" onClick={onShare}><Share2 size={14} /> Share</button>
              )
            ) : null}
          </div>
        </div>
        <div className="stats-column">
          <div className="stat-panel glass-panel">
            <span className="mini-label">Cards in orbit</span>
            <strong>{cardsLoading ? "…" : cardsError ? "—" : cards.length}</strong>
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
      <div className="lower-grid"><div className="recent-panel glass-panel"><div className="panel-header"><div><span className="mini-label">Recent introductions</span><h2>A little momentum</h2></div><button type="button" className="link-button" onClick={onViewContacts}>View all <ArrowUpRight size={14} /></button></div><div className="activity-list">{contacts.slice(0, 3).map((contact: ContactRow, index: number) => <motion.div key={contact.id} className="activity-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }}><div className="activity-avatar">{getInitials(contact.name)}</div><div className="activity-copy"><strong>{contact.name}</strong><span>{contact.title || "New contact"}{contact.company ? ` · ${contact.company}` : ""}</span></div><div className="activity-meta"><span>{contact.source === "exchange_form" ? "Exchanged details" : "Saved your card"}</span><time>{formatDate(contact.createdAt)}</time></div></motion.div>)}{contacts.length === 0 ? <div className="empty-state"><UsersRound size={22} /><span>Your first introduction will land here.</span></div> : null}</div></div><div className="quote-panel"><span className="quote-mark">“</span><p>People remember how easy you made it to keep in touch.</p><span className="quote-credit">heyitsme / a better handoff</span></div></div>
    </motion.div>
  );
}

function CardsView({
  cards,
  onNew,
  onEdit,
  onShare,
  onPublish,
  publishing,
  onDelete,
  isAuthenticated,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: any) {
  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-heading-row">
        <div>
          <span className="section-kicker"><CircleUserRound size={14} /> Your cards</span>
          <h1>Different room,<br /><em>different signal.</em></h1>
          <p>Keep the right version of you close at hand.</p>
        </div>
        <GlassButton onClick={onNew}><Plus size={16} /> New card</GlassButton>
      </div>
      {isLoading ? (
        <div className="empty-state glass-panel" style={{ padding: "48px 24px" }}>
          <LogoLoader />
          <span style={{ marginTop: 12 }}>Loading your cards…</span>
        </div>
      ) : isError ? (
        <div className="empty-state glass-panel">
          <CircleUserRound size={24} />
          <strong>Could not load your cards.</strong>
          <span>{errorMessage}</span>
          <GlassButton onClick={onRetry}>Try again</GlassButton>
        </div>
      ) : cards.length === 0 ? (
        <div className="empty-state glass-panel">
          <CircleUserRound size={24} />
          <strong>No cards yet.</strong>
          <span>Create your first card to share your details and portfolio.</span>
          <GlassButton onClick={onNew}><Plus size={15} /> Create your card</GlassButton>
        </div>
      ) : (
        <div className="cards-grid">
          {cards.map((card: CardDraft, index: number) => {
            const archived = Boolean(card.deletedAt);
            const status = archived ? "Archived" : card.published ? "Live" : "Private";
            return (
              <motion.div
                key={card.id}
                className={`card-list-item glass-panel ${archived ? "is-archived" : ""}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.07 }}
              >
                <CardVisual card={card} compact onClick={archived ? undefined : () => onEdit(card)} label={`Edit ${card.displayName || "untitled card"}`} />
                <div className="card-list-meta">
                  <div>
                    <strong>{card.displayName || "Untitled card"}</strong>
                    <span>{card.title}{card.company ? ` · ${card.company}` : ""}</span>
                  </div>
                  <span className={`tiny-status ${status.toLowerCase()}`}>
                    <span className="status-dot" />{status}
                  </span>
                </div>
                <div className="card-list-actions">
                  {archived ? null : (
                    <>
                      <button onClick={() => onEdit(card)}><Pencil size={14} /> Edit</button>
                      <button onClick={() => onShare(card)}><Share2 size={14} /> Share</button>
                      <button onClick={() => onPublish(card)} disabled={publishing}>
                        <span className="publish-toggle" />{card.published ? "Unpublish" : "Publish"}
                      </button>
                    </>
                  )}
                  <button className="danger-action" onClick={() => onDelete(card)}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </motion.div>
            );
          })}
          <button className="new-card-tile" onClick={onNew}>
            <span><Plus size={20} /></span>
            <strong>Create another card</strong>
            <small>{!isAuthenticated ? "Guest mode keeps one draft. Sign in for all features." : "Same you. New context."}</small>
          </button>
        </div>
      )}
    </motion.div>
  );
}

function BuilderView({
  draft,
  setDraft,
  onSave,
  onPublishAndCopy,
  onCancel,
  saving,
  onUpload,
  onAddReference,
  onDeleteReference,
  isAuthenticated,
  fieldErrors = {},
  onClearError,
  isDirty = false,
}: any) {
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const update = (key: keyof CardDraft, value: string) => setDraft((current: CardDraft) => ({ ...current, [key]: value }));
  return (
    <motion.div className="builder-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="page-heading-row builder-heading">
        <div>
          <button className="back-button" onClick={onCancel}>← Back to cards</button>
          <span className="section-kicker"><Sparkles size={14} /> Card builder</span>
          <h1>Make it<br /><em>unmistakably you.</em></h1>
          {!isAuthenticated ? (
            <div className="guest-builder-banner">
              <span className="status-dot" />
              <span>Saved on this browser. Sign in to publish and sync.</span>
            </div>
          ) : null}
        </div>
        <div className="builder-save-actions">
          {!isDirty ? (
            <span className="save-status-indicator" title="All changes saved in this browser">
              <Check size={14} /> Saved
            </span>
          ) : null}
          <button className="text-button" onClick={onCancel}>Discard</button>
          <button className="publish-copy-button" onClick={onPublishAndCopy} disabled={saving}>
            {!isAuthenticated ? (
              <><LogIn size={15} /> Sign in to publish</>
            ) : (
              <><Share2 size={15} /> {saving ? "Publishing…" : "Publish & copy link"}</>
            )}
          </button>
          <GlassButton onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : <><Check size={16} /> Save card</>}
          </GlassButton>
        </div>
      </div>

      <div className="mobile-builder-tabs" role="tablist" aria-label="Builder view">
        <button
          type="button"
          role="tab"
          id="mobile-tab-edit"
          aria-selected={mobileTab === "edit"}
          aria-controls="builder-form-panel"
          className={`mobile-tab-btn ${mobileTab === "edit" ? "is-active" : ""}`}
          onClick={() => setMobileTab("edit")}
        >
          <PenLine size={15} /> Edit
        </button>
        <button
          type="button"
          role="tab"
          id="mobile-tab-preview"
          aria-selected={mobileTab === "preview"}
          aria-controls="builder-preview-panel"
          className={`mobile-tab-btn ${mobileTab === "preview" ? "is-active" : ""}`}
          onClick={() => setMobileTab("preview")}
        >
          <Eye size={15} /> Preview
        </button>
      </div>

      <div className={`builder-layout mobile-view-${mobileTab}`}>
        <div id="builder-form-panel" className="builder-form glass-panel" role="tabpanel" aria-labelledby="mobile-tab-edit">
          <div className="form-section">
            <div className="form-section-heading">
              <span>01</span>
              <div>
                <h2>Essentials</h2>
                <p>Enough context to make the hello feel natural.</p>
              </div>
            </div>
            <div className="media-picker-row">
              <ImagePicker label="Profile photo" hint="Square works best" shape="round" value={draft.avatarUrl} onChange={(value) => update("avatarUrl", value)} onUpload={onUpload} />
              <ImagePicker label="Cover" hint="Wide image, or a muted video loop up to 3MB" shape="wide" allowVideo value={draft.coverUrl} onChange={(value) => update("coverUrl", value)} onUpload={onUpload} />
            </div>
            <div className="field-grid">
              <Field label="Your name" value={draft.displayName} onChange={(value: string) => { update("displayName", value); onClearError?.("displayName"); }} error={fieldErrors.displayName} placeholder="Alex Morgan" required hint={(draft as any).id > 0 ? "Your card link stays the same when you change your name." : undefined} />
              <Field label="Role / title" value={draft.title} onChange={(value: string) => { update("title", value); onClearError?.("title"); }} error={fieldErrors.title} placeholder="Creative director" />
              <Field label="Company" value={draft.company} onChange={(value: string) => { update("company", value); onClearError?.("company"); }} error={fieldErrors.company} placeholder="Studio North" />
              <Field label="Location" value={draft.location} onChange={(value: string) => { update("location", value); onClearError?.("location"); }} error={fieldErrors.location} placeholder="San Francisco, CA" />
              <Field label="Email" value={draft.email} onChange={(value: string) => { update("email", value); onClearError?.("email"); }} error={fieldErrors.email} placeholder="hello@you.co" type="email" />
              <Field label="Phone" value={draft.phone} onChange={(value: string) => { update("phone", value); onClearError?.("phone"); }} error={fieldErrors.phone} placeholder="+1 415 555 0183" />
            </div>
            <label className="field-label">
              <span>A little context</span>
              <textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} placeholder="What do you want people to remember about you?" />
            </label>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>02</span>
              <div>
                <h2>Links</h2>
                <p>Add a few places for the conversation to continue.</p>
              </div>
            </div>
            <label className="field-label" htmlFor="field-links">
              <span>Links</span>
              <input
                id="field-links"
                value={parseLinks(draft.links).join(", ")}
                onChange={(event) => { update("links", JSON.stringify(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))); onClearError?.("links"); }}
                aria-invalid={Boolean(fieldErrors.links)}
                aria-describedby={fieldErrors.links ? "field-links-error" : undefined}
                className={fieldErrors.links ? "has-error" : undefined}
                placeholder="yourwebsite.com, linkedin.com/in/you"
              />
              {fieldErrors.links ? <span id="field-links-error" className="field-error-text" role="alert">{fieldErrors.links}</span> : null}
            </label>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>03</span>
              <div>
                <h2>Portfolio</h2>
                <p>Add images, videos, files, or a project link. Uploads are served from secure storage.</p>
              </div>
            </div>
            <div className="field-grid">
              <Field
                label="Image gallery heading"
                value={draft.galleryHeading || ""}
                onChange={(value: string) => update("galleryHeading", value)}
                placeholder="Moments & work in focus."
                hint="Heading shown above your photo gallery."
              />
              <Field
                label="Project list heading"
                value={draft.portfolioHeading || ""}
                onChange={(value: string) => update("portfolioHeading", value)}
                placeholder="A little proof of the practice."
                hint="Heading shown above project links, documents, and videos."
              />
            </div>
            {fieldErrors.portfolio ? <span className="field-error-text" role="alert">{fieldErrors.portfolio}</span> : null}
            <PortfolioEditor raw={draft.portfolio} onChange={(value: string) => { update("portfolio", value); onClearError?.("portfolio"); }} onUpload={onUpload} />
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>04</span>
              <div>
                <h2>Contact buttons</h2>
                <p>Add social profiles and direct channels — Viber, WhatsApp, Telegram, and more.</p>
              </div>
            </div>
            <Field label="Contact heading" value={draft.contactHeading || ""} onChange={(value: string) => update("contactHeading", value)} placeholder="Pick the easiest way in." />
            {fieldErrors.channels ? <span className="field-error-text" role="alert">{fieldErrors.channels}</span> : null}
            <ChannelsEditor raw={draft.channels} onChange={(value: string) => { update("channels", value); onClearError?.("channels"); }} />
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>05</span>
              <div>
                <h2>Client references</h2>
                <p>Show the thoughtful words people remember after the work is done.</p>
              </div>
            </div>
            <ReferencesEditor cardId={draft.id} onAddReference={onAddReference} onDeleteReference={onDeleteReference} isAuthenticated={isAuthenticated} />
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>06</span>
              <div>
                <h2>Appearance</h2>
                <p>Choose a palette and page background that fits your style.</p>
              </div>
            </div>
            <div className="theme-picker">
              {themeOptions.map((theme) => (
                <button
                  type="button"
                  key={theme.id}
                  onClick={() => update("theme", theme.id)}
                  className={`theme-swatch theme-${theme.id} ${draft.theme === theme.id ? "is-selected" : ""}`}
                >
                  <span className="swatch-colors">
                    <i style={{ background: theme.colors[0] }} />
                    <i style={{ background: theme.colors[1] }} />
                    <i style={{ background: theme.colors[2] }} />
                  </span>
                  <span>{theme.label}</span>
                  {draft.theme === theme.id ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
            <div className="media-picker-row">
              <ImagePicker label="Page background" hint="Fills your page behind everything. Image up to 3MB" shape="wide" value={draft.backgroundUrl} onChange={(value) => update("backgroundUrl", value)} onUpload={onUpload} />
            </div>
          </div>
        </div>

        <div id="builder-preview-panel" className="builder-preview-column" role="tabpanel" aria-labelledby="mobile-tab-preview">
          <div className={`preview-sticky${draft.backgroundUrl ? " has-page-bg" : ""}`}>
            {draft.backgroundUrl ? (
              <div className="preview-page-bg" aria-hidden="true">
                <img src={draft.backgroundUrl} alt="" />
              </div>
            ) : null}
            <div className="preview-label">
              <span>Live preview</span>
              <span><span className="status-dot" /> updates as you type</span>
            </div>
            <CardVisual card={{ ...draft, displayName: draft.displayName || "Your name", title: draft.title || "Your title" }} />
            <div className="preview-tip">
              <Sparkles size={15} />
              <span>Keep it light. Your card can do the talking.</span>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mobile-floating-preview-btn"
        onClick={() => setMobileTab((tab) => (tab === "edit" ? "preview" : "edit"))}
        aria-label={mobileTab === "edit" ? "Preview card" : "Back to editing"}
      >
        {mobileTab === "edit" ? <><Eye size={16} /> Preview card</> : <><PenLine size={16} /> Back to editing</>}
      </button>
    </motion.div>
  );
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
  const latestItems = useRef(items);
  latestItems.current = items;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<PortfolioItem["kind"]>("image");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addItem = (item: PortfolioItem) => onChange(JSON.stringify([...items, item]));

  const addUrlItem = () => {
    if (!url.trim()) return;
    if (items.length >= MAX_PORTFOLIO_ITEMS) {
      toast.error(`Portfolio is full (maximum ${MAX_PORTFOLIO_ITEMS} items).`);
      return;
    }
    const newItem: PortfolioItem = {
      id: crypto.randomUUID(),
      kind,
      title: kind === "image" ? "" : (title.trim() || url.trim()),
      url: url.trim(),
      description: description.trim() || undefined,
    };
    if (portfolioStoredLength([...items, newItem]) > MAX_PORTFOLIO_LENGTH) {
      toast.error("Portfolio size limit reached.");
      return;
    }
    addItem(newItem);
    setTitle("");
    setUrl("");
    setDescription("");
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    setBusy(true);
    try {
      const result = await executeBatchUpload(
        items,
        files,
        onUpload,
        {
          description,
          onProgress: setUploadProgress,
          onError: (name, error) => toast.error(`Failed to upload ${name}: ${error?.message || "Upload error"}`),
        }
      );

      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.warning) toast.warning(result.warning);
        if (result.newItems.length > 0) {
          // Uploads take a while; append to the list as it is now, so edits made meanwhile are kept.
          onChange(JSON.stringify([...latestItems.current, ...result.newItems]));
          if (result.newItems.length > 1) {
            toast.success(`Uploaded ${result.newItems.length} photos! Add descriptions below.`);
          } else {
            toast.success("Photo uploaded.");
          }
          setDescription("");
          setTitle("");
        }
      }
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  };

  const updateItem = (index: number, patch: Partial<PortfolioItem>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    if (portfolioStoredLength(next) > MAX_PORTFOLIO_LENGTH) {
      toast.error("Portfolio size limit reached.");
      return;
    }
    onChange(JSON.stringify(next));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    onChange(JSON.stringify(reordered));
  };

  return (
    <div className="portfolio-editor">
      <div className="portfolio-add-box">
        <div className="portfolio-add-row">
          <select value={kind} onChange={(event) => setKind(event.target.value as PortfolioItem["kind"])}>
            <option value="image">Photo / Image</option>
            <option value="link">Website link</option>
            <option value="video">Video URL</option>
            <option value="file">Document URL</option>
          </select>
          {kind !== "image" && (
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Project title"
            />
          )}
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={kind === "image" ? "Photo URL https://… (or upload below)" : "https://…"}
          />
          <button className="outline-button" type="button" onClick={addUrlItem} disabled={!url.trim()}>
            <Plus size={14} /> Add
          </button>
        </div>

        <textarea
          className="portfolio-add-desc"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={kind === "image" ? "Photo description (optional, shown in carousel & lightbox gallery)..." : "Project description or context (optional)..."}
          rows={2}
        />

        <label
          className={`upload-drop ${isDragging ? "is-dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void handleFiles(e.dataTransfer.files);
            }
          }}
        >
          <Upload size={17} />
          <span>{busy ? (uploadProgress || "Uploading photos…") : "Upload photos (click to select or drag & drop multiple images)"}</span>
          <input
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.zip"
            disabled={busy}
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) {
                void handleFiles(event.target.files);
              }
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="portfolio-list">
        {items.map((item, index) => (
          <div className="portfolio-item-card" key={item.id}>
            <div className="portfolio-item-top">
              <div className="portfolio-item-thumb">
                {item.kind === "image" ? (
                  <img src={item.url} alt="" />
                ) : item.kind === "video" ? (
                  <span className="portfolio-item-icon"><Play size={15} /></span>
                ) : item.kind === "file" ? (
                  <span className="portfolio-item-icon"><FileText size={15} /></span>
                ) : (
                  <span className="portfolio-item-icon"><Link2 size={15} /></span>
                )}
              </div>

              <div className="portfolio-item-info">
                {item.kind === "image" ? (
                  <span className="portfolio-item-label">
                    Photo {items.slice(0, index + 1).filter((it) => it.kind === "image").length}
                  </span>
                ) : (
                  <input
                    className="portfolio-item-title-input"
                    value={item.title}
                    onChange={(e) => updateItem(index, { title: e.target.value })}
                    placeholder="Title"
                  />
                )}
                <span className="portfolio-item-meta">
                  {item.kind} · {item.url.replace(/^https?:\/\//, "").slice(0, 36)}
                </span>
              </div>

              <div className="portfolio-item-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => moveItem(index, "up")}
                  disabled={index === 0}
                  title="Move slide up / earlier"
                  aria-label="Move slide up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => moveItem(index, "down")}
                  disabled={index === items.length - 1}
                  title="Move slide down / later"
                  aria-label="Move slide down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => onChange(JSON.stringify(items.filter((c) => c.id !== item.id)))}
                  aria-label={item.kind === "image" ? `Remove photo ${index + 1}` : `Remove ${item.title}`}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <textarea
              className="portfolio-item-desc-input"
              value={item.description ?? ""}
              onChange={(e) => updateItem(index, { description: e.target.value })}
              placeholder={item.kind === "image" ? "Photo description (shown on carousel & lightbox)..." : "Description (optional)..."}
              rows={2}
            />
          </div>
        ))}
        {items.length === 0 ? (
          <p className="editor-empty">Add photos, documents, or website links. Photos will automatically form an interactive swipeable carousel with descriptions on your card.</p>
        ) : null}
      </div>
    </div>
  );
}

function ChannelsEditor({ raw, onChange }: { raw: string; onChange: (value: string) => void }) {
  const channels = parseChannels(raw, { keepEmpty: true });
  const [selectedProvider, setSelectedProvider] = useState("");
  const update = (index: number, patch: Partial<ChannelItem>) => onChange(JSON.stringify(channels.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)));
  const addChannel = () => { if (!selectedProvider) return; onChange(JSON.stringify([...channels, { provider: selectedProvider, url: "" }])); setSelectedProvider(""); };
  return <div className="channels-editor"><div className="channel-add-grid"><select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)}><option value="">Choose a provider…</option>{channelOptions.filter((provider) => !channels.some((item) => item.provider === provider)).map((provider) => <option value={provider} key={provider}>{provider[0].toUpperCase() + provider.slice(1)}</option>)}</select><button className="outline-button" type="button" onClick={addChannel} disabled={!selectedProvider}><Plus size={14} /> Add channel</button><span>Choose a provider, then add a new conversation door.</span></div>{channels.map((channel, index) => <div className="channel-row" key={`${channel.provider}-${index}`}><strong>{channel.provider}</strong><input value={channel.label ?? ""} onChange={(event) => update(index, { label: event.target.value })} placeholder="Custom label, e.g. Message me" aria-label={`${channel.provider} button label`} /><input value={channel.url} onChange={(event) => update(index, { url: event.target.value })} placeholder={channelPlaceholder(channel.provider)} aria-label={`${channel.provider} link, handle, or number`} /><button className="icon-button" type="button" onClick={() => onChange(JSON.stringify(channels.filter((_, itemIndex) => itemIndex !== index)))} aria-label={`Remove ${channel.provider}`} title="Remove"><Trash2 size={14} /></button></div>)}{channels.length === 0 ? <p className="editor-empty">Add your social profiles and direct messaging links.</p> : null}</div>;
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
            <button className="icon-button" type="button" onClick={() => void remove(reference.id)} title="Delete reference" aria-label={`Delete reference from ${reference.clientName}`}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {references.length === 0 && <p className="editor-empty">No references added yet.</p>}
      </div>
    </div>
  );
}

