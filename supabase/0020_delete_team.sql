-- Feather cloud — delete a whole team (M61).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0019
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- Owner-only. Every team-scoped table references teams(id) ON DELETE CASCADE
-- (members, panels, projects, deploys, deploy_bundles, commits, issues,
-- issue_comments, …), so removing the team row removes all of its data. Commit
-- and rollback files on the storage server are left as harmless orphans.

create or replace function public.delete_team(p_team uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.teams where id = p_team and owner_id = auth.uid()
  ) then
    raise exception 'only the team owner can delete this team';
  end if;

  delete from public.teams where id = p_team;  -- cascades to all team data
end;
$$;

grant execute on function public.delete_team(uuid) to authenticated;
