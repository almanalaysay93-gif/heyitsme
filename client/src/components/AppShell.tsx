import { useAuth } from "@/_core/hooks/useAuth";
import { BrandMark } from "@/components/BrandMark";
import { LegalLinks } from "@/components/LegalLinks";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { usePageMeta } from "@/hooks/usePageMeta";
import { getInitials } from "@/lib/cardKit";
import { BarChart3, ChevronRight, CircleUserRound, CreditCard, LayoutGrid, LogOut, Menu, QrCode, UsersRound, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";

export type ShellNavItem = { label: string; icon: LucideIcon; active?: boolean; onClick: () => void };

type Props = {
  /** First and last part of the trail in the top bar, as in "Workspace › Overview". */
  area?: string;
  crumb: string;
  /** Which workspace the switcher shows as open. */
  current?: "personal" | number;
  /** Sidebar entries for this screen. Left out, the sidebar shows the personal workspace. */
  nav?: ShellNavItem[];
  navLabel?: string;
  /** Which personal entry to mark as open, when the personal sidebar is shown. */
  active?: "google-reviews" | "admin-google-api" | "admin-teams";
  profileNote?: string;
  children: ReactNode;
};

/**
 * The sidebar, top bar and page frame of the workspace, for the screens that live outside Home:
 * Teams, Google Reviews and the admin pages. Same markup and classes as Home, so they look the same.
 */
export function AppShell({ area = "Workspace", crumb, current = "personal", nav, navLabel = "Workspace", active, profileNote, children }: Props) {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  usePageMeta({ title: `${crumb === area ? crumb : `${crumb} · ${area}`} — heyitsme`, noindex: true });
  const name = user?.name || (isAuthenticated ? "You" : "Guest");
  const go = (path: string) => () => { navigate(path); setOpen(false); };
  const item = ({ label, icon: Icon, active: on, onClick }: ShellNavItem) => (
    <button key={label} type="button" className={`nav-item ${on ? "is-active" : ""}`} aria-current={on ? "page" : undefined} onClick={() => { onClick(); setOpen(false); }}>
      <Icon size={17} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="app-frame">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="ambient ambient-three" />
      <aside id="app-sidebar" className={`app-sidebar ${open ? "is-open" : ""}`}>
        <a className="brand-lockup" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }} title="heyitsme home"><BrandMark /><span>heyitsme</span></a>
        <div className="sidebar-profile">
          <div className="profile-orb">{getInitials(name)}</div>
          <div>
            <strong>{name}</strong>
            <span>{profileNote ?? (isAuthenticated ? "Signed in" : "Preview mode")}</span>
          </div>
        </div>
        <WorkspaceSwitcher current={current} signedIn={isAuthenticated} onNavigate={() => setOpen(false)} />
        {nav ? <>
          <div className="nav-section-label">{navLabel}</div>
          <nav aria-label={navLabel}>{nav.map(item)}</nav>
          <div className="nav-section-label nav-section-spaced">Personal</div>
          <nav>{item({ label: "My cards", icon: CircleUserRound, onClick: go("/app") })}</nav>
        </> : <>
          <div className="nav-section-label">Workspace</div>
          <nav>
            {item({ label: "Overview", icon: LayoutGrid, onClick: go("/app") })}
            {item({ label: "My cards", icon: CircleUserRound, onClick: go("/app/cards") })}
            {item({ label: "Contact Exchanges", icon: UsersRound, onClick: go("/app/contacts") })}
            {item({ label: "Insights", icon: BarChart3, onClick: go("/app/insights") })}
            {isAuthenticated ? item({ label: "Billing", icon: CreditCard, onClick: go("/app/billing") }) : null}
          </nav>
          <div className="nav-section-label nav-section-spaced">Business Features &amp; Services</div>
          <nav>{item({ label: "Google Reviews", icon: QrCode, active: active === "google-reviews", onClick: go("/app/google-reviews") })}</nav>
          {user?.role === "admin" ? <>
            <div className="nav-section-label nav-section-spaced">Admin</div>
            <nav>
              {item({ label: "Google API Usage", icon: BarChart3, active: active === "admin-google-api", onClick: go("/app/admin/google-api") })}
              {item({ label: "Teams", icon: UsersRound, active: active === "admin-teams", onClick: go("/app/admin/teams") })}
            </nav>
          </> : null}
        </>}
        <div className="sidebar-bottom">
          {isAuthenticated ? item({ label: "Sign out", icon: LogOut, onClick: () => { void logout(); } }) : null}
          <LegalLinks className="sidebar-legal" />
        </div>
      </aside>
      <main className="app-main" id="main" tabIndex={-1}>
        <header className="app-topbar">
          <button className="mobile-menu-button" onClick={() => setOpen(value => !value)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="app-sidebar">
            <Menu size={20} />
          </button>
          <div className="crumbs">
            {crumb === area ? null : <><span>{area}</span><ChevronRight size={14} /></>}
            <strong>{crumb}</strong>
          </div>
        </header>
        <div className="content-wrap gr-shell">{children}</div>
      </main>
    </div>
  );
}
