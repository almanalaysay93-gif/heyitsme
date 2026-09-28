import { BrandMark } from "@/components/BrandMark";
import { LegalLinks } from "@/components/LegalLinks";
import { SUPPORT_EMAIL } from "@/const";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { ReactNode } from "react";
import { Link } from "wouter";

const LAST_UPDATED = "September 28, 2026";

export function ContactLine() {
  return SUPPORT_EMAIL ? (
    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  ) : (
    <>the support address listed in the footer of this site</>
  );
}

export function LegalShell({
  title,
  intro,
  updated = LAST_UPDATED,
  children,
}: {
  title: string;
  intro: string;
  updated?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="legal-nav">
        <Link className="brand-lockup" href="/"><BrandMark /><span>heyitsme</span></Link>
      </header>
      <main id="main" tabIndex={-1}>
        <article className="legal-doc">
          {updated ? <p className="legal-updated">Last updated {updated}</p> : null}
          <h1>{title}</h1>
          <p className="legal-intro">{intro}</p>
          {children}
        </article>
      </main>
      <footer className="legal-footer">
        <span>heyitsme · start free</span>
        <LegalLinks />
      </footer>
    </div>
  );
}

export function PrivacyPage() {
  usePageMeta({
    title: "Privacy — heyitsme",
    description: "What heyitsme collects, why, who processes it, and how to get it removed.",
    canonicalPath: "/privacy",
  });

  return (
    <LegalShell
      title="Privacy"
      intro="heyitsme is a digital business card you can start free. We collect what it takes to run your card and nothing for advertising. This page explains what that is."
    >
      <h2>What we collect</h2>
      <h3>When you sign in</h3>
      <p>
        You sign in with Google. Google sends us your name, email address, and an account identifier. We store those
        with the time you signed up and last signed in. We never see your Google password.
      </p>
      <h3>What you put on a card</h3>
      <p>
        Everything you type or upload to a card: name, title, company, email, phone, location, bio, links, messaging
        channels, portfolio items, references, and images or files. <strong>A published card is public.</strong> Anyone
        with the link can see it, and search engines may find it if the link is posted somewhere public. Unpublish a card
        to take it offline.
      </p>
      <h3>Details visitors share with you</h3>
      <p>
        A card has a form where visitors can leave their details. We store the name and anything else they choose to add
        (email, phone, company, title, a note) and show it only to the card owner. The owner can tag, edit, export, and
        delete those contacts.
      </p>
      <h3>Card activity</h3>
      <p>
        When someone opens a published card, saves the contact, taps a link, or shares the card, we record the type of
        action, which card, which link, and when. Owners see these as totals on their Insights page. These records do
        not include who the visitor was.
      </p>
      <h3>If you buy a paid plan</h3>
      <p>
        You pay on the 2C2P payment page. heyitsme never receives or stores your card number or wallet details. 2C2P sends
        us the result of the payment: an invoice reference, a transaction reference, the amount, the currency, the payment
        method type (for example Google Pay), and whether it succeeded. We keep these with your plan, its start and end
        dates, and your monthly lead count, to run billing and show you your payment history.
      </p>
      <h3>Security and error data</h3>
      <p>
        To stop spam and abuse, we briefly process IP addresses, for example to limit how often a form can be sent or
        to avoid counting the same view twice. We store only a one-way hash of the address, and it expires within an
        hour. If the app crashes in your browser, it sends us the error message, the page address, and your browser
        type so we can fix it. Our hosting provider also keeps standard request logs, which include IP addresses.
      </p>

      <h2>Cookies and browser storage</h2>
      <ul>
        <li><strong>app_session_id</strong>: keeps you signed in. Lasts up to 30 days of inactivity or until you sign out.</li>
        <li><strong>__Host-oauth_state</strong>: a one-time value that protects sign-in from forgery. Expires after 10 minutes.</li>
        <li>
          <strong>Browser storage</strong>: if you try the builder without signing in, your draft card stays in your own
          browser and is never sent to us. We also remember your theme choice there.
        </li>
      </ul>
      <p>There are no advertising cookies, no third-party trackers, and no analytics scripts.</p>

      <h2>How we use it</h2>
      <p>
        We use this information to run heyitsme: to show your cards, deliver contacts to you, show you your Insights,
        keep the service secure, and fix bugs. We do not sell personal information and we do not use it for ads.
      </p>

      <h2>Who else handles it</h2>
      <p>These providers process data for us, only to run the service:</p>
      <ul>
        <li><strong>Google</strong> handles sign-in.</li>
        <li><strong>Vercel</strong> hosts the site and API.</li>
        <li><strong>Supabase</strong> hosts the database with accounts, cards, contacts, and activity.</li>
        <li><strong>Microlink</strong> takes the screenshots shown for website links on cards. Browsers load them from Microlink.</li>
        <li><strong>S3-compatible object storage</strong> holds the images and files you upload.</li>
        <li><strong>2C2P</strong> processes payments for paid plans, with Google as the wallet provider when you pay with Google Pay. Their own privacy terms apply to the details you enter on their page.</li>
        <li><strong>Resend</strong> sends account emails, such as new-contact notices and payment confirmations.</li>
      </ul>
      <p>They may process data in countries other than yours.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep account and card data until you delete it or ask us to close your account. Deleting a card erases it
        right away, with its references, visit stats, and uploaded files. Deleted contacts disappear right away too. Hashed IP data is gone within an hour. We keep error reports and hosting logs
        only as long as we need them to run and debug the service.
      </p>

      <h2>Your choices</h2>
      <p>
        You can edit or delete your cards, contacts, and references at any time, and you can export your contacts as a
        CSV file. To get a copy of your data, correct it, or delete your account and everything in it, email <ContactLine />.
        We will reply within 30 days. If you left your details on someone's card and want them removed, contact that
        person or email us.
      </p>

      <h2>Children</h2>
      <p>heyitsme is not meant for anyone under 16, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes, we will update the date at the top. If a change is significant, we will tell signed-in
        users before it takes effect.
      </p>

      <h2>Contact</h2>
      <p>Questions about privacy: <ContactLine />.</p>
    </LegalShell>
  );
}

