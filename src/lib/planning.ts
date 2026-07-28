// Planning & Organisation (M63): team chats, task assignment and to-do lists,
// plus per-user notifications. All members-only (RLS in supabase/0023).
// Author/assignee profiles are resolved by the UI from the loaded member list,
// so these helpers return plain rows.

import { supabase } from "./supabase";

export interface PlanningChat {
  id: string;
  project_id: string;
  team_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface PlanningMessage {
  id: string;
  chat_id: string;
  project_id: string;
  team_id: string;
  body: string;
  author_id: string | null;
  created_at: string;
}

export type TaskStatus = "open" | "done" | "archived";

export interface PlanningTask {
  id: string;
  project_id: string;
  team_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  issue_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
}

export interface PlanningTaskComment {
  id: string;
  task_id: string;
  team_id: string;
  body: string;
  author_id: string | null;
  created_at: string;
}

export interface TodoList {
  id: string;
  project_id: string;
  team_id: string;
  title: string;
  issue_id: string | null;
  task_id: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
}

export interface TodoItem {
  id: string;
  list_id: string;
  team_id: string;
  body: string;
  done: boolean;
  position: number;
  created_at: string;
}

export interface TodoListAssignee {
  list_id: string;
  user_id: string;
}

export interface Notification {
  id: string;
  user_id: string;
  team_id: string | null;
  project_id: string | null;
  kind: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

function ok<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// --- Chats -----------------------------------------------------------------

export async function listChats(projectId: string): Promise<PlanningChat[]> {
  const { data, error } = await supabase
    .from("planning_chats")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return ok(data, error) ?? [];
}

/** Create a chat (admins/owners only — enforced by RLS). */
export async function createChat(
  projectId: string,
  teamId: string,
  name: string,
): Promise<PlanningChat> {
  const { data, error } = await supabase
    .from("planning_chats")
    .insert({ project_id: projectId, team_id: teamId, name, created_by: (await uid()) })
    .select()
    .single();
  return ok(data, error);
}

export async function deleteChat(chatId: string): Promise<void> {
  const { error } = await supabase.from("planning_chats").delete().eq("id", chatId);
  if (error) throw new Error(error.message);
}

// --- Messages --------------------------------------------------------------

export async function listMessages(chatId: string, limit = 200): Promise<PlanningMessage[]> {
  const { data, error } = await supabase
    .from("planning_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(limit);
  return ok(data, error) ?? [];
}

/** Post a message; notifies each @mentioned member. */
export async function postMessage(
  chat: PlanningChat,
  body: string,
  mentions: string[],
): Promise<PlanningMessage> {
  const author = await uid();
  const { data, error } = await supabase
    .from("planning_messages")
    .insert({ chat_id: chat.id, project_id: chat.project_id, team_id: chat.team_id, body, author_id: author })
    .select()
    .single();
  const row = ok(data, error);
  const others = mentions.filter((m) => m !== author);
  if (others.length > 0) {
    await supabase.from("notifications").insert(
      others.map((user_id) => ({
        user_id,
        team_id: chat.team_id,
        project_id: chat.project_id,
        kind: "mention",
        body: `You were mentioned in #${chat.name}`,
        link: chat.project_id,
      })),
    );
  }
  return row;
}

export function subscribeMessages(
  chatId: string,
  onInsert: (m: PlanningMessage) => void,
): () => void {
  const channel = supabase
    .channel(`planning_messages:${chatId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "planning_messages", filter: `chat_id=eq.${chatId}` },
      (payload) => onInsert(payload.new as PlanningMessage),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

// --- Tasks -----------------------------------------------------------------

export async function listTasks(projectId: string): Promise<PlanningTask[]> {
  const { data, error } = await supabase
    .from("planning_tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return ok(data, error) ?? [];
}

export async function listAssignees(projectId: string): Promise<TaskAssignee[]> {
  // All assignees for the project's tasks (join through tasks).
  const { data, error } = await supabase
    .from("planning_task_assignees")
    .select("task_id, user_id, planning_tasks!inner(project_id)")
    .eq("planning_tasks.project_id", projectId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ task_id: r.task_id as string, user_id: r.user_id as string }));
}

export async function createTask(
  projectId: string,
  teamId: string,
  fields: { title: string; description?: string; issue_id?: string | null },
): Promise<PlanningTask> {
  const { data, error } = await supabase
    .from("planning_tasks")
    .insert({
      project_id: projectId,
      team_id: teamId,
      title: fields.title,
      description: fields.description ?? "",
      issue_id: fields.issue_id ?? null,
      created_by: await uid(),
    })
    .select()
    .single();
  return ok(data, error);
}

export async function updateTask(
  taskId: string,
  patch: Partial<Pick<PlanningTask, "title" | "description" | "status" | "issue_id">>,
): Promise<void> {
  const { error } = await supabase.from("planning_tasks").update(patch).eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("planning_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
}

/** Assign a member to a task and notify them. */
export async function assignTask(
  task: PlanningTask,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("planning_task_assignees")
    .insert({ task_id: task.id, user_id: userId, team_id: task.team_id });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  const me = await uid();
  if (userId !== me) {
    await supabase.from("notifications").insert({
      user_id: userId,
      team_id: task.team_id,
      project_id: task.project_id,
      kind: "task_assigned",
      body: `You were assigned the task “${task.title}”`,
      link: task.project_id,
    });
  }
}

export async function unassignTask(taskId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("planning_task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function listTaskComments(taskId: string): Promise<PlanningTaskComment[]> {
  const { data, error } = await supabase
    .from("planning_task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  return ok(data, error) ?? [];
}

export async function commentTask(
  taskId: string,
  teamId: string,
  body: string,
): Promise<PlanningTaskComment> {
  const { data, error } = await supabase
    .from("planning_task_comments")
    .insert({ task_id: taskId, team_id: teamId, body, author_id: await uid() })
    .select()
    .single();
  return ok(data, error);
}

// --- To-do lists -----------------------------------------------------------

export async function listTodoLists(projectId: string): Promise<TodoList[]> {
  const { data, error } = await supabase
    .from("planning_todo_lists")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return ok(data, error) ?? [];
}

export async function listTodoItems(projectId: string): Promise<TodoItem[]> {
  const { data, error } = await supabase
    .from("planning_todo_items")
    .select("*, planning_todo_lists!inner(project_id)")
    .eq("planning_todo_lists.project_id", projectId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    list_id: r.list_id as string,
    team_id: r.team_id as string,
    body: r.body as string,
    done: r.done as boolean,
    position: r.position as number,
    created_at: r.created_at as string,
  }));
}

export async function createTodoList(
  projectId: string,
  teamId: string,
  fields: { title: string; issue_id?: string | null; task_id?: string | null },
): Promise<TodoList> {
  const { data, error } = await supabase
    .from("planning_todo_lists")
    .insert({
      project_id: projectId,
      team_id: teamId,
      title: fields.title,
      issue_id: fields.issue_id ?? null,
      task_id: fields.task_id ?? null,
      created_by: await uid(),
    })
    .select()
    .single();
  return ok(data, error);
}

export async function setTodoListArchived(listId: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from("planning_todo_lists").update({ archived }).eq("id", listId);
  if (error) throw new Error(error.message);
}

export async function deleteTodoList(listId: string): Promise<void> {
  const { error } = await supabase.from("planning_todo_lists").delete().eq("id", listId);
  if (error) throw new Error(error.message);
}

export async function addTodoItem(
  listId: string,
  teamId: string,
  body: string,
  position: number,
): Promise<TodoItem> {
  const { data, error } = await supabase
    .from("planning_todo_items")
    .insert({ list_id: listId, team_id: teamId, body, position })
    .select()
    .single();
  return ok(data, error);
}

export async function toggleTodoItem(itemId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from("planning_todo_items").update({ done }).eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function deleteTodoItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("planning_todo_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

// --- To-do list assignees --------------------------------------------------

export async function listTodoListAssignees(projectId: string): Promise<TodoListAssignee[]> {
  const { data, error } = await supabase
    .from("planning_todo_list_assignees")
    .select("list_id, user_id, planning_todo_lists!inner(project_id)")
    .eq("planning_todo_lists.project_id", projectId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ list_id: r.list_id as string, user_id: r.user_id as string }));
}

/** Assign a member to a to-do list and notify them. */
export async function assignTodoList(list: TodoList, userId: string): Promise<void> {
  const { error } = await supabase
    .from("planning_todo_list_assignees")
    .insert({ list_id: list.id, user_id: userId, team_id: list.team_id });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  const me = await uid();
  if (userId !== me) {
    await supabase.from("notifications").insert({
      user_id: userId,
      team_id: list.team_id,
      project_id: list.project_id,
      kind: "todo_assigned",
      body: `You were assigned the to-do list “${list.title}”`,
      link: list.project_id,
    });
  }
}

export async function unassignTodoList(listId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("planning_todo_list_assignees")
    .delete()
    .eq("list_id", listId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// --- Notifications ---------------------------------------------------------

export async function listNotifications(limit = 30): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ok(data, error) ?? [];
}

export async function unreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
  if (error) throw new Error(error.message);
}

export function subscribeNotifications(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
