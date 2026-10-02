"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { analyse, explain, selectLists } from "@/lib/ranking";
import { DEFAULT_SETTINGS, type DashboardPayload, type DashboardResponse, type TaskInsight } from "@/lib/types";

const STORAGE_KEY = "infuseher.dashboard.v1";
const REFRESH_MS = 60_000;

// Today's date in London, Ontario, as YYYY-MM-DD.
function todayInLondonOntario(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

function readSaved(): DashboardPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DashboardPayload) : null;
  } catch {
    return null;
  }
}

function save(payload: DashboardPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", hour: "numeric", minute: "2-digit" });
}

function formatDue(due: string, today: string) {
  const d = due.slice(0, 10);
  const label = new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  if (d < today) return { label: `Overdue · ${label}`, overdue: true };
  if (d === today) return { label: "Due today", overdue: true };
  return { label: `Due ${label}`, overdue: false };
}

export default function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  // "fresh": just loaded from Notion. "saved": shown from this device while loading.
  // "stale": Notion failed; showing an older copy.
  const [freshness, setFreshness] = useState<"fresh" | "saved" | "stale" | "none">("none");
  const [error, setError] = useState<DashboardResponse["error"]>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const body = (await res.json()) as DashboardResponse;
      setError(body.error);
      if (body.data && !body.stale) {
        setPayload(body.data);
        setFreshness("fresh");
        save(body.data);
      } else if (body.data) {
        setPayload((p) => (p && p.generatedAt > body.data!.generatedAt ? p : body.data));
        setFreshness("stale");
      } else {
        setFreshness((f) => (f === "none" ? "none" : "stale"));
      }
    } catch {
      setError({ source: "notion", message: "Couldn't reach the dashboard server. Check your internet connection." });
      setFreshness((f) => (f === "none" ? "none" : "stale"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = readSaved();
    if (saved) {
      setPayload(saved);
      setFreshness("saved");
    }
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

  const today = todayInLondonOntario();
  const view = useMemo(() => {
    if (!payload) return null;
    const analysis = analyse(payload.tasks, payload.projects);
    const lists = selectLists(analysis, { owner: "Everyone", settings: DEFAULT_SETTINGS, today });
    return { analysis, lists };
  }, [payload, today]);

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="eyebrow">InfuseHER</p>
          <h1>Today</h1>
        </div>
        <div className="sync" aria-live="polite">
          {loading ? "Updating…" : payload ? `Updated ${formatTime(payload.generatedAt)}` : ""}
        </div>
      </header>

      {error && (
        <div className={`banner ${payload ? "warn" : "error"}`} role="alert">
          <strong>{error.source === "config" ? "Setup problem" : "Couldn't reach Notion"}</strong>
          <span>{error.message}</span>
          {payload && (freshness === "stale" || freshness === "saved") && (
            <span>
              Showing the lists from {formatTime(payload.generatedAt)}, which may be out of date.
            </span>
          )}
          {!payload && <span>The dashboard is empty because nothing could be loaded, not because there's nothing to do.</span>}
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
            <TaskList
              title="Chokepoints"
              hint="Small steps that unlock other work"
              ids={view.lists.chokepointIds}
              view={view}
              kind="chokepoint"
              today={today}
            />
            <TaskList
              title="Quick wins"
              hint="Under 30 minutes, nothing waits on them"
              ids={view.lists.quickWinIds}
              view={view}
              kind="quickwin"
              today={today}
            />
          </div>

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
                {view.lists.waitingOnIds.length} task{view.lists.waitingOnIds.length === 1 ? "" : "s"} waiting on
                someone else
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
    </main>
  );
}

type View = { analysis: ReturnType<typeof analyse>; lists: ReturnType<typeof selectLists> };

function TaskList(props: {
  title: string;
  hint: string;
  ids: string[];
  view: View;
  kind: "chokepoint" | "quickwin";
  today: string;
}) {
  const { title, hint, ids, view, kind, today } = props;
  return (
    <section className="list">
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      {ids.length === 0 ? (
        <p className="empty">Nothing here right now.</p>
      ) : (
        <ol>
          {ids.map((id) => (
            <TaskCard key={id} insight={view.analysis.insights[id]} view={view} kind={kind} today={today} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TaskCard({ insight, view, kind, today }: { insight: TaskInsight; view: View; kind: "chokepoint" | "quickwin"; today: string }) {
  const t = insight.task;
  const due = t.due ? formatDue(t.due, today) : null;
  const pinned = view.lists.pinnedIds.includes(t.id);
  const firstUnlock = insight.directlyUnlocksIds[0] ?? insight.downstreamIds[0];
  const more = insight.downstreamIds.length - 1;

  return (
    <li className="card">
      <div className="card-title">
        {pinned && <span className="pin" title="Pinned">📌</span>}
        <span>{t.title}</span>
      </div>
      <div className="meta">
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
      </div>
      {kind === "chokepoint" && firstUnlock && (
        <p className="unlocks">
          Unlocks: {view.analysis.insights[firstUnlock].task.title}
          {more > 0 && `, and ${more} more`}
        </p>
      )}
      <p className="why">{explain(insight, kind)}</p>
    </li>
  );
}
