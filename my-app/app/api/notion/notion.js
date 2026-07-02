// 使い方：このファイルから必要な関数をインポートして使用します。
// 例：
// import { getSavedNotionTestData, searchNotionPages } from "./notion.js";
//
// getSavedNotionTestData() - テスト用の保存済みNotionデータを取得します。
// searchNotionPages(apiKey, query) - Notionワークスペース内のページ／データベースを検索します。
// collectNotionPageInfo(page) - Notionページ／データベースのメタ情報／プロパティ一覧を整形します。

const defaultNotionVersion = "2022-06-28";

function buildHeaders(accessToken) {
  if (!accessToken) {
    throw new Error("accessToken is required for Notion API authentication");
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": defaultNotionVersion,
    "Content-Type": "application/json",
  };
}

function plainTextFromRichText(items) {
  if (!Array.isArray(items)) return "";
  return items.map((item) => item?.plain_text || "").join("");
}

function simplifyPropertyValue(property) {
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
        ? property.multi_select.map((item) => item.name)
        : [];
    case "date":
      return property.date || null;
    case "people":
      return Array.isArray(property.people)
        ? property.people.map((person) => person?.name || person?.email || null).filter(Boolean)
        : [];
    case "files":
      return Array.isArray(property.files)
        ? property.files.map((file) => file.name || file.file?.url || file.external?.url)
        : [];
    case "relation":
      return Array.isArray(property.relation)
        ? property.relation.map((relation) => relation.id)
        : [];
    case "formula":
      if (!property.formula) return null;
      return property.formula.string ?? property.formula.number ?? property.formula.boolean ?? property.formula.date ?? null;
    case "rollup":
      if (!property.rollup) return null;
      return property.rollup.array ?? property.rollup.number ?? property.rollup.string ?? property.rollup.date ?? null;
    case "created_by":
    case "last_edited_by":
      return property[property.type]?.name || property[property.type]?.email || null;
    default:
      return property[property.type] ?? null;
  }
}

export function extractNotionProperties(properties = {}) {
  if (!properties || typeof properties !== "object") return {};
  return Object.entries(properties).reduce((acc, [name, property]) => {
    acc[name] = simplifyPropertyValue(property);
    return acc;
  }, {});
}

function formatNotionPropertyValue(value) {
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

export function formatNotionPropertiesList(properties = {}) {
  const simplified = extractNotionProperties(properties);
  return Object.entries(simplified).map(([name, value]) => `${name}: ${formatNotionPropertyValue(value)}`);
}

function parseInput(argv, name, envName) {
  const prefix = `${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  if (arg) {
    return arg.slice(prefix.length);
  }
  return process.env[envName] || undefined;
}

export function getNotionFetchOptions(argv = process.argv, env = process.env) {
  void env;
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

export async function getNotionPagesOutput(options = {}) {
  const {
    accessToken,
    query = "",
    searchType = "workspace",
    pageSize = 50,
    maxPages = 3,
  } = options;

  const formatted = await fetchNotionPages({
    accessToken,
    query,
    searchType,
    pageSize,
    maxPages,
  });

  return formatted;
}

export async function runNotionFetchTest(argv = process.argv, env = process.env) {
  const options = getNotionFetchOptions(argv, env);
  if (!options.accessToken) {
    throw new Error("accessToken が必要です。例: node test.js accessToken=your-token");
  }

  const result = await getNotionPagesOutput(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function getSavedNotionTestData() {
  const savedNotionProperties = {
    Name: { type: "title", title: [{ plain_text: "テストタスク" }] },
    Description: { type: "rich_text", rich_text: [{ plain_text: "これは参照用のNotionデータです。" }] },
    Status: { type: "select", select: { name: "In progress" } },
    Assignee: { type: "rich_text", rich_text: [{ plain_text: "太郎" }] },
    Due: { type: "date", date: "2026-06-30" },
  };
  return formatNotionPropertiesList(savedNotionProperties);
}

export function extractNotionTitle(page) {
  const titleProperty = Object.values(page.properties || {}).find(
    (property) => property?.type === "title"
  );
  if (titleProperty) {
    return plainTextFromRichText(titleProperty.title);
  }

  if (Array.isArray(page.title)) {
    return plainTextFromRichText(page.title);
  }

  return page.url || page.id || "";
}

export function collectNotionPageInfo(page) {
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

export function filterNotionPagesByQuery(pages, query) {
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

async function fetchNotionJson(url, accessToken, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function queryNotionDatabase(
  accessToken,
  _databaseIdValue,
  pageSize = 50,
  maxPages = 5,
  filter = null,
  sorts = null
) {
  void filter;
  void sorts;
  return searchNotionWorkspace(accessToken, "", pageSize, maxPages);
}

export async function searchNotionWorkspace(accessToken, query = "", pageSize = 50, maxPages = 3) {
  const results = [];
  let nextCursor = null;
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const safeMaxPages = Math.min(Math.max(maxPages, 1), 10);
  let requestCount = 0;

  do {
    const body = {
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

export async function searchNotionPages(accessToken, query = "", pageSize = 50, maxPages = 3) {
  return searchNotionWorkspace(accessToken, query, pageSize, maxPages);
}

export async function fetchNotionPages({
  accessToken,
  query = "",
  searchType = "workspace",
  pageSize = 50,
  maxPages = 3,
}) {
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


