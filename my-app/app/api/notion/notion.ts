// 使い方：このファイルから必要な関数をインポートして使用します。
// 例：
// import { getSavedNotionTestData, searchNotionPages } from "./notion.ts";
//
// getSavedNotionTestData() - テスト用の保存済みNotionデータを取得します。
// searchNotionPages(apiKey, query) - Notionワークスペース内のページ／データベースを検索します。
// collectNotionPageInfo(page) - Notionページ／データベースのメタ情報／プロパティ一覧を整形します。

import {Client} from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const defaultNotionVersion = "2022-06-28";

function buildHeaders(accessToken: string): Record<string, string> {
  if (!accessToken) {
    throw new Error("accessToken is required for Notion API authentication");
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": defaultNotionVersion,
    "Content-Type": "application/json",
  };
}

interface RichTextItem {
  plain_text?: string;
  [key: string]: any;
}

function plainTextFromRichText(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return (items as RichTextItem[]).map((item) => item?.plain_text || "").join("");
}

function simplifyPropertyValue(property: any): any {
  if (!property || typeof property !== "object") return null;

  switch (property.type) {
    case "title":
      return plainTextFromRichText(property.title);
    case "rich_text":
      return plainTextFromRichText(property.rich_text);
    case "number":
    case "checkbox":
    case "url":
    case "email":
    case "phone_number":
    case "created_time":
    case "last_edited_time":
      return property[property.type];
    case "select":
      return property.select ? property.select.name : null;
    case "multi_select":
      return Array.isArray(property.multi_select)
        ? property.multi_select.map((item: any) => item.name)
        : [];
    case "date":
      return property.date || null;
    case "people":
      return Array.isArray(property.people)
        ? property.people
            .map((person: any) => person?.name || person?.email || null)
            .filter(Boolean)
        : [];
    case "files":
      return Array.isArray(property.files)
        ? property.files.map(
            (file: any) => file.name || file.file?.url || file.external?.url
          )
        : [];
    case "relation":
      return Array.isArray(property.relation)
        ? property.relation.map((relation: any) => relation.id)
        : [];
    case "formula":
      if (!property.formula) return null;
      return (
        property.formula.string ??
        property.formula.number ??
        property.formula.boolean ??
        property.formula.date ??
        null
      );
    case "rollup":
      if (!property.rollup) return null;
      return (
        property.rollup.array ??
        property.rollup.number ??
        property.rollup.string ??
        property.rollup.date ??
        null
      );
    case "created_by":
    case "last_edited_by":
      return property[property.type]?.name || property[property.type]?.email || null;
    default:
      return property[property.type] ?? null;
  }
}

export function extractNotionProperties(properties: Record<string, any> = {}): Record<string, any> {
  if (!properties || typeof properties !== "object") return {};
  return Object.entries(properties).reduce((acc: Record<string, any>, [name, property]) => {
    acc[name] = simplifyPropertyValue(property);
    return acc;
  }, {});
}

function formatNotionPropertyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined) return "";
        return typeof item === "object" ? JSON.stringify(item) : String(item);
      })
      .filter((item) => item !== "")
      .join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatNotionPropertiesList(properties: Record<string, any> = {}): string[] {
  const simplified = extractNotionProperties(properties);
  return Object.entries(simplified).map(([name, value]) => `${name}: ${formatNotionPropertyValue(value)}`);
}

interface ParseInputOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
}

