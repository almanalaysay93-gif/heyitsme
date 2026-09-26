import { InfoDialog } from "@/components/InfoDialog";
import { SUPPORT_EMAIL } from "@/const";
import { useState } from "react";
import { Link } from "wouter";

export function LegalLinks({ className = "" }: { className?: string }) {
  const [supportOpen, setSupportOpen] = useState(false);
  return (
    <nav className={`legal-links ${className}`} aria-label="Information and legal">
      <Link href="/about">About</Link>
      <Link href="/faq">FAQ</Link>
      <Link href="/pricing">Pricing</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      {SUPPORT_EMAIL ? (
        <>
          {/* A dialog, not a bare mailto: a browser with no mail app would otherwise open nothing useful. */}
          <button type="button" className="legal-links-button" onClick={() => setSupportOpen(true)}>Support</button>
          <InfoDialog
            open={supportOpen}
            onOpenChange={setSupportOpen}
            title="Contact support"
            description="Email us and we'll reply as soon as we can."
            value={SUPPORT_EMAIL}
            copyLabel="Copy email address"
            copiedLabel="Email address copied."
            action={{ label: "Open email app", href: `mailto:${SUPPORT_EMAIL}?subject=heyitsme%20support` }}
          />
        </>
      ) : null}
    </nav>
  );
}
