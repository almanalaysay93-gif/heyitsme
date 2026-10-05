import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { prerender } from "react-dom/static";
import superjson from "superjson";
import { Router } from "wouter";
import { SITEMAP_PATHS } from "@shared/routes";
import App from "./App";
import { trpc } from "./lib/trpc";

/** The pages whose markup ships in the HTML, so the first paint does not wait for JavaScript. */
export const routes: readonly string[] = SITEMAP_PATHS;

/**
 * Build-time only (scripts/prerender.mjs). Renders one public page to the markup main.tsx hydrates.
 * Nothing is fetched here: queries stay in their loading state, exactly as on the client's first render.
 */
export async function renderRoute(path: string): Promise<string> {
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })] });
  const { prelude } = await prerender(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Router ssrPath={path}>
          <App />
        </Router>
      </QueryClientProvider>
    </trpc.Provider>,
  );
  return new Response(prelude).text();
}