function parseInput(argv: string[], name: string, envName: string): string | undefined {
  const prefix = `${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  if (arg) {
    return arg.slice(prefix.length);
  }
  return process.env[envName];
}

interface NotionFetchOptions {
  accessToken?: string;
  query: string;
  searchType: "search" | "workspace";
  pageSize: number;
  maxPages: number;
}

export function getNotionFetchOptions(
  argv = process.argv,
  env = process.env as Record<string, string | undefined>
): NotionFetchOptions {
  const accessToken = parseInput(argv, "accessToken", "NOTION_ACCESS_TOKEN");
  const query = parseInput(argv, "query", "NOTION_QUERY") || "";
  const searchType = parseInput(argv, "searchType", "NOTION_SEARCH_TYPE") === "search" ? "search" : "workspace";
  const pageSize = Number(parseInput(argv, "pageSize", "NOTION_PAGE_SIZE") || 10);
  const maxPages = Number(parseInput(argv, "maxPages", "NOTION_MAX_PAGES") || 2);

  return {
    accessToken,
    query,
    searchType,
    pageSize,
    maxPages,
  };
}

interface NotionPagesOutput {
  source: string;
  count: number;
  results: any[];
}

export async function getNotionPagesOutput(options: Partial<NotionFetchOptions> = {}): Promise<NotionPagesOutput> {
  const {
    accessToken,
    query = "",
    searchType = "workspace",
    pageSize = 50,
    maxPages = 3,
  } = options;

  const formatted = await fetchNotionPages({
    accessToken: accessToken || "",
    query,
    searchType: searchType as "workspace" | "search",
    pageSize,
    maxPages,
  });

  return formatted;
}

export { buildNotionSavePayload } from "./notion-helper";

export async function runNotionFetchTest(
  argv = process.argv,
  env = process.env as Record<string, string | undefined>
): Promise<NotionPagesOutput> {
  const options = getNotionFetchOptions(argv, env);
  if (!options.accessToken) {
    throw new Error("accessToken が必要です。例: node test.js accessToken=your-token");
  }

  const result = await getNotionPagesOutput(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function getSavedNotionTestData(): string[] {
  const savedNotionProperties: Record<string, any> = {
    Name: { type: "title", title: [{ plain_text: "テストタスク" }] },
    Description: { type: "rich_text", rich_text: [{ plain_text: "これは参照用のNotionデータです。" }] },
    Status: { type: "select", select: { name: "In progress" } },
    Assignee: { type: "rich_text", rich_text: [{ plain_text: "太郎" }] },
    Due: { type: "date", date: "2026-06-30" },
  };
  return formatNotionPropertiesList(savedNotionProperties);
}

export function extractNotionTitle(page: any): string {
  const titleProperty = Object.values(page.properties || {}).find(
    (property: any) => property?.type === "title"
  );
  if (titleProperty) {
    return plainTextFromRichText((titleProperty as any).title);
  }

  if (Array.isArray(page.title)) {
    return plainTextFromRichText(page.title);
  }

  return page.url || page.id || "";
}

interface NotionPageInfo {
  id: string;
  object: any;
  url: string | null;
  title: string;
  parent: any;
  created_time: string | null;
  last_edited_time: string | null;
  icon: any;
  cover: any;
  properties: Record<string, any>;
  propertiesList: string[];
}

export function collectNotionPageInfo(page: any): NotionPageInfo {
  return {
    id: page.id,
    object: page.object ?? null,
    url: page.url ?? null,
    title: extractNotionTitle(page),
    parent: page.parent ?? null,
    created_time: page.created_time ?? null,
    last_edited_time: page.last_edited_time ?? null,
    icon: page.icon ?? null,
    cover: page.cover ?? null,
    properties: extractNotionProperties(page.properties),
    propertiesList: formatNotionPropertiesList(page.properties),
  };
}

export function filterNotionPagesByQuery(pages: any[], query?: string): any[] {
  const lowerQuery = (query || "").toLowerCase();
  if (!lowerQuery) return pages;

  return pages.filter((page) => {
    const title = extractNotionTitle(page) || "";
    if (title.toLowerCase().includes(lowerQuery)) return true;

    const propertyValues = Object.values(extractNotionProperties(page.properties));
    return propertyValues.some((value) => {
      if (typeof value === "string") {
        return value.toLowerCase().includes(lowerQuery);
      }
      if (Array.isArray(value)) {
        return value.some((item) => typeof item === "string" && item.toLowerCase().includes(lowerQuery));
      }
      if (value && typeof value === "object") {
        return JSON.stringify(value).toLowerCase().includes(lowerQuery);
      }
      return false;
    });
  });
}

async function fetchNotionJson(
  url: string,
  accessToken: string,
  body?: Record<string, any>,
  method = "POST"
): Promise<any> {
  const response = await fetch(url, {
    method,
    headers: buildHeaders(accessToken),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

interface DbSchemaProperty {
  name: string;
  type: string;
}

interface DbSchema {
  id: string;
  title: string;
  properties: DbSchemaProperty[];
}

export async function findChildDatabases(
  accessToken: string,
  pageId: string,
  seen?: Set<string>,
  depth = 0
): Promise<DbSchema[]> {
  if (!accessToken || !pageId || depth > 2) {
    return [];
  }

  const seenSet = seen instanceof Set ? seen : new Set<string>(seen || []);

  try {
    const data = await fetchNotionJson(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      accessToken,
      undefined,
      "GET"
    );

    const schemas: DbSchema[] = [];
    const results = Array.isArray(data?.results) ? data.results : [];

    for (const block of results) {
      const blockId = block?.id;
      if (!blockId) continue;

      if (block?.type === "child_database") {
        if (!seenSet.has(blockId)) {
          seenSet.add(blockId);
          const schema = await fetchDbSchema(accessToken, blockId);
          if (schema) schemas.push(schema);
        }
      }

      if (block?.type === "child_page") {
        const pageKey = `page:${blockId}`;
        if (!seenSet.has(pageKey)) {
          seenSet.add(pageKey);
          const nestedSchemas = await findChildDatabases(accessToken, blockId, seenSet, depth + 1);
          schemas.push(...nestedSchemas);
        }
      }
    }

    return schemas;
  } catch (error) {
    console.warn("[notion] findChildDatabases failed", error);
    return [];
  }
}

export async function fetchDbSchema(accessToken: string, id: string): Promise<DbSchema | null> {
  if (!accessToken || !id) {
    return null;
  }

  try {
    const db = await fetchNotionJson(
      `https://api.notion.com/v1/databases/${id}`,
      accessToken,
      undefined,
      "GET"
    );
    const title =
      Array.isArray(db?.title) && db.title.length > 0
        ? db.title[0]?.plain_text || db.title[0]?.text?.content || "無題"
        : "無題";

    const rawProperties = db?.properties && typeof db.properties === "object" ? db.properties : {};
    const properties: DbSchemaProperty[] = Object.entries(rawProperties).map(([name, prop]: [string, any]) => ({
      name,
      type: prop?.type || prop?.config?.type || "unknown",
    }));

    return {
      id,
      title,
      properties,
    };
  } catch (error) {
    console.warn("[notion] fetchDbSchema failed", error);
    return null;
  }
}

