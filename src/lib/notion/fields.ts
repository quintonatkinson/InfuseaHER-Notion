// Every Notion field name the app depends on lives here.
// If you rename a field in Notion, change it here too. If a name here
// doesn't match Notion, the app stops at startup and says which one.

export const TASK_FIELDS = {
  title: { name: "Task", types: ["title"] },
  status: { name: "Status", types: ["select", "status"] },
  priority: { name: "Priority", types: ["select"] },
  owner: { name: "Owner", types: ["select"] },
  effort: { name: "Effort", types: ["select"] },
  due: { name: "Due", types: ["date"] },
  notes: { name: "Notes", types: ["rich_text"] },
  project: { name: "Project", types: ["relation"] },
  blockedBy: { name: "Blocked by", types: ["relation"] },
  blocking: { name: "Blocking", types: ["relation"] },
  parent: { name: "Parent task", types: ["relation"] },
  subtasks: { name: "Sub-tasks", types: ["relation"] },
} as const;

export const PROJECT_FIELDS = {
  title: { name: "Project Name", types: ["title"] },
  status: { name: "Status", types: ["select", "status"] },
  priority: { name: "Priority", types: ["select"] },
  area: { name: "Area", types: ["select"] },
  targetDate: { name: "Target Date", types: ["date"] },
  summary: { name: "Summary", types: ["rich_text"] },
  tasks: { name: "Tasks", types: ["relation"] },
} as const;

// Option values the ranking rules depend on. If one of these is renamed
// in Notion the rules would silently go wrong, so startup checks them.
export const REQUIRED_OPTIONS = {
  tasks: {
    status: ["Done", "Waiting On"],
    effort: ["Quick"],
    priority: ["High", "Medium", "Low"],
  },
} as const;

export const STATUS_DONE = "Done";
export const STATUS_WAITING = "Waiting On";
export const EFFORT_QUICK = "Quick";
