import { BrandMark } from "@/components/BrandMark";
import { LegalLinks } from "@/components/LegalLinks";
import { useAuth } from "@/_core/hooks/useAuth";
import { startGoogleLogin, SUPPORT_EMAIL } from "@/const";
import { usePageMeta } from "@/hooks/usePageMeta";
import { trpc } from "@/lib/trpc";
import {
  annualSavingsMinor,
  FOUNDING_MEMBER_LIMIT,
  formatPeso,
  PRICES_MINOR,
  TEAMS_INCLUDED_SEATS,
  type BillingCycle,
} from "@shared/plans";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import "@/components/billing/billing.css";
import "./pricing.css";

const FREE_FEATURES = [
  "One digital card with your own heyitsme.fyi link",
  "QR code and NFC-ready link that never expire",
  "Save-to-contacts (.vcf) for iPhone and Android",
  "Social, contact and portfolio links",
  "Up to 10 new leads a month",
  "7 days of insights",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Up to 3 cards",
  "Unlimited lead capture",
  "Insights for 30, 90 and 365 days",
  "Hide heyitsme branding on your page",
];

const TEAMS_FEATURES = [
  `${TEAMS_INCLUDED_SEATS} team members included`,
  "One company workspace and brand",
  "Company-controlled templates",
  "Team directory and team-level insights",
  "Central lead reporting and CSV export",
  "Owner, admin and member roles",
];