export async function searchDatabases(accessToken: string): Promise<DbSchema[]> {
  if (!accessToken) {
    return [];
  }

  try {
    const data = await fetchNotionJson(
      "https://api.notion.com/v1/search",
      accessToken,
      { page_size: 100 },
      "POST"
    );
    if (!data || !Array.isArray(data.results)) {
      console.warn("[notion] searchDatabases returned invalid results");
      return [];
    }

    const allDatabases: DbSchema[] = [];
    const seenIds = new Set<string>();
    const dbIdsToTry = new Set<string>();
    const pageIdsToTraverse = new Set<string>();

    for (const result of data.results) {
      const objectType = result?.object;
      const parent = result?.parent;
      const id = result?.id;

      if (!id) continue;

      if (objectType === "database") {
        dbIdsToTry.add(id);
        if (parent?.type === "page_id") {
          pageIdsToTraverse.add(parent.page_id);
        }
        if (parent?.type === "database_id") {
          dbIdsToTry.add(parent.database_id);
        }
      } else if (objectType === "page") {
        if (parent?.type === "database_id") {
          dbIdsToTry.add(parent.database_id);
        } else {
          pageIdsToTraverse.add(id);
        }

        if (parent?.type === "page_id") {
          pageIdsToTraverse.add(parent.page_id);
        }
      }
    }

    for (const dbId of dbIdsToTry) {
      if (seenIds.has(dbId)) continue;
      seenIds.add(dbId);
      const schema = await fetchDbSchema(accessToken, dbId);
      if (schema) allDatabases.push(schema);
    }

    for (const pageId of pageIdsToTraverse) {
      const pageKey = `page:${pageId}`;
      if (seenIds.has(pageKey)) continue;
      seenIds.add(pageKey);
      const nestedSchemas = await findChildDatabases(accessToken, pageId, seenIds);
      allDatabases.push(...nestedSchemas);
    }

    return allDatabases;
  } catch (error) {
    console.warn("[notion] searchDatabases failed", error);
    return [];
  }
}

