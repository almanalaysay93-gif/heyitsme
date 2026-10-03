import { ChevronsUpDown, CircleUserRound, Plus, UsersRound } from "lucide-react";
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { ROLE_LABELS } from "@shared/teams";

/**
 * Moves between the personal workspace and the user's teams without signing out.
 * Renders nothing while Teams is switched off, so the personal app looks as it always has.
 */
export function WorkspaceSwitcher({ current, signedIn, onNavigate }: { current: "personal" | number; signedIn: boolean; onNavigate?: () => void }) {
  const [, navigate] = useLocation();
  const status = trpc.teams.status.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  const enabled = signedIn && Boolean(status.data?.enabled);
  const teams = trpc.teams.list.useQuery(undefined, { enabled, retry: false });
  if (!enabled) return null;

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };
  const active = typeof current === "number" ? teams.data?.find(team => team.id === current) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="workspace-switcher" aria-label="Switch workspace">
          {active ? <UsersRound size={15} aria-hidden="true" /> : <CircleUserRound size={15} aria-hidden="true" />}
          <span>{active ? active.name : "Personal"}</span>
          <ChevronsUpDown size={13} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="account-dropdown-content">
        <DropdownMenuItem onSelect={() => go("/app")} className="account-menu-link" aria-current={current === "personal" ? "true" : undefined}>
          <CircleUserRound size={14} /> Personal
        </DropdownMenuItem>
        {teams.data?.length ? <DropdownMenuSeparator /> : null}
        {teams.data?.map(team => (
          <DropdownMenuItem key={team.id} onSelect={() => go(`/app/team/${team.id}`)} className="account-menu-link" aria-current={current === team.id ? "true" : undefined}>
            <UsersRound size={14} /> {team.name} <span className="workspace-switcher-role">{ROLE_LABELS[team.role]}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("/app/team")} className="account-menu-link">
          <Plus size={14} /> Create a team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
