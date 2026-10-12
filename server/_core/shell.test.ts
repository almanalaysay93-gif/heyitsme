import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITEMAP_PATHS } from "@shared/routes";

const root = path.resolve(import.meta.dirname, "../..");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf-8")) as {
  functions: Record<string, { includeFiles: string }>;
  rewrites: { source: string; destination: string }[];
};

// index.html carries the landing page's own markup (scripts/prerender.mjs). Any other route that
// received it would paint the landing page first, so those routes must get the empty shell.
describe("HTML shell routing", () => {
  it("never sends the prerendered landing file to another route", () => {
    expect(vercel.rewrites.filter(rule => rule.destination === "/index.html")).toEqual([]);
  });

  it("gives browser-drawn routes the empty shell", () => {
    for (const source of ["/app", "/app/(.*)", "/r/(.*)", "/event/(.*)"]) {
      expect(vercel.rewrites.find(rule => rule.source === source)?.destination).toBe("/app.html");
    }
  });

  it("gives each public page its own prerendered file", () => {
    for (const page of SITEMAP_PATHS.filter(route => route !== "/")) {
      expect(vercel.rewrites.find(rule => rule.source === page)?.destination).toBe(`${page}/index.html`);
    }
  });

  it("ships the empty shell with the function that renders card pages", () => {
    expect(vercel.functions["api/index.js"].includeFiles).toContain("public/app.html");
    expect(fs.readFileSync(path.join(root, "server/_core/seo.ts"), "utf-8")).not.toContain('"index.html"');
  });

  it("prerenders exactly the pages the sitemap lists", () => {
    const script = fs.readFileSync(path.join(root, "scripts/prerender.mjs"), "utf-8");
    for (const page of SITEMAP_PATHS) expect(script).toContain(`"${page}": "src/pages/`);
  });
});
