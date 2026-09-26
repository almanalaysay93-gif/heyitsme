import { SUPPORT_EMAIL } from "@/const";
import { Link } from "wouter";

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`legal-links ${className}`} aria-label="Information and legal">
      <Link href="/about">About</Link>
      <Link href="/faq">FAQ</Link>
      <Link href="/pricing">Pricing</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      {SUPPORT_EMAIL ? <a href={`mailto:${SUPPORT_EMAIL}`}>Support</a> : null}
    </nav>
  );
}
