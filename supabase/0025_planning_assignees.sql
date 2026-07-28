-- Feather cloud — to-do list assignees + assignee notifications (M70/M71).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0024
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- Adds member assignment to to-do lists (mirroring task assignees) and wires
-- notifications so that whoever is assigned to a task or a to-do list is told
-- when a comment is posted or a change is made to it.

-- ---------------------------------------------------------------------------
-- To-do list assignees
-- ---------------------------------------------------------------------------
create table if not exists public.planning_todo_list_assignees (
  list_id uuid not null references public.planning_todo_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  primary key (list_id, user_id)
);

alter table public.planning_todo_list_assignees enable row level security;
drop policy if exists ptodoasg_all on public.planning_todo_list_assignees;
create policy ptodoasg_all on public.planning_todo_list_assignees
  for all using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- ---------------------------------------------------------------------------
-- Notify task assignees when a comment is posted (except the comment's author)
-- ---------------------------------------------------------------------------
create or replace function public.planning_notify_task_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.planning_tasks;
begin
  select * into t from public.planning_tasks where id = new.task_id;
  if t.id is null then return new; end if;
  insert into public.notifications (user_id, team_id, project_id, kind, body, link)
  select a.user_id, t.team_id, t.project_id, 'task_comment',
         'New comment on task “' || t.title || '”', t.project_id::text
    from public.planning_task_assignees a
   where a.task_id = t.id
     and a.user_id <> coalesce(new.author_id, auth.uid());
  return new;
end; $$;

drop trigger if exists on_task_comment_notify on public.planning_task_comments;
create trigger on_task_comment_notify
  after insert on public.planning_task_comments
  for each row execute function public.planning_notify_task_comment();

-- ---------------------------------------------------------------------------
-- Notify task assignees when the task's title or status changes (except actor)
-- ---------------------------------------------------------------------------
create or replace function public.planning_notify_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status or new.title is distinct from old.title then
    insert into public.notifications (user_id, team_id, project_id, kind, body, link)
    select a.user_id, new.team_id, new.project_id, 'task_updated',
           'Task “' || new.title || '” was updated', new.project_id::text
      from public.planning_task_assignees a
     where a.task_id = new.id
       and a.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return new;
end; $$;

drop trigger if exists on_task_change_notify on public.planning_tasks;
create trigger on_task_change_notify
  after update on public.planning_tasks
  for each row execute function public.planning_notify_task_change();

-- ---------------------------------------------------------------------------
-- Notify to-do list assignees when the list's items change (except actor)
-- ---------------------------------------------------------------------------
create or replace function public.planning_notify_todo_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare l public.planning_todo_lists; lid uuid;
begin
  lid := coalesce(new.list_id, old.list_id);
  select * into l from public.planning_todo_lists where id = lid;
  if l.id is null then return coalesce(new, old); end if;
  insert into public.notifications (user_id, team_id, project_id, kind, body, link)
  select a.user_id, l.team_id, l.project_id, 'todo_updated',
         'To-do list “' || l.title || '” was updated', l.project_id::text
    from public.planning_todo_list_assignees a
   where a.list_id = l.id
     and a.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  return coalesce(new, old);
end; $$;

drop trigger if exists on_todo_item_notify on public.planning_todo_items;
create trigger on_todo_item_notify
  after insert or update or delete on public.planning_todo_items
  for each row execute function public.planning_notify_todo_change();
