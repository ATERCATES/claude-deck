import { getDb } from "./index";
import type {
  Session,
  Group,
  Project,
  ProjectDevServer,
  ProjectRepository,
  DevServer,
  User,
  AuthSession,
} from "./types";

function query<T>(sql: string, params: unknown[] = []): T[] {
  return getDb()
    .prepare(sql)
    .all(...params) as T[];
}

function queryOne<T>(sql: string, params: unknown[] = []): T | null {
  return (
    (getDb()
      .prepare(sql)
      .get(...params) as T) ?? null
  );
}

function execute(sql: string, params: unknown[] = []): void {
  getDb()
    .prepare(sql)
    .run(...params);
}

export const queries = {
  createSession: (
    id: string,
    name: string,
    tmuxName: string | null,
    workingDirectory: string,
    parentSessionId: string | null,
    model: string | null,
    systemPrompt: string | null,
    groupPath: string,
    agentType: string,
    autoApprove: boolean,
    projectId: string | null
  ) =>
    execute(
      `INSERT INTO sessions (id, name, tmux_name, working_directory, parent_session_id, model, system_prompt, group_path, agent_type, auto_approve, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        tmuxName,
        workingDirectory,
        parentSessionId,
        model,
        systemPrompt,
        groupPath,
        agentType,
        autoApprove ? 1 : 0,
        projectId,
      ]
    ),

  getSession: (id: string) =>
    queryOne<Session>("SELECT * FROM sessions WHERE id = ?", [id]),

  getAllSessions: () =>
    query<Session>("SELECT * FROM sessions ORDER BY updated_at DESC"),

  updateSessionStatus: (status: string, id: string) =>
    execute(
      "UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?",
      [status, id]
    ),

  updateSessionClaudeId: (claudeSessionId: string, id: string) =>
    execute(
      "UPDATE sessions SET claude_session_id = ?, updated_at = datetime('now') WHERE id = ?",
      [claudeSessionId, id]
    ),

  updateSessionName: (name: string, tmuxName: string, id: string) =>
    execute(
      "UPDATE sessions SET name = ?, tmux_name = ?, updated_at = datetime('now') WHERE id = ?",
      [name, tmuxName, id]
    ),

  deleteSession: (id: string) =>
    execute("DELETE FROM sessions WHERE id = ?", [id]),

  updateSessionWorktree: (
    worktreePath: string | null,
    branchName: string | null,
    baseBranch: string | null,
    port: number | null,
    id: string
  ) =>
    execute(
      "UPDATE sessions SET worktree_path = ?, branch_name = ?, base_branch = ?, dev_server_port = ?, updated_at = datetime('now') WHERE id = ?",
      [worktreePath, branchName, baseBranch, port, id]
    ),

  updateSessionPR: (
    prUrl: string | null,
    prNumber: number | null,
    prStatus: string | null,
    id: string
  ) =>
    execute(
      "UPDATE sessions SET pr_url = ?, pr_number = ?, pr_status = ?, updated_at = datetime('now') WHERE id = ?",
      [prUrl, prNumber, prStatus, id]
    ),

  updateSessionGroup: (groupPath: string, id: string) =>
    execute(
      "UPDATE sessions SET group_path = ?, updated_at = datetime('now') WHERE id = ?",
      [groupPath, id]
    ),

  getSessionsByGroup: (groupPath: string) =>
    query<Session>(
      "SELECT * FROM sessions WHERE group_path = ? ORDER BY updated_at DESC",
      [groupPath]
    ),

  moveSessionsToGroup: (newGroupPath: string, oldGroupPath: string) =>
    execute(
      "UPDATE sessions SET group_path = ?, updated_at = datetime('now') WHERE group_path = ?",
      [newGroupPath, oldGroupPath]
    ),

  updateSessionProject: (projectId: string, id: string) =>
    execute(
      "UPDATE sessions SET project_id = ?, updated_at = datetime('now') WHERE id = ?",
      [projectId, id]
    ),

  getSessionsByProject: (projectId: string) =>
    query<Session>(
      "SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC",
      [projectId]
    ),

  getWorkersByConductor: (conductorId: string) =>
    query<Session>(
      "SELECT * FROM sessions WHERE conductor_session_id = ? ORDER BY created_at ASC",
      [conductorId]
    ),

  updateWorkerStatus: (workerStatus: string, id: string) =>
    execute(
      "UPDATE sessions SET worker_status = ?, updated_at = datetime('now') WHERE id = ?",
      [workerStatus, id]
    ),

  createWorkerSession: (
    id: string,
    name: string,
    tmuxName: string,
    workingDirectory: string,
    conductorSessionId: string,
    workerTask: string,
    model: string | null,
    groupPath: string,
    agentType: string,
    projectId: string | null
  ) =>
    execute(
      `INSERT INTO sessions (id, name, tmux_name, working_directory, conductor_session_id, worker_task, worker_status, model, group_path, agent_type, project_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        id,
        name,
        tmuxName,
        workingDirectory,
        conductorSessionId,
        workerTask,
        model,
        groupPath,
        agentType,
        projectId,
      ]
    ),

  getAllGroups: () =>
    query<Group>("SELECT * FROM groups ORDER BY sort_order ASC, name ASC"),

  getGroup: (path: string) =>
    queryOne<Group>("SELECT * FROM groups WHERE path = ?", [path]),

  createGroup: (path: string, name: string, sortOrder: number) =>
    execute("INSERT INTO groups (path, name, sort_order) VALUES (?, ?, ?)", [
      path,
      name,
      sortOrder,
    ]),

  updateGroupName: (name: string, path: string) =>
    execute("UPDATE groups SET name = ? WHERE path = ?", [name, path]),

  updateGroupExpanded: (expanded: boolean, path: string) =>
    execute("UPDATE groups SET expanded = ? WHERE path = ?", [
      expanded ? 1 : 0,
      path,
    ]),

  updateGroupOrder: (sortOrder: number, path: string) =>
    execute("UPDATE groups SET sort_order = ? WHERE path = ?", [
      sortOrder,
      path,
    ]),

  deleteGroup: (path: string) =>
    execute("DELETE FROM groups WHERE path = ?", [path]),

  createProject: (
    id: string,
    name: string,
    workingDirectory: string,
    agentType: string,
    defaultModel: string,
    initialPrompt: string | null,
    sortOrder: number
  ) =>
    execute(
      `INSERT INTO projects (id, name, working_directory, agent_type, default_model, initial_prompt, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        workingDirectory,
        agentType,
        defaultModel,
        initialPrompt,
        sortOrder,
      ]
    ),

  getProject: (id: string) =>
    queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]),

  getAllProjects: () =>
    query<Project>(
      "SELECT * FROM projects ORDER BY is_uncategorized ASC, sort_order ASC, name ASC"
    ),

  updateProject: (
    name: string,
    workingDirectory: string,
    agentType: string,
    defaultModel: string,
    initialPrompt: string | null,
    id: string
  ) =>
    execute(
      "UPDATE projects SET name = ?, working_directory = ?, agent_type = ?, default_model = ?, initial_prompt = ?, updated_at = datetime('now') WHERE id = ?",
      [name, workingDirectory, agentType, defaultModel, initialPrompt, id]
    ),

  updateProjectExpanded: (expanded: boolean, id: string) =>
    execute("UPDATE projects SET expanded = ? WHERE id = ?", [
      expanded ? 1 : 0,
      id,
    ]),

  updateProjectOrder: (sortOrder: number, id: string) =>
    execute("UPDATE projects SET sort_order = ? WHERE id = ?", [sortOrder, id]),

  deleteProject: (id: string) =>
    execute("DELETE FROM projects WHERE id = ? AND is_uncategorized = 0", [id]),

  createProjectDevServer: (
    id: string,
    projectId: string,
    name: string,
    type: string,
    command: string,
    port: number | null,
    portEnvVar: string | null,
    sortOrder: number
  ) =>
    execute(
      `INSERT INTO project_dev_servers (id, project_id, name, type, command, port, port_env_var, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, name, type, command, port, portEnvVar, sortOrder]
    ),

  getProjectDevServer: (id: string) =>
    queryOne<ProjectDevServer>(
      "SELECT * FROM project_dev_servers WHERE id = ?",
      [id]
    ),

  getProjectDevServers: (projectId: string) =>
    query<ProjectDevServer>(
      "SELECT * FROM project_dev_servers WHERE project_id = ? ORDER BY sort_order ASC",
      [projectId]
    ),

  updateProjectDevServer: (
    name: string,
    type: string,
    command: string,
    port: number | null,
    portEnvVar: string | null,
    sortOrder: number,
    id: string
  ) =>
    execute(
      "UPDATE project_dev_servers SET name = ?, type = ?, command = ?, port = ?, port_env_var = ?, sort_order = ? WHERE id = ?",
      [name, type, command, port, portEnvVar, sortOrder, id]
    ),

  deleteProjectDevServer: (id: string) =>
    execute("DELETE FROM project_dev_servers WHERE id = ?", [id]),

  deleteProjectDevServers: (projectId: string) =>
    execute("DELETE FROM project_dev_servers WHERE project_id = ?", [
      projectId,
    ]),

  createProjectRepository: (
    id: string,
    projectId: string,
    name: string,
    path: string,
    isPrimary: boolean,
    sortOrder: number
  ) =>
    execute(
      `INSERT INTO project_repositories (id, project_id, name, path, is_primary, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, projectId, name, path, isPrimary ? 1 : 0, sortOrder]
    ),

  getProjectRepository: (id: string) =>
    queryOne<ProjectRepository>(
      "SELECT * FROM project_repositories WHERE id = ?",
      [id]
    ),

  getProjectRepositories: (projectId: string) =>
    query<ProjectRepository>(
      "SELECT * FROM project_repositories WHERE project_id = ? ORDER BY sort_order ASC",
      [projectId]
    ),

  updateProjectRepository: (
    name: string,
    path: string,
    isPrimary: boolean,
    sortOrder: number,
    id: string
  ) =>
    execute(
      "UPDATE project_repositories SET name = ?, path = ?, is_primary = ?, sort_order = ? WHERE id = ?",
      [name, path, isPrimary ? 1 : 0, sortOrder, id]
    ),

  deleteProjectRepository: (id: string) =>
    execute("DELETE FROM project_repositories WHERE id = ?", [id]),

  deleteProjectRepositories: (projectId: string) =>
    execute("DELETE FROM project_repositories WHERE project_id = ?", [
      projectId,
    ]),

  createDevServer: (
    id: string,
    projectId: string,
    type: string,
    name: string,
    command: string,
    status: string,
    pid: number | null,
    containerId: string | null,
    ports: string,
    workingDirectory: string
  ) =>
    execute(
      `INSERT INTO dev_servers (id, project_id, type, name, command, status, pid, container_id, ports, working_directory)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        type,
        name,
        command,
        status,
        pid,
        containerId,
        ports,
        workingDirectory,
      ]
    ),

  getDevServer: (id: string) =>
    queryOne<DevServer>("SELECT * FROM dev_servers WHERE id = ?", [id]),

  getAllDevServers: () =>
    query<DevServer>("SELECT * FROM dev_servers ORDER BY created_at DESC"),

  getDevServersByProject: (projectId: string) =>
    query<DevServer>(
      "SELECT * FROM dev_servers WHERE project_id = ? ORDER BY created_at DESC",
      [projectId]
    ),

  updateDevServerStatus: (status: string, id: string) =>
    execute(
      "UPDATE dev_servers SET status = ?, updated_at = datetime('now') WHERE id = ?",
      [status, id]
    ),

  updateDevServerPid: (pid: number | null, status: string, id: string) =>
    execute(
      "UPDATE dev_servers SET pid = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
      [pid, status, id]
    ),

  updateDevServer: (
    status: string,
    pid: number | null,
    containerId: string | null,
    ports: string,
    id: string
  ) =>
    execute(
      "UPDATE dev_servers SET status = ?, pid = ?, container_id = ?, ports = ?, updated_at = datetime('now') WHERE id = ?",
      [status, pid, containerId, ports, id]
    ),

  deleteDevServer: (id: string) =>
    execute("DELETE FROM dev_servers WHERE id = ?", [id]),

  deleteDevServersByProject: (projectId: string) =>
    execute("DELETE FROM dev_servers WHERE project_id = ?", [projectId]),

  getHiddenItems: (itemType: string) =>
    query<{ item_id: string }>(
      "SELECT item_id FROM hidden_items WHERE item_type = ?",
      [itemType]
    ),

  getAllHiddenItems: () =>
    query<{ item_type: string; item_id: string }>(
      "SELECT item_type, item_id FROM hidden_items"
    ),

  hideItem: (itemType: string, itemId: string) =>
    execute(
      "INSERT OR IGNORE INTO hidden_items (item_type, item_id) VALUES (?, ?)",
      [itemType, itemId]
    ),

  unhideItem: (itemType: string, itemId: string) =>
    execute("DELETE FROM hidden_items WHERE item_type = ? AND item_id = ?", [
      itemType,
      itemId,
    ]),

  getUserCount(): number {
    return (
      queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users") ?? {
        count: 0,
      }
    ).count;
  },

  getUserByUsername(username: string): User | null {
    return queryOne<User>("SELECT * FROM users WHERE username = ?", [username]);
  },

  getUserById(id: string): User | null {
    return queryOne<User>("SELECT * FROM users WHERE id = ?", [id]);
  },

  createUser(
    id: string,
    username: string,
    passwordHash: string,
    totpSecret: string | null
  ): void {
    execute(
      "INSERT INTO users (id, username, password_hash, totp_secret) VALUES (?, ?, ?, ?)",
      [id, username, passwordHash, totpSecret]
    );
  },

  getAuthSessionByToken(token: string): AuthSession | null {
    return queryOne<AuthSession>(
      "SELECT * FROM auth_sessions WHERE token = ?",
      [token]
    );
  },

  createAuthSession(
    id: string,
    token: string,
    userId: string,
    expiresAt: string
  ): void {
    execute(
      "INSERT INTO auth_sessions (id, token, user_id, expires_at) VALUES (?, ?, ?, ?)",
      [id, token, userId, expiresAt]
    );
  },

  renewAuthSession(token: string, expiresAt: string): void {
    execute("UPDATE auth_sessions SET expires_at = ? WHERE token = ?", [
      expiresAt,
      token,
    ]);
  },

  deleteAuthSession(token: string): void {
    execute("DELETE FROM auth_sessions WHERE token = ?", [token]);
  },

  deleteExpiredAuthSessions(): void {
    execute("DELETE FROM auth_sessions WHERE expires_at < datetime('now')");
  },
};
