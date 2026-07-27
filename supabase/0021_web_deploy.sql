-- Feather cloud — Web Deployments (M59).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0020
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- A project can be "put online": its latest deployed snapshot is published to
-- the Feather nginx server under /webroot/webdeployment/<slug>/, reachable at
-- https://feather.spcfy.eu/webdeployment/<slug>/. This migration only stores the
-- flag + a stable, unique URL slug; the actual file copy is done by the
-- `feather-storage` Edge Function (publish-web / unpublish-web actions).

alter table public.projects add column if not exists web_deploy boolean not null default false;
alter table public.projects add column if not exists web_slug text unique;

-- Enable/disable web deployment for a project (team members only). Returns the
-- slug (generated once from the project name, kept stable afterwards).
create or replace function public.set_web_deploy(p_project uuid, p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_name text;
  v_base text;
  v_slug text;
  v_n int := 1;
begin
  select team_id, name, web_slug into v_team, v_name, v_slug
  from public.projects where id = p_project;
  if v_team is null then
    raise exception 'project not found';
  end if;
  if not exists (
    select 1 from public.team_members where team_id = v_team and user_id = auth.uid()
  ) then
    raise exception 'only team members can change web deployment';
  end if;

  if not p_enabled then
    update public.projects set web_deploy = false where id = p_project;
    return v_slug;
  end if;

  -- Generate a stable, unique slug the first time it's enabled.
  if v_slug is null then
    v_base := trim(both '-' from regexp_replace(lower(coalesce(v_name, 'project')), '[^a-z0-9]+', '-', 'g'));
    if v_base = '' then v_base := 'project'; end if;
    v_slug := v_base;
    while exists (select 1 from public.projects where web_slug = v_slug and id <> p_project) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;
  end if;

  update public.projects set web_deploy = true, web_slug = v_slug where id = p_project;
  return v_slug;
end;
$$;

grant execute on function public.set_web_deploy(uuid, boolean) to authenticated;
