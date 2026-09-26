export const DEMO_CARD_ID = -1;
export const DEMO_SLUG = "demo";

export interface DemoCardData {
  id: number;
  ownerUserId: number;
  creationKey: string;
  displayName: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  bio: string;
  links: string;
  portfolio: string;
  channels: string;
  theme: string;
  logoUrl: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  contactHeading: string | null;
  galleryHeading: string | null;
  portfolioHeading: string | null;
  slug: string;
  published: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DEMO_CARD: DemoCardData = {
  id: DEMO_CARD_ID,
  ownerUserId: 0,
  creationKey: "demo-card",
  displayName: "Alex Morgan",
  title: "Creative Director",
  company: "Studio North",
  email: "alex@example.com",
  phone: "+1 555-0100",
  location: "San Francisco, CA",
  bio: "I help small teams find the one sentence and visual craft that makes their brand click.",
  links: JSON.stringify(["https://example.com"]),
  portfolio: JSON.stringify([
    {
      id: "demo-item-1",
      kind: "link",
      title: "Brand identity systems",
      url: "https://example.com/work",
      description: "Selected visual craft and identity guidelines",
    },
  ]),
  channels: JSON.stringify([
    { provider: "linkedin", url: "https://linkedin.com/in/example", label: "LinkedIn" },
    { provider: "instagram", url: "https://instagram.com/example", label: "Instagram" },
  ]),
  theme: "midnight",
  logoUrl: null,
  avatarUrl: null,
  coverUrl: null,
  backgroundUrl: null,
  contactHeading: "Get in touch",
  galleryHeading: "Selected visuals",
  portfolioHeading: "Featured projects",
  slug: DEMO_SLUG,
  published: true,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

export const DEMO_REFERENCES = [
  {
    id: -101,
    ownerUserId: 0,
    cardId: DEMO_CARD_ID,
    clientName: "Sarah Chen",
    clientRole: "Design Partner",
    company: "North Ventures",
    quote: "Alex delivered our complete brand identity and guidelines with unmatched craft and clarity.",
    avatarUrl: null,
    approved: true,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
  },
];
