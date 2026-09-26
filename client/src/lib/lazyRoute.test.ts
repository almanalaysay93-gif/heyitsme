import { afterEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadForNewVersion } from "./lazyRoute";

describe("isChunkLoadError", () => {
  it("recognises each browser's missing-chunk message and nothing else", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://heyitsme.fyi/assets/Legal-abc.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });
});

describe("reloadForNewVersion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reloads once, then refuses within the window so a broken deploy cannot loop", () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      location: { reload },
    });
    expect(reloadForNewVersion(1_000_000)).toBe(true);
    expect(reloadForNewVersion(1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForNewVersion(1_050_000)).toBe(true);
  });
});
