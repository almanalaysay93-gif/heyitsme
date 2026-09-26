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
  siteUrl: (process.env.SITE_URL || (process.env.NODE_ENV === "production" ? "https://heyitsme.fyi" : "")).trim().replace(/\/$/, ""),
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  // Resend, for owner notifications. Without a key, mail is skipped and logged.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  // The address must be on the domain verified in Resend, send.heyitsme.fyi.
  mailFrom: process.env.MAIL_FROM || "heyitsme <notifications@send.heyitsme.fyi>",
};
