-- Feather cloud — readable URL slugs for teams and projects (M57).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0021
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- Adds a stable, unique `slug` to teams and projects so the web app can use
-- readable URLs (/team/<slug>, /project/<slug>); users already have a unique
-- `username`. Slugs are generated from the name on insert and backfilled here.

alter table public.teams add column if not exists slug text unique;
alter table public.projects add column if not exists slug text unique;

-- name → url-safe base (lowercase, [a-z0-9-]); null when empty.
create or replace function public.feather_slugify(txt text)
returns text language sql immutable as $$
  select nullif(trim(both '-' from regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g')), '');
$$;

create or replace function public.teams_set_slug()
returns trigger language plpgsql as $$
declare base text; s text; n int := 1;
begin
  if new.slug is not null then return new; end if;
  base := coalesce(public.feather_slugify(new.name), 'team');
  s := base;
  while exists (select 1 from public.teams where slug = s and id <> new.id) loop
    n := n + 1; s := base || '-' || n;
  end loop;
  new.slug := s;
  return new;
end $$;

drop trigger if exists teams_slug_trg on public.teams;
create trigger teams_slug_trg before insert on public.teams
  for each row execute function public.teams_set_slug();

create or replace function public.projects_set_slug()
returns trigger language plpgsql as $$
declare base text; s text; n int := 1;
begin
  if new.slug is not null then return new; end if;
  base := coalesce(public.feather_slugify(new.name), 'project');
  s := base;
  while exists (select 1 from public.projects where slug = s and id <> new.id) loop
    n := n + 1; s := base || '-' || n;
  end loop;
  new.slug := s;
  return new;
end $$;

drop trigger if exists projects_slug_trg on public.projects;
create trigger projects_slug_trg before insert on public.projects
  for each row execute function public.projects_set_slug();

-- Backfill existing rows.
do $$
declare r record; base text; s text; n int;
begin
  for r in select id, name from public.teams where slug is null loop
    base := coalesce(public.feather_slugify(r.name), 'team'); s := base; n := 1;
    while exists (select 1 from public.teams where slug = s) loop n := n + 1; s := base || '-' || n; end loop;
    update public.teams set slug = s where id = r.id;
  end loop;
  for r in select id, name from public.projects where slug is null loop
    base := coalesce(public.feather_slugify(r.name), 'project'); s := base; n := 1;
    while exists (select 1 from public.projects where slug = s) loop n := n + 1; s := base || '-' || n; end loop;
    update public.projects set slug = s where id = r.id;
  end loop;
end $$;
