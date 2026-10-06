import { BrandMark } from "@/components/BrandMark";
import { LegalLinks } from "@/components/LegalLinks";
import { useAuth } from "@/_core/hooks/useAuth";
import { startGoogleLogin } from "@/const";
import { usePageMeta } from "@/hooks/usePageMeta";
import { TEAMS_PLAN, formatPeso } from "@shared/plans";
import { Check, Sparkles, UsersRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import "@/components/billing/billing.css";
import "./pricing.css";
const free = [
  "1 digital card and permanent public URL",
  "QR code and NFC-ready link",
  "Save contact / VCard",
  "Social links, contact links and basic portfolio",
  "Professional colors and themes",
  "10 contact exchanges per calendar month",
  "7-day analytics",
  "heyitsme branding shown",
];
export const PRO_FEATURES = [
  "5 digital cards",
  "Unlimited contact exchanges",
  "Premium colors and gradients",
  "Professional animations and premium typography",
  "Advanced QR customization with logo",
  "QR campaign tracking",
  "365-day analytics and link performance",
  "Contact tags, notes, follow-ups and CSV export",
  "Remove heyitsme branding",
];
const TEAMS_PRICE = formatPeso(TEAMS_PLAN.priceMinor);
const teams = [
  `${TEAMS_PLAN.seats} seats included`,
  "Company cards managed in one place",
  "Shared branding and locked company details",
  "Team contacts",
  "Event pages with RSVP and check-in",
  "Team analytics",
  "Email signatures and meeting backgrounds",
];
const HEADLINES: Record<string, string> = {
  Free: "A clean digital business card.",
  Pro: "Your professional identity.",
  Teams: "One brand across your whole team.",
};
export default function PricingPage() {
  usePageMeta({
    title: "Pricing — Free, Pro and Teams — heyitsme",
    description:
      `Free forever. Pro — ₱299/month. Teams — ${TEAMS_PRICE}/month for each team, ${TEAMS_PLAN.seats} seats included.`,
    canonicalPath: "/pricing",
  });
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const upgrade = () =>
    isAuthenticated
      ? navigate("/app/billing?upgrade=1")
      : startGoogleLogin("/app/billing?upgrade=1");
  // Billing lists the plans to a signed-in person, with the Teams sign-up on its card.
  const startTeam = () =>
    isAuthenticated ? navigate("/app/billing") : startGoogleLogin("/app/billing");
  return (
    <div className="legal-page pricing-page">
      <header className="legal-nav">
        <Link className="brand-lockup" href="/">
          <BrandMark />
          <span>heyitsme</span>
        </Link>
      </header>
      <main id="main" className="pricing-main">
        <header className="pricing-head">
          <span className="section-kicker">Pricing</span>
          <h1>
            Make every introduction
            <br />
            <em>memorable.</em>
          </h1>
          <p>
            Build a stronger professional presence with premium design,
            unlimited contact exchanges and deeper insights.
          </p>
        </header>
        <div className="plan-grid">
          {[
            { name: "Free", price: "₱0", period: "Forever", features: free },
            {
              name: "Pro",
              price: "₱299",
              period: "/month",
              features: PRO_FEATURES,
            },
            {
              name: "Teams",
              price: TEAMS_PRICE,
              period: "/month for each team",
              features: teams,
            },
          ].map(plan => (
            <section
              key={plan.name}
              className={`plan-card ${plan.name === "Pro" ? "plan-card-pro" : ""}`}
            >
              <span
                className={`plan-chip plan-chip-${plan.name.toLowerCase()}`}
              >
                {plan.name === "Pro" ? <Sparkles size={13} /> : null}
                {plan.name === "Teams" ? <UsersRound size={13} /> : null}
                {plan.name}
              </span>
              <h2>
                {HEADLINES[plan.name]}
              </h2>
              <p className="plan-price">
                <strong>{plan.price}</strong>
                <span>{plan.period}</span>
              </p>
              {plan.name === "Pro" ? (
                <button
                  className="glass-button glass-button-primary plan-cta"
                  onClick={upgrade}
                >
                  Upgrade to Pro — ₱299/month
                </button>
              ) : plan.name === "Teams" ? (
                <button className="outline-button plan-cta" onClick={startTeam}>
                  Start a team
                </button>
              ) : (
                <Link className="outline-button plan-cta" href="/app/cards/new">
                  Create Free Card
                </Link>
              )}
              <ul>
                {plan.features.map(feature => (
                  <li key={feature}>
                    <Check size={15} />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section className="pricing-facts">
          <p>
            Cancel anytime. Existing cards and contacts survive a downgrade.
          </p>
          <p>
            Teams is paid by the team's owner, one month at a time, and comes
            with {TEAMS_PLAN.seats} seats. It is separate from your own Free or
            Pro plan. If a team's plan ends, nothing is deleted.
          </p>
          <p>Payments activate a plan only after server verification.</p>
        </section>
      </main>
      <footer className="legal-footer">
        <LegalLinks />
      </footer>
    </div>
  );
}
