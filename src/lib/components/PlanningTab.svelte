<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Issue, TeamMember } from "../cloud";
  import {
    addTodoItem,
    assignTask,
    assignTodoList,
    commentTask,
    createChat,
    createTask,
    createTodoList,
    deleteChat,
    deleteTask,
    deleteTodoItem,
    deleteTodoList,
    listAssignees,
    listChats,
    listMessages,
    listTaskComments,
    listTasks,
    listTodoItems,
    listTodoListAssignees,
    listTodoLists,
    postMessage,
    setTodoListArchived,
    subscribeMessages,
    toggleTodoItem,
    unassignTask,
    unassignTodoList,
    updateTask,
    type PlanningChat,
    type PlanningMessage,
    type PlanningTask,
    type PlanningTaskComment,
    type TaskAssignee,
    type TodoItem,
    type TodoList,
    type TodoListAssignee,
  } from "../planning";

  let {
    projectId,
    teamId,
    members,
    issues,
    currentUserId = null,
    isMember = false,
    isAdmin = false,
    onOpenFile,
    onOpenProfile,
  }: {
    projectId: string;
    teamId: string;
    members: TeamMember[];
    issues: Issue[];
    currentUserId?: string | null;
    isMember?: boolean;
    isAdmin?: boolean;
    onOpenFile?: (path: string) => void;
    onOpenProfile?: (userId: string) => void;
  } = $props();

  type Section = "chats" | "tasks" | "todos";
  let section = $state<Section>("chats");

  // --- Member lookup helpers ------------------------------------------------
  function member(userId: string | null): TeamMember | undefined {
    return members.find((m) => m.user_id === userId);
  }
  function memberName(userId: string | null): string {
    const m = member(userId);
    return m?.display_name?.trim() || m?.username || "Someone";
  }
  function initial(userId: string | null): string {
    return memberName(userId).charAt(0).toUpperCase();
  }
  function avatarUrl(userId: string | null): string | null {
    return member(userId)?.avatar_url ?? null;
  }
  function memberByHandle(handle: string): TeamMember | undefined {
    return members.find((x) => (x.username ?? "").toLowerCase() === handle.toLowerCase());
  }
  function openProfile(userId: string | null | undefined) {
    if (userId) onOpenProfile?.(userId);
  }
  const openIssues = $derived(issues.filter((i) => i.status === "open"));
  function issueLabel(id: string | null): string | null {
    if (!id) return null;
    const i = issues.find((x) => x.id === id);
    return i ? `#${i.number} ${i.title}` : null;
  }

  // ==========================================================================
  // Chats
  // ==========================================================================
  let chats = $state<PlanningChat[]>([]);
  let activeChatId = $state<string | null>(null);
  let messages = $state<PlanningMessage[]>([]);
  let draft = $state("");
  let newChatName = $state("");
  let creatingChat = $state(false);
  let chatError = $state<string | null>(null);
  let unsubMessages: (() => void) | null = null;

  const activeChat = $derived(chats.find((c) => c.id === activeChatId) ?? null);

  async function loadChats() {
    try {
      chats = await listChats(projectId);
      if (!activeChatId && chats.length > 0) selectChat(chats[0].id);
    } catch (e) {
      chatError = String(e instanceof Error ? e.message : e);
    }
  }

  function selectChat(id: string) {
    activeChatId = id;
    void loadMessages(id);
    unsubMessages?.();
    unsubMessages = subscribeMessages(id, (m) => {
      if (m.chat_id === activeChatId && !messages.some((x) => x.id === m.id)) {
        messages = [...messages, m];
      }
    });
  }

  async function loadMessages(id: string) {
    try {
      messages = await listMessages(id);
    } catch (e) {
      chatError = String(e instanceof Error ? e.message : e);
    }
  }

  async function addChat() {
    if (newChatName.trim() === "") return;
    creatingChat = true;
    chatError = null;
    try {
      const c = await createChat(projectId, teamId, newChatName.trim());
      chats = [...chats, c];
      newChatName = "";
      selectChat(c.id);
    } catch (e) {
      chatError = String(e instanceof Error ? e.message : e);
    } finally {
      creatingChat = false;
    }
  }

  async function removeChat(id: string) {
    try {
      await deleteChat(id);
      chats = chats.filter((c) => c.id !== id);
      if (activeChatId === id) {
        activeChatId = null;
        messages = [];
        if (chats.length > 0) selectChat(chats[0].id);
      }
    } catch (e) {
      chatError = String(e instanceof Error ? e.message : e);
    }
  }

  // Resolve @username tokens in the draft to member ids for notifications.
  function mentionedIds(text: string): string[] {
    const ids = new Set<string>();
    for (const match of text.matchAll(/@([a-z0-9_.-]+)/gi)) {
      const handle = match[1].toLowerCase();
      const m = members.find((x) => (x.username ?? "").toLowerCase() === handle);
      if (m) ids.add(m.user_id);
    }
    return [...ids];
  }

  async function send() {
    const body = draft.trim();
    if (body === "" || !activeChat) return;
    draft = "";
    try {
      await postMessage(activeChat, body, mentionedIds(body));
      // The realtime subscription echoes it back; nothing else to do.
    } catch (e) {
      chatError = String(e instanceof Error ? e.message : e);
      draft = body; // restore on failure
    }
  }

  // Split a message body into text / @mention / #file segments for rendering.
  type Seg = { kind: "text" | "mention" | "file"; value: string; known?: boolean };
  function segments(body: string): Seg[] {
    const out: Seg[] = [];
    const re = /([@#])([a-z0-9_.\-/]+)/gi;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (m.index > last) out.push({ kind: "text", value: body.slice(last, m.index) });
      if (m[1] === "@") {
        const known = members.some((x) => (x.username ?? "").toLowerCase() === m![2].toLowerCase());
        out.push({ kind: "mention", value: m[2], known });
      } else {
        out.push({ kind: "file", value: m[2], known: true });
      }
      last = re.lastIndex;
    }
    if (last < body.length) out.push({ kind: "text", value: body.slice(last) });
    return out;
  }

  function time(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ==========================================================================
  // Tasks
  // ==========================================================================
  let tasks = $state<PlanningTask[]>([]);
  let assignees = $state<TaskAssignee[]>([]);
  let showArchived = $state(false);
  let showCompletedTasks = $state(false);
  let newTaskTitle = $state("");
  let newTaskIssue = $state<string>("");
  let expandedTask = $state<string | null>(null);
  let taskComments = $state<PlanningTaskComment[]>([]);
  let taskCommentDraft = $state("");
  let taskError = $state<string | null>(null);

  async function loadTasks() {
    try {
      [tasks, assignees] = await Promise.all([listTasks(projectId), listAssignees(projectId)]);
    } catch (e) {
      taskError = String(e instanceof Error ? e.message : e);
    }
  }

  const openTasks = $derived(tasks.filter((t) => t.status === "open"));
  const doneTasks = $derived(tasks.filter((t) => t.status === "done"));
  const archivedTasks = $derived(tasks.filter((t) => t.status === "archived"));
  function taskAssignees(taskId: string): string[] {
    return assignees.filter((a) => a.task_id === taskId).map((a) => a.user_id);
  }

  async function addTask() {
    if (newTaskTitle.trim() === "") return;
    taskError = null;
    try {
      const t = await createTask(projectId, teamId, {
        title: newTaskTitle.trim(),
        issue_id: newTaskIssue || null,
      });
      tasks = [t, ...tasks];
      newTaskTitle = "";
      newTaskIssue = "";
    } catch (e) {
      taskError = String(e instanceof Error ? e.message : e);
    }
  }

  async function setTaskStatus(t: PlanningTask, status: PlanningTask["status"]) {
    try {
      await updateTask(t.id, { status });
      tasks = tasks.map((x) => (x.id === t.id ? { ...x, status } : x));
    } catch (e) {
      taskError = String(e instanceof Error ? e.message : e);
    }
  }

  async function removeTask(id: string) {
    try {
      await deleteTask(id);
      tasks = tasks.filter((t) => t.id !== id);
    } catch (e) {
      taskError = String(e instanceof Error ? e.message : e);
    }
  }

  async function toggleAssignee(t: PlanningTask, userId: string) {
    const has = taskAssignees(t.id).includes(userId);
    try {
      if (has) {
        await unassignTask(t.id, userId);
        assignees = assignees.filter((a) => !(a.task_id === t.id && a.user_id === userId));
      } else {
        await assignTask(t, userId);
        assignees = [...assignees, { task_id: t.id, user_id: userId }];
      }
    } catch (e) {
      taskError = String(e instanceof Error ? e.message : e);
    }
  }

  async function openTask(t: PlanningTask) {
    if (expandedTask === t.id) {
      expandedTask = null;
      return;
    }
    expandedTask = t.id;
    taskComments = [];
    taskCommentDraft = "";
    try {
      taskComments = await listTaskComments(t.id);
    } catch (e) {
      taskError = String(e instanceof Error ? e.message : e);
    }
  }

  async function sendTaskComment(t: PlanningTask) {
    const body = taskCommentDraft.trim();
    if (body === "") return;
    taskCommentDraft = "";
    try {
      const c = await commentTask(t.id, teamId, body);
      taskComments = [...taskComments, c];
    } catch (e) {
      taskError = String(e instanceof Error ? e.message : e);
      taskCommentDraft = body;
    }
  }

  // ==========================================================================
  // To-do lists
  // ==========================================================================
  let todoLists = $state<TodoList[]>([]);
  let todoItems = $state<TodoItem[]>([]);
  let todoAssignees = $state<TodoListAssignee[]>([]);
  let newListTitle = $state("");
  let newListIssue = $state<string>("");
  let itemDraft = $state<Record<string, string>>({});
  let assignOpen = $state<Record<string, boolean>>({});
  let showArchivedTodos = $state(false);
  let showCompletedTodos = $state(false);
  let todoError = $state<string | null>(null);

  async function loadTodos() {
    try {
      [todoLists, todoItems, todoAssignees] = await Promise.all([
        listTodoLists(projectId),
        listTodoItems(projectId),
        listTodoListAssignees(projectId),
      ]);
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  function itemsOf(listId: string): TodoItem[] {
    return todoItems.filter((i) => i.list_id === listId);
  }
  // A list counts as "completed" once it has items and every item is done.
  function listCompleted(listId: string): boolean {
    const items = itemsOf(listId);
    return items.length > 0 && items.every((i) => i.done);
  }
  function assigneesOf(listId: string): string[] {
    return todoAssignees.filter((a) => a.list_id === listId).map((a) => a.user_id);
  }
  const activeLists = $derived(todoLists.filter((l) => !l.archived && !listCompleted(l.id)));
  const completedLists = $derived(todoLists.filter((l) => !l.archived && listCompleted(l.id)));
  const archivedLists = $derived(todoLists.filter((l) => l.archived));

  async function toggleListAssignee(list: TodoList, userId: string) {
    const has = assigneesOf(list.id).includes(userId);
    try {
      if (has) {
        await unassignTodoList(list.id, userId);
        todoAssignees = todoAssignees.filter((a) => !(a.list_id === list.id && a.user_id === userId));
      } else {
        await assignTodoList(list, userId);
        todoAssignees = [...todoAssignees, { list_id: list.id, user_id: userId }];
      }
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  async function addList() {
    if (newListTitle.trim() === "") return;
    todoError = null;
    try {
      const l = await createTodoList(projectId, teamId, {
        title: newListTitle.trim(),
        issue_id: newListIssue || null,
      });
      todoLists = [l, ...todoLists];
      newListTitle = "";
      newListIssue = "";
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  async function addItem(list: TodoList) {
    const body = (itemDraft[list.id] ?? "").trim();
    if (body === "") return;
    itemDraft = { ...itemDraft, [list.id]: "" };
    try {
      const pos = itemsOf(list.id).length;
      const item = await addTodoItem(list.id, teamId, body, pos);
      todoItems = [...todoItems, item];
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  async function toggleItem(item: TodoItem) {
    try {
      await toggleTodoItem(item.id, !item.done);
      todoItems = todoItems.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i));
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  async function removeItem(id: string) {
    try {
      await deleteTodoItem(id);
      todoItems = todoItems.filter((i) => i.id !== id);
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  async function archiveList(list: TodoList, archived: boolean) {
    try {
      await setTodoListArchived(list.id, archived);
      todoLists = todoLists.map((l) => (l.id === list.id ? { ...l, archived } : l));
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  async function removeList(id: string) {
    try {
      await deleteTodoList(id);
      todoLists = todoLists.filter((l) => l.id !== id);
      todoItems = todoItems.filter((i) => i.list_id !== id);
    } catch (e) {
      todoError = String(e instanceof Error ? e.message : e);
    }
  }

  // Load the active section on demand (and on project change).
  let loaded = $state<Record<Section, boolean>>({ chats: false, tasks: false, todos: false });
  $effect(() => {
    void projectId;
    // Reset when the project changes.
    loaded = { chats: false, tasks: false, todos: false };
    chats = [];
    activeChatId = null;
    messages = [];
    tasks = [];
    todoLists = [];
    todoItems = [];
    todoAssignees = [];
  });
  $effect(() => {
    const s = section;
    if (loaded[s]) return;
    loaded = { ...loaded, [s]: true };
    if (s === "chats") void loadChats();
    else if (s === "tasks") void loadTasks();
    else void loadTodos();
  });

  onDestroy(() => unsubMessages?.());
</script>

{#if !isMember}
  <p class="notice muted">Planning is the team's private workspace. Sign in as a member of this project's team to see chats, tasks and to-do lists.</p>
{:else}
  <div class="planning">
    <nav class="sub">
      <button class:active={section === "chats"} onclick={() => (section = "chats")}>Chats</button>
      <button class:active={section === "tasks"} onclick={() => (section = "tasks")}>Tasks</button>
      <button class:active={section === "todos"} onclick={() => (section = "todos")}>To-dos</button>
    </nav>

    {#if section === "chats"}
      <div class="chats">
        <aside class="chat-list">
          {#each chats as c (c.id)}
            <button class="chat-item" class:active={c.id === activeChatId} onclick={() => selectChat(c.id)}>
              <span class="hash">#</span><span class="chat-name">{c.name}</span>
              {#if isAdmin}
                <span
                  class="del"
                  role="button"
                  tabindex="0"
                  title="Delete chat"
                  onclick={(e) => {
                    e.stopPropagation();
                    void removeChat(c.id);
                  }}
                  onkeydown={(e) => e.key === "Enter" && removeChat(c.id)}
                >×</span>
              {/if}
            </button>
          {/each}
          {#if chats.length === 0}
            <p class="muted empty">No chats yet.</p>
          {/if}
          {#if isAdmin}
            <form class="new-chat" onsubmit={(e) => { e.preventDefault(); void addChat(); }}>
              <input bind:value={newChatName} placeholder="New chat name" maxlength="40" />
              <button class="primary small" type="submit" disabled={creatingChat || newChatName.trim() === ""}>Add</button>
            </form>
          {:else}
            <p class="muted hint">Only admins can create chats.</p>
          {/if}
        </aside>

        <section class="chat-main">
          {#if activeChat}
            <div class="messages">
              {#each messages as m (m.id)}
                <div class="msg">
                  <button class="avatar" title={memberName(m.author_id)} onclick={() => openProfile(m.author_id)}>
                    {#if avatarUrl(m.author_id)}<img src={avatarUrl(m.author_id)} alt="" />{:else}{initial(m.author_id)}{/if}
                  </button>
                  <div class="msg-body">
                    <div class="msg-head">
                      <button class="msg-author link" onclick={() => openProfile(m.author_id)}>{memberName(m.author_id)}</button>
                      <span class="msg-time muted">{time(m.created_at)}</span>
                    </div>
                    <div class="msg-text">
                      {#each segments(m.body) as seg}
                        {#if seg.kind === "mention"}
                          <button class="tag mention" class:unknown={!seg.known} disabled={!seg.known} onclick={() => openProfile(memberByHandle(seg.value)?.user_id)} title="View profile">@{seg.value}</button>
                        {:else if seg.kind === "file"}
                          <button class="tag file" onclick={() => onOpenFile?.(seg.value)} title="Open file">#{seg.value}</button>
                        {:else}
                          {seg.value}
                        {/if}
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
              {#if messages.length === 0}
                <p class="muted empty">Start the conversation. Tag a teammate with <code>@username</code> or a file with <code>#path</code>.</p>
              {/if}
            </div>
            <form class="composer" onsubmit={(e) => { e.preventDefault(); void send(); }}>
              <input bind:value={draft} placeholder="Message #{activeChat.name}   ( @teammate  #file )" autocomplete="off" />
              <button class="primary" type="submit" disabled={draft.trim() === ""}>Send</button>
            </form>
          {:else}
            <p class="muted empty center">Select or create a chat to start talking.</p>
          {/if}
        </section>
      </div>
      {#if chatError}<p class="error">{chatError}</p>{/if}
    {:else if section === "tasks"}
      <div class="tasks">
        <form class="new-task" onsubmit={(e) => { e.preventDefault(); void addTask(); }}>
          <input bind:value={newTaskTitle} placeholder="New task…" />
          <select bind:value={newTaskIssue}>
            <option value="">No issue</option>
            {#each openIssues as i (i.id)}
              <option value={i.id}>#{i.number} {i.title}</option>
            {/each}
          </select>
          <button class="primary small" type="submit" disabled={newTaskTitle.trim() === ""}>Add task</button>
        </form>

        {#snippet taskCard(t: PlanningTask)}
          <div class="task" class:done={t.status === "done"}>
            <div class="task-row">
              <input type="checkbox" checked={t.status === "done"} onchange={() => setTaskStatus(t, t.status === "done" ? "open" : "done")} title="Mark done" />
              <button class="task-title" onclick={() => openTask(t)}>{t.title}</button>
              <div class="task-meta">
                {#if issueLabel(t.issue_id)}<span class="tag issue" title={issueLabel(t.issue_id)}>#{issues.find((i) => i.id === t.issue_id)?.number}</span>{/if}
                <span class="assignee-avatars">
                  {#each taskAssignees(t.id) as uid (uid)}
                    <button class="avatar tiny" title={memberName(uid)} onclick={() => openProfile(uid)}>
                      {#if avatarUrl(uid)}<img src={avatarUrl(uid)} alt="" />{:else}{initial(uid)}{/if}
                    </button>
                  {/each}
                </span>
              </div>
            </div>
            {#if expandedTask === t.id}
              <div class="task-detail">
                <div class="assign">
                  <span class="muted small">Assignees:</span>
                  {#each members as m (m.user_id)}
                    <button class="chip toggle" class:on={taskAssignees(t.id).includes(m.user_id)} onclick={() => toggleAssignee(t, m.user_id)}>
                      {m.display_name?.trim() || m.username}
                    </button>
                  {/each}
                </div>
                <div class="comments">
                  {#each taskComments as c (c.id)}
                    <div class="comment">
                      <div class="c-head">
                        <button class="avatar tiny" title={memberName(c.author_id)} onclick={() => openProfile(c.author_id)}>
                          {#if avatarUrl(c.author_id)}<img src={avatarUrl(c.author_id)} alt="" />{:else}{initial(c.author_id)}{/if}
                        </button>
                        <button class="c-author link" onclick={() => openProfile(c.author_id)}>{memberName(c.author_id)}</button>
                        <span class="muted small">{time(c.created_at)}</span>
                      </div>
                      <div class="c-body">
                        {#each segments(c.body) as seg}
                          {#if seg.kind === "mention"}
                            <button class="tag mention" class:unknown={!seg.known} disabled={!seg.known} onclick={() => openProfile(memberByHandle(seg.value)?.user_id)} title="View profile">@{seg.value}</button>
                          {:else if seg.kind === "file"}
                            <button class="tag file" onclick={() => onOpenFile?.(seg.value)} title="Open file">#{seg.value}</button>
                          {:else}{seg.value}{/if}
                        {/each}
                      </div>
                    </div>
                  {/each}
                  <form class="comment-form" onsubmit={(e) => { e.preventDefault(); void sendTaskComment(t); }}>
                    <input bind:value={taskCommentDraft} placeholder="Comment…" />
                    <button class="ghost small" type="submit" disabled={taskCommentDraft.trim() === ""}>Send</button>
                  </form>
                </div>
                <div class="task-actions">
                  <button class="ghost small danger" onclick={() => removeTask(t.id)}>Delete task</button>
                </div>
              </div>
            {/if}
          </div>
        {/snippet}

        {#each openTasks as t (t.id)}
          {@render taskCard(t)}
        {/each}
        {#if openTasks.length === 0}<p class="muted empty">No open tasks.</p>{/if}

        {#if doneTasks.length > 0}
          <button class="ghost small archived-toggle" onclick={() => (showCompletedTasks = !showCompletedTasks)}>
            {showCompletedTasks ? "Hide" : "Show"} completed ({doneTasks.length})
          </button>
          {#if showCompletedTasks}
            {#each doneTasks as t (t.id)}
              {@render taskCard(t)}
            {/each}
          {/if}
        {/if}

        {#if archivedTasks.length > 0}
          <button class="ghost small archived-toggle" onclick={() => (showArchived = !showArchived)}>
            {showArchived ? "Hide" : "Show"} archived ({archivedTasks.length})
          </button>
          {#if showArchived}
            {#each archivedTasks as t (t.id)}
              <div class="task archived">
                <span class="task-title muted">{t.title}</span>
                {#if issueLabel(t.issue_id)}<span class="muted small">· issue closed</span>{/if}
                <button class="ghost small" onclick={() => setTaskStatus(t, "open")}>Restore</button>
              </div>
            {/each}
          {/if}
        {/if}
        {#if taskError}<p class="error">{taskError}</p>{/if}
      </div>
    {:else}
      <div class="todos">
        <form class="new-list" onsubmit={(e) => { e.preventDefault(); void addList(); }}>
          <input bind:value={newListTitle} placeholder="New to-do list…" />
          <select bind:value={newListIssue}>
            <option value="">No issue</option>
            {#each openIssues as i (i.id)}
              <option value={i.id}>#{i.number} {i.title}</option>
            {/each}
          </select>
          <button class="primary small" type="submit" disabled={newListTitle.trim() === ""}>Add list</button>
        </form>

        {#snippet todoCard(list: TodoList)}
          <div class="todo-list">
            <div class="list-head">
              <h4>{list.title}</h4>
              <div class="list-actions">
                <button class="ghost tiny" title="Assign members" onclick={() => (assignOpen = { ...assignOpen, [list.id]: !assignOpen[list.id] })}>People</button>
                <button class="ghost tiny danger" title="Delete" onclick={() => removeList(list.id)}>×</button>
              </div>
            </div>
            <div class="list-sub">
              {#if issueLabel(list.issue_id)}<span class="tag issue small" title={issueLabel(list.issue_id)}>#{issues.find((i) => i.id === list.issue_id)?.number}</span>{/if}
              {#if assigneesOf(list.id).length > 0}
                <span class="assignee-avatars">
                  {#each assigneesOf(list.id) as uid (uid)}
                    <button class="avatar tiny" title={memberName(uid)} onclick={() => openProfile(uid)}>
                      {#if avatarUrl(uid)}<img src={avatarUrl(uid)} alt="" />{:else}{initial(uid)}{/if}
                    </button>
                  {/each}
                </span>
              {/if}
            </div>
            {#if assignOpen[list.id]}
              <div class="assign">
                <span class="muted small">Assignees:</span>
                {#each members as m (m.user_id)}
                  <button class="chip toggle" class:on={assigneesOf(list.id).includes(m.user_id)} onclick={() => toggleListAssignee(list, m.user_id)}>
                    {m.display_name?.trim() || m.username}
                  </button>
                {/each}
              </div>
            {/if}
            <ul>
              {#each itemsOf(list.id) as item (item.id)}
                <li class:done={item.done}>
                  <input type="checkbox" checked={item.done} onchange={() => toggleItem(item)} />
                  <span>{item.body}</span>
                  <button class="x" onclick={() => removeItem(item.id)} title="Remove">×</button>
                </li>
              {/each}
            </ul>
            <form class="add-item" onsubmit={(e) => { e.preventDefault(); void addItem(list); }}>
              <input value={itemDraft[list.id] ?? ""} oninput={(e) => (itemDraft = { ...itemDraft, [list.id]: e.currentTarget.value })} placeholder="Add item…" />
            </form>
          </div>
        {/snippet}

        <div class="list-grid">
          {#each activeLists as list (list.id)}
            {@render todoCard(list)}
          {/each}
        </div>
        {#if activeLists.length === 0}<p class="muted empty">No to-do lists yet.</p>{/if}

        {#if completedLists.length > 0}
          <button class="ghost small archived-toggle" onclick={() => (showCompletedTodos = !showCompletedTodos)}>
            {showCompletedTodos ? "Hide" : "Show"} completed ({completedLists.length})
          </button>
          {#if showCompletedTodos}
            <div class="list-grid">
              {#each completedLists as list (list.id)}
                {@render todoCard(list)}
              {/each}
            </div>
          {/if}
        {/if}

        {#if archivedLists.length > 0}
          <button class="ghost small archived-toggle" onclick={() => (showArchivedTodos = !showArchivedTodos)}>
            {showArchivedTodos ? "Hide" : "Show"} archived ({archivedLists.length})
          </button>
          {#if showArchivedTodos}
            <div class="list-grid">
              {#each archivedLists as list (list.id)}
                <div class="todo-list archived">
                  <div class="list-head"><h4 class="muted">{list.title}</h4>
                    <button class="ghost tiny" onclick={() => archiveList(list, false)}>Restore</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
        {#if todoError}<p class="error">{todoError}</p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .sub {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 18px;
  }
  .sub button {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 8px 12px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
  }
  .sub button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .notice {
    padding: 24px 0;
    text-align: center;
    line-height: 1.5;
  }
  .empty {
    padding: 12px 0;
    font-size: 13px;
  }
  .empty.center {
    text-align: center;
    padding: 40px 0;
  }
  .hint {
    font-size: 11px;
    padding: 6px 2px;
  }

  /* Chats */
  .chats {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 16px;
    min-height: 420px;
  }
  .chat-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-right: 1px solid var(--border);
    padding-right: 12px;
  }
  .chat-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-radius: 8px;
    padding: 7px 9px;
    text-align: left;
    font-size: 13px;
    color: var(--text);
  }
  .chat-item:hover {
    background: var(--surface-2);
  }
  .chat-item.active {
    background: var(--surface-2);
    font-weight: 600;
  }
  .hash {
    color: var(--text-muted);
  }
  .chat-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .del {
    color: var(--text-muted);
    padding: 0 4px;
  }
  .del:hover {
    color: var(--danger, #f87171);
  }
  .new-chat,
  .composer,
  .comment-form,
  .add-item,
  .new-task,
  .new-list {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .new-chat input,
  .composer input {
    flex: 1;
    min-width: 0;
  }
  .chat-main {
    display: flex;
    flex-direction: column;
    min-height: 420px;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 460px;
    padding-right: 6px;
  }
  .msg {
    display: flex;
    gap: 10px;
  }
  .avatar {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border: none;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--accent);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .avatar:hover {
    filter: brightness(1.08);
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }
  .avatar.tiny {
    width: 20px;
    height: 20px;
    font-size: 10px;
  }
  .avatar.tiny + .avatar.tiny {
    margin-left: -6px;
  }
  .msg-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .msg-author {
    font-weight: 600;
    font-size: 13px;
  }
  .msg-author.link,
  .c-author.link {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--text);
    cursor: pointer;
  }
  .msg-author.link:hover,
  .c-author.link:hover {
    text-decoration: underline;
    color: var(--accent);
  }
  .msg-time {
    font-size: 11px;
  }
  .msg-text {
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tag {
    font-weight: 600;
  }
  .tag.mention,
  .tag.file {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-radius: 5px;
    padding: 0 4px;
  }
  .tag.mention,
  .tag.file {
    border: none;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .tag.mention:hover:not(:disabled),
  .tag.file:hover {
    text-decoration: underline;
  }
  .tag.mention.unknown {
    color: var(--text-muted);
    background: transparent;
    cursor: default;
  }

  /* Tasks */
  .task {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .task.done .task-title {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .task-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .task-title {
    flex: 1;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }
  .task-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .assignee-avatars {
    display: flex;
  }
  .tag.issue {
    font-size: 11px;
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: 20px;
    padding: 1px 7px;
  }
  .task-detail {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .assign {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .chip {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 12px;
    color: var(--text);
  }
  .chip.toggle.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .comment {
    font-size: 13px;
    margin-bottom: 8px;
  }
  .c-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 2px;
  }
  .c-author {
    font-weight: 600;
  }
  .c-body {
    margin-left: 27px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .list-sub {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0;
    min-height: 20px;
  }
  .small {
    font-size: 12px;
  }
  .archived-toggle {
    margin-top: 6px;
  }
  .task.archived {
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0.75;
  }

  /* To-dos */
  .list-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
    margin-top: 10px;
  }
  .todo-list {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
  }
  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .list-head h4 {
    font-size: 14px;
  }
  .list-actions {
    display: flex;
    gap: 4px;
  }
  .todo-list ul {
    list-style: none;
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .todo-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .todo-list li.done span {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .todo-list li span {
    flex: 1;
  }
  .x {
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 0 4px;
  }
  .x:hover {
    color: var(--danger, #f87171);
  }
  .tiny {
    font-size: 11px;
    padding: 3px 7px;
  }
  .danger {
    color: var(--danger, #f87171);
  }

  @media (max-width: 720px) {
    .chats {
      grid-template-columns: 1fr;
    }
    .chat-list {
      border-right: none;
      border-bottom: 1px solid var(--border);
      padding-right: 0;
      padding-bottom: 12px;
    }
  }
</style>
