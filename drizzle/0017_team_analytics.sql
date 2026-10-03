-- Teams phase 5: team analytics read the existing "analyticsEvents" rows of company cards, so nothing is copied.
-- The only new setting is whether a team shows its leaderboard. It is off until a team admin turns it on.
alter table "workspaces" add column if not exists "leaderboardEnabled" boolean default false not null;
