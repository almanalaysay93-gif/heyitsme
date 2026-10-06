import { trpc } from "@/lib/trpc";
import { formatPeso, type PaymentChannel, type PlanCode } from "@shared/plans";
import {
  BarChart3, Building2, CalendarCheck, Contact, CreditCard, Download, Infinity as InfinityIcon, Link2, Mail, Palette,
  QrCode, Sparkles, Tag, Users, UsersRound, type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import TeamPay, { CHANNEL_LABELS } from "./TeamPay";

type Feature = [LucideIcon, string];

const FREE: Feature[] = [
  [CreditCard, "1 digital card"],
  [QrCode, "QR code"],
  [Link2, "Card link for NFC"],
  [Contact, "10 contact exchanges a month"],
  [BarChart3, "7 days of insights"],
  [Tag, "heyitsme branding on the card"],
];
const PRO: Feature[] = [
  [CreditCard, "5 digital cards"],
  [InfinityIcon, "Unlimited contact exchanges"],
  [BarChart3, "365 days of insights"],
  [Palette, "Premium colors, gradients and animations"],
  [QrCode, "Branded QR and QR campaigns"],
  [Download, "Contact management and CSV export"],
  [Sparkles, "No heyitsme branding"],
];
const teamFeatures = (seats: number): Feature[] => [
  [Users, `${seats} seats included`],
  [CreditCard, "Company cards managed in one place"],
  [Building2, "Shared branding and locked details"],
  [Contact, "Team contacts"],
  [CalendarCheck, "Event pages with RSVP and check-in"],
  [BarChart3, "Team analytics"],
  [Mail, "Email signatures and meeting backgrounds"],
];

const dateText = (value: Date | string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

function PlanCard({ name, badge, headline, text, price, per, featured, features, fine, children }: {
  name: string;
  badge?: string;
  headline: string;
  text: string;
  price: string;
  per: string;
  featured?: boolean;
  features: Feature[];
  fine: string;
  children: ReactNode;
}) {
  return (
    <article className={`glass-panel tier-card ${featured ? "is-featured" : ""}`}>
      <header className="tier-card-head">
        <h3>{name}</h3>
        {badge ? <span className="tier-card-badge">{badge}</span> : null}
      </header>
      <p className="tier-card-headline">{headline}</p>
      <p className="tier-card-text">{text}</p>
      <p className="tier-card-price"><strong>{price}</strong><span>{per}</span></p>
      <div className="tier-card-cta">{children}</div>
      <ul className="tier-card-features">
        {features.map(([Icon, label]) => <li key={label}><Icon size={17} aria-hidden="true" /><span>{label}</span></li>)}
      </ul>
      <p className="tier-card-fine">{fine}</p>
    </article>
  );
}

/** Name the team, pick how to pay. The team is made first, unpaid, so a payment always has a team to land on. */
function TeamSignup({ channels, priceMinor, onCancel }: { channels: readonly PaymentChannel[]; priceMinor: number; onCancel: () => void }) {
  const [name, setName] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.teams.create.useMutation();
  const checkout = trpc.billing.createTeamCheckout.useMutation();
  const busy = create.isPending || checkout.isPending;
  const subscribe = async (channel: PaymentChannel) => {
    try {
      const workspace = await create.mutateAsync({ name });
      // From here the team exists. If checkout cannot open, it shows under "Your teams" with its own pay buttons.
      void utils.billing.teamPlans.invalidate();
      void utils.teams.list.invalidate();
      const result = await checkout.mutateAsync({ workspaceId: workspace.id, channel });
      window.location.assign(result.redirectUrl);
    } catch { /* The error shows under the buttons. */ }
  };
  const error = create.error ?? checkout.error;
  return (
    <form className="plan-signup" onSubmit={(event: FormEvent) => event.preventDefault()}>
      <label>
        <span>Team or company name</span>
        <input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={120} required autoFocus />
      </label>
      {channels.map(channel => (
        <button key={channel} type="button" className="glass-button glass-button-primary" disabled={busy || name.trim().length < 2} onClick={() => void subscribe(channel)}>
          {busy ? "Opening checkout…" : `Pay ${formatPeso(priceMinor)} with ${CHANNEL_LABELS[channel]}`}
        </button>
      ))}
      <button type="button" className="outline-button" onClick={onCancel} disabled={busy}>Not now</button>
      {error ? <p role="alert" className="plan-error">{create.error ? error.message : `${error.message} Your team was made. Pay for it under "Your teams" below.`}</p> : null}
    </form>
  );
}

type Offer = {
  checkoutOpen: boolean;
  channels: readonly PaymentChannel[];
  prices: { pro: { monthly: number } };
  teams: { enabled: boolean; checkoutOpen: boolean; priceMinor: number; seats: number };
};

/** Every plan side by side, each with its price and its one button. Prices and what is open come from the server. */
export default function PlanCards({ plan, offer, onUpgrade }: { plan: PlanCode; offer: Offer; onUpgrade: () => void }) {
  const [, navigate] = useLocation();
  const [signup, setSignup] = useState(false);
  const { teams } = offer;
  const owned = trpc.billing.teamPlans.useQuery(undefined, { enabled: teams.enabled, retry: false });
  const current = <button type="button" className="outline-button" disabled>Your current plan</button>;

  return (
    <section className="plan-section" aria-labelledby="plans-heading">
      <h2 id="plans-heading" className="plan-section-title">Plans and pricing</h2>
      <div className="tier-cards">
        <PlanCard name="Free" headline="Your card, online" text="A profile, a QR code and a link that works with any NFC tag." price={formatPeso(0)} per="/ month" features={FREE} fine="Free stays free. Your card never expires.">
          {plan === "free" ? current : <button type="button" className="outline-button" disabled>Included in your plan</button>}
        </PlanCard>

        <PlanCard name="Pro" headline="Make it yours" text="More cards, your own look, and every contact kept." price={formatPeso(offer.prices.pro.monthly)} per="/ month" featured={plan === "free"} features={PRO} fine="Paid one month at a time. Renew from this page. If it ends, nothing is deleted.">
          {plan === "pro" ? current : (
            <button type="button" className="glass-button glass-button-primary" onClick={onUpgrade}><Sparkles size={15} aria-hidden="true" /> Upgrade to Pro</button>
          )}
        </PlanCard>

        {teams.enabled ? (
          <PlanCard
            name="Teams"
            badge="For a company"
            headline="One place for everyone"
            text="Company cards, shared branding, team contacts and events. Your personal cards and plan stay as they are."
            price={teams.checkoutOpen ? formatPeso(teams.priceMinor) : "Free"}
            per={teams.checkoutOpen ? "/ month for each team" : "for now"}
            featured={plan !== "free"}
            features={teamFeatures(teams.seats)}
            fine={teams.checkoutOpen
              ? "Paid one month at a time by the team's owner. If it ends and is not renewed within 3 days, the team is put on hold until it is paid. Nothing is deleted."
              : "Paid sign-up for Teams is not open yet, so starting a team costs nothing today."}
          >
            {!teams.checkoutOpen ? (
              <button type="button" className="glass-button glass-button-primary" onClick={() => navigate("/app/team")}><UsersRound size={15} aria-hidden="true" /> Start a team</button>
            ) : signup ? (
              <TeamSignup channels={offer.channels} priceMinor={teams.priceMinor} onCancel={() => setSignup(false)} />
            ) : (
              <button type="button" className="glass-button glass-button-primary" onClick={() => setSignup(true)}><UsersRound size={15} aria-hidden="true" /> Subscribe to Teams</button>
            )}
          </PlanCard>
        ) : null}
      </div>

      {owned.data?.length ? (
        <div className="glass-panel billing-panel" aria-labelledby="your-teams-heading">
          <h3 id="your-teams-heading" className="billing-panel-title"><UsersRound size={15} aria-hidden="true" /> Your teams</h3>
          <ul className="plan-teams">
            {owned.data.map(team => (
              <li key={team.id}>
                <span>
                  <strong>{team.name}</strong>
                  <small>
                    {team.state === "free" ? "No end date. Nothing to pay."
                      : team.state === "unpaid" ? "Not paid for yet. It opens for changes once it is paid."
                      : team.state === "ended" ? `The plan ended on ${dateText(team.accessUntil!)}. Everything is still there to view.`
                      : `Paid through ${dateText(team.accessUntil!)}.`}
                  </small>
                </span>
                <div className="billing-actions">
                  <button type="button" className="outline-button" onClick={() => navigate(`/app/team/${team.id}`)}>Open team</button>
                  {team.state !== "free" && teams.checkoutOpen ? (
                    <TeamPay workspaceId={team.id} channels={offer.channels} priceMinor={teams.priceMinor} verb={team.state === "active" ? "Renew early:" : "Pay"} buttonClass={team.state === "active" ? "outline-button" : "glass-button glass-button-primary"} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
