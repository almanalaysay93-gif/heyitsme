import { ContactLine, LegalShell } from "@/pages/Legal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link } from "wouter";

export function AboutPage() {
  usePageMeta({
    title: "About — heyitsme",
    description: "Learn about heyitsme: a fast, free, privacy-first digital business card that makes introductions simple, without apps or paywalls.",
    canonicalPath: "/about",
  });

  return (
    <LegalShell
      title="About heyitsme"
      intro="heyitsme is a free digital business card designed for introductions that feel human, fast, and memorable."
      updated={null}
    >
      <h2>The idea</h2>
      <p>
        Paper business cards get lost, bent, or left behind. Most digital card apps force recipients to install an app
        or register for an account just to view a phone number. Standard link-in-bio tools look like cluttered billboards
        rather than thoughtful introductions.
      </p>
      <p>
        heyitsme gives you a single, elegant introduction page with your essential contact details, key links, visual portfolio,
        and client quotes. Anyone with a smartphone can open it in their browser, save your contact details in one tap,
        or send their own details back to you.
      </p>

      <h2>Our principles</h2>
      <h3>Zero friction for recipients</h3>
      <p>
        The person viewing your card never needs to download an app, create an account, or log in. It works instantly on any
        modern browser across iOS, Android, macOS, Windows, and Linux.
      </p>

      <h3>100% free, no hidden paywalls</h3>
      <p>
        All current features—multiple cards, QR codes, portfolio uploads, contact exchange, CSV exports, visitor insights,
        and email signatures—are completely free for everyone. There are no surprise subscriptions, trials, or paywalls.
      </p>

      <h3>Privacy by default</h3>
      <p>
        We do not use advertising cookies, third-party analytics pixels, or fingerprinting scripts. Your visitor analytics
        track aggregate actions (page views, contact-save taps, and link taps), never visitor identities.
      </p>

      <h2>Contact and support</h2>
      <p>
        heyitsme is maintained as an open, accessible digital card service. For technical assistance, bug reports, or general inquiries,
        reach out to <ContactLine />.
      </p>
    </LegalShell>
  );
}

export function FaqPage() {
  usePageMeta({
    title: "Frequently Asked Questions — heyitsme",
    description: "Find answers to common questions about heyitsme: compatibility, contact exchange, privacy, file limits, and free features.",
    canonicalPath: "/faq",
  });

  return (
    <LegalShell
      title="Frequently Asked Questions"
      intro="Everything you need to know about using heyitsme, sharing your card, and managing your contacts."
      updated={null}
    >
      <h2>Sharing and compatibility</h2>
      <h3>Does the recipient need to download an app or create an account?</h3>
      <p>
        No. When someone taps your link or scans your QR code, your card opens directly in their browser. They do not need to install
        an app, create an account, or sign in to view your details or save your contact.
      </p>

      <h3>How does saving a contact work on iPhone and Android?</h3>
      <p>
        When a visitor taps <em>Save contact</em>, the server serves a standard vCard (.vcf) file. On iPhones running Safari, iOS automatically
        opens the native &ldquo;Add to Contacts&rdquo; sheet. On Android devices running Chrome or other browsers, the contact file downloads
        and can be added to Google Contacts or the device address book in one tap.
      </p>

      <h3>How do I share my card in person or online?</h3>
      <p>
        You can present your QR code for immediate in-person scanning, copy your card&rsquo;s public link, or use the built-in SMS and email
        helpers to send a pre-formatted message. You can also generate an email signature that links to your card.
      </p>

      <h2>Card builder &amp; limits</h2>
      <h3>What is the difference between preview mode and publishing?</h3>
      <p>
        You can build and preview a card immediately without signing in; guest drafts remain stored only in your local browser storage.
        Signing in with Google allows you to publish your card to a public URL (<code>/c/your-name</code>), upload persistent media files,
        collect exchanged contacts, and access Insights.
      </p>

      <h3>What are the technical limits?</h3>
      <ul>
        <li><strong>File uploads:</strong> Up to 3 MB per file for authenticated accounts (1 MB in local guest preview mode). Supports JPG, PNG, WebP, GIF, MP4, WebM, MOV, PDF, Word, and ZIP files.</li>
        <li><strong>Portfolio items:</strong> Up to 20 items per card, with a total serialized portfolio payload limit of 12,000 characters.</li>
        <li><strong>Contact tags:</strong> Up to 12 custom tags per exchanged contact.</li>
        <li><strong>Cards per account:</strong> Up to 500 cards per account.</li>
      </ul>

      <h2>Contact exchange &amp; privacy</h2>
      <h3>How does contact exchange work?</h3>
      <p>
        Visitors can tap <em>Exchange details</em> on your public card to fill out a concise form with their name, email, phone number,
        title, company, and an optional note. Their submission lands directly in your private Contacts tab in the workspace, and you receive
        an email notification.
      </p>

      <h3>What does Insights show, and does it identify visitors?</h3>
      <p>
        Insights reports aggregate counts over 7, 30, or 90 days: total page views, contact-save (.vcf) actions, detail exchanges,
        and link taps. We do not track individual visitor identities or use advertising trackers. The only personal information
        collected from visitors is what they voluntarily submit through the contact exchange form.
      </p>

      <h3>Can I unpublish or delete my card?</h3>
      <p>
        Yes. You can unpublish a card at any time from your cards overview, making it immediately inaccessible to the public. If you delete
        a card, its public link, references, and visit stats are permanently removed. Contacts you collected through the card remain saved
        in your Contacts tab.
      </p>

      <h3>Can I export my contacts?</h3>
      <p>
        Yes. In your Contacts tab, tap <em>Export CSV</em> to download a complete, standard spreadsheet containing all names, emails, phone numbers,
        companies, titles, tags, and notes you have received.
      </p>

      <h3>Can I back up my cards?</h3>
      <p>
        Yes. Open the account menu and choose <em>Download my card data</em>. You get a JSON file with every card&rsquo;s text,
        links, portfolio entries, and references. Photos and uploaded files are listed as links, not copied into the file, so
        save any originals you want to keep.
      </p>

      <h2>Support</h2>
      <p>
        Have questions that aren&rsquo;t covered here? Send an email to <ContactLine /> and we&rsquo;ll be glad to help.
      </p>
    </LegalShell>
  );
}

