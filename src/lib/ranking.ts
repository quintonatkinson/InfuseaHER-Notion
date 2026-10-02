// The ranking rules. Pure functions only: no Notion, no network, no AI.
// Same input always gives the same lists, which is what keeps the
// dashboard stable between page loads. Runs on the server and in the browser.

import { EFFORT_QUICK, STATUS_DONE, STATUS_WAITING } from "./notion/fields";
import type {
  Analysis,
  DashboardSettings,
  Objective,
  OwnerFilter,
  Project,
  Task,
  TaskInsight,
} from "./types";

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function isOpen(task: Task): boolean {
  return task.status !== STATUS_DONE;
}

// Priority (High, Medium, Low, blank), then due date (soonest first, none
// last), then oldest created, then ID so ties never flip between loads.
export function compareByUrgency(a: Task, b: Task): number {
  const pa = PRIORITY_ORDER[a.priority ?? ""] ?? 3;
  const pb = PRIORITY_ORDER[b.priority ?? ""] ?? 3;
  if (pa !== pb) return pa - pb;
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  if (a.createdTime !== b.createdTime) return a.createdTime < b.createdTime ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function addEdge(map: Map<string, Set<string>>, from: string, to: string) {
  let set = map.get(from);
  if (!set) map.set(from, (set = new Set()));
  set.add(to);
}

export function analyse(tasks: Task[], projects: Project[]): Analysis {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  // "A blocks B" edges. Notion pairs Blocking and Blocked by, but we read
  // both sides so a half-saved relation still counts. Links to pages we
  // didn't load (deleted, or outside the database) are ignored.
  const blocks = new Map<string, Set<string>>();
  const blockedBy = new Map<string, Set<string>>();
  const subtasks = new Map<string, Set<string>>();
  for (const t of tasks) {
    for (const b of t.blockingIds) {
      if (byId.has(b)) {
        addEdge(blocks, t.id, b);
        addEdge(blockedBy, b, t.id);
      }
    }
    for (const a of t.blockedByIds) {
      if (byId.has(a)) {
        addEdge(blocks, a, t.id);
        addEdge(blockedBy, t.id, a);
      }
    }
    for (const s of t.subtaskIds) if (byId.has(s)) addEdge(subtasks, t.id, s);
    for (const p of t.parentIds) if (byId.has(p)) addEdge(subtasks, p, t.id);
  }

  const openList = (ids: Set<string> | undefined) =>
    [...(ids ?? [])].map((id) => byId.get(id)!).filter(isOpen).sort(compareByUrgency);

  const insights: Record<string, TaskInsight> = {};
  for (const t of tasks) {
    const open = isOpen(t);
    const openBlockers = openList(blockedBy.get(t.id));
    const openSubs = openList(subtasks.get(t.id));

    let notActionableReason = "";
    if (!open) notActionableReason = "Done";
    else if (t.status === STATUS_WAITING) notActionableReason = "Waiting On";
    else if (openBlockers.length > 0)
      notActionableReason = `Blocked by ${openBlockers.map((b) => b.title).join(", ")}`;
    else if (openSubs.length > 0)
      notActionableReason = `Has ${openSubs.length} open sub-task${openSubs.length === 1 ? "" : "s"}`;

    // Walk "Blocking" outwards. The visited set means a cycle can't loop forever.
    const seen = new Set<string>([t.id]);
    const queue = [t.id];
    const downstream: Task[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      for (const next of blocks.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
        const nt = byId.get(next)!;
        if (isOpen(nt)) downstream.push(nt);
      }
    }
    downstream.sort(compareByUrgency);

    insights[t.id] = {
      task: t,
      projectNames: t.projectIds.map((id) => projectName.get(id)).filter((n): n is string => !!n),
      open,
      actionable: notActionableReason === "",
      notActionableReason,
      downstreamIds: downstream.map((d) => d.id),
      directlyUnlocksIds: openList(blocks.get(t.id)).map((d) => d.id),
      openBlockerIds: openBlockers.map((b) => b.id),
      openSubtaskIds: openSubs.map((s) => s.id),
    };
  }

  return { insights, cycles: findCycles(tasks.filter(isOpen), blocks, byId) };
}

// Tarjan's strongly-connected-components over open tasks. Any group of two
// or more tasks that block each other (or one that blocks itself) is a cycle.
function findCycles(
  open: Task[],
  blocks: Map<string, Set<string>>,
  byId: Map<string, Task>,
): string[][] {
  const openIds = new Set(open.map((t) => t.id));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  // Iterative version so a long chain can't overflow the call stack.
  for (const start of [...openIds].sort()) {
    if (index.has(start)) continue;
    const work: { id: string; next: string[]; i: number }[] = [];
    const enter = (id: string) => {
      index.set(id, counter);
      low.set(id, counter);
      counter++;
      stack.push(id);
      onStack.add(id);
      work.push({ id, next: [...(blocks.get(id) ?? [])].filter((n) => openIds.has(n)).sort(), i: 0 });
    };
    enter(start);
    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.next.length) {
        const n = frame.next[frame.i++];
        if (!index.has(n)) enter(n);
        else if (onStack.has(n)) low.set(frame.id, Math.min(low.get(frame.id)!, index.get(n)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        const component: string[] = [];
        let id: string;
        do {
          id = stack.pop()!;
          onStack.delete(id);
          component.push(id);
        } while (id !== frame.id);
        const selfLoop = component.length === 1 && (blocks.get(frame.id)?.has(frame.id) ?? false);
        if (component.length > 1 || selfLoop) {
          cycles.push(component.map((c) => byId.get(c)!.title).sort());
        }
      }
    }
  }
  return cycles;
}

export interface ListOptions {
  owner: OwnerFilter;
  settings: DashboardSettings;
  today: string; // YYYY-MM-DD, used for snoozes
}

export interface DashboardLists {
  chokepointIds: string[];
  quickWinIds: string[];
  objectives: Objective[];
  waitingOnIds: string[];
  pinnedIds: string[];
}

function matchesOwner(task: Task, owner: OwnerFilter): boolean {
  return owner === "Everyone" || task.owner === owner;
}

function isQuickWin(i: TaskInsight): boolean {
  return i.actionable && i.task.effort === EFFORT_QUICK && i.downstreamIds.length === 0;
}

function isChokepoint(i: TaskInsight): boolean {
  return i.actionable && i.downstreamIds.length > 0;
}

export function selectLists(analysis: Analysis, opts: ListOptions): DashboardLists {
  const { owner, settings, today } = opts;
  const hidden = new Set(settings.hiddenProjectIds);
  const all = Object.values(analysis.insights);

  const visible = (i: TaskInsight) =>
    i.open &&
    matchesOwner(i.task, owner) &&
    !(settings.snoozed[i.task.id] && settings.snoozed[i.task.id] > today) &&
    !i.task.projectIds.some((p) => hidden.has(p));

  const candidates = all.filter(visible);

  const chokepoints = candidates.filter(isChokepoint).sort((a, b) => {
    const d = b.downstreamIds.length - a.downstreamIds.length;
    return d !== 0 ? d : compareByUrgency(a.task, b.task);
  });
  const quickWins = candidates.filter(isQuickWin).sort((a, b) => compareByUrgency(a.task, b.task));

  // Pinned tasks go to the top of the list they belong to, in the order
  // they were pinned. One that fits neither list (say it's blocked) goes
  // to the top of Chokepoints so it is still seen.
  const pinned = settings.pinnedIds
    .map((id) => analysis.insights[id])
    .filter((i): i is TaskInsight => !!i && visible(i));
  const pinnedQuick = pinned.filter(isQuickWin);
  const pinnedChoke = pinned.filter((i) => !isQuickWin(i));
  const pinnedSet = new Set(pinned.map((i) => i.task.id));

  const fill = (pins: TaskInsight[], rest: TaskInsight[]) =>
    [...pins, ...rest.filter((i) => !pinnedSet.has(i.task.id))]
      .slice(0, Math.max(settings.listSize, pins.length))
      .map((i) => i.task.id);

  const objectives: Objective[] = all
    .filter((i) => i.open && i.task.subtaskIds.length + i.openSubtaskIds.length > 0)
    .map((i) => objectiveFor(analysis, i))
    .filter((o) => {
      if (owner === "Everyone") return true;
      const parent = analysis.insights[o.parentId].task;
      return (
        parent.owner === owner ||
        analysis.insights[o.parentId].openSubtaskIds.some((s) => analysis.insights[s].task.owner === owner)
      );
    })
    .sort((a, b) => compareByUrgency(analysis.insights[a.parentId].task, analysis.insights[b.parentId].task));

  const waitingOnIds = all
    .filter((i) => i.open && i.task.status === STATUS_WAITING && matchesOwner(i.task, owner))
    .sort((a, b) => compareByUrgency(a.task, b.task))
    .map((i) => i.task.id);

  return {
    chokepointIds: fill(pinnedChoke, chokepoints),
    quickWinIds: fill(pinnedQuick, quickWins),
    objectives,
    waitingOnIds,
    pinnedIds: [...pinnedSet],
  };
}

function objectiveFor(analysis: Analysis, parent: TaskInsight): Objective {
  const subIds = new Set([...parent.task.subtaskIds, ...parent.openSubtaskIds]);
  // Also count sub-tasks that point at this parent but aren't listed on it.
  for (const i of Object.values(analysis.insights)) {
    if (i.task.parentIds.includes(parent.task.id)) subIds.add(i.task.id);
  }
  const subs = [...subIds].map((id) => analysis.insights[id]).filter((i): i is TaskInsight => !!i);
  const done = subs.filter((s) => !s.open).length;

  // Next sub-task: something you can do now if there is one; otherwise the
  // open one with the fewest blockers, i.e. the next link in the chain.
  const next = subs
    .filter((s) => s.open)
    .sort((a, b) => {
      if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
      const aw = a.task.status === STATUS_WAITING ? 1 : 0;
      const bw = b.task.status === STATUS_WAITING ? 1 : 0;
      if (aw !== bw) return aw - bw;
      const d = a.openBlockerIds.length - b.openBlockerIds.length;
      return d !== 0 ? d : compareByUrgency(a.task, b.task);
    })[0];

  return {
    parentId: parent.task.id,
    done,
    total: subs.length,
    nextSubtaskId: next?.task.id ?? null,
    nextIsBlocked: next ? !next.actionable : false,
  };
}

// One line saying why a task is on the list.
export function explain(i: TaskInsight, list: "chokepoint" | "quickwin"): string {
  const parts: string[] = [];
  if (list === "chokepoint") {
    const n = i.downstreamIds.length;
    if (n > 0) parts.push(n === 1 ? "1 open task waits on this" : `${n} open tasks wait on this`);
  } else {
    parts.push("Quick, nothing waits on it");
  }
  if (i.task.priority) parts.push(`${i.task.priority} priority`);
  if (!i.actionable) parts.push(i.notActionableReason);
  return parts.join(" · ");
}
