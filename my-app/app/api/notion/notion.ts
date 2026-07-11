// 使い方：このファイルから必要な関数をインポートして使用します。
//
// searchNotionPages(apiKey, query) - Notionワークスペース内のページ／データベースを検索します。
// collectNotionPageInfo(page) - Notionページ／データベースのメタ情報／プロパティ一覧を整形します。

//interfaceまとめ(機能ごとにimportをまとめる予定)
import { 
  NotionFetchOptions,
  NotionPagesOutput,
} from "../notion";



//汎用ユーティリティ関数
import {
  parseInput,
} from "./utils/notion-utils";

import {
  fetchNotionPages
} from "./api/search";


// function buildNotionSchemaMap(schemaProperties: unknown) {
//   const exactMatches = new Map<string, { name: string; type: string }>();
//   const groupedByType: Record<string, Array<{ name: string; type: string }>> = {};

//   const normalized = normalizeSchemaPropertiesInput(schemaProperties);
//   if (!normalized || typeof normalized !== "object") {
//     return { exactMatches, groupedByType };
//   }

//   Object.entries(normalized).forEach(([name, value]) => {
//     const type = typeof value === "string" ? value : inferNotionPropertyType(name, value);
//     const key = normalizeKey(name);
//     exactMatches.set(key, { name, type });
//     groupedByType[type] = groupedByType[type] || [];
//     groupedByType[type].push({ name, type });
//   });

//   return { exactMatches, groupedByType };
// }

// function simplifyPropertyValue(property: any): any {
//   if (!property || typeof property !== "object") return null;

//   switch (property.type) {
//     case "title":
//       return plainTextFromRichText(property.title);
//     case "rich_text":
//       return plainTextFromRichText(property.rich_text);
//     case "number":
//     case "checkbox":
//     case "url":
//     case "email":
//     case "phone_number":
//     case "created_time":
//     case "last_edited_time":
//       return property[property.type];
//     case "select":
//       return property.select ? property.select.name : null;
//     case "multi_select":
//       return Array.isArray(property.multi_select)
//         ? property.multi_select.map((item: any) => item.name)
//         : [];
//     case "date":
//       return property.date || null;
//     case "people":
//       return Array.isArray(property.people)
//         ? property.people
//             .map((person: any) => person?.name || person?.email || null)
//             .filter(Boolean)
//         : [];
//     case "files":
//       return Array.isArray(property.files)
//         ? property.files.map(
//             (file: any) => file.name || file.file?.url || file.external?.url
//           )
//         : [];
//     case "relation":
//       return Array.isArray(property.relation)
//         ? property.relation.map((relation: any) => relation.id)
//         : [];
//     case "formula":
//       if (!property.formula) return null;
//       return (
//         property.formula.string ??
//         property.formula.number ??
//         property.formula.boolean ??
//         property.formula.date ??
//         null
//       );
//     case "rollup":
//       if (!property.rollup) return null;
//       return (
//         property.rollup.array ??
//         property.rollup.number ??
//         property.rollup.string ??
//         property.rollup.date ??
//         null
//       );
//     case "created_by":
//     case "last_edited_by":
//       return property[property.type]?.name || property[property.type]?.email || null;
//     default:
//       return property[property.type] ?? null;
//   }
// }

// //->groqなし、内部利用あり
// export function extractNotionProperties(properties: Record<string, any> = {}): Record<string, any> {
//   if (!properties || typeof properties !== "object") return {};
//   return Object.entries(properties).reduce((acc: Record<string, any>, [name, property]) => {
//     acc[name] = simplifyPropertyValue(property);
//     return acc;
//   }, {});
// }

// //->groqなし、内部利用あり
// export function formatNotionPropertiesList(properties: Record<string, any> = {}): string[] {
//   const simplified = extractNotionProperties(properties);
//   return Object.entries(simplified).map(([name, value]) => `${name}: ${formatNotionPropertyValue(value)}`);
// }

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

// export function buildNotionSavePayload(
//   mappings: Array<{
//     propertyName: string;
//     value: string;
//   }>,
//   schemaProperties: unknown = {}
// ) {
//   const payload = Object.fromEntries(
//     mappings.map(item => [
//       item.propertyName,
//       item.value
//     ])
//   );

//   return buildNotionProperties(
//     payload,
//     schemaProperties
//   );
// }

// function buildNotionProperties(payload: unknown = {}, schemaProperties: unknown = {}) {
//   const normalizedPayload = typeof payload === "string" ? safeParseJson(payload) || { content: payload } : payload || {};
//   const schemaMap = buildNotionSchemaMap(schemaProperties);
//   const properties: Record<string, any> = {};