export function PricingPage() {
  usePageMeta({
    title: "Pricing & Limits — 100% Free — heyitsme",
    description: "heyitsme is 100% free with no subscriptions, trials, or paywalls. See all included features and technical limits.",
    canonicalPath: "/pricing",
  });

  return (
    <LegalShell
      title="Pricing &amp; Limits"
      intro="heyitsme is completely free. No subscriptions, no trials, and no credit card required."
      updated={null}
    >
      <h2>Free for everyone</h2>
      <p>
        All current features of heyitsme are 100% free. We believe professional introductions should be clean, fast, and accessible
        without artificial paywalls or monthly fees.
      </p>

      <h2>What&rsquo;s included</h2>
      <ul>
        <li><strong>Multiple cards:</strong> Create and manage cards for different roles, projects, or contexts (up to 500 cards per account).</li>
        <li><strong>Portfolio &amp; gallery:</strong> Showcase photos, video loops, PDF documents, and external project links (up to 20 items per card).</li>
        <li><strong>One-tap contact saving:</strong> Provide standard vCard (.vcf) downloads compatible with iOS and Android address books.</li>
        <li><strong>QR codes &amp; share tools:</strong> High-resolution QR codes (downloadable as PNG or SVG), personal links, and share helpers.</li>
        <li><strong>Two-way contact exchange:</strong> Let visitors send their contact information directly back to your private contact book.</li>
        <li><strong>Contact management &amp; CSV export:</strong> Organize contacts with tags, search, follow-up indicators, and one-click CSV export.</li>
        <li><strong>Privacy-respecting insights:</strong> View aggregate page views, contact-save counts, and link tap metrics over 7, 30, or 90 days.</li>
        <li><strong>Email signature generator:</strong> Generate responsive HTML and rich text email signatures linking directly to your card.</li>
        <li><strong>Client references:</strong> Highlight verified quotes and testimonials from collaborators and clients.</li>
      </ul>

      <h2>Technical limits</h2>
      <p>
        To keep the platform fast, secure, and reliable for all users, the following generous technical boundaries are enforced:
      </p>
      <ul>
        <li><strong>Upload file size:</strong> 3 MB per file for signed-in accounts (1 MB in local browser preview).</li>
        <li><strong>Portfolio capacity:</strong> Up to 20 items per card (up to 12,000 characters total serialized payload).</li>
        <li><strong>Contact tags:</strong> Up to 12 custom tags per contact.</li>
        <li><strong>Card capacity:</strong> Up to 500 cards per account.</li>
        <li><strong>Rate limits:</strong> Standard rate limits protect card views, contact exchanges, and file uploads against automated abuse.</li>
      </ul>

      <h2>Questions about pricing?</h2>
      <p>
        If you have any questions or feedback about our free offering, please contact <ContactLine />.
      </p>
    </LegalShell>
  );
}
