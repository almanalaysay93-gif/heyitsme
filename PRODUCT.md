# heyitsme product contract

heyitsme is a free digital business card and professional presence platform for people who want introductions to carry more context. The phase-one experience focuses on three jobs: create a card, share it in a browser-first way, and collect contact details when someone wants to stay in touch.

The implemented MVP includes multiple cards per user, a live card builder, card themes, contact fields, links, a personalized public slug, QR generation, copy-link and SMS/email helpers, a public card route, a simple exchange form, contact listing, search, and CSV export. Cards can now include portfolio images, videos, documents, and website links; social and communication providers such as LinkedIn, Instagram, WhatsApp, Telegram, Viber, Signal, and Calendly; and a curated reference section for past-client comments. All implemented capabilities are available without a plan, upgrade, checkout, or billing flow.

The backend contract is defined around `cards`, `contacts`, and `analyticsEvents` entities. The current WebDev runtime uses its initialized database for the working path, with the tables and procedures kept easy to move to Supabase once an active project and publishable key are available.
