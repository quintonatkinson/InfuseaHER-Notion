import { describe, expect, it } from "vitest";
import { analyse, selectLists, type ListOptions } from "../src/lib/ranking";
import { DEFAULT_SETTINGS, type Task } from "../src/lib/types";
import * as live from "./fixtures/live-2026-10-02";

const TODAY = "2026-10-02";

function opts(over: Partial<ListOptions> = {}): ListOptions {
  return { owner: "Everyone", settings: DEFAULT_SETTINGS, today: TODAY, ...over };
}

let seq = 0;
function task(id: string, over: Partial<Task> = {}): Task {
  seq++;
  return {
    id,
    url: "",
    title: id,
    status: "Not Started",
    priority: "Medium",
    owner: "Quinton",
    effort: "Medium",
    due: null,
    notes: "",
    createdTime: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    projectIds: [],
    blockedByIds: [],
    blockingIds: [],
    parentIds: [],
    subtaskIds: [],
    ...over,
  };
}

// Builds tasks where each pair [a, b] means "a blocks b", filling both sides.
function chain(tasks: Task[], edges: [string, string][]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const [a, b] of edges) {
    byId.get(a)!.blockingIds.push(b);
    byId.get(b)!.blockedByIds.push(a);
  }
  return tasks;
}

function lists(tasks: Task[], o: Partial<ListOptions> = {}) {
  const analysis = analyse(tasks, []);
  return { analysis, ...selectLists(analysis, opts(o)) };
}

describe("blocked tasks", () => {
  it("a task blocked by an open task is not actionable", () => {
    const t = chain([task("a"), task("b", { effort: "Quick" })], [["a", "b"]]);
    const r = lists(t);
    expect(r.analysis.insights.b.actionable).toBe(false);
    expect(r.analysis.insights.b.notActionableReason).toBe("Blocked by a");
    expect(r.quickWinIds).not.toContain("b");
  });

  it("becomes actionable once every blocker is Done", () => {
    const t = chain(
      [task("a", { status: "Done" }), task("c", { status: "Done" }), task("b", { effort: "Quick" })],
      [["a", "b"], ["c", "b"]],
    );
    const r = lists(t);
    expect(r.analysis.insights.b.actionable).toBe(true);
    expect(r.quickWinIds).toEqual(["b"]);
  });

  it("counts a relation even if only one side was saved", () => {
    const t = [task("a"), task("b", { blockedByIds: ["a"] })];
    const r = lists(t);
    expect(r.analysis.insights.a.downstreamIds).toEqual(["b"]);
    expect(r.analysis.insights.b.actionable).toBe(false);
  });

  it("ignores links to tasks that aren't loaded (e.g. deleted)", () => {
    const r = lists([task("b", { blockedByIds: ["gone"], effort: "Quick" })]);
    expect(r.analysis.insights.b.actionable).toBe(true);
  });
});

