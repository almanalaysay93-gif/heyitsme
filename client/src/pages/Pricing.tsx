import { BrandMark } from "@/components/BrandMark";
import { LegalLinks } from "@/components/LegalLinks";
import { useAuth } from "@/_core/hooks/useAuth";
import { startGoogleLogin } from "@/const";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Check, Sparkles } from "lucide-react";
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
export default function PricingPage() {
  usePageMeta({
    title: "Pricing — Free and Pro — heyitsme",
    description:
      "Pro — ₱299/month. Premium design, unlimited contact exchanges and deeper insights.",
    canonicalPath: "/pricing",
  });
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const upgrade = () =>
    isAuthenticated
      ? navigate("/app/billing?upgrade=1")
      : startGoogleLogin("/app/billing?upgrade=1");
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
          ].map(plan => (
            <section
              key={plan.name}
              className={`plan-card ${plan.name === "Pro" ? "plan-card-pro" : ""}`}
            >
              <span
                className={`plan-chip plan-chip-${plan.name.toLowerCase()}`}
              >
                {plan.name === "Pro" ? <Sparkles size={13} /> : null}
                {plan.name}
              </span>
              <h2>
                {plan.name === "Pro"
                  ? "Your professional identity."
                  : "A clean digital business card."}
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
          <p>Payments activate Pro only after server verification.</p>
        </section>
      </main>
      <footer className="legal-footer">
        <LegalLinks />
      </footer>
    </div>
  );
}
