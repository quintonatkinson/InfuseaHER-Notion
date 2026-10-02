import "server-only";

// Reads settings from environment variables. Server-side only: the
// "server-only" import makes the build fail if this is ever pulled into
// browser code, so the Notion token can't leak into the page.

export class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is not set. Add it to .env.local (or Vercel's environment variables).`);
  return value;
}

export function normaliseId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export function notionConfig() {
  return {
    token: required("NOTION_TOKEN"),
    tasksDataSourceId: required("NOTION_TASKS_DATA_SOURCE_ID"),
    projectsDataSourceId: required("NOTION_PROJECTS_DATA_SOURCE_ID"),
    rootPageId: normaliseId(required("NOTION_ROOT_PAGE_ID")),
    blockedPageIds: (process.env.NOTION_BLOCKED_PAGE_IDS ?? "")
      .split(",")
      .map((s) => normaliseId(s.trim()))
      .filter(Boolean),
    cacheTtlMs: Math.max(5, Number(process.env.CACHE_TTL_SECONDS) || 60) * 1000,
  };
}
