import "server-only";
import { ConfigError, notionConfig } from "./config";
import { checkSchema, loadProjects, loadTasks } from "./notion/load";
import type { DashboardPayload, DashboardResponse } from "./types";

// Server-side cache. Notion is slow and rate limited, so tasks and projects
// are fetched once and reused for CACHE_TTL_SECONDS. Anything that writes to
// Notion calls invalidateDashboard() so the next load is fresh.
//
// On Vercel each running server instance keeps its own copy, and a cold
// start begins empty. That's fine at our size; the browser also keeps the
// last good copy so a failed fetch never shows an empty dashboard.

let cached: { payload: DashboardPayload; fetchedAt: number } | null = null;
let inflight: Promise<DashboardPayload> | null = null;
let schemaWarnings: string[] | null = null;

async function fetchFresh(): Promise<DashboardPayload> {
  // Check the schema once per server start, before the first read.
  if (schemaWarnings === null) schemaWarnings = await checkSchema();
  const [tasks, projects] = await Promise.all([loadTasks(), loadProjects()]);
  return { generatedAt: new Date().toISOString(), tasks, projects, schemaWarnings };
}

export function invalidateDashboard() {
  cached = null;
}

export async function getDashboard(): Promise<DashboardResponse> {
  let ttl: number;
  try {
    ttl = notionConfig().cacheTtlMs;
  } catch (err) {
    return { data: null, stale: false, error: { source: "config", message: (err as Error).message } };
  }

  if (cached && Date.now() - cached.fetchedAt < ttl) {
    return { data: cached.payload, stale: false, error: null };
  }

  try {
    // If several requests arrive together, share one trip to Notion.
    inflight ??= fetchFresh().finally(() => (inflight = null));
    const payload = await inflight;
    cached = { payload, fetchedAt: Date.now() };
    return { data: payload, stale: false, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Dashboard load failed:", message);
    const source = err instanceof ConfigError ? "config" : "notion";
    // Keep serving the last good copy, clearly marked as possibly out of date.
    return { data: cached?.payload ?? null, stale: !!cached, error: { source, message } };
  }
}
