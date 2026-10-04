import { resolvePublicOrigin } from "@shared/publicOrigin";

export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // `||` so an empty manual variable falls through to the names the Vercel Supabase integration sets.
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "",
  // Supabase Storage bucket for uploads, used when S3 is not configured. Created on first upload.
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "uploads",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  // Public origin, e.g. https://heyitsme.fyi, used for canonical URLs, sitemap, and link previews.
  // Local development without SITE_URL keeps the request's own host; everything else uses the shared policy.
  siteUrl: !process.env.SITE_URL?.trim() && process.env.NODE_ENV !== "production" ? "" : resolvePublicOrigin(process.env.SITE_URL),
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  // Resend, for owner notifications. Without a key, mail is skipped and logged.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  // The address must be on the domain verified in Resend, send.heyitsme.fyi.
  mailFrom: process.env.MAIL_FROM || "heyitsme <notifications@send.heyitsme.fyi>",

  // Pro tools are live. Checkout and quota enforcement remain explicit launch flags.
  // Free-plan limits (1 card, 10 leads a month, 7 days of insights). Keep off until checkout works.
  planLimitsEnabled: flag("PLAN_LIMITS_ENABLED", false),
  paymentsEnabled: flag("PAYMENTS_ENABLED", false),
  paymentProvider: process.env.PAYMENT_PROVIDER || "2c2p",
  // "production" talks to the live gateway. Anything else uses the sandbox.
  paymentProviderEnv: process.env.PAYMENT_PROVIDER_ENV === "production" ? "production" : "sandbox",
  paymentGatewayMerchantId: process.env.PAYMENT_GATEWAY_MERCHANT_ID ?? "",
  paymentGatewaySecret: process.env.PAYMENT_GATEWAY_SECRET ?? "",
  googlePayEnabled: flag("GOOGLE_PAY_ENABLED", false),
  googlePayRecurringEnabled: flag("GOOGLE_PAY_RECURRING_ENABLED", false),
  gcashEnabled: flag("GCASH_ENABLED", false),
  // Used when Google Pay is loaded on our own pages. The 2C2P hosted page does not need them.
  googlePayMerchantId: process.env.GOOGLE_PAY_MERCHANT_ID ?? "",
  googlePayMerchantName: process.env.GOOGLE_PAY_MERCHANT_NAME || "heyitsme",
  googlePayEnv: process.env.GOOGLE_PAY_ENV === "PRODUCTION" ? "PRODUCTION" : "TEST",
  nfcStoreEnabled: flag("NFC_STORE_ENABLED", false),
  teamsEnabled: flag("TEAMS_ENABLED", false),
  // Custom colors and QR styling on team event pages. Off, saved looks stay and new ones are refused.
  teamEventStylingEnabled: flag("TEAM_EVENT_STYLING_ENABLED", true),
  foundingOfferEnabled: false,
  proDesignEnabled: flag("PRO_DESIGN_ENABLED", true),
  qrCampaignsEnabled: flag("QR_CAMPAIGNS_ENABLED", true),
  proAnalyticsEnabled: flag("PRO_ANALYTICS_ENABLED", true),
  // Comma-separated Google account emails that keep every feature with no plan. Compared lowercase.
  complimentaryEmails: (process.env.COMPLIMENTARY_EMAILS ?? "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean),
};

function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "true" || value === "1";
}
