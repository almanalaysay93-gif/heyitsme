import { trpc } from "@/lib/trpc";
import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode,
} from "react";
import type { PlanCode } from "@shared/plans";

// Plan state for the workspace. Everything shown here comes from billing.me; the server enforces the same rules.

export type UpgradeReason =
  | "lead_warning" | "lead_limit" | "analytics" | "card_limit" | "branding" | "portfolio_images" | "general";

const UpgradeDialog = lazy(() => import("@/components/billing/UpgradeDialog"));

type UpgradeContextValue = { openUpgrade: (reason: UpgradeReason) => void };
const UpgradeContext = createContext<UpgradeContextValue>({ openUpgrade: () => undefined,
});

export function useUpgrade() {
  return useContext(UpgradeContext);
}

/** Wraps the workspace. The dialog code loads only the first time someone opens it. */
export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const [loaded, setLoaded] = useState(false);
  const openUpgrade = useCallback((next: UpgradeReason) => {
    setLoaded(true);
    setReason(next);
  }, []);
  const value = useMemo(() => ({ openUpgrade }), [openUpgrade]);
  return (
    <UpgradeContext.Provider value={value}>
      {children}
      {loaded ? (
        <Suspense fallback={null}>
          <UpgradeDialog reason={reason ?? "general"} open={reason !== null} onOpenChange={open => !open && setReason(null)} />
        </Suspense>
      ) : null}
    </UpgradeContext.Provider>
  );
}

export function useBilling(enabled: boolean) {
  return trpc.billing.me.useQuery(undefined, { enabled, retry: false, staleTime: 30_000,
  });
}

export const PLAN_LABELS: Record<PlanCode, string> = { free: "Free", pro: "Pro",
};

/** True when a tRPC error is a plan limit (FORBIDDEN from server/billing/gate.ts). */
export function isPlanLimitError(error: unknown): boolean {
  return (error as { data?: { code?: string } })?.data?.code === "FORBIDDEN";
}
