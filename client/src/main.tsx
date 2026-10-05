import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot, hydrateRoot } from "react-dom/client";
import superjson from "superjson";
import { Router } from "wouter";
import App from "./App";
import { startLogin } from "./const";
import { installGlobalErrorReporting } from "./lib/reportError";
// Self-hosted fonts: no request to Google, and CSP can stay font-src 'self'.
import "@fontsource-variable/dm-sans";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./index.css";
import "./buttons.css";

installGlobalErrorReporting();

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        try {
          const raw = sessionStorage.getItem("app-session-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length) || raw;
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

const container = document.getElementById("root")!;
// The same tree entry-prerender.tsx renders, so the public pages' markup can be adopted as it is.
const app = (
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </trpc.Provider>
);

// Public pages ship their markup in the HTML (scripts/prerender.mjs). Adopt it only when it is this
// page's markup; any other file that reaches this URL is cleared and drawn from scratch.
const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
if (container.dataset.prerendered === currentPath) {
  hydrateRoot(container, app);
} else {
  container.replaceChildren();
  createRoot(container).render(app);
}