//   Object.entries(normalizedPayload as Record<string, any>).forEach(([key, value]) => {
//     const propertyInfo = lookupNotionProperty(key, schemaMap, value);
//     const notionValue = buildNotionPropertyValue(propertyInfo.type, value);
//     if (!notionValue) return;
//     if (!properties[propertyInfo.name]) {
//       properties[propertyInfo.name] = notionValue;
//     }
//   });

//   const hasTitle = Object.values(properties).some((property) => property?.title);
//   if (!hasTitle) {
//     properties.Title = createFallbackTitle(normalizedPayload);
//   }

//   return ensureRequiredProperties(properties, schemaProperties, normalizedPayload);
// }

// function normalizeSchemaPropertiesInput(schemaProperties: unknown): Record<string, any> {
//   if (!schemaProperties) return {};
//   if (Array.isArray(schemaProperties)) {
//     try {
//       return Object.fromEntries(
//         schemaProperties
//           .filter((p: any) => p && typeof p.name === "string")
//           .map((p: any) => [p.name, p.type || "rich_text"])
//       );
//     } catch {
//       return {};
//     }
//   }
//   if (schemaProperties && typeof schemaProperties === "object" && Array.isArray((schemaProperties as any).properties)) {
//     try {
//       return Object.fromEntries(
//         (schemaProperties as any).properties
//           .filter((p: any) => p && typeof p.name === "string")
//           .map((p: any) => [p.name, p.type || (p && p.type) || "rich_text"])
//       );
//     } catch {
//       return {};
//     }
//   }
//   if (typeof schemaProperties === "object") return schemaProperties as Record<string, any>;
//   return {};
// }

// function ensureRequiredProperties(properties: Record<string, any>, schemaProperties: unknown = {}, payload: unknown = {}) {
//   const normalized = normalizeSchemaPropertiesInput(schemaProperties);
//   if (!normalized || typeof normalized !== "object") return properties;

//   const schemaEntries = Object.entries(normalized).map(([name, val]) => {
//     const type = typeof val === "string" ? val : (val && (val as any).type) || inferNotionPropertyType(name, val);
//     return { name, type };
//   });

//   for (const { name, type } of schemaEntries) {
//     if (properties[name]) {
//       if (type === "date") {
//         const hasDate = properties[name] && properties[name].date && parseDateValue(properties[name].date.start);
//         if (!hasDate) {
//           properties[name] = { date: { start: new Date().toISOString() } };
//         }
//       }
//       continue;
//     }

//     switch (type) {
//       case "title":
//         //properties配下のキーに登録されている文字列を用いるため、実際に登録されている文字列を取得する。
//         //properties[name] = { title: { text: "testdata"}};
//         break;
//       case "date":
//         properties[name] = { date: { start: new Date().toISOString() } };
//         break;
//       case "number":
//         properties[name] = { number: 0 };
//         break;
//       case "select":
//         properties[name] = { select: { name: "Uncategorized" } };
//         break;
//       case "multi_select":
//         properties[name] = { multi_select: [] };
//         break;
//       case "checkbox":
//         properties[name] = { checkbox: false };
//         break;
//       default:
//         properties[name] = { rich_text: [{ type: "text", text: { content: "" } }] };
//         break;
//     }
//   }

//   const hasTitle = Object.values(properties).some((p) => p && (p as any).title);
//   if (!hasTitle) {
//     properties.Title = createFallbackTitle(payload);
//   }

//   return properties;
// }

// function createFallbackTitle(payload: unknown) {
//   const values = Array.isArray(payload)
//     ? payload.map(normalizeNotionTextValue)
//     : Object.values(payload || {}).map(normalizeNotionTextValue);
//   const titleText = values.filter(Boolean).join(" / ").trim();
//   return buildTitleProperty(titleText || "Notion update");
// }

// function buildTitleProperty(content: string) {
//   return {
//     title: [
//       {
//         text: {
//           content: normalizeText(content) || "Untitled",
//         },
//       },
//     ],
//   };
// }

// function inferNotionPropertyType(propertyKey: string, rawValue: unknown): string {
//   const key = normalizeKey(propertyKey);
//   if (!key) return "rich_text";

