// Plain data shapes shared by the server and the browser.
// IDs are always Notion page IDs, lowercase, without dashes.

export interface Task {
  id: string;
  url: string;
  title: string;
  status: string | null;
  priority: string | null;
  owner: string | null;
  effort: string | null;
  due: string | null; // ISO date (YYYY-MM-DD or full datetime)
  notes: string;
  createdTime: string; // ISO datetime
  projectIds: string[];
  blockedByIds: string[];
  blockingIds: string[];
  parentIds: string[];
  subtaskIds: string[];
}

export interface Project {
  id: string;
  url: string;
  name: string;
  status: string | null;
  priority: string | null;
  area: string | null;
}

export type OwnerFilter = "Everyone" | "Quinton" | "Chelsey";

// One task as the dashboard sees it, with the facts behind its ranking.
export interface TaskInsight {
  task: Task;
  projectNames: string[];
  open: boolean;
  actionable: boolean;
  // Why it isn't actionable, in plain words (empty when actionable).
  notActionableReason: string;
  // Every open task that sits behind this one, following "Blocking" transitively.
  downstreamIds: string[];
  // Open tasks this one directly blocks, most important first.
  directlyUnlocksIds: string[];
  // Open tasks currently blocking this one.
  openBlockerIds: string[];
  openSubtaskIds: string[];
}

export interface Objective {
  parentId: string;
  done: number;
  total: number;
  nextSubtaskId: string | null;
  nextIsBlocked: boolean;
}

export interface Analysis {
  insights: Record<string, TaskInsight>;
  // Task names forming each dependency cycle found.
  cycles: string[][];
}

export interface DashboardSettings {
  defaultOwner: OwnerFilter;
  listSize: number;
  pinnedIds: string[];
  snoozed: Record<string, string>; // task id -> ISO date it comes back
  hiddenProjectIds: string[];
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  defaultOwner: "Everyone",
  listSize: 5,
  pinnedIds: [],
  snoozed: {},
  hiddenProjectIds: [],
};

// What the server sends to the browser.
export interface DashboardPayload {
  generatedAt: string;
  tasks: Task[];
  projects: Project[];
  schemaWarnings: string[];
}

export interface DashboardResponse {
  data: DashboardPayload | null;
  // True when Notion could not be reached and `data` is an older copy.
  stale: boolean;
  error: { source: "notion" | "config"; message: string } | null;
}
