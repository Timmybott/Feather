-- Feather cloud — auto-close issues on deploy (M72).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0025
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- When committing, a member can pin one or more open issues to that commit
-- (via assign_issue_commit). Once the commit ships — i.e. the bundle it belongs
-- to is released from CURRENT DEPLOY — every open issue pinned to a commit in
-- that bundle is closed automatically. Closing an issue also runs the existing
-- planning trigger, archiving the tasks/to-do lists linked to it.

create or replace function public.close_deployed_issues(p_bundle uuid)
returns int language plpgsql security definer set search_path = public as $$
declare tid uuid; n int;
begin
  select team_id into tid from public.deploy_bundles where id = p_bundle;
  if tid is null then return 0; end if;
  if not public.is_team_member(tid) then raise exception 'not a member of this team'; end if;

  with closed as (
    update public.issues i
       set status = 'closed', closed_at = now(), updated_at = now()
     where i.status = 'open'
       and i.commit_id in (select c.id from public.commits c where c.bundle_id = p_bundle)
    returning i.id
  )
  select count(*) into n from closed;
  return n;
end; $$;

grant execute on function public.close_deployed_issues(uuid) to authenticated;
