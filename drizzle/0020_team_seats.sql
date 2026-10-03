-- Teams phase 8: each team's seat allowance and the date its plan runs to. No price is stored here.
-- Both are empty for every existing team, which means the standard allowance and no end date, so nothing changes
-- until heyitsme sets them. A plan that has ended only stops changes: nothing is deleted and nobody is removed.
alter table "workspaces" add column if not exists "seatLimit" integer;
alter table "workspaces" add column if not exists "accessUntil" timestamp;
