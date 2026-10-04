// Teams: the names and limits both the server and the client need. Who may do what is decided on the server
// (server/teams/access.ts); the client only uses these to label things.

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const MEMBER_STATUSES = ["invited", "active", "suspended", "removed"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };
export const STATUS_LABELS: Record<MemberStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

/** How long an invitation link works. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Safety caps. They are not a price or a plan limit.
export const MAX_OWNED_WORKSPACES = 3;
/** The seats a team has until heyitsme sets its own allowance. Invited, active and suspended people each hold one. */
export const MAX_WORKSPACE_PEOPLE = 50;
/** The most seats heyitsme can give one team. */
export const MAX_SEAT_ALLOWANCE = 1000;
export const MAX_WORKSPACE_CARDS = 200;
export const MAX_DEPARTMENTS = 50;
export const MAX_TEMPLATES = 30;

/** Card details a team can lock, so members ask an admin instead of changing them. */
export const LOCKABLE_FIELDS = ["displayName", "title", "company", "email", "phone", "location", "bio"] as const;
export type LockableField = (typeof LOCKABLE_FIELDS)[number];
export const FIELD_LABELS: Record<LockableField, string> = {
  displayName: "Name",
  title: "Job title",
  company: "Company",
  email: "Work email",
  phone: "Phone",
  location: "Location",
  bio: "Introduction",
};

export const REQUEST_STATUS_LABELS = {
  pending: "Waiting for an admin",
  approved: "Approved",
  rejected: "Declined",
  cancelled: "Cancelled",
} as const;

export const TEAM_CARD_STATUSES = ["draft", "published", "suspended", "archived"] as const;
export type TeamCardStatus = (typeof TEAM_CARD_STATUSES)[number];
export const CARD_STATUS_LABELS: Record<TeamCardStatus, string> = {
  draft: "Draft",
  published: "Published",
  suspended: "Paused",
  archived: "Archived",
};

/** What happens to a person's company cards when they are removed from the team. Nothing is deleted. */
export const REMOVAL_CARD_CHOICES = ["unassign", "archive", "transfer"] as const;
export type RemovalCardChoice = (typeof REMOVAL_CARD_CHOICES)[number];

/** What happens to the contacts a person collected for the team when they are removed. Nothing is deleted. */
export const REMOVAL_CONTACT_CHOICES = ["keep", "transfer", "archive"] as const;
export type RemovalContactChoice = (typeof REMOVAL_CONTACT_CHOICES)[number];

/** Time ranges, in days, for team analytics. */
export const TEAM_ANALYTICS_RANGES = [7, 30, 90, 365] as const;
export type TeamAnalyticsRange = (typeof TEAM_ANALYTICS_RANGES)[number];

/** Every Team capability. Resolved on the server; never trust a copy held by the browser. */
export const TEAM_CAPABILITIES = [
  "canCreateWorkspace",
  "canInviteMembers",
  "canCreateTeamCards",
  "canCreateTemplates",
  "canManageBrand",
  "canCreateEvents",
  "canStyleEventPages",
  "canViewWorkspaceAnalytics",
  "canManageWorkspaceContacts",
  "canUseDepartments",
  "canUseAssetLibrary",
  "canGenerateEmailSignatures",
  "canGenerateMeetingBackgrounds",
] as const;
export type TeamCapability = (typeof TEAM_CAPABILITIES)[number];
export type TeamEntitlements = Record<TeamCapability, boolean>;

export const isAdminRole = (role: WorkspaceRole) => role === "owner" || role === "admin";
