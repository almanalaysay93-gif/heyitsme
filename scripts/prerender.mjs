// Runs after both Vite builds (see "build" in package.json). Writes each public page's markup into its
// HTML file so the first paint does not wait for JavaScript, and keeps an empty shell (app.html) for
// every route that is drawn in the browser: the workspace, cards, events, review pages.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(root, "dist", "public");
const bundleDir = path.join(root, "dist", "prerender");
const EMPTY_ROOT = '<div id="root"></div>';

// The module App.tsx loads for each public page. Its CSS and chunks are linked from the page's HTML,
// so the markup paints styled and hydration does not wait on a second round of downloads.
const PAGE_MODULES = {
  "/": "src/pages/Landing.tsx",
  "/about": "src/pages/Info.tsx",
  "/faq": "src/pages/Info.tsx",
  "/pricing": "src/pages/Pricing.tsx",
  "/privacy": "src/pages/Legal.tsx",
  "/terms": "src/pages/Legal.tsx",
};

const manifestDir = path.join(publicDir, ".vite");
const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, "manifest.json"), "utf-8"));

/** <link> tags for a page module and everything it imports, minus what the entry script already brings. */
function pageLinks(route) {
  const start = PAGE_MODULES[route];
  if (!start || !manifest[start]) throw new Error(`prerender: no built module for ${route}. Update PAGE_MODULES.`);
  const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
  const seen = new Set([entry]);
  const styles = new Set();
  const scripts = new Set();
  const visit = key => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    scripts.add(chunk.file);
    for (const css of chunk.css ?? []) styles.add(css);
    for (const next of chunk.imports ?? []) visit(next);
  };
  visit(start);
  for (const css of manifest[entry].css ?? []) styles.delete(css);
  return [
    ...[...styles].map(file => `<link rel="stylesheet" crossorigin href="/${file}">`),
    ...[...scripts].map(file => `<link rel="modulepreload" crossorigin href="/${file}">`),
  ];
}

const { routes, renderRoute } = await import(pathToFileURL(path.join(bundleDir, "entry-prerender.js")).href);

const indexPath = path.join(publicDir, "index.html");
if (!fs.readFileSync(indexPath, "utf-8").includes(EMPTY_ROOT)) {
  throw new Error("prerender: dist/public/index.html has no empty #root. Run `vite build` first.");
}
fs.copyFileSync(indexPath, path.join(publicDir, "app.html"));

for (const route of routes) {
  const file = route === "/" ? indexPath : path.join(publicDir, route.slice(1), "index.html");
  const html = fs.readFileSync(file, "utf-8");
  if (!html.includes(EMPTY_ROOT)) throw new Error(`prerender: ${file} has no empty #root`);
  const markup = await renderRoute(route);
  if (!markup.includes("<h1")) throw new Error(`prerender: ${route} rendered without a heading`);
  // A function replacement, so "$" in the markup is never read as a replace pattern.
  const page = html
    .replace("</head>", () => `  ${pageLinks(route).join("\n    ")}\n  </head>`)
    .replace(EMPTY_ROOT, () => `<div id="root" data-prerendered="${route}">${markup}</div>`);
  fs.writeFileSync(file, page);
  console.log(`prerendered ${route} (${(markup.length / 1024).toFixed(1)} kB)`);
}

fs.rmSync(bundleDir, { recursive: true, force: true });
// The manifest is a build input, not something to publish.
fs.rmSync(manifestDir, { recursive: true, force: true });
