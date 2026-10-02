import "server-only";
import { normaliseId, notionConfig } from "../config";
import type { Project, Task } from "../types";
import { notion, paginate } from "./api";
import { PROJECT_FIELDS, REQUIRED_OPTIONS, TASK_FIELDS } from "./fields";

// ---- Schema check ---------------------------------------------------------

interface SchemaProperty {
  id: string;
  name: string;
  type: string;
  select?: { options: { name: string }[] };
  status?: { options: { name: string }[] };
}

interface DataSource {
  properties: Record<string, SchemaProperty>;
}

type FieldMap = Record<string, { name: string; types: readonly string[] }>;

export class SchemaError extends Error {}

function checkFields(label: string, ds: DataSource, fields: FieldMap): string[] {
  const problems: string[] = [];
  for (const { name, types } of Object.values(fields)) {
    const prop = ds.properties[name];
    if (!prop) problems.push(`${label} database has no field called "${name}".`);
    else if (!types.includes(prop.type))
      problems.push(`${label} field "${name}" is a ${prop.type} field; expected ${types.join(" or ")}.`);
  }
  return problems;
}

function optionNames(prop: SchemaProperty | undefined): string[] {
  return (prop?.select ?? prop?.status)?.options.map((o) => o.name) ?? [];
}

// Reads the live schema and stops with a plain message if anything the app
// relies on has been renamed or removed. Returns non-fatal warnings.
export async function checkSchema(): Promise<string[]> {
  const cfg = notionConfig();
  const [tasks, projects] = await Promise.all([
    notion<DataSource>(`data_sources/${cfg.tasksDataSourceId}`),
    notion<DataSource>(`data_sources/${cfg.projectsDataSourceId}`),
  ]);
  const problems = [...checkFields("Tasks", tasks, TASK_FIELDS), ...checkFields("Projects", projects, PROJECT_FIELDS)];

  for (const [key, required] of Object.entries(REQUIRED_OPTIONS.tasks)) {
    const field = TASK_FIELDS[key as keyof typeof TASK_FIELDS].name;
    const have = optionNames(tasks.properties[field]);
    for (const opt of required) {
      if (tasks.properties[field] && !have.includes(opt))
        problems.push(`Tasks field "${field}" has no "${opt}" option; the ranking rules depend on it.`);
    }
  }
  if (problems.length) throw new SchemaError(problems.join(" "));

  const warnings: string[] = [];
  const owners = optionNames(tasks.properties[TASK_FIELDS.owner.name]);
  for (const o of ["Quinton", "Chelsey", "Claude"]) {
    if (!owners.includes(o)) warnings.push(`Tasks "Owner" has no "${o}" option.`);
  }
  return warnings;
}

// ---- Rows -----------------------------------------------------------------

interface RichText {
  plain_text: string;
}

interface PageProperty {
  id: string;
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  select?: { name: string } | null;
  status?: { name: string } | null;
  date?: { start: string; end: string | null } | null;
  relation?: { id: string }[];
  has_more?: boolean;
}

interface Page {
  id: string;
  url: string;
  created_time: string;
  in_trash?: boolean;
  properties: Record<string, PageProperty>;
}

const text = (p?: PageProperty) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join("");
const choice = (p?: PageProperty) => (p?.select ?? p?.status)?.name ?? null;
const date = (p?: PageProperty) => p?.date?.start ?? null;

// Notion only includes the first 25 links of a relation inside a page. If
// there are more, fetch the full list from the property endpoint.
async function relation(page: Page, field: string): Promise<string[]> {
  const prop = page.properties[field];
  if (!prop) return [];
  if (!prop.has_more) return (prop.relation ?? []).map((r) => normaliseId(r.id));
  const items = await paginate<{ relation: { id: string } }>((cursor) =>
    notion(`pages/${page.id}/properties/${encodeURIComponent(prop.id)}${cursor ? `?start_cursor=${cursor}` : ""}`),
  );
  return items.map((i) => normaliseId(i.relation.id));
}

async function queryAll(dataSourceId: string): Promise<Page[]> {
  const pages = await paginate<Page>((cursor) =>
    notion(`data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    }),
  );
  return pages.filter((p) => !p.in_trash);
}

export async function loadTasks(): Promise<Task[]> {
  const pages = await queryAll(notionConfig().tasksDataSourceId);
  const F = TASK_FIELDS;
  return Promise.all(
    pages.map(async (p): Promise<Task> => {
      const props = p.properties;
      const [projectIds, blockedByIds, blockingIds, parentIds, subtaskIds] = await Promise.all([
        relation(p, F.project.name),
        relation(p, F.blockedBy.name),
        relation(p, F.blocking.name),
        relation(p, F.parent.name),
        relation(p, F.subtasks.name),
      ]);
      return {
        id: normaliseId(p.id),
        url: p.url,
        title: text(props[F.title.name]) || "(untitled task)",
        status: choice(props[F.status.name]),
        priority: choice(props[F.priority.name]),
        owner: choice(props[F.owner.name]),
        effort: choice(props[F.effort.name]),
        due: date(props[F.due.name]),
        notes: text(props[F.notes.name]),
        createdTime: p.created_time,
        projectIds,
        blockedByIds,
        blockingIds,
        parentIds,
        subtaskIds,
      };
    }),
  );
}

export async function loadProjects(): Promise<Project[]> {
  const pages = await queryAll(notionConfig().projectsDataSourceId);
  const F = PROJECT_FIELDS;
  return pages.map((p) => ({
    id: normaliseId(p.id),
    url: p.url,
    name: text(p.properties[F.title.name]) || "(untitled project)",
    status: choice(p.properties[F.status.name]),
    priority: choice(p.properties[F.priority.name]),
    area: choice(p.properties[F.area.name]),
  }));
}