describe("transitive downstream counts", () => {
  it("counts every open task behind a chokepoint, not just direct ones", () => {
    const t = chain([task("a"), task("b"), task("c"), task("d")], [["a", "b"], ["b", "c"], ["c", "d"]]);
    const r = lists(t);
    expect(r.analysis.insights.a.downstreamIds.sort()).toEqual(["b", "c", "d"]);
    expect(r.analysis.insights.a.directlyUnlocksIds).toEqual(["b"]);
    expect(r.chokepointIds).toEqual(["a"]);
  });

  it("counts a shared downstream task once (diamond)", () => {
    const t = chain([task("a"), task("b"), task("c"), task("d")], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    expect(lists(t).analysis.insights.a.downstreamIds).toHaveLength(3);
  });

  it("does not count Done tasks downstream but still walks through them", () => {
    const t = chain([task("a"), task("b", { status: "Done" }), task("c")], [["a", "b"], ["b", "c"]]);
    expect(lists(t).analysis.insights.a.downstreamIds).toEqual(["c"]);
  });

  it("counts Waiting On tasks downstream (they are still open)", () => {
    const t = chain([task("a"), task("b", { status: "Waiting On" })], [["a", "b"]]);
    expect(lists(t).analysis.insights.a.downstreamIds).toEqual(["b"]);
  });

  it("sorts by count, then priority, then due date, then oldest created", () => {
    const t = chain(
      [
        task("one-low", { priority: "Low" }),
        task("two", { priority: "Low" }),
        task("one-high-late", { priority: "High", due: "2026-12-01" }),
        task("one-high-soon", { priority: "High", due: "2026-11-01" }),
        task("one-high-nodue-old", { priority: "High" }),
        task("one-high-nodue-new", { priority: "High" }),
        task("x1"), task("x2"), task("x3"), task("x4"), task("x5"), task("x6"), task("x7"),
      ],
      [
        ["one-low", "x1"],
        ["two", "x2"], ["two", "x3"],
        ["one-high-late", "x4"],
        ["one-high-soon", "x5"],
        ["one-high-nodue-old", "x6"],
        ["one-high-nodue-new", "x7"],
      ],
    );
    const r = lists(t, { settings: { ...DEFAULT_SETTINGS, listSize: 10 } });
    expect(r.chokepointIds).toEqual([
      "two",
      "one-high-soon",
      "one-high-late",
      "one-high-nodue-old",
      "one-high-nodue-new",
      "one-low",
    ]);
  });
});

describe("parents with sub-tasks", () => {
  function family(childStatuses: string[]) {
    const kids = childStatuses.map((s, i) => task(`k${i}`, { status: s, parentIds: ["p"], effort: "Quick" }));
    const parent = task("p", { effort: "Quick", subtaskIds: kids.map((k) => k.id) });
    return [parent, ...kids];
  }

  it("a parent with open sub-tasks is not actionable; its sub-task is", () => {
    const r = lists(family(["Not Started", "Done"]));
    expect(r.analysis.insights.p.actionable).toBe(false);
    expect(r.quickWinIds).toEqual(["k0"]);
  });

  it("a parent whose sub-tasks are all Done becomes actionable", () => {
    const r = lists(family(["Done", "Done"]));
    expect(r.analysis.insights.p.actionable).toBe(true);
    expect(r.quickWinIds).toEqual(["p"]);
  });

  it("shows the parent under Objectives with progress and the next sub-task", () => {
    const t = chain(
      [
        task("p", { title: "Acquire an NP", subtaskIds: ["s1", "s2", "s3"] }),
        task("s1", { parentIds: ["p"], status: "Done" }),
        task("s2", { parentIds: ["p"] }),
        task("s3", { parentIds: ["p"] }),
      ],
      [["s1", "s2"], ["s2", "s3"]],
    );
    const r = lists(t);
    expect(r.objectives).toEqual([{ parentId: "p", done: 1, total: 3, nextSubtaskId: "s2", nextIsBlocked: false }]);
  });

  it("names the next link in the chain even when nothing is actionable", () => {
    const t = chain(
      [
        task("blocker"),
        task("p", { subtaskIds: ["s1", "s2"] }),
        task("s1", { parentIds: ["p"] }),
        task("s2", { parentIds: ["p"] }),
      ],
      [["blocker", "s1"], ["s1", "s2"]],
    );
    const o = lists(t).objectives[0];
    expect(o.nextSubtaskId).toBe("s1");
    expect(o.nextIsBlocked).toBe(true);
  });
});

describe("Waiting On", () => {
  it("is never actionable, even when unblocked and quick", () => {
    const r = lists([task("w", { status: "Waiting On", effort: "Quick" })]);
    expect(r.analysis.insights.w.actionable).toBe(false);
    expect(r.quickWinIds).toEqual([]);
    expect(r.waitingOnIds).toEqual(["w"]);
  });

  it("a Waiting On chokepoint is excluded but still blocks what's behind it", () => {
    const t = chain([task("w", { status: "Waiting On" }), task("b", { effort: "Quick" })], [["w", "b"]]);
    const r = lists(t);
    expect(r.chokepointIds).toEqual([]);
    expect(r.analysis.insights.b.actionable).toBe(false);
  });
});

describe("cycles", () => {
  it("reports a cycle by name and doesn't crash or loop", () => {
    const t = chain(
      [task("a", { title: "Alpha" }), task("b", { title: "Beta" }), task("c", { title: "Gamma" }), task("d")],
      [["a", "b"], ["b", "c"], ["c", "a"], ["c", "d"]],
    );
    const r = lists(t);
    expect(r.analysis.cycles).toEqual([["Alpha", "Beta", "Gamma"]]);
    // All three block each other, so none is actionable.
    expect(r.chokepointIds).toEqual([]);
    expect(r.analysis.insights.a.downstreamIds.sort()).toEqual(["b", "c", "d"]);
  });

  it("reports a task that blocks itself", () => {
    const t = chain([task("a", { title: "Self" })], [["a", "a"]]);
    expect(lists(t).analysis.cycles).toEqual([["Self"]]);
  });

  it("ignores a cycle that runs through a Done task", () => {
    const t = chain([task("a"), task("b", { status: "Done" })], [["a", "b"], ["b", "a"]]);
    expect(lists(t).analysis.cycles).toEqual([]);
  });
});

describe("lists", () => {
  it("quick wins exclude anything with tasks downstream (those are chokepoints)", () => {
    const t = chain([task("a", { effort: "Quick" }), task("b")], [["a", "b"]]);
    const r = lists(t);
    expect(r.chokepointIds).toEqual(["a"]);
    expect(r.quickWinIds).toEqual([]);
  });

  it("filters by owner; Claude's tasks only show under Everyone", () => {
    const t = [
      task("q", { owner: "Quinton", effort: "Quick" }),
      task("c", { owner: "Chelsey", effort: "Quick" }),
      task("ai", { owner: "Claude", effort: "Quick" }),
    ];
    expect(lists(t).quickWinIds.sort()).toEqual(["ai", "c", "q"]);
    expect(lists(t, { owner: "Chelsey" }).quickWinIds).toEqual(["c"]);
    expect(lists(t, { owner: "Quinton" }).quickWinIds).toEqual(["q"]);
  });

  it("applies pins, snoozes, hidden projects and list size", () => {
    const t = [
      task("a", { effort: "Quick", priority: "High" }),
      task("b", { effort: "Quick" }),
      task("c", { effort: "Quick", priority: "Low" }),
      task("snoozed", { effort: "Quick", priority: "High" }),
      task("hidden", { effort: "Quick", priority: "High", projectIds: ["ig"] }),
      task("blocked-pin"),
      task("x"),
    ];
    chain(t, [["x", "blocked-pin"]]);
    const settings = {
      ...DEFAULT_SETTINGS,
      listSize: 2,
      pinnedIds: ["c", "blocked-pin"],
      snoozed: { snoozed: "2026-10-05" },
      hiddenProjectIds: ["ig"],
    };
    const r = lists(t, { settings });
    expect(r.quickWinIds).toEqual(["c", "a"]);
    expect(r.chokepointIds).toEqual(["blocked-pin", "x"]);
    // Snooze expires on its date.
    const later = lists(t, { settings: { ...settings, listSize: 3 }, today: "2026-10-05" });
    expect(later.quickWinIds).toEqual(["c", "a", "snoozed"]);
  });
});

describe("live Notion snapshot (2026-10-02)", () => {
  const analysis = analyse(live.tasks, live.projects);
  const r = selectLists(analysis, opts());
  const title = (id: string) => analysis.insights[id].task.title;

  it("has unique IDs", () => {
    expect(new Set(live.tasks.map((t) => t.id)).size).toBe(live.tasks.length);
  });

  it("puts 'Draft the NP recruitment message' first with four open tasks behind it", () => {
    expect(title(r.chokepointIds[0])).toBe("Draft the NP recruitment message");
    expect(analysis.insights[r.chokepointIds[0]].downstreamIds).toHaveLength(4);
    expect(title(analysis.insights[r.chokepointIds[0]].directlyUnlocksIds[0])).toBe("Post the NP recruitment message");
  });

  it("puts 'Find and retain an accountant' second with three", () => {
    expect(title(r.chokepointIds[1])).toBe("Find and retain an accountant");
    expect(analysis.insights[r.chokepointIds[1]].downstreamIds).toHaveLength(3);
  });

  it("excludes the offers landing page review because it is Waiting On", () => {
    const offers = live.tasks.find((t) => t.title === "Review and edit the offers landing page content")!;
    expect(analysis.insights[offers.id].downstreamIds).toHaveLength(3);
    expect(r.chokepointIds).not.toContain(offers.id);
    expect(r.waitingOnIds).toContain(offers.id);
  });

  it("matches the full expected lists", () => {
    expect(r.chokepointIds.map(title)).toEqual([
      "Draft the NP recruitment message",
      "Find and retain an accountant",
      "Build the real customer tracking table",
      "Send the 16 drafted supply-chain outreach emails",
      "Research and choose the spa location",
    ]);
    expect(r.quickWinIds.map(title)).toEqual([
      "Verify the real phone number and postal code for the London studio",
      "Rotate the hardcoded Notion token in Vendor Outreach - Monitor Replies",
      "Set a target launch date",
      "Clarify and call Vasi's pharmacy for Botox/Dysport pricing",
      "Call Oxford Pharmacy & Compounding re injectables and ingredients",
    ]);
  });

  it("shows both parents under Objectives", () => {
    const objs = r.objectives.map((o) => [title(o.parentId), o.done, o.total, o.nextSubtaskId && title(o.nextSubtaskId)]);
    expect(objs).toEqual([
      ["Acquire an NP", 0, 4, "Draft the NP recruitment message"],
      ["Reach out to distributors", 0, 3, "Send the 16 drafted supply-chain outreach emails"],
    ]);
  });

  it("finds no cycles and five Waiting On tasks", () => {
    expect(analysis.cycles).toEqual([]);
    expect(r.waitingOnIds).toHaveLength(5);
  });

  it("never shows a task in both lists", () => {
    const both = r.chokepointIds.filter((id) => r.quickWinIds.includes(id));
    expect(both).toEqual([]);
  });
});
