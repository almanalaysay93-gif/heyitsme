import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { isSpaRoute } from "@shared/routes";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Works from source (server/_core) and from the bundle (dist/server).
  const distPath = [
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(import.meta.dirname, "..", "public"),
    path.resolve(import.meta.dirname, "../..", "dist", "public"),
  ].find((candidate) => fs.existsSync(path.join(candidate, "index.html")));
  if (!distPath) {
    console.error("Could not find the client build (dist/public). Run `pnpm build` first.");
    return;
  }

  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(distPath, { index: false }));

  // App routes get the shell; everything else is a real 404, matching vercel.json.
  app.use("*", (req, res) => {
    if (isSpaRoute(req.originalUrl.split("?")[0])) {
      res.sendFile(path.resolve(distPath, "index.html"));
      return;
    }
    const notFound = path.resolve(distPath, "404.html");
    res.status(404);
    if (fs.existsSync(notFound)) res.sendFile(notFound);
    else res.type("text/plain").send("Not found");
  });
}
