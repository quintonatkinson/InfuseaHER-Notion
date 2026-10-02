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

// The InfuseHER workspace IDs. They aren't secret, so they live here and
// only need setting as environment variables if the databases ever move.
const DEFAULTS = {
  tasksDataSourceId: "3c30941e-7a9b-81d2-897a-000ba9805db7",
  projectsDataSourceId: "3c30941e-7a9b-81ee-a593-000be5c15413",
  rootPageId: "21c0941e7a9b80278586dd7bfa4e7723",
};

// "Softwares & Logins" holds passwords. It is always blocked, whatever the
// environment says; NOTION_BLOCKED_PAGE_IDS can only add more pages.
const ALWAYS_BLOCKED = ["3c20941e7a9b8150958bf472ca653c7d"];

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function notionConfig() {
  return {
    token: required("NOTION_TOKEN"),
    tasksDataSourceId: optional("NOTION_TASKS_DATA_SOURCE_ID", DEFAULTS.tasksDataSourceId),
    projectsDataSourceId: optional("NOTION_PROJECTS_DATA_SOURCE_ID", DEFAULTS.projectsDataSourceId),
    rootPageId: normaliseId(optional("NOTION_ROOT_PAGE_ID", DEFAULTS.rootPageId)),
    blockedPageIds: [...ALWAYS_BLOCKED, ...(process.env.NOTION_BLOCKED_PAGE_IDS ?? "").split(",")]
      .map((s) => normaliseId(s.trim()))
      .filter(Boolean),
    cacheTtlMs: Math.max(5, Number(process.env.CACHE_TTL_SECONDS) || 60) * 1000,
  };
}