//   if (/(^title$|^name$|subject|headline|heading)/.test(key)) return "title";
//   if (/(description|content|body|note|memo|summary|detail|comment|message|sentence|prompt|question)/.test(key)) return "rich_text";
//   if (/(status|state|stage|type|category|priority|label|role|topic|level)/.test(key)) return "select";
//   if (/(tags|labels|categories|genres|topics|people|assignees)/.test(key)) return "multi_select";
//   if (/(date|due|deadline|created|updated|finished|time|start|end)/.test(key)) return "date";
//   if (/(url|link|website|homepage|page|path)/.test(key)) return "url";
//   if (/(email|mail)/.test(key)) return "email";
//   if (/(phone|tel|mobile|contact)/.test(key)) return "phone_number";
//   if (/(^(is|has|should|was|can|did|do|done)|_(is|has|done)$|checkbox|completed|active|enabled)/.test(key) || typeof rawValue === "boolean") return "checkbox";
//   if (Array.isArray(rawValue)) return "multi_select";
//   if (typeof rawValue === "number") return "number";
//   return "rich_text";
// }

// function lookupNotionProperty(rawKey: string, schemaMap: ReturnType<typeof buildNotionSchemaMap>, rawValue: unknown) {
//   const normalizedKey = normalizeKey(rawKey);
//   const exact = schemaMap.exactMatches.get(normalizedKey);
//   if (exact) return exact;

//   const inferredType = inferNotionPropertyType(rawKey, rawValue);
//   const fallbackByType = schemaMap.groupedByType[inferredType];
//   if (Array.isArray(fallbackByType) && fallbackByType.length > 0) {
//     return fallbackByType[0];
//   }

//   return { name: rawKey.trim() || "Title", type: inferredType };
// }

// function buildNotionPropertyValue(type: string, rawValue: unknown) {
//   const valueText = normalizeNotionTextValue(rawValue);

//   switch (type) {
//     case "title":
//       return buildTitleProperty(valueText);
//     case "rich_text":
//       return { rich_text: [{ type: "text", text: { content: valueText } }] };
//     case "number": {
//       const numberValue = Number(rawValue);
//       return Number.isFinite(numberValue)
//         ? { number: numberValue }
//         : { number: 0 };
//     }
//     case "checkbox":
//       return { checkbox: Boolean(rawValue) };
//     case "url":
//       return { url: valueText || null };
//     case "email":
//       return { email: valueText || null };
//     case "phone_number":
//       return { phone_number: valueText || null };
//     case "date": {
//       const parsed = parseDateValue(rawValue);
//       return { date: { start: parsed || new Date().toISOString() } };
//     }
//     case "select":
//       return {
//         select: {
//           name: valueText || String(rawValue) || "Uncategorized",
//         },
//       };
//     case "multi_select": {
//       const items = Array.isArray(rawValue)
//         ? rawValue
//         : typeof rawValue === "string"
//         ? rawValue.split(/[,;]+/)
//         : [rawValue];
//       return {
//         multi_select: items
//           .map((item) => ({ name: normalizeNotionTextValue(item) }))
//           .filter((item) => item.name),
//       };
//     }
//     default:
//       return { rich_text: [{ type: "text", text: { content: valueText } }] };
//   }
// }

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

// export function extractNotionTitle(page: any): string {
//   const titleProperty = Object.values(page.properties || {}).find(
//     (property: any) => property?.type === "title"
//   );
//   if (titleProperty) {
//     return plainTextFromRichText((titleProperty as any).title);
//   }

//   if (Array.isArray(page.title)) {
//     return plainTextFromRichText(page.title);
//   }

//   return page.url || page.id || "";
// }

// //->groqなし、内部利用あり
// export function collectNotionPageInfo(page: any): NotionPageInfo {
//   return {
//     id: page.id,
//     object: page.object ?? null,
//     url: page.url ?? null,
//     title: extractNotionTitle(page),
//     parent: page.parent ?? null,
//     created_time: page.created_time ?? null,
//     last_edited_time: page.last_edited_time ?? null,
//     icon: page.icon ?? null,
//     cover: page.cover ?? null,
//     properties: extractNotionProperties(page.properties),
//     propertiesList: formatNotionPropertiesList(page.properties),
//   };
// }

// export async function findChildDatabases(
//   accessToken: string,
//   pageId: string,
//   seen?: Set<string>,
//   depth = 0
// ): Promise<DbSchema[]> {
//   if (!accessToken || !pageId || depth > 5) {
//     return [];
//   }

//   const seenSet = seen instanceof Set ? seen : new Set<string>(seen || []);

//   try {
//     const data = await fetchNotionJson(
//       `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
//       accessToken,
//       undefined,
//       "GET"
//     );