export function TermsPage() {
  usePageMeta({
    title: "Terms — heyitsme",
    description: "The ground rules for using heyitsme.",
    canonicalPath: "/terms",
  });

  return (
    <LegalShell
      title="Terms"
      intro="These terms apply whenever you use heyitsme. By using it, you agree to them. They are short, so please read them."
    >
      <h2>The service</h2>
      <p>
        heyitsme lets you make digital business cards, share them by link or QR code, and receive details from people
        you meet. The Free plan costs nothing and has no end date. Paid plans (Pro, and later Teams) add features for a
        fee shown on the <Link href="/pricing">pricing page</Link>. We may change, add, or remove features over time.
      </p>

      <h2>Paid plans</h2>
      <p>
        Prices are in Philippine pesos and include the features listed on the pricing page when you buy. A yearly plan is
        paid once and covers twelve months from the confirmed payment. Pro starts when 2C2P confirms your payment to us, not
        when your browser returns from the payment page. You can cancel from Billing at any time; your plan stays on until
        the end of the period you paid for, then your account moves to Free. Moving to Free never deletes your cards,
        contacts, or insights data. If a price changes, it applies from your next payment, never to a period you already paid for.
      </p>
      <p>
        <strong>Refunds:</strong> We offer a full refund within 14 days of your first payment for a paid plan.
        To request a refund, send an email to <ContactLine /> with your account email address and payment reference.
        We do not offer partial or prorated refunds for cancellations made after the 14-day period.
        When you cancel your plan, you keep paid access until the end of the billing period.
        If a billing error or duplicate charge occurs, contact us and we will refund the incorrect charge.
        We issue approved refunds to your original payment method through our payment processor within 5 to 10 business days.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with a Google account, and you are responsible for what happens under your account. Tell us right
        away if you think someone else has access to it.
      </p>

      <h2>Your content</h2>
      <p>
        You own what you put on your cards. You let us store, copy, and display it only as needed to run heyitsme, for
        example to show your published card to people who open its link. Only upload material you have the right to
        share. Published cards are public, so do not put anything on a card that you want to keep private.
      </p>

      <h2>Acceptable use</h2>
      <p>Do not use heyitsme to:</p>
      <ul>
        <li>pretend to be another person or organisation, or mislead people about who you are;</li>
        <li>post anything illegal, hateful, harassing, sexually explicit, or anything that infringes someone else's rights;</li>
        <li>send spam, phishing, or malware, or link to them;</li>
        <li>collect other people's information without their consent;</li>
        <li>overload, probe, or interfere with the service, or get around its limits.</li>
      </ul>

      <h2>Contacts you receive</h2>
      <p>
        When people share their details through your card, you are responsible for how you use them. Respect their
        wishes and follow the laws that apply to you, including rules on marketing messages.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop using heyitsme at any time and ask us to delete your account. We may remove content or suspend
        accounts that break these terms or put other people at risk. Where it is reasonable, we will tell you first.
      </p>

      <h2>No warranty</h2>
      <p>
        heyitsme is provided "as is" and "as available". We work to keep it running and your data safe, but we cannot
        promise it will always be available or free of errors. Keep your own copies of anything important, such as an
        export of your contacts.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential losses, or for lost data, profits,
        or business, that come from using heyitsme or from not being able to use it. Nothing in these terms limits any
        liability that the law does not allow us to limit.
      </p>

      <h2>Changes</h2>
      <p>
        If we change these terms, we will update the date at the top. If you keep using heyitsme after a change, you
        accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <ContactLine />. Our <Link href="/privacy">privacy policy</Link> explains how we handle personal information.
      </p>
    </LegalShell>
  );
}
