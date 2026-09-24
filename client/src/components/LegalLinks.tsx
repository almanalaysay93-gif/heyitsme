import { SUPPORT_EMAIL } from "@/const";
import { Link } from "wouter";

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`legal-links ${className}`} aria-label="Legal">
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      {SUPPORT_EMAIL ? <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a> : null}
    </nav>
  );
}
