import "server-only";
import { notionConfig } from "../config";

// Pinned Notion API version. In this version databases hold one or more
// "data sources", and rows are queried through the data source ID
// (/v1/data_sources/{id}/query), not the database ID.
// NOTION_API_BASE is only for local testing against a fake Notion; leave it unset.
export const NOTION_VERSION = "2026-03-11";

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const MAX_ATTEMPTS = 4;

// One request to Notion, retrying politely on rate limits (429) and
// temporary server errors. Notion allows about 3 requests a second.
export async function notion<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token } = notionConfig();
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${process.env.NOTION_API_BASE ?? "https://api.notion.com/v1"}/${path}`, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      lastError = err;
      await sleep(500 * attempt);
      continue;
    }
    if (res.ok) return (await res.json()) as T;

    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      lastError = new NotionError(`Notion returned ${res.status}`, res.status);
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
      continue;
    }
    throw new NotionError(explain(res.status, text), res.status);
  }
  throw lastError instanceof NotionError
    ? lastError
    : new NotionError(`Couldn't reach Notion (${lastError instanceof Error ? lastError.message : "network error"})`);
}

function explain(status: number, body: string): string {
  let message = body;
  try {
    message = JSON.parse(body).message ?? body;
  } catch {}
  if (status === 401) return "Notion rejected the token. Check NOTION_TOKEN.";
  if (status === 404)
    return `Notion couldn't find that page or database. Make sure the InfuseHER page is shared with the integration (… menu → Connections). Details: ${message}`;
  return `Notion error ${status}: ${message}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Follows Notion's paging until every result is fetched.
export async function paginate<T>(fetchPage: (cursor?: string) => Promise<{ results: T[]; has_more: boolean; next_cursor: string | null }>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    out.push(...page.results);
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}