export default function PricingPage() {
  usePageMeta({
    title: "Pricing — Free, Pro and Teams — heyitsme",
    description: "Start free with one digital card. Pro is ₱149/month or ₱1,290/year for unlimited leads and a year of insights. Teams starts at ₱499/month.",
    canonicalPath: "/pricing",
  });
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const offer = trpc.billing.offer.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const data = offer.data;

  const foundingOpen = Boolean(data?.foundingOfferEnabled && (data.founding.remaining ?? 0) > 0);
  const proPrice = PRICES_MINOR.pro[cycle];
  const foundingPrice = PRICES_MINOR.proFounding[cycle];
  const per = cycle === "annual" ? "year" : "month";
  const checkoutOpen = Boolean(data?.checkoutOpen);
  const monthlyAvailable = !data || data.cycles.includes("monthly");

  const upgrade = () => {
    const target = "/app/billing?upgrade=1";
    if (isAuthenticated) navigate(target);
    else startGoogleLogin(target);
  };

  return (
    <div className="legal-page pricing-page">
      <header className="legal-nav">
        <Link className="brand-lockup" href="/"><BrandMark /><span>heyitsme</span></Link>
      </header>
      <main id="main" tabIndex={-1} className="pricing-main">
        <header className="pricing-head">
          <span className="section-kicker">Pricing</span>
          <h1>Start free.<br /><em>Upgrade when it pays.</em></h1>
          <p>Start free. Upgrade when networking starts creating opportunities. Prices are in Philippine pesos.</p>
        </header>

        {data && !data.limitsEnforced ? (
          <p className="pricing-notice" role="note">
            Paid plans are launching soon. Until they do, every account keeps the features it has today.
          </p>
        ) : null}

        {foundingOpen ? (
          <div className="pricing-founding">
            <span className="plan-chip plan-chip-founding">Founding Member</span>
            <p>
              The first {FOUNDING_MEMBER_LIMIT} Pro members pay {formatPeso(PRICES_MINOR.proFounding.monthly)}/month or {formatPeso(PRICES_MINOR.proFounding.annual)}/year for as long as their plan stays active.
              {data?.founding.remaining !== null && data?.founding.remaining !== undefined ? ` ${data.founding.remaining} spots left.` : ""}
            </p>
          </div>
        ) : null}

        <div className="cycle-toggle pricing-cycle" role="radiogroup" aria-label="Billing period">
          {(["monthly", "annual"] as const).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={cycle === option} className={cycle === option ? "is-active" : ""} onClick={() => setCycle(option)}>
              {option === "monthly" ? "Monthly" : "Yearly"}
              <small>{option === "annual" ? `Save ${formatPeso(annualSavingsMinor("pro", foundingOpen))} on Pro` : monthlyAvailable ? "Cancel anytime" : "Monthly checkout soon"}</small>
            </button>
          ))}
        </div>

        <div className="plan-grid">
          <section className="plan-card" aria-labelledby="plan-free">
            <span className="plan-chip plan-chip-free">Free</span>
            <h2 id="plan-free">A better way to share who you are.</h2>
            <p className="plan-price"><strong>₱0</strong> <span>forever</span></p>
            <Link className="outline-button plan-cta" href="/app/cards/new">Create free card</Link>
            <ul>{FREE_FEATURES.map((item) => <li key={item}><Check size={15} aria-hidden="true" /> {item}</li>)}</ul>
          </section>

          <section className="plan-card plan-card-pro" aria-labelledby="plan-pro">
            <div className="plan-card-top">
              <span className="plan-chip plan-chip-pro"><Sparkles size={12} aria-hidden="true" /> Pro</span>
              <span className="plan-recommended">Recommended</span>
            </div>
            <h2 id="plan-pro">Turn introductions into opportunities.</h2>
            <p className="plan-price">
              <strong>{formatPeso(foundingOpen ? foundingPrice : proPrice)}</strong> <span>/{per}</span>
              {foundingOpen ? <s aria-label={`Standard price ${formatPeso(proPrice)} per ${per}`}>{formatPeso(proPrice)}</s> : null}
            </p>
            {foundingOpen ? <p className="plan-sub">Founding price. Standard price {formatPeso(proPrice)}/{per}.</p> : null}
            {checkoutOpen ? (
              <button type="button" className="glass-button glass-button-primary plan-cta" onClick={upgrade}>Upgrade to Pro</button>
            ) : (
              <button type="button" className="glass-button glass-button-primary plan-cta" disabled>Checkout opens soon</button>
            )}
            <p className="plan-sub">Pay with Google Pay{data?.channels.includes("gcash") ? " or GCash" : ""} on a secure 2C2P page.</p>
            <ul>{PRO_FEATURES.map((item) => <li key={item}><Check size={15} aria-hidden="true" /> {item}</li>)}</ul>
          </section>

          <section className="plan-card plan-card-teams" aria-labelledby="plan-teams">
            <span className="plan-chip plan-chip-teams">Teams</span>
            <h2 id="plan-teams">Keep every team member on brand.</h2>
            <p className="plan-price"><strong>{formatPeso(PRICES_MINOR.teams[cycle])}</strong> <span>/{per}</span></p>
            <p className="plan-sub">{TEAMS_INCLUDED_SEATS} members included. Extra members {formatPeso(PRICES_MINOR.teamsExtraSeat[cycle])}/member/{per}.</p>
            {data?.teamsEnabled ? (
              <button type="button" className="outline-button plan-cta" onClick={upgrade}>Start a team</button>
            ) : SUPPORT_EMAIL ? (
              <a className="outline-button plan-cta" href={`mailto:${SUPPORT_EMAIL}?subject=heyitsme%20Teams`}>Teams is coming. Tell us about your team</a>
            ) : (
              <button type="button" className="outline-button plan-cta" disabled>Teams is coming soon</button>
            )}
            <ul>{TEAMS_FEATURES.map((item) => <li key={item}><Check size={15} aria-hidden="true" /> {item}</li>)}</ul>
          </section>
        </div>

        <section className="pricing-facts" aria-labelledby="pricing-facts">
          <h2 id="pricing-facts">What never changes</h2>
          <ul>
            <li>Your public profile, QR code and NFC link stay free and never expire.</li>
            <li>Cancel anytime. Pro stays on until the end of the period you paid for.</li>
            <li>Downgrading never deletes cards, contacts or insights data. Cards above the Free limit stay live and editable.</li>
            <li>heyitsme never sees or stores your card details. Payments run on the 2C2P payment page.</li>
          </ul>
          <h2>Technical limits on every plan</h2>
          <ul>
            <li>Uploads up to 3 MB per file (1 MB in browser preview).</li>
            <li>Up to 20 portfolio items per card and 12 tags per contact.</li>
            <li>Rate limits protect card views, contact exchanges and uploads from automated abuse.</li>
          </ul>
          <p>More answers on the <Link href="/faq">FAQ</Link>.</p>
        </section>
      </main>
      <footer className="legal-footer">
        <span>heyitsme · start free</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
