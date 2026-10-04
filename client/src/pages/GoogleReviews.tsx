import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { startGoogleLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { copyToClipboard } from "@/lib/cardKit";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import "./google-reviews.css";

type Result = { id: string; name: string; address: string; token: string };
const newToken = () => crypto.randomUUID();

export default function GoogleReviews() {
  const { isAuthenticated, loading } = useAuth();
  const cards = trpc.cards.list.useQuery(undefined, { enabled: isAuthenticated });
  const [cardId, setCardId] = useState(0);
  // The card editor links here with ?card=, so the page opens on the card being edited.
  useEffect(() => {
    if (cardId || !cards.data?.length) return;
    const wanted = Number(new URLSearchParams(location.search).get("card"));
    setCardId(cards.data.find(card => card.id === wanted)?.id ?? cards.data[0].id);
  }, [cards.data, cardId]);
  const page = trpc.googleReviews.ownerPage.useQuery({ cardId }, { enabled: cardId > 0 });
  const allowance = trpc.googleReviews.allowance.useQuery({ cardId }, { enabled: cardId > 0 });
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [sessionToken, setSessionToken] = useState(newToken);
  const search = trpc.googleReviews.search.useQuery({ cardId, query: term, sessionToken }, { enabled: cardId > 0 && term.length >= 3 && allowance.data?.canConnect === true && allowance.data.setups.canSetup, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const select = trpc.googleReviews.select.useMutation();
  const connect = trpc.googleReviews.connect.useMutation();
  const settings = trpc.googleReviews.settings.useMutation();
  const remove = trpc.googleReviews.delete.useMutation();
  const setups = allowance.data?.setups;
  const [selected, setSelected] = useState<{ name?: string; address?: string; category?: string; rating?: number; reviewCount?: number; token: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [changing, setChanging] = useState(false);
  const [days, setDays] = useState<1 | 7 | 30 | 90 | null>(30);
  const summary = trpc.googleReviews.summary.useQuery({ cardId, days }, { enabled: cardId > 0 && !!page.data?.placeId });
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of summary.data?.rows ?? []) out[row.type] = (out[row.type] ?? 0) + row.count;
    return out;
  }, [summary.data]);
  const trend = useMemo(() => {
    const days = new Map<string, { views: number; clicks: number }>();
    for (const row of summary.data?.rows ?? []) {
      const day = days.get(row.day) ?? { views: 0, clicks: 0 };
      if (row.type === "page_view") day.views += row.count;
      if (row.type === "google_review_click") day.clicks += row.count;
      days.set(row.day, day);
    }
    return Array.from(days).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  }, [summary.data]);
  useEffect(() => { const timer = setTimeout(() => setTerm(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  const url = page.data ? `${location.origin}/r/${page.data.slug}` : "";
  const copy = (value: string) => void copyToClipboard(value);
  const choose = async (result: Result) => {
    try {
      const data = await select.mutateAsync({ cardId, suggestionToken: result.token, sessionToken });
      setSelected({ ...data.place, token: data.selectionToken });
    } catch { setSelected(null); }
  };
  const confirm = async () => {
    if (!selected) return;
    try {
      await connect.mutateAsync({ cardId, selectionToken: selected.token });
      await page.refetch();
      await allowance.refetch();
      setSuccess(true); setChanging(false);
      setSelected(null);
      setQuery(""); setTerm(""); setSessionToken(newToken());
    } catch { /* Mutation error appears below the confirmation buttons. */ }
  };
  const qrSvg = () => document.getElementById("review-qr")?.querySelector("svg");
  const downloadQr = () => {
    const svg = qrSvg(); if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "google-review-qr.svg"; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  if (loading || cards.isLoading) return <AppShell area="Business features" crumb="Google Reviews" active="google-reviews"><p role="status">Loading...</p></AppShell>;
  if (!isAuthenticated) return <AppShell area="Business features" crumb="Google Reviews" active="google-reviews"><h1>Google Reviews</h1><p>Sign in to connect your business.</p><button className="gr-primary" onClick={startGoogleLogin}>Sign in</button></AppShell>;
  return <AppShell area="Business features" crumb="Google Reviews" active="google-reviews">
    <header className="gr-heading"><div><span className="section-kicker">Business features & services</span><h1>Google Reviews</h1><p>Make it easier for customers to find your business and leave a Google review.</p></div></header>
    {!cards.data?.length ? <section className="gr-panel"><h2>Create a card first</h2><p>Your review page will use its business name and logo.</p><Link href="/app/cards/new" className="gr-primary">Create a card</Link></section> : <>
      <label className="gr-field">Business card<select value={cardId} onChange={e => { setCardId(Number(e.target.value)); setSelected(null); setSuccess(false); }}>{cards.data.map(card => <option key={card.id} value={card.id}>{card.company || card.displayName}</option>)}</select></label>
      {allowance.data?.canConnect === false && !page.data?.enabled ? <section className="gr-panel"><h2>One Google business on Free</h2><p>Your account already has an active Google business on another card. Disconnect it before you add a different business, or use a Pro account for more locations.</p></section> : !page.data?.placeId || !page.data?.enabled || selected || changing ? setups?.canSetup === false && !selected ? <section className="gr-panel"><h2>Weekly setup limit reached</h2><p>Your plan allows {setups.limit} Google business {setups.limit === 1 ? "setup" : "setups"} a week, and you have used {setups.limit === 1 ? "it" : "them all"}.{setups.nextAt ? ` You can set up again on ${new Date(setups.nextAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.` : ""}</p>{setups.tier === "free" && <p>Pro allows 5 a week and Teams 10.</p>}{changing && <div className="gr-actions"><button className="gr-secondary" onClick={() => setChanging(false)}>Back</button></div>}</section> : <section className="gr-panel"><h2>{selected ? "Is this your business?" : "Grow your Google reputation"}</h2>
        {selected ? <><strong>{selected.name}</strong><p>{selected.address}</p><p>{selected.category}</p>{selected.rating && <p>★ {selected.rating} on Google · {selected.reviewCount ?? 0} reviews</p>}<div className="gr-actions"><button className="gr-primary" onClick={() => void confirm()} disabled={connect.isPending}>{connect.isPending ? "Creating your Google Review page..." : "Yes, this is my business"}</button><button className="gr-secondary" onClick={() => { setSelected(null); setSessionToken(newToken()); }}>Search again</button></div>{connect.error && <p role="alert" className="gr-error">{connect.error.message}</p>}</> : <><p>Find your business and we will set everything up automatically.</p><form className="gr-search" onSubmit={e => { e.preventDefault(); setTerm(query.trim()); }}><label className="gr-field">Business name or address<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Start typing your business name or address..." autoComplete="off" /></label><button className="gr-primary" type="submit" disabled={query.trim().length < 3 || search.isFetching}>Find my business</button></form>{query.trim().length < 3 && <p className="gr-hint">Type at least 3 letters, then pick your business from the list.</p>}{search.isFetching && <p role="status">Searching Google...</p>}{search.error && <p role="alert" className="gr-error">{search.error.message}</p>}{term && !search.isFetching && search.data?.length === 0 && <p>We could not find that business. Try its name and city.</p>}<div className="gr-results" role="listbox" aria-label="Google businesses">{search.data?.map(result => <button key={result.id} role="option" aria-selected="false" onClick={() => void choose(result)}><strong>{result.name}</strong><span>{result.address}</span></button>)}</div>{select.isPending && <p role="status">Loading business details...</p>}{select.error && <p role="alert" className="gr-error">{select.error.message}</p>}</>}
        {setups?.limit != null && <p className="gr-hint">Setups this week: {setups.used} of {setups.limit}. Connecting or reconnecting a business uses one.</p>}<p className="gr-attribution">Results from Google Maps</p></section> : <>
        {success && <section className="gr-panel"><h2>You are ready to collect reviews</h2><p>Your review page, QR code, and NFC link are ready.</p></section>}
        <section className="gr-panel"><h2>{page.data.businessName}</h2><p>{page.data.address}</p>{page.data.rating && <p>★ {page.data.rating} on Google · {page.data.reviewCount ?? 0} reviews</p>}<p className="gr-attribution">Rating and review count from Google Maps</p><div className="gr-actions"><a className="gr-primary" href={url} target="_blank" rel="noreferrer">Open review page</a><button className="gr-secondary" onClick={() => copy(`${url}?source=share`)}>Copy link</button></div></section>
        <section className="gr-grid"><div className="gr-panel"><h2>QR code</h2><div id="review-qr"><QRCodeSVG value={`${url}?source=qr`} size={220} level="H" marginSize={2} /></div><div className="gr-actions"><button className="gr-secondary" onClick={downloadQr}>Download QR</button><button className="gr-secondary" onClick={() => copy(`${url}?source=qr`)}>Copy QR link</button></div></div><div className="gr-panel"><h2>NFC link ready</h2><p>Program this link into a compatible NFC tag.</p><button className="gr-secondary" onClick={() => copy(`${url}?source=nfc`)}>Copy NFC link</button><h3>Google business</h3><p>Details saved {page.data.lastSyncedAt ? new Date(page.data.lastSyncedAt).toLocaleDateString() : "today"}. Reconnect to update the name, rating, or review count.</p><button className="gr-secondary" onClick={() => { if (window.confirm("Reconnecting searches Google again and replaces the saved business details. Your review link, QR code, and NFC link stay the same.")) { setSuccess(false); setSelected(null); setSessionToken(newToken()); setChanging(true); } }}>Reconnect Google Business</button><button className="gr-secondary" onClick={async () => { if (window.confirm("Disconnect Google? The review link will stop working. Analytics will remain.")) { await settings.mutateAsync({ cardId, enabled: false }); await page.refetch(); await allowance.refetch(); } }}>Disconnect</button></div></section>
        <section className="gr-panel"><div className="gr-heading"><h2>Analytics</h2><label>Period <select value={days ?? "all"} onChange={e => setDays(e.target.value === "all" ? null : Number(e.target.value) as 1 | 7 | 30 | 90)}><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="all">All time</option></select></label></div><div className="gr-metrics">{[["Review page views", counts.page_view ?? 0], ["Google review clicks", counts.google_review_click ?? 0], ["QR scans", counts.qr_scan ?? 0], ["NFC taps", counts.nfc_tap ?? 0], ["Click conversion", `${counts.page_view ? ((counts.google_review_click ?? 0) / counts.page_view * 100).toFixed(1) : "0.0"}%`]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><h3>Activity trend</h3><div className="gr-trend" role="img" aria-label="Daily review page views and Google review clicks">{trend.length ? trend.map(([day, value]) => <div key={day} title={`${day}: ${value.views} views, ${value.clicks} clicks`}><i style={{ height: `${Math.max(3, value.views / Math.max(1, ...trend.map(([, item]) => item.views)) * 100)}%` }} /><b style={{ height: `${Math.max(3, value.clicks / Math.max(1, ...trend.map(([, item]) => item.views)) * 100)}%` }} /></div>) : <p>No activity yet.</p>}</div><p>Blue: page views. Gold: Google review clicks.</p><p>Customer indicated completion: {counts.review_completion_acknowledged ?? 0}. This does not confirm a published Google review.</p></section>
        <section className="gr-panel"><h2>Profile</h2><label><input type="checkbox" checked={page.data.showOnCard} onChange={async e => { await settings.mutateAsync({ cardId, showOnCard: e.target.checked }); await page.refetch(); }} /> Show Google Reviews on my profile</label></section>
        <section className="gr-panel"><h2>Delete Google Reviews</h2><p>Removes this review page, its QR code and NFC link, and its activity history. Your card and your reviews on Google are not affected.</p><button className="gr-secondary gr-danger" disabled={remove.isPending} onClick={async () => { if (!window.confirm("Delete Google Reviews for this card? The review link, QR code and NFC link stop working and the activity history is erased. This cannot be undone.")) return; try { await remove.mutateAsync({ cardId }); setSuccess(false); setChanging(false); await page.refetch(); await allowance.refetch(); } catch { /* The error shows below the button. */ } }}>{remove.isPending ? "Deleting..." : "Delete Google Reviews"}</button>{remove.error && <p role="alert" className="gr-error">{remove.error.message}</p>}</section>
      </>}
    </>}
  </AppShell>;
}
