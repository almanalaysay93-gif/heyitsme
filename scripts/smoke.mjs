// Read-only post-deploy smoke check. Usage: node scripts/smoke.mjs https://heyitsme.fyi
// Touches only public routes and the demo card; writes nothing (client-error takes one tagged report).
const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
let failed = 0;
async function check(name, path, test, init) {
  try {
    const res = await fetch(base + path, { redirect: "manual", ...init });
    const body = res.status === 204 || res.status >= 300 && res.status < 400 ? "" : await res.text();
    const problem = test(res, body);
    console.log(`${problem ? "FAIL" : "ok  "} ${name}${problem ? ` — ${problem}` : ""}`);
    if (problem) failed++;
  } catch (error) {
    console.log(`FAIL ${name} — ${error.message}`);
    failed++;
  }
}
const status = (want) => (res) => (res.status === want ? null : `status ${res.status}, want ${want}`);

await check("home renders with title", "/", (r, b) => r.status !== 200 ? `status ${r.status}` : /<title>[^<]+<\/title>/.test(b) ? null : "no <title>");
await check("security headers", "/", (r) => ["content-security-policy", "strict-transport-security", "x-content-type-options"].filter((h) => !r.headers.get(h)).join(", ") || null);
for (const page of ["/about", "/faq", "/pricing", "/privacy", "/terms"]) await check(`marketing ${page}`, page, status(200));

// Canonical/share metadata is written at build time; a stale SITE_URL once leaked the old Vercel host here.
const expectedOrigin = process.env.EXPECT_ORIGIN || "https://heyitsme.fyi";
const metaUrls = (html) => [...html.matchAll(/(?:rel="canonical" href|property="og:(?:url|image)" content|name="twitter:image" content)="([^"]+)"/g)].map((m) => m[1]);
for (const page of ["/", "/about", "/faq", "/pricing", "/privacy", "/terms", "/c/demo"]) {
  await check(`metadata origin ${page}`, page, (r, b) => {
    const urls = metaUrls(b);
    if (urls.length < 3) return `only ${urls.length} canonical/og/twitter urls`;
    const bad = urls.filter((u) => !u.startsWith(expectedOrigin + "/"));
    const canonicals = (b.match(/rel="canonical"/g) || []).length;
    return bad.length ? `wrong origin: ${bad[0]}` : canonicals !== 1 ? `${canonicals} canonical tags` : null;
  });
}
await check("share image is an image", "/og.png", (r) => (r.status === 200 && /^image\//.test(r.headers.get("content-type") || "") ? null : `status ${r.status} ${r.headers.get("content-type")}`));
await check("demo vCard uses production origin", "/c/demo.vcf", (r, b) => (/vercel\.app/i.test(b) ? "legacy host in vCard" : null));
await check("demo card", "/c/demo", (r, b) => r.status !== 200 ? `status ${r.status}` : b.includes("og:title") ? null : "no og:title");
await check("demo vCard", "/c/demo.vcf", (r, b) => r.status !== 200 ? `status ${r.status}` : b.startsWith("BEGIN:VCARD") ? null : "not a vCard");
await check("missing card is 404", "/c/definitely-not-a-card-zz9", status(404));
await check("unknown path is 404", "/no-such-page-zz9", status(404));
await check("robots.txt", "/robots.txt", status(200));
await check("sitemap.xml", "/sitemap.xml", (r, b) => r.status === 200 && b.includes("<urlset") ? null : `status ${r.status}`);
await check("health", "/api/health", (r) => (r.status === 200 ? null : `status ${r.status} (503 = database down)`));
await check("client-error accepts report", "/api/client-error", status(204), {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "smoke", message: "smoke test" }),
});

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
