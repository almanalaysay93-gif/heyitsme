import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import "./google-reviews.css";

export default function PublicReview() {
  const { slug = "" } = useParams<{ slug: string }>();
  const page = trpc.googleReviews.publicPage.useQuery({ slug }, { retry: false });
  const track = trpc.googleReviews.track.useMutation();
  const sent = useRef(false);
  const [returned, setReturned] = useState(() => { try { return sessionStorage.getItem(`review-opened-${slug}`) === "1"; } catch { return false; } });
  const [thanked, setThanked] = useState(false);
  const params = new URLSearchParams(location.search);
  const source = /^[a-z0-9_-]{1,32}$/.test(params.get("source") ?? "") ? params.get("source")! : "direct";
  const campaign = /^[a-z0-9_-]{1,64}$/.test(params.get("campaign") ?? "") ? params.get("campaign")! : undefined;
  const device = /tablet|ipad/i.test(navigator.userAgent) ? "tablet" : /mobile|android|iphone/i.test(navigator.userAgent) ? "mobile" : "desktop";
  const send = (type: "page_view" | "qr_scan" | "nfc_tap" | "google_review_click" | "view_google_maps_click" | "review_completion_acknowledged") => void track.mutateAsync({ slug, type, source, campaign, device }).catch(() => {});
  useEffect(() => {
    if (!page.data || sent.current) return;
    sent.current = true;
    send("page_view");
    if (source === "qr") send("qr_scan");
    if (source === "nfc") send("nfc_tap");
  }, [page.data, source]);
  useEffect(() => {
    const onFocus = () => { if (sessionStorage.getItem(`review-opened-${slug}`) === "1") setReturned(true); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [slug]);
  if (page.isLoading) return <main className="gr-public">Loading review page...</main>;
  if (!page.data?.reviewUrl) return <main className="gr-public"><h1>Review page unavailable</h1><p>This link is no longer active.</p><Link href="/">Go to heyitsme</Link></main>;
  const p = page.data;
  const logo = typeof p.logoUrl === "string" && /^(https?:\/\/|\/(?!\/))/.test(p.logoUrl) ? p.logoUrl : null;
  return <main className="gr-public" id="main"><div className="gr-public-card">
    {logo && <img className="gr-logo" src={logo} alt={`${p.businessName} logo`} />}
    <h1>{p.businessName}</h1>
    {p.rating && <p className="gr-rating">★★★★★ <strong>{p.rating} on Google</strong>{p.reviewCount != null && <span> · {p.reviewCount} reviews</span>}</p>}
    <p className="gr-attribution">Business details from Google Maps</p>
    {thanked ? <div className="gr-thanks"><div className="gr-stars" aria-hidden="true">★★★★★</div><h2>Thank you for your support</h2><p>Your feedback helps {p.businessName} grow.</p><Link className="gr-secondary" href={`/c/${p.cardSlug}`}>Visit business profile</Link></div> : <><h2>How was your experience?</h2><p>Your feedback helps this business and helps others find it.</p><a className="gr-primary gr-big" href={`${p.reviewUrl}?source=${encodeURIComponent(source)}`} target="_blank" rel="noopener noreferrer" onClick={() => { sessionStorage.setItem(`review-opened-${slug}`, "1"); }}>{p.hasDirectReviewLink ? "Leave a Google review" : "Open on Google Maps"}</a>{!p.hasDirectReviewLink && <p>Tap Write a review on the Google Maps listing.</p>}<a className="gr-text-link" href={p.mapsUrl ?? undefined} target="_blank" rel="noopener noreferrer" onClick={() => send("view_google_maps_click")}>View on Google</a>{returned && <button className="gr-secondary" onClick={() => { send("review_completion_acknowledged"); sessionStorage.removeItem(`review-opened-${slug}`); setThanked(true); }}>I've finished my review</button>}</>}
  </div><footer><Link href="/">Powered by heyitsme.fyi</Link></footer></main>;
}
