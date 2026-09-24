import { describe, expect, it } from "vitest";
import { orphanedUploadKeys, ownedUploadKeys } from "./cardFiles";

describe("ownedUploadKeys", () => {
  it("collects this owner's uploads from photos and portfolio items only", () => {
    const keys = ownedUploadKeys(
      {
        avatarUrl: "/storage/7-portfolio/a1-photo_1a2b3c4d.webp",
        coverUrl: "https://heyitsme.example/storage/7-portfolio/c2-cover_5e6f7a8b.jpg",
        portfolio: JSON.stringify([
          { id: "1", kind: "file", title: "Deck", url: "/storage/7-portfolio/d3-deck_9c0d1e2f.pdf" },
          { id: "2", kind: "link", title: "Site", url: "https://ada.design" },
          { id: "3", kind: "image", title: "Not mine", url: "/storage/8-portfolio/x-other_00000000.png" },
          { id: "4", kind: "file", title: "Sneaky", url: "/storage/7-portfolio/../8-portfolio/x.png" },
        ]),
      },
      7,
    );
    expect(Array.from(keys).sort()).toEqual([
      "7-portfolio/a1-photo_1a2b3c4d.webp",
      "7-portfolio/c2-cover_5e6f7a8b.jpg",
      "7-portfolio/d3-deck_9c0d1e2f.pdf",
    ]);
  });
});

describe("orphanedUploadKeys", () => {
  it("keeps files another of the owner's cards still uses", () => {
    const deleted = { avatarUrl: "/storage/7-portfolio/shared.webp", coverUrl: "/storage/7-portfolio/only-here.jpg" };
    const remaining = [{ avatarUrl: "/storage/7-portfolio/shared.webp", coverUrl: null }];
    expect(orphanedUploadKeys(deleted, remaining, 7)).toEqual(["7-portfolio/only-here.jpg"]);
  });
});
