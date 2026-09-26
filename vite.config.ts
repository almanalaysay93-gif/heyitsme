import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

import { MARKETING_METADATA, renderMarketingHtml } from "./server/_core/meta";
import { resolvePublicOrigin } from "./shared/publicOrigin";

// Same origin policy as runtime (server/_core/env.ts): a stale or legacy SITE_URL can never reach generated HTML.
const publicOrigin = resolvePublicOrigin(process.env.SITE_URL);

const outDir = path.resolve(import.meta.dirname, "dist/public");

// Generate pre-rendered static HTML with full metadata and JSON-LD for all public marketing pages
function marketingPagesPlugin(): Plugin {
  return {
    name: "heyitsme-marketing-pages",
    apply: "build",
    closeBundle() {
      const indexPath = path.join(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const rawTemplate = fs.readFileSync(indexPath, "utf-8");
      const siteUrl = publicOrigin;

      for (const [route] of Object.entries(MARKETING_METADATA)) {
        const pageHtml = renderMarketingHtml(rawTemplate, route, siteUrl);
        if (route === "/") {
          fs.writeFileSync(indexPath, pageHtml);
        } else {
          const dir = path.join(outDir, route.replace(/^\//, ""));
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "index.html"), pageHtml);
        }
      }
    },
  };
}

// Vercel serves 404.html for any path no rewrite matches, with a real 404 status.
// It is the app shell (so the branded NotFound page renders) marked noindex.
function notFoundPage(): Plugin {
  return {
    name: "heyitsme-404-page",
    apply: "build",
    closeBundle() {
      const indexPath = path.join(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const html = fs
        .readFileSync(indexPath, "utf-8")
        .replace(/<title>[\s\S]*?<\/title>/, "<title>Page not found — heyitsme</title>")
        .replace("</head>", '    <meta name="robots" content="noindex" />\n  </head>');
      fs.writeFileSync(path.join(outDir, "404.html"), html);
    },
  };
}

// Link-preview scrapers want absolute image URLs. SITE_URL comes from the Vercel project env.
function absoluteSocialImages(): Plugin {
  const siteUrl = publicOrigin;
  return {
    name: "heyitsme-absolute-social-images",
    apply: "build",
    transformIndexHtml(html) {
      return siteUrl ? html.replace(/content="\/og\.png"/g, `content="${siteUrl}/og.png"`) : html;
    },
  };
}

// jsx-loc stamps source file paths onto every element; keep that to the dev server.
const plugins = [react(), tailwindcss(), { ...jsxLocPlugin(), apply: "serve" as const }, absoluteSocialImages(), notFoundPage(), marketingPagesPlugin()];

export default defineConfig({
  // Non-secret release id for client error reports: Vercel's commit SHA, else the mode.
  define: { __RELEASE__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || process.env.NODE_ENV || "dev") },
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
