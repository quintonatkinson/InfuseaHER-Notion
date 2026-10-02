"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyse, explain, selectLists } from "@/lib/ranking";
import {
  DEFAULT_SETTINGS,
  type DashboardPayload,
  type DashboardResponse,
  type OwnerFilter,
  type TaskInsight,
} from "@/lib/types";

const STORAGE_KEY = "infuseher.dashboard.v1";
const OWNER_KEY = "infuseher.owner";
const REFRESH_MS = 60_000;
const OWNERS: OwnerFilter[] = ["Everyone", "Quinton", "Chelsey"];

// Today's date in London, Ontario, as YYYY-MM-DD.
function todayInLondonOntario(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDue(due: string, today: string) {
  const d = due.slice(0, 10);
  const label = new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  if (d < today) return { label: `Overdue · ${label}`, overdue: true };
  if (d === today) return { label: "Due today", overdue: true };
  return { label: `Due ${label}`, overdue: false };
}

type Toast = { text: string; undo?: () => void; error?: boolean };

export default function Dashboard({ who }: { who: "Quinton" | "Chelsey" }) {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  // "fresh": just loaded from Notion. "saved": shown from this device while loading.
  // "stale": Notion failed; showing an older copy.
  const [freshness, setFreshness] = useState<"fresh" | "saved" | "stale" | "none">("none");
  const [error, setError] = useState<DashboardResponse["error"]>(null);
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<OwnerFilter>(who);
  // Status changes made here that Notion hasn't confirmed yet. Applied on top
  // of whatever the server sends, so a tick never flickers back.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), t.undo ? 8000 : 6000);
  }, []);

  const accept = useCallback((body: DashboardResponse) => {
    setError(body.error);
    if (body.data && !body.stale) {
      setPayload(body.data);
      setFreshness("fresh");
      writeLocal(STORAGE_KEY, body.data);
    } else if (body.data) {
      setPayload((p) => (p && p.generatedAt > body.data!.generatedAt ? p : body.data));
      setFreshness("stale");
    } else {
      setFreshness((f) => (f === "none" ? "none" : "stale"));
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      accept((await res.json()) as DashboardResponse);
    } catch {
      setError({ source: "notion", message: "Couldn't reach the dashboard server. Check your internet connection." });
      setFreshness((f) => (f === "none" ? "none" : "stale"));
    } finally {
      setLoading(false);
    }
  }, [accept]);

  useEffect(() => {
    const saved = readLocal<DashboardPayload>(STORAGE_KEY);
    if (saved) {
      setPayload(saved);
      setFreshness("saved");
    }
    const savedOwner = readLocal<OwnerFilter>(OWNER_KEY);
    if (savedOwner && OWNERS.includes(savedOwner)) setOwner(savedOwner);
    refresh();
    // Keep the list live: refresh every minute while the page is open, and
    // straight away when you come back to the tab or unlock your phone.
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const chooseOwner = (o: OwnerFilter) => {
    setOwner(o);
    writeLocal(OWNER_KEY, o);
  };

  const changeStatus = useCallback(
    async (taskId: string, title: string, status: string, previous: string | null) => {
      setPending((p) => ({ ...p, [taskId]: status }));
      const clear = () =>
        setPending((p) => {
          const { [taskId]: _, ...rest } = p;
          return rest;
        });
      try {
        const res = await fetch(`/api/tasks/${taskId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Couldn't update Notion.");
        if (body.dashboard) accept(body.dashboard as DashboardResponse);
        clear();
        if (status === "Done") {
          showToast({
            text: `Marked “${title}” done.`,
            undo: () => changeStatus(taskId, title, previous ?? "Not Started", "Done"),
          });
        } else {
          showToast({ text: `“${title}” is back to ${status}.` });
        }
      } catch (err) {
        clear();
        showToast({ text: (err as Error).message, error: true });
      }
    },
    [accept, showToast],
  );

  const today = todayInLondonOntario();
  const view = useMemo(() => {
    if (!payload) return null;
    const tasks = payload.tasks.map((t) => (pending[t.id] ? { ...t, status: pending[t.id] } : t));
    const analysis = analyse(tasks, payload.projects);
    const lists = selectLists(analysis, { owner, settings: DEFAULT_SETTINGS, today });
    return { analysis, lists };
  }, [payload, pending, owner, today]);

  async function switchPerson() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  const onCheck = (i: TaskInsight) => changeStatus(i.task.id, i.task.title, "Done", i.task.status);

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="eyebrow">InfuseHER</p>
          <h1>Today</h1>
        </div>
        <div className="top-right">
          <span className="sync" aria-live="polite">
            {loading ? "Updating…" : payload ? `Updated ${formatTime(payload.generatedAt)}` : ""}
          </span>
          <button className="link small" onClick={switchPerson}>
            {who} · switch
          </button>
        </div>
      </header>

      <div className="owner-filter" role="radiogroup" aria-label="Whose tasks">
        {OWNERS.map((o) => (
          <button key={o} role="radio" aria-checked={owner === o} className={owner === o ? "on" : ""} onClick={() => chooseOwner(o)}>
            {o}
          </button>
        ))}
      </div>

      {error && (
        <div className={`banner ${payload ? "warn" : "error"}`} role="alert">
          <strong>{error.source === "config" ? "Setup problem" : "Couldn't reach Notion"}</strong>
          <span>{error.message}</span>
          {payload && (freshness === "stale" || freshness === "saved") && (
            <span>Showing the lists from {formatTime(payload.generatedAt)}, which may be out of date.</span>
          )}
          {!payload && <span>The dashboard is empty because nothing could be loaded, not because there&rsquo;s nothing to do.</span>}
          <button className="link" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {payload?.schemaWarnings.map((w) => (
        <div key={w} className="banner warn">
          {w}
        </div>
      ))}

      {view && view.analysis.cycles.length > 0 && (
        <div className="banner warn" role="alert">
          <strong>Dependency loop found</strong>
          {view.analysis.cycles.map((c) => (
            <span key={c.join("|")}>
              These tasks block each other, so none of them can start: {c.join(" → ")}. Fix one of the
              &ldquo;Blocked by&rdquo; links in Notion.
            </span>
          ))}
        </div>
      )}

      {!view && !error && <p className="muted">Loading your tasks from Notion…</p>}

      {view && (
        <>
          <div className="lists">
            <TaskList title="Chokepoints" hint="Small steps that unlock other work" ids={view.lists.chokepointIds} view={view} kind="chokepoint" today={today} onCheck={onCheck} />
            <TaskList title="Quick wins" hint="Under 30 minutes, nothing waits on them" ids={view.lists.quickWinIds} view={view} kind="quickwin" today={today} onCheck={onCheck} />
          </div>

          {view.lists.otherIds.length > 0 && (
            <div className="lists single">
              <TaskList
                title={`Also on ${owner}'s plate`}
                hint="Ready to start, though nothing is waiting on them"
                ids={view.lists.otherIds}
                view={view}
                kind="other"
                today={today}
                onCheck={onCheck}
              />
            </div>
          )}

          {view.lists.objectives.length > 0 && (
            <section className="objectives">
              <h2>Objectives</h2>
              <ul>
                {view.lists.objectives.map((o) => {
                  const parent = view.analysis.insights[o.parentId].task;
                  const next = o.nextSubtaskId ? view.analysis.insights[o.nextSubtaskId].task : null;
                  return (
                    <li key={o.parentId}>
                      <div className="obj-head">
                        <a href={parent.url} target="_blank" rel="noreferrer">
                          {parent.title}
                        </a>
                        <span className="count">
                          {o.done} of {o.total} done
                        </span>
                      </div>
                      <progress max={o.total} value={o.done} aria-label={`${o.done} of ${o.total} done`} />
                      {next && (
                        <p className="next">
                          Next: {next.title}
                          {o.nextIsBlocked && <span className="muted"> (waiting on something else first)</span>}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {view.lists.waitingOnIds.length > 0 && (
            <details className="waiting">
              <summary>
                {view.lists.waitingOnIds.length} task{view.lists.waitingOnIds.length === 1 ? "" : "s"} waiting on someone else
              </summary>
              <ul>
                {view.lists.waitingOnIds.map((id) => {
                  const t = view.analysis.insights[id].task;
                  return (
                    <li key={id}>
                      <a href={t.url} target="_blank" rel="noreferrer">
                        {t.title}
                      </a>
                      <span className="muted"> · {t.owner ?? "No owner"}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}

      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              className="link"
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </main>
  );
}

type View = { analysis: ReturnType<typeof analyse>; lists: ReturnType<typeof selectLists> };

function TaskList(props: {
  title: string;
  hint: string;
  ids: string[];
  view: View;
  kind: "chokepoint" | "quickwin" | "other";
  today: string;
  onCheck: (i: TaskInsight) => void;
}) {
  const { title, hint, ids, view, kind, today, onCheck } = props;
  return (
    <section className="list">
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      {ids.length === 0 ? (
        <p className="empty">Nothing here right now.</p>
      ) : (
        <ol>
          {ids.map((id) => (
            <TaskCard key={id} insight={view.analysis.insights[id]} view={view} kind={kind} today={today} onCheck={onCheck} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TaskCard(props: {
  insight: TaskInsight;
  view: View;
  kind: "chokepoint" | "quickwin" | "other";
  today: string;
  onCheck: (i: TaskInsight) => void;
}) {
  const { insight, view, kind, today, onCheck } = props;
  const [open, setOpen] = useState(false);
  const t = insight.task;
  const due = t.due ? formatDue(t.due, today) : null;
  const pinned = view.lists.pinnedIds.includes(t.id);
  const firstUnlock = insight.directlyUnlocksIds[0] ?? insight.downstreamIds[0];
  const more = insight.downstreamIds.length - 1;
  const name = (id: string) => view.analysis.insights[id]?.task.title ?? "(unknown task)";
  const subtasks = [...new Set([...t.subtaskIds, ...insight.openSubtaskIds])]
    .map((id) => view.analysis.insights[id])
    .filter(Boolean);

  return (
    <li className={`card ${open ? "open" : ""}`}>
      <button className="check" aria-label={`Mark “${t.title}” done`} onClick={() => onCheck(insight)}>
        <span aria-hidden="true" />
      </button>
      <div className="card-body">
        <button className="card-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="card-title">
            {pinned && (
              <span className="pin" title="Pinned">
                📌
              </span>
            )}
            {t.title}
          </span>
          <span className="meta">
            {t.owner === "Claude" ? (
              <span className="tag ai" title="An AI assistant can do this one for you">
                Claude can do this
              </span>
            ) : (
              <span className="tag">{t.owner ?? "No owner"}</span>
            )}
            {insight.projectNames.map((p) => (
              <span key={p} className="tag soft">
                {p}
              </span>
            ))}
            {t.effort && <span className="tag soft">{t.effort}</span>}
            {due && <span className={`tag ${due.overdue ? "due" : "soft"}`}>{due.label}</span>}
          </span>
          {kind === "chokepoint" && firstUnlock && (
            <span className="unlocks">
              Unlocks: {name(firstUnlock)}
              {more > 0 && `, and ${more} more`}
            </span>
          )}
          <span className="why">{explain(insight, kind)}</span>
        </button>

        {open && (
          <div className="details">
            {t.notes ? <p className="notes">{t.notes}</p> : <p className="muted">No notes.</p>}
            {subtasks.length > 0 && (
              <>
                <h3>Sub-tasks</h3>
                <ul>
                  {subtasks.map((s) => (
                    <li key={s.task.id} className={s.open ? "" : "done"}>
                      {s.open ? "○" : "✓"} {s.task.title}
                      {s.open && s.task.status && <span className="muted"> · {s.task.status}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {insight.openBlockerIds.length > 0 && (
              <>
                <h3>Blocked by</h3>
                <ul>
                  {insight.openBlockerIds.map((id) => (
                    <li key={id}>{name(id)}</li>
                  ))}
                </ul>
              </>
            )}
            {insight.downstreamIds.length > 0 && (
              <>
                <h3>Waiting on this</h3>
                <ul>
                  {insight.downstreamIds.map((id) => (
                    <li key={id}>{name(id)}</li>
                  ))}
                </ul>
              </>
            )}
            <a className="notion-link" href={t.url} target="_blank" rel="noreferrer">
              Open in Notion ↗
            </a>
          </div>
        )}
      </div>
    </li>
  );
}
