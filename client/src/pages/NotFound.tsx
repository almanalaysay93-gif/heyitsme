import { LegalLinks } from "@/components/LegalLinks";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link } from "wouter";

export default function NotFound() {
  usePageMeta({ title: "Page not found — heyitsme", noindex: true });

  return (
    <main className="public-loading" id="main" tabIndex={-1}>
      <div className="not-found-mark">?</div>
      <h1>Nothing lives here.</h1>
      <p>The link may be mistyped, or the page has moved.</p>
      <Link href="/">Back to heyitsme</Link>
      <LegalLinks className="legal-links-dark" />
    </main>
  );
}