//     const schemas: DbSchema[] = [];
//     const results = Array.isArray(data?.results) ? data.results : [];

//     for (const block of results) {
//       const blockId = block?.id;
//       if (!blockId) continue;

//       if (block?.type === "child_database") {
//         if (!seenSet.has(blockId)) {
//           seenSet.add(blockId);
//           const schema = await fetchDbSchema(accessToken, blockId);
//           if (schema) schemas.push(schema);
//         }
//       }

//       if (block?.type === "child_page") {
//         const pageKey = `page:${blockId}`;
//         if (!seenSet.has(pageKey)) {
//           seenSet.add(pageKey);
//           const nestedSchemas = await findChildDatabases(accessToken, blockId, seenSet, depth + 1);
//           schemas.push(...nestedSchemas);
//         }
//       }
//     }

//     return schemas;
//   } catch (error) {
//     console.warn("[notion] findChildDatabases failed", error);
//     return [];
//   }
// }

// export async function fetchDbSchema(accessToken: string, id: string): Promise<DbSchema | null> {
//   if (!accessToken || !id) {
//     return null;
//   }

//   try {
//     const db = await fetchNotionJson(
//       `https://api.notion.com/v1/databases/${id}`,
//       accessToken,
//       undefined,
//       "GET"
//     );
//     const title =
//       Array.isArray(db?.title) && db.title.length > 0
//         ? db.title[0]?.plain_text || db.title[0]?.text?.content || "無題"
//         : "無題";

//     const rawProperties = db?.properties && typeof db.properties === "object" ? db.properties : {};
//     const properties: DbSchemaProperty[] = Object.entries(rawProperties).map(([name, prop]: [string, any]) => ({
//       name,
//       type: prop?.type || prop?.config?.type || "unknown",
//     }));

//     return {
//       id,
//       title,
//       properties,
//     };
//   } catch (error) {
//     console.warn("[notion] fetchDbSchema failed", error);
//     return null;
//   }
// }

// export async function searchDatabases(accessToken: string): Promise<DbSchema[]> {
//   if (!accessToken) {
//     return [];
//   }

//   try {
//     const data = await fetchNotionJson(
//       "https://api.notion.com/v1/search",
//       accessToken,
//       { page_size: 100 },
//       "POST"
//     );
//     if (!data || !Array.isArray(data.results)) {
//       console.warn("[notion] searchDatabases returned invalid results");
//       return [];
//     }

//     const allDatabases: DbSchema[] = [];
//     const seenIds = new Set<string>();
//     const dbIdsToTry = new Set<string>();
//     const pageIdsToTraverse = new Set<string>();

//     for (const result of data.results) {
//       const objectType = result?.object;
//       const parent = result?.parent;
//       const id = result?.id;

//       if (!id) continue;

//       if (objectType === "database") {
//         dbIdsToTry.add(id);
//         if (parent?.type === "page_id") {
//           pageIdsToTraverse.add(parent.page_id);
//         }
//         if (parent?.type === "database_id") {
//           dbIdsToTry.add(parent.database_id);
//         }
//       } else if (objectType === "page") {
//         if (parent?.type === "database_id") {
//           dbIdsToTry.add(parent.database_id);
//         } else {
//           pageIdsToTraverse.add(id);
//         }

//         if (parent?.type === "page_id") {
//           pageIdsToTraverse.add(parent.page_id);
//         }
//       }
//     }

//     for (const dbId of dbIdsToTry) {
//       if (seenIds.has(dbId)) continue;
//       seenIds.add(dbId);
//       const schema = await fetchDbSchema(accessToken, dbId);
//       if (schema) allDatabases.push(schema);
//     }

//     for (const pageId of pageIdsToTraverse) {
//       const pageKey = `page:${pageId}`;
//       if (seenIds.has(pageKey)) continue;
//       seenIds.add(pageKey);
//       const nestedSchemas = await findChildDatabases(accessToken, pageId, seenIds);
//       allDatabases.push(...nestedSchemas);
//     }

//     return allDatabases;
//   } catch (error) {
//     console.warn("[notion] searchDatabases failed", error);
//     return [];
//   }
// }

// export async function fetchPageBodyText(accessToken: string, pageId: string): Promise<string> {
//   if (!accessToken || !pageId) {
//     return "";
//   }

//   try {
//     const data = await fetchNotionJson(
//       `https://api.notion.com/v1/blocks/${pageId}/children?page_size=10`,
//       accessToken,
//       undefined,
//       "GET"
//     );