export async function fetchPageBodyText(accessToken: string, pageId: string): Promise<string> {
  if (!accessToken || !pageId) {
    return "";
  }

  try {
    const data = await fetchNotionJson(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=10`,
      accessToken,
      undefined,
      "GET"
    );

    const texts: string[] = [];
    const results = Array.isArray(data?.results) ? data.results : [];

    for (const block of results) {
      const richText = block?.[block?.type]?.rich_text || [];
      for (const item of richText) {
        if (item?.plain_text) {
          texts.push(item.plain_text);
        }
      }
    }

    return texts.join(" ").slice(0, 500);
  } catch (error) {
    console.warn("[notion] fetchPageBodyText failed", error);
    return "";
  }
}

interface NotionQueryRow {
  __page_id: string;
  __body?: string;
  [key: string]: any;
}

export async function queryDatabase(
  accessToken: string,
  databaseId: string,
  includeBody = false
): Promise<NotionQueryRow[]> {
  if (!accessToken || !databaseId) {
    return [];
  }

  try {
    const response = await fetchNotionJson(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      accessToken,
      { page_size: 50 },
      "POST"
    );

    if (!response || !Array.isArray(response.results)) {
      console.warn("[notion] queryDatabase returned invalid results");
      return [];
    }

    const rows: NotionQueryRow[] = [];

    for (const page of response.results) {
      const row: NotionQueryRow = { __page_id: page.id };
      const properties = page.properties || {};

      for (const [key, prop] of Object.entries(properties)) {
        if (!prop || typeof prop !== "object") continue;

        const propAny = prop as any;
        switch (propAny.type) {
          case "title":
            row[key] = plainTextFromRichText(propAny.title);
            break;
          case "rich_text":
            row[key] = plainTextFromRichText(propAny.rich_text);
            break;
          case "checkbox":
            row[key] = propAny.checkbox ? "✓" : "✗";
            break;
          case "date":
            row[key] = propAny.date?.start ?? "";
            break;
          case "select":
            row[key] = propAny.select?.name ?? "";
            break;
          case "number":
            row[key] = propAny.number != null ? String(propAny.number) : "";
            break;
          default:
            break;
        }
      }

      rows.push(row);
    }

    if (includeBody) {
      for (const row of rows) {
        const body = await fetchPageBodyText(accessToken, row.__page_id);
        if (body) {
          row.__body = body;
        }
      }
    }

    return rows;
  } catch (error) {
    console.warn("[notion] queryDatabase failed", error);
    return [];
  }
}

export async function queryNotionDatabase(
  accessToken: string,
  databaseIdValue: string,
  pageSize = 50,
  maxPages = 5,
  filter: any = null,
  sorts: any = null
): Promise<NotionQueryRow[]> {
  return queryDatabase(accessToken, databaseIdValue);
}

export async function searchNotionWorkspace(
  accessToken: string,
  query = "",
  pageSize = 50,
  maxPages = 3
): Promise<any[]> {
  const results: any[] = [];
  let nextCursor: string | null = null;
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const safeMaxPages = Math.min(Math.max(maxPages, 1), 10);
  let requestCount = 0;

  do {
    const body: Record<string, any> = {
      query,
      page_size: safePageSize,
    };
    if (nextCursor) body.start_cursor = nextCursor;

    const data = await fetchNotionJson("https://api.notion.com/v1/search", accessToken, body);

    if (Array.isArray(data.results)) {
      results.push(...data.results);
    }
    nextCursor = data.next_cursor;
    requestCount += 1;
  } while (nextCursor && requestCount < safeMaxPages);

  return results;
}

export async function searchNotionPages(
  accessToken: string,
  query = "",
  pageSize = 50,
  maxPages = 3
): Promise<any[]> {
  return searchNotionWorkspace(accessToken, query, pageSize, maxPages);
}

interface FetchNotionPagesOptions {
  accessToken: string;
  query?: string;
  searchType?: "workspace" | "search";
  pageSize?: number;
  maxPages?: number;
}

interface FetchNotionPagesResult {
  source: string;
  count: number;
  results: NotionPageInfo[];
}

export async function fetchNotionPages({
  accessToken,
  query = "",
  searchType = "workspace",
  pageSize = 50,
  maxPages = 3,
}: FetchNotionPagesOptions): Promise<FetchNotionPagesResult> {
  if (!accessToken) {
    throw new Error("accessToken is required to fetch Notion pages.");
  }

  const source = searchType === "search" ? "search" : "workspace";
  const pages = await searchNotionWorkspace(accessToken, query, pageSize, maxPages);

  const results = pages.map((page) => collectNotionPageInfo(page));
  return {
    source,
    count: results.length,
    results,
  };
}
