import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const outDir = path.resolve(import.meta.dirname, "dist/public");

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
  const siteUrl = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
  return {
    name: "heyitsme-absolute-social-images",
    apply: "build",
    transformIndexHtml(html) {
      return siteUrl ? html.replace(/content="\/og\.png"/g, `content="${siteUrl}/og.png"`) : html;
    },
  };
}

// jsx-loc stamps source file paths onto every element; keep that to the dev server.
const plugins = [react(), tailwindcss(), { ...jsxLocPlugin(), apply: "serve" as const }, absoluteSocialImages(), notFoundPage()];

export default defineConfig({
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
