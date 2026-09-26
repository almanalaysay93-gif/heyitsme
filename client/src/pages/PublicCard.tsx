import { LogoLoader } from "@/components/BrandMark";
import { CardLanding } from "@/components/CardLanding";
import { Field } from "@/components/Field";
import { usePageMeta } from "@/hooks/usePageMeta";
import { buildVCard, readPreviewCard, toDraft, type CardDraft } from "@/lib/card";
import { copyToClipboard, downloadBlob, safeFileName } from "@/lib/cardKit";
import { trpc } from "@/lib/trpc";
import { parsePageConfig, switchTemplate, TEMPLATE_IDS, type TemplateId } from "@shared/pageConfig";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Send, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

/** Guest previews only; published cards link to /c/<slug>.vcf. */
function downloadVCard(card: CardDraft) {
  downloadBlob(new Blob([buildVCard(card, window.location.href, window.location.origin)], { type: "text/vcard;charset=utf-8" }), `${safeFileName(card.displayName, "contact")}.vcf`);
  toast.success("Contact file (.vcf) downloaded.");
}

export default function PublicCardPage() {
  const [location] = useLocation();
  const slug = location.split("/c/")[1]?.split("/")[0] ?? "";
  // One view per page load: refetching on focus would log a new view each time the visitor switches tabs.
  const cardQuery = trpc.publicCard.bySlug.useQuery({ slug }, { enabled: Boolean(slug), retry: false, refetchOnWindowFocus: false, staleTime: Infinity });
  const exchange = trpc.publicCard.exchange.useMutation();
  const trackEvent = trpc.publicCard.track.useMutation();
  const [showForm, setShowForm] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", title: "", notes: "", website: "" });
  const rawCard = cardQuery.data as any;
  const previewCard = !rawCard && slug === "new-card" ? readPreviewCard() : null;
  const card = rawCard ? toDraft(rawCard) : previewCard;
  const references = rawCard?.references ?? [];

  useEffect(() => {
    if (!showForm) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setShowForm(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm]);

  const isDemo = card?.slug === "demo" || card?.id === -1;

  // The server already rendered these tags for crawlers; this keeps them right after client-side navigation.
  usePageMeta({
    title: isDemo
      ? "Alex Morgan (Demo Card) — heyitsme"
      : card?.displayName
        ? `${card.displayName}${card.title ? ` · ${card.title}` : ""} — heyitsme`
        : "heyitsme",
    description: isDemo
      ? "Explore a live demo card on heyitsme. See how links, portfolio items, vCard download, and details exchange work."
      : card
        ? (card.bio || `${card.displayName}${card.title ? `, ${card.title}` : ""}${card.company ? ` at ${card.company}` : ""}. Save my contact or exchange details.`).slice(0, 200)
        : undefined,
    canonicalPath: rawCard ? `/c/${rawCard.slug}` : undefined,
    noindex: !rawCard,
  });

  if (cardQuery.isLoading) {
    return (
      <div className="public-loading">
        <LogoLoader label="Opening a little context…" />
      </div>
    );
  }
  // A guest preview lives in this browser, so it still opens when the lookup fails.
  if (cardQuery.isError && !card) {
    return (
      <main className="public-loading" id="main" tabIndex={-1}>
        <div className="not-found-mark">!</div>
        <h1>Could not load this card.</h1>
        <p>Something went wrong loading this card. Please try again.</p>
        <button className="outline-button" onClick={() => void cardQuery.refetch()}>Try again</button>
        <a href="/">Visit heyitsme</a>
      </main>
    );
  }
  if (!card) {
    return (
      <main className="public-loading" id="main" tabIndex={-1}>
        <div className="not-found-mark">?</div>
        <h1>This card moved.</h1>
        <p>Ask for an updated link or head back to heyitsme.</p>
        <a href="/">Visit heyitsme</a>
      </main>
    );
  }

  // The demo can show any template (/c/demo?template=business) so people can compare them before signing up.
  const demoTemplate = isDemo ? new URLSearchParams(window.location.search).get("template") : null;
  const baseConfig = parsePageConfig(card.page);
  const config = demoTemplate && (TEMPLATE_IDS as readonly string[]).includes(demoTemplate) ? switchTemplate(baseConfig, demoTemplate as TemplateId) : baseConfig;
  // Guest previews live in this browser only (their id is a timestamp), so nothing about them reaches the server.
  const canExchange = Boolean(rawCard);

  // Best-effort counters for the owner's Insights; a failed ping never interrupts the visitor.
  const track = (type: "vcard" | "link" | "share", target?: string) => {
    if (!canExchange) return;
    trackEvent.mutate({ cardId: card.id, type, target: target?.slice(0, 80) || null }, { onError: () => undefined });
  };

  // Published cards open the server's .vcf, which iPhone Safari shows as an "add contact" sheet; blob
  // downloads there land in Files instead. Guest previews have no server copy, so they still build the file here.
  const saveContact = () => {
    track("vcard");
    if (rawCard?.slug) window.location.assign(`/c/${encodeURIComponent(rawCard.slug)}.vcf`);
    else downloadVCard(card);
  };

  const copyLink = async () => {
    track("share", "copy");
    if (await copyToClipboard(window.location.href)) toast.success("Link copied.");
    else toast.info(window.location.href);
  };

  const shareLink = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: card.displayName, url: window.location.href });
        track("share", "native");
        return;
      } catch (error: any) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyLink();
  };

  const openForm = () => { setShowForm(true); setSent(false); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error("Please add your name.");
      return;
    }
    const trimmedEmail = form.email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("That email doesn't look right.");
      return;
    }
    if (!canExchange) {
      toast.error("Cannot exchange details on a preview card.");
      return;
    }
    try {
      await exchange.mutateAsync({
        cardId: card.id,
        name: trimmedName,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        title: form.title.trim() || null,
        notes: form.notes.trim() || null,
        website: form.website || null,
      });
      setSent(true);
      toast.success(isDemo ? "Details exchanged (demo simulation). No real emails sent." : "Details exchanged.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not send your details.");
    }
  };

  return (
    <>
      {isDemo ? (
        <aside className="lx-demo-banner" role="status" aria-label="Demo card">
          <Sparkles size={14} aria-hidden="true" />
          <span>Demo card · Sample details, nothing is sent.</span>
          {TEMPLATE_IDS.map((id) => (
            <a key={id} href={`/c/demo?template=${id}`} aria-current={config.template === id ? "page" : undefined}>{id[0].toUpperCase() + id.slice(1)}</a>
          ))}
        </aside>
      ) : null}
      <CardLanding
        card={card}
        config={config}
        references={references}
        interactive
        canExchange={canExchange}
        pageUrl={window.location.href}
        onSaveContact={saveContact}
        onExchange={openForm}
        onShare={() => void shareLink()}
        onCopyLink={() => void copyLink()}
        track={track}
      />

      <AnimatePresence>
        {showForm ? (
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Exchange details with ${card.displayName}`}
              className="exchange-sheet glass-panel"
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(event) => event.stopPropagation()}
            >
              {sent ? (
                <div className="success-state">
                  <div className="success-check"><Check size={25} /></div>
                  <h2>Nice. You’re in.</h2>
                  <p>Your details were sent to {card.displayName}. Keep the good conversation going.</p>
                  <button className="outline-button" onClick={() => setShowForm(false)}>Close</button>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="sheet-header">
                    <div>
                      <span className="mini-label">Exchange details</span>
                      <h2>Make it easy to find you too.</h2>
                    </div>
                    <button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X size={17} /></button>
                  </div>
                  <div className="field-grid">
                    <Field label="Your name" value={form.name} onChange={(value: string) => setForm({ ...form, name: value })} placeholder="Jordan Lee" required />
                    <Field label="Email" type="email" value={form.email} onChange={(value: string) => setForm({ ...form, email: value })} placeholder="you@example.com" />
                    <Field label="Company" value={form.company} onChange={(value: string) => setForm({ ...form, company: value })} placeholder="Your company" />
                    <Field label="Role / title" value={form.title} onChange={(value: string) => setForm({ ...form, title: value })} placeholder="What you do" />
                  </div>
                  <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                  <label className="field-label">
                    A note <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Where did we meet?" />
                  </label>
                  <button className="glass-button glass-button-primary full-width" disabled={exchange.isPending}>
                    {exchange.isPending ? "Sending…" : <><Send size={16} /> Exchange details</>}
                  </button>
                  <p className="privacy-note">Your details are shared only with {card.displayName}. No app download required. <Link href="/privacy">How we handle your details</Link></p>
                </form>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
