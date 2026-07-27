-- Feather cloud — Planning & Organisation per project (M63).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0022
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- A project's Planning tab: team chats, task assignment (tasks can link an open
-- issue and carry assignees + comments), and shared to-do lists. Planning data
-- is TEAM-MEMBERS ONLY (unlike the public issues/overview) — it's the team's
-- internal workspace. Chats can only be created by admins/owners; everything
-- else is open to any team member. Closing an issue auto-archives the tasks and
-- to-do lists linked to it.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.planning_chats (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  name       text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists planning_chats_project_idx on public.planning_chats (project_id, created_at asc);

create table if not exists public.planning_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.planning_chats(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  body       text not null,
  author_id  uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists planning_messages_chat_idx on public.planning_messages (chat_id, created_at asc);

create table if not exists public.planning_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  title       text not null,
  description text not null default '',
  status      text not null default 'open' check (status in ('open', 'done', 'archived')),
  issue_id    uuid references public.issues(id) on delete set null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists planning_tasks_project_idx on public.planning_tasks (project_id, created_at desc);

create table if not exists public.planning_task_assignees (
  task_id uuid not null references public.planning_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  primary key (task_id, user_id)
);

create table if not exists public.planning_task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.planning_tasks(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  body       text not null,
  author_id  uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists planning_task_comments_task_idx on public.planning_task_comments (task_id, created_at asc);

create table if not exists public.planning_todo_lists (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  title      text not null,
  issue_id   uuid references public.issues(id) on delete set null,
  task_id    uuid references public.planning_tasks(id) on delete set null,
  archived   boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists planning_todo_lists_project_idx on public.planning_todo_lists (project_id, created_at desc);

create table if not exists public.planning_todo_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.planning_todo_lists(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  body       text not null,
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists planning_todo_items_list_idx on public.planning_todo_items (list_id, position asc, created_at asc);

-- Per-user notifications (mentions, task assignments, …).
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  team_id    uuid references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind       text not null,
  body       text not null,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security — members only (chats: create = admin)
-- ---------------------------------------------------------------------------
alter table public.planning_chats          enable row level security;
alter table public.planning_messages       enable row level security;
alter table public.planning_tasks          enable row level security;
alter table public.planning_task_assignees enable row level security;
alter table public.planning_task_comments  enable row level security;
alter table public.planning_todo_lists     enable row level security;
alter table public.planning_todo_items     enable row level security;
alter table public.notifications           enable row level security;

-- Helper: full member CRUD policy set on a table with a team_id column.
-- (Written out per table so the migration stays plain SQL.)

-- planning_chats: read/update/delete = member; INSERT = admin/owner only.
drop policy if exists pchats_select on public.planning_chats;
create policy pchats_select on public.planning_chats for select using (public.is_team_member(team_id));
drop policy if exists pchats_insert on public.planning_chats;
create policy pchats_insert on public.planning_chats for insert with check (public.is_team_admin(team_id));
drop policy if exists pchats_update on public.planning_chats;
create policy pchats_update on public.planning_chats for update using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
drop policy if exists pchats_delete on public.planning_chats;
create policy pchats_delete on public.planning_chats for delete using (public.is_team_admin(team_id));

-- planning_messages: member read/insert; author may delete own.
drop policy if exists pmsg_select on public.planning_messages;
create policy pmsg_select on public.planning_messages for select using (public.is_team_member(team_id));
drop policy if exists pmsg_insert on public.planning_messages;
create policy pmsg_insert on public.planning_messages for insert with check (public.is_team_member(team_id) and author_id = auth.uid());
drop policy if exists pmsg_delete on public.planning_messages;
create policy pmsg_delete on public.planning_messages for delete using (author_id = auth.uid() or public.is_team_admin(team_id));

-- planning_tasks: full member CRUD.
drop policy if exists ptask_all on public.planning_tasks;
create policy ptask_all on public.planning_tasks for all using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- planning_task_assignees: full member CRUD.
drop policy if exists ptaskasg_all on public.planning_task_assignees;
create policy ptaskasg_all on public.planning_task_assignees for all using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- planning_task_comments: member read/insert; author delete.
drop policy if exists ptaskc_select on public.planning_task_comments;
create policy ptaskc_select on public.planning_task_comments for select using (public.is_team_member(team_id));
drop policy if exists ptaskc_insert on public.planning_task_comments;
create policy ptaskc_insert on public.planning_task_comments for insert with check (public.is_team_member(team_id) and author_id = auth.uid());
drop policy if exists ptaskc_delete on public.planning_task_comments;
create policy ptaskc_delete on public.planning_task_comments for delete using (author_id = auth.uid() or public.is_team_admin(team_id));

-- planning_todo_lists + items: full member CRUD.
drop policy if exists ptodolist_all on public.planning_todo_lists;
create policy ptodolist_all on public.planning_todo_lists for all using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
drop policy if exists ptodoitem_all on public.planning_todo_items;
create policy ptodoitem_all on public.planning_todo_items for all using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- notifications: you see/update/delete your own; a team member may create one
-- for a teammate (mentions, assignments).
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select using (user_id = auth.uid());
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert with check (public.is_team_member(team_id));
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Auto-archive tasks/to-do lists when their linked issue closes (restore on reopen)
-- ---------------------------------------------------------------------------
create or replace function public.planning_on_issue_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and coalesce(old.status, '') <> 'closed' then
    update public.planning_tasks set status = 'archived'
      where issue_id = new.id and status <> 'archived';
    update public.planning_todo_lists set archived = true
      where issue_id = new.id
         or task_id in (select id from public.planning_tasks where issue_id = new.id);
  elsif new.status = 'open' and coalesce(old.status, '') = 'closed' then
    update public.planning_tasks set status = 'open'
      where issue_id = new.id and status = 'archived';
    update public.planning_todo_lists set archived = false
      where issue_id = new.id
         or task_id in (select id from public.planning_tasks where issue_id = new.id);
  end if;
  return new;
end; $$;

drop trigger if exists on_issue_status_planning on public.issues;
create trigger on_issue_status_planning
  after update on public.issues
  for each row execute function public.planning_on_issue_status();

-- ---------------------------------------------------------------------------
-- Realtime — live chat messages and notifications
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_messages') then
      alter publication supabase_realtime add table public.planning_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
