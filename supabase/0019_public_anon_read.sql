-- Feather cloud — public (anonymous) read for the web app (M52).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0018
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- The Feather web app lets anyone browse and search teams, users and projects
-- like GitHub — no account required. `0017` already opened these reads to any
-- *signed-in* user; this widens them to the *anonymous* role too, so a visitor
-- without a Feather account can still view public pages and search.
--
-- Unchanged: all writes still require the right membership/role, and `panels`
-- stay members-only (they hold the encrypted API keys) — so server files and
-- the console remain available only to signed-in members, through the
-- membership-checked `feather-panel` Edge Function. `profiles` were already
-- world-readable (`using (true)`).

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select using (true);

drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select using (true);

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select using (true);

drop policy if exists deploys_select on public.deploys;
create policy deploys_select on public.deploys for select using (true);

drop policy if exists bundles_select on public.deploy_bundles;
create policy bundles_select on public.deploy_bundles for select using (true);

drop policy if exists commits_select on public.commits;
create policy commits_select on public.commits for select using (true);

drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues for select using (true);

drop policy if exists issue_comments_select on public.issue_comments;
create policy issue_comments_select on public.issue_comments for select using (true);