//     const texts: string[] = [];
//     const results = Array.isArray(data?.results) ? data.results : [];

//     for (const block of results) {
//       const richText = block?.[block?.type]?.rich_text || [];
//       for (const item of richText) {
//         if (item?.plain_text) {
//           texts.push(item.plain_text);
//         }
//       }
//     }

//     return texts.join(" ").slice(0, 500);
//   } catch (error) {
//     console.warn("[notion] fetchPageBodyText failed", error);
//     return "";
//   }
// }

// export async function queryDatabase(
//   accessToken: string,
//   databaseId: string,
//   includeBody = false
// ): Promise<NotionQueryRow[]> {
//   if (!accessToken || !databaseId) {
//     return [];
//   }

//   try {
//     const response = await fetchNotionJson(
//       `https://api.notion.com/v1/databases/${databaseId}/query`,
//       accessToken,
//       { page_size: 50 },
//       "POST"
//     );

//     if (!response || !Array.isArray(response.results)) {
//       console.warn("[notion] queryDatabase returned invalid results");
//       return [];
//     }

//     const rows: NotionQueryRow[] = [];

//     for (const page of response.results) {
//       const row: NotionQueryRow = { __page_id: page.id };
//       const properties = page.properties || {};

//       for (const [key, prop] of Object.entries(properties)) {
//         if (!prop || typeof prop !== "object") continue;

//         const propAny = prop as any;
//         switch (propAny.type) {
//           case "title":
//             row[key] = plainTextFromRichText(propAny.title);
//             break;
//           case "rich_text":
//             row[key] = plainTextFromRichText(propAny.rich_text);
//             break;
//           case "checkbox":
//             row[key] = propAny.checkbox ? "✓" : "✗";
//             break;
//           case "date":
//             row[key] = propAny.date?.start ?? "";
//             break;
//           case "select":
//             row[key] = propAny.select?.name ?? "";
//             break;
//           case "number":
//             row[key] = propAny.number != null ? String(propAny.number) : "";
//             break;
//           default:
//             break;
//         }
//       }

//       rows.push(row);
//     }

//     if (includeBody) {
//       for (const row of rows) {
//         const body = await fetchPageBodyText(accessToken, row.__page_id);
//         if (body) {
//           row.__body = body;
//         }
//       }
//     }

//     return rows;
//   } catch (error) {
//     console.warn("[notion] queryDatabase failed", error);
//     return [];
//   }
// }

// export async function searchNotionWorkspace(
//   accessToken: string,
//   query = "",
//   pageSize = 50,
//   maxPages = 3
// ): Promise<any[]> {
//   const results: any[] = [];
//   let nextCursor: string | null = null;
//   const safePageSize = Math.min(Math.max(pageSize, 1), 100);
//   const safeMaxPages = Math.min(Math.max(maxPages, 1), 10);
//   let requestCount = 0;

//   do {
//     const body: Record<string, any> = {
//       query,
//       page_size: safePageSize,
//     };
//     if (nextCursor) body.start_cursor = nextCursor;

//     const data = await fetchNotionJson("https://api.notion.com/v1/search", accessToken, body);

//     if (Array.isArray(data.results)) {
//       results.push(...data.results);
//     }
//     nextCursor = data.next_cursor;
//     requestCount += 1;
//   } while (nextCursor && requestCount < safeMaxPages);

//   return results;
// }

// export async function searchNotionPages(
//   accessToken: string,
//   query = "",
//   pageSize = 50,
//   maxPages = 3
// ): Promise<any[]> {
//   return searchNotionWorkspace(accessToken, query, pageSize, maxPages);
// }

//->groqあり、内部利用あり
// export async function fetchNotionPages({
//   accessToken,
//   query = "",
//   searchType = "workspace",
//   pageSize = 50,
//   maxPages = 3,
// }: FetchNotionPagesOptions): Promise<FetchNotionPagesResult> {
//   if (!accessToken) {
//     throw new Error("accessToken is required to fetch Notion pages.");
//   }

//   const source = searchType === "search" ? "search" : "workspace";
//   const pages = await searchNotionWorkspace(accessToken, query, pageSize, maxPages);

//   const results = pages.map((page) => collectNotionPageInfo(page));
//   return {
//     source,
//     count: results.length,
//     results,
//   };

// }

// export async function getWorkspaceSchema(
//   accessToken: string
// ) {
//   const databases = await searchDatabases(accessToken);

//   return databases.map((db) => ({
//     databaseId: db.id,
//     databaseTitle: db.title,
//     properties: db.properties,
//   }));
// }
