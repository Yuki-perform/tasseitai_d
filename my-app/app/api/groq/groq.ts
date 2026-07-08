import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchNotionPages,
  searchDatabases,
  queryDatabase,
  fetchPageBodyText,
  fetchDbSchema,
  buildNotionSavePayload,
} from "../notion/notion";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

interface NotionDebugState {
  requestBody: Record<string, unknown> | null;
  error: {
    message: string;
    status?: number;
    statusText?: string;
    responseText?: string;
  } | null;
}

let lastNotionDebugState: NotionDebugState = {
  requestBody: null,
  error: null,
};

export function getLastNotionDebugState(): NotionDebugState {
  return lastNotionDebugState;
}

async function loadPromptTemplate(fileName: string): Promise<string> {
  const candidatePaths = [
    path.join(currentDir, fileName),
    path.join(currentDir, "..", "notion", fileName),
    path.join(currentDir, "..", "groq", fileName),
  ];

  let lastError: Error | undefined;
  for (const candidatePath of candidatePaths) {
    try {
      return await readFile(candidatePath, "utf8");
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error(`Prompt template not found: ${fileName}`);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToolName(rawText: unknown): "notion_search" | "notion_update" | null {
  const text = normalizeText(rawText).toLowerCase();
  if (!text) return null;
  const match = text.match(/\b(notion_search|notion_update)\b/);
  if (Array.isArray(match) && match[1]) {
    return match[1] as "notion_search" | "notion_update";
  }
  if (text.includes("notion_update")) return "notion_update";
  if (text.includes("notion_search")) return "notion_search";
  if (/(none|不要|なし|not needed|tool not needed)/.test(text)) return null;
  return null;
}

function normalizeKey(value: unknown): string {
  return normalizeText(value)
    .replace(/[_\s-]+/g, " ")
    .trim()
    .toLowerCase();
}

function safeParseJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseDateValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeSchemaPropertiesInput(
  schemaProperties: unknown
): Record<string, string> {
  if (!schemaProperties) return {};
  // If schema is provided as array of { name, type }
  if (Array.isArray(schemaProperties)) {
    try {
      return Object.fromEntries(
        schemaProperties
          .filter((p) => p && typeof p.name === "string")
          .map((p) => [p.name, p.type || "rich_text"])
      );
    } catch {
      return {};
    }
  }
  // If schema is an object with a `properties` array (the shape the user requested)
  if (
    schemaProperties &&
    typeof schemaProperties === "object" &&
    Array.isArray((schemaProperties as any).properties)
  ) {
    try {
      return Object.fromEntries(
        (schemaProperties as any).properties
          .filter((p: any) => p && typeof p.name === "string")
          .map((p: any) => [p.name, p.type || (p && p.type) || "rich_text"])
      );
    } catch {
      return {};
    }
  }
  // If provided as map/object already
  if (typeof schemaProperties === "object") return schemaProperties as Record<string, string>;
  return {};
}

function inferNotionPropertyType(propertyKey: string, rawValue: unknown): string {
  const key = normalizeKey(propertyKey);
  if (!key) return "rich_text";

  if (/(^title$|^name$|subject|headline|heading)/.test(key)) return "title";
  if (
    /(description|content|body|note|memo|summary|detail|comment|message|sentence|prompt|question)/.test(
      key
    )
  )
    return "rich_text";
  if (/(status|state|stage|type|category|priority|label|role|topic|level)/.test(key))
    return "select";
  if (/(tags|labels|categories|genres|topics|people|assignees)/.test(key))
    return "multi_select";
  if (/(date|due|deadline|created|updated|finished|time|start|end)/.test(key))
    return "date";
  if (/(url|link|website|homepage|page|path)/.test(key)) return "url";
  if (/(email|mail)/.test(key)) return "email";
  if (/(phone|tel|mobile|contact)/.test(key)) return "phone_number";
  if (
    /(^(is|has|should|was|can|did|do|done)|_(is|has|done)$|checkbox|completed|active|enabled)/.test(
      key
    ) ||
    typeof rawValue === "boolean"
  )
    return "checkbox";
  if (Array.isArray(rawValue)) return "multi_select";
  if (typeof rawValue === "number") return "number";
  return "rich_text";
}

interface SchemaMapItem {
  name: string;
  type: string;
}

interface SchemaMap {
  exactMatches: Map<string, SchemaMapItem>;
  groupedByType: Record<string, SchemaMapItem[]>;
}

function buildNotionSchemaMap(schemaProperties: Record<string, unknown> = {}): SchemaMap {
  const exactMatches = new Map<string, SchemaMapItem>();
  const groupedByType: Record<string, SchemaMapItem[]> = {};

  const normalized = normalizeSchemaPropertiesInput(schemaProperties);
  if (!normalized || typeof normalized !== "object") {
    return { exactMatches, groupedByType };
  }

  Object.entries(normalized).forEach(([name, value]) => {
    const type = typeof value === "string" ? value : inferNotionPropertyType(name, value);
    const key = normalizeKey(name);
    exactMatches.set(key, { name, type });
    groupedByType[type] = groupedByType[type] || [];
    groupedByType[type].push({ name, type });
  });

  return { exactMatches, groupedByType };
}

function lookupNotionProperty(
  rawKey: string,
  schemaMap: SchemaMap,
  rawValue: unknown
): SchemaMapItem {
  const normalizedKey = normalizeKey(rawKey);
  const exact = schemaMap.exactMatches.get(normalizedKey);
  if (exact) return exact;

  const inferredType = inferNotionPropertyType(rawKey, rawValue);
  const fallbackByType = schemaMap.groupedByType[inferredType];
  if (Array.isArray(fallbackByType) && fallbackByType.length > 0) {
    return fallbackByType[0];
  }

  return { name: String(rawKey).trim() || "Title", type: inferredType };
}

function normalizeNotionTextValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeNotionTextValue(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function buildTitleProperty(content: string): Record<string, unknown> {
  return {
    title: [
      {
        text: {
          content: normalizeText(content) || "Untitled",
        },
      },
    ],
  };
}

function buildNotionPropertyValue(type: string, rawValue: unknown): Record<string, unknown> | null {
  const valueText = normalizeNotionTextValue(rawValue);

  switch (type) {
    case "title":
      return buildTitleProperty(valueText);
    case "rich_text":
      return { rich_text: [{ type: "text", text: { content: valueText } }] };
    case "number": {
      const numberValue = Number(rawValue);
      return Number.isFinite(numberValue)
        ? { number: numberValue }
        : { number: 0 };
    }
    case "checkbox":
      return { checkbox: Boolean(rawValue) };
    case "url":
      return { url: valueText || null };
    case "email":
      return { email: valueText || null };
    case "phone_number":
      return { phone_number: valueText || null };
    case "date": {
      const parsed = parseDateValue(rawValue);
      // Notion expects a date object for date properties. If parsing fails,
      // provide a sensible default (current time) to avoid validation errors.
      return { date: { start: parsed || new Date().toISOString() } };
    }
    case "select":
      return {
        select: {
          name: valueText || String(rawValue) || "Uncategorized",
        },
      };
    case "multi_select": {
      const items = Array.isArray(rawValue)
        ? rawValue
        : typeof rawValue === "string"
          ? rawValue.split(/[,;]+/)
          : [rawValue];
      return {
        multi_select: items
          .map((item) => ({ name: normalizeNotionTextValue(item) }))
          .filter((item) => item.name),
      };
    }
    default:
      return { rich_text: [{ type: "text", text: { content: valueText } }] };
  }
}

function ensureRequiredProperties(
  properties: Record<string, unknown>,
  schemaProperties: Record<string, unknown> = {},
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  const normalized = normalizeSchemaPropertiesInput(schemaProperties);
  if (!normalized || typeof normalized !== "object") return properties;

  const schemaEntries = Object.entries(normalized).map(([name, val]) => {
    const type =
      typeof val === "string"
        ? val
        : (val && typeof val === "object" && (val as any).type) ||
          inferNotionPropertyType(name, val);
    return { name, type };
  });

  for (const { name, type } of schemaEntries) {
    // Skip if property already provided
    if (properties[name]) {
      // For date property, ensure it has a valid date
      if (type === "date") {
        const hasDate =
          properties[name] &&
          typeof properties[name] === "object" &&
          (properties[name] as any).date &&
          parseDateValue((properties[name] as any).date.start);
        if (!hasDate) {
          properties[name] = { date: { start: new Date().toISOString() } };
        }
      }
      continue;
    }

    // Provide sensible defaults for required types
    switch (type) {
      case "title":
        properties[name] = { title: { text: "testdata"}};
        break;
      case "date":
        properties[name] = { date: { start: new Date().toISOString() } };
        break;
      case "number":
        properties[name] = { number: 0 };
        break;
      case "select":
        properties[name] = { select: { name: "Uncategorized" } };
        break;
      case "multi_select":
        properties[name] = { multi_select: [] };
        break;
      case "checkbox":
        properties[name] = { checkbox: false };
        break;
      default:
        // For rich_text and other types, add minimal text
        properties[name] = { rich_text: [{ type: "text", text: { content: "" } }] };
        break;
    }
  }

  // Ensure there is at least one title property on the page
  const hasTitle = Object.values(properties).some((p) => p && typeof p === "object" && (p as any).title);
  if (!hasTitle) {
    properties.Title = createFallbackTitle(payload);
  }

  return properties;
}

function createFallbackTitle(payload: unknown): Record<string, unknown> {
  const values = Array.isArray(payload)
    ? payload.map(normalizeNotionTextValue)
    : Object.values(payload || {}).map(normalizeNotionTextValue);
  const titleText = values.filter(Boolean).join(" / ").trim();
  return buildTitleProperty(titleText || "Notion update");
}

function buildNotionProperties(
  payload: Record<string, unknown> | string | null = {},
  schemaProperties: Record<string, unknown> = {}
): Record<string, unknown> {
  const normalizedPayload =
    typeof payload === "string" ? safeParseJson(payload) || { content: payload } : payload || {};
  const schemaMap = buildNotionSchemaMap(schemaProperties);
  const properties: Record<string, unknown> = {};

  Object.entries(normalizedPayload).forEach(([key, value]) => {
    const propertyInfo = lookupNotionProperty(key, schemaMap, value);
    const notionValue = buildNotionPropertyValue(propertyInfo.type, value);
    if (!notionValue) return;
    if (!properties[propertyInfo.name]) {
      properties[propertyInfo.name] = notionValue;
    }
  });

  const hasTitle = Object.values(properties).some((property) => property && typeof property === "object" && (property as any).title);
  if (!hasTitle) {
    properties.Title = createFallbackTitle(normalizedPayload);
  }

  // Ensure required properties (dates, titles, numbers, selects, etc.) are present
  return ensureRequiredProperties(properties, schemaProperties, normalizedPayload);
}

interface NotionUpdateContext {
  parentId: string;
  schemaProperties: Record<string, unknown>;
}

async function resolveNotionUpdateArgs(
  accessToken: string,
  requestedParentId: string,
  notionData: Record<string, unknown> = {}
): Promise<NotionUpdateContext> {
  let parentId = typeof requestedParentId === "string" ? requestedParentId : "";
  const rawProperties = (notionData as any)?.results?.[0]?.properties;
  const schemaProperties =
    rawProperties && typeof rawProperties === "object" ? rawProperties : {};

  if (!parentId) {
    const databases = await searchDatabases(accessToken);
    if (Array.isArray(databases) && databases.length > 0) {
      parentId = databases[0].id;
      if (!Object.keys(schemaProperties).length && Array.isArray(databases[0].properties)) {
        return {
          parentId,
          schemaProperties: Object.fromEntries(
            databases[0].properties.map((prop: any) => [prop.name, prop.type || "rich_text"])
          ),
        };
      }
    }
  }

  if (parentId && !Object.keys(schemaProperties).length) {
    const rows = await queryDatabase(accessToken, parentId, false);
    if (Array.isArray(rows) && rows.length > 0) {
      const inferredProperties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rows[0])) {
        if (key.startsWith("__")) continue;
        inferredProperties[key] = value;
      }
      if (Object.keys(inferredProperties).length > 0) {
        return { parentId, schemaProperties: inferredProperties };
      }
    }
  }

  return { parentId, schemaProperties };
}

function normalizeSchemaPropertiesArray(
  schemaProperties: Record<string, unknown> = {}
): SchemaMapItem[] {
  if (Array.isArray(schemaProperties)) return schemaProperties;
  if (schemaProperties && typeof schemaProperties === "object") {
    return Object.entries(schemaProperties).map(([name, value]) => ({
      name,
      type:
        typeof value === "string"
          ? value
          : (value && typeof value === "object" && (value as any).type) ||
            inferNotionPropertyType(name, value),
    }));
  }
  return [];
}

async function createNotionPage(
  accessToken: string,
  parentId: string,
  properties: Record<string, unknown>
): Promise<any> {
  if (!accessToken) {
    throw new Error("accessToken が必要です");
  }
  if (!parentId) {
    throw new Error("parentId が必要です");
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  const notionUrl = "https://api.notion.com/v1/pages";

  async function postPage(body: Record<string, unknown>): Promise<any> {
    const response = await fetch(notionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Notion API error: ${response.status} ${response.statusText} - ${responseText}`
      );
    }
    return JSON.parse(responseText);
  }

  try {
    const requestBody = { parent: { database_id: parentId}, properties };
    lastNotionDebugState = {
      requestBody,
      error: null,
    };
    //デバッグログ
    console.log(
      "[Notion] Sending page creation payload:\n",
      JSON.stringify(requestBody, null, 2)
    );
    return await postPage(requestBody);
  } catch (databaseError) {

    const message =
      databaseError instanceof Error ? databaseError.message : String(databaseError);
    const errorDetails = databaseError instanceof Error
      ? {
          message,
          status: (databaseError as Error & { status?: number }).status,
          statusText: (databaseError as Error & { statusText?: string }).statusText,
          responseText: (databaseError as Error & { responseText?: string }).responseText,
        }
      : { message };

    lastNotionDebugState = {
      requestBody: {
        parent: { database_id: parentId},
        properties,
      },
      error: errorDetails,
    };

    if (
      message.includes("database_id") ||
      message.includes("parent") ||
      message.includes("Invalid request")
    ) {
      throw new Error(
        `Notion page creation failed. parentId must be a valid database_id. ${message}`
      );
    }

    throw databaseError;
  }
}

export async function saveToNotion(
  accessToken: string,
  parentId: string,
  payload: Record<string, unknown> = {},
  schemaProperties: Record<string, unknown> = {}
): Promise<any> {
  const notionProperties = buildNotionProperties(payload, schemaProperties);
  return createNotionPage(accessToken, parentId, notionProperties);
}

// Notionデータを取得する関数（遅延実行）
async function fetchNotionData(
  accessToken: string,
  query = ""
): Promise<{ results: any[] }> {
  if (!accessToken) {
    throw new Error("accessToken が必要です");
  }

  try {
    const data = await fetchNotionPages({
      accessToken,
      query,
      pageSize: 10,
      maxPages: 2,
    });

    const results = (data?.results || []).map((item: any) => ({
      title: item.title,
      url: item.url,
      lastEdited: item.last_edited_time,
      properties: item.properties,
      propertiesList: item.propertiesList,
      content: "",
    }));

    return { results };
  } catch (error) {
    console.error(
      "Notionデータ取得エラー:",
      error instanceof Error ? error.message : String(error)
    );

    return { results: [] };
  }
}

export function buildNotionSearchText(rows: any[] = [], databaseTitle = ""): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  return rows
    .slice(0, 10)
    .map((row, index) => {
      const entries = Object.entries(row || {})
        .filter(([key]) => !key.startsWith("__"))
        .map(([key, value]) => `${key}: ${normalizeNotionTextValue(value)}`)
        .filter((entry) => entry.split(":").slice(1).join(":").trim())
        .join(" / ");
      const body = row?.__body ? `\nbody: ${normalizeNotionTextValue(row.__body)}` : "";
      const prefix = databaseTitle ? `${databaseTitle} | ` : "";
      return `- ${index + 1}. ${prefix}${entries || "内容なし"}${body}`;
    })
    .join("\n");
}

export function matchesNotionQuery(row: Record<string, unknown> = {}, question = ""): boolean {
  const query = normalizeText(question);
  if (!query) return true;

  const terms = query
    .split(/\s+/)
    .map((term) => term.toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return true;

  const genericQuery = /教えて|内容|一覧|表示|見せ|確認|リスト|何|どんな|どれ|お願い|して/.test(query);
  if (genericQuery) return true;

  const haystack = Object.entries(row || {})
    .filter(([key]) => !key.startsWith("__"))
    .map(([, value]) => normalizeNotionTextValue(value))
    .join(" ")
    .toLowerCase();

  return terms.some((term) => haystack.includes(term));
}

export async function executeNotionSearch(accessToken: string, question = ""): Promise<string> {
  const searchQuery = normalizeText(question);
  if (!accessToken) {
    return "Notion accessToken が設定されていません。";
  }

  try {
    const databases = await searchDatabases(accessToken);
    if (!Array.isArray(databases) || databases.length === 0) {
      return "Notion でデータベースを見つけられませんでした。";
    }

    const sections: string[] = [];
    for (const database of databases.slice(0, 5)) {
      const rows = await queryDatabase(accessToken, database.id, false);
      const enrichedRows: any[] = [];

      for (const row of rows) {
        const body = await fetchPageBodyText(accessToken, row.__page_id);
        if (body) {
          row.__body = body;
        }
        if (matchesNotionQuery(row, searchQuery)) {
          enrichedRows.push(row);
        }
      }

      const matchedRows = enrichedRows.length > 0 ? enrichedRows : rows;
      const sectionText = buildNotionSearchText(matchedRows, database.title || database.id);
      if (sectionText) {
        sections.push(`データベース: ${database.title || database.id}\n${sectionText}`);
      }
    }

    return sections.length > 0
      ? sections.join("\n\n")
      : "指定条件に一致する Notion データが見つかりませんでした。";
  } catch (error) {
    console.error("Notion search failed:", error);
    return `Notion検索中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Node標準fetchを使う
//入力: promptText (string) - ユーザからの質問や指示
//出力: 生成されたテキスト (string) - GROQ APIからの応答
export async function generateText(promptText: string): Promise<string> {
  const normalizedPromptText = normalizeText(promptText);
  if (!normalizedPromptText) {
    throw new Error("generateText requires a non-empty string promptText argument");
  }

  const groqApiKey = (
    process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY
  )?.trim();
  if (!groqApiKey) {
    throw new Error(
      "GROQ_API_KEY が設定されていません。Vercel の環境変数に GROQ_API_KEY を追加してください。"
    );
  }

  let res;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: normalizedPromptText }],
      }),
    });
  } catch (error) {
    throw new Error(
      `GROQ API request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!res.ok) {
    const responseText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${responseText}`);
  }

  const data = (await res.json().catch(() => null)) as any;
  return typeof data?.choices?.[0]?.message?.content === "string"
    ? data.choices[0].message.content.trim()
    : "";
}

//notionに対しsearchかupdateのどちらを使用するべきか判断させる。
//返り値: notion_search か notion_update のいずれかの文字列
export async function buildToolCallPrompt(userMessage: string): Promise<"notion_search" | "notion_update" | null> {
  const template = await loadPromptTemplate("tool_call_prompt.txt");
  const usermessage = normalizeText(userMessage);
  const judgePrompt = `${template}\nユーザー入力:${usermessage}\n判断対象: notion_search もしくは notion_update のどちらを使用すべきかを答えてください。返答はnotion_search か notion_update のいずれかの文字列のみで答えてください.`;
  const rawResult = await generateText(judgePrompt);
  return normalizeToolName(rawResult);
}

export async function buildRecallPrompt(
  userMessage: string,
  toolName: string,
  toolResult: string
): Promise<string> {
  const template = await loadPromptTemplate("re_call_prompt.txt");
  return template
    .replaceAll("{{user_message}}", normalizeText(userMessage))
    .replaceAll("{{tool_name}}", normalizeText(toolName))
    .replaceAll("{{tool_result}}", normalizeText(toolResult));
}

async function buildNotionPrompt(question: string, accessToken: string): Promise<string> {
  if (!accessToken) {
    throw new Error("accessToken が必要です");
  }
  const questionText = normalizeText(question);
  if (!questionText) {
    throw new Error("質問文が必要です");
  }

  const notionData = await fetchNotionData(accessToken, questionText);
  const propertiesList = (notionData?.results || [])
    .flatMap((result: any) => result.propertiesList || [])
    .flat();
  const propertiesText = propertiesList.join("\n");

  return [
    "以下は Notion データベースから取得した情報の一覧です。",
    "これらのデータをもとに、質問に回答してください。",
    "",
    propertiesText,
    "",
    `質問: ${questionText}`,
  ].join("\n");
}

export { buildNotionPrompt };

export async function generateTextFromNotionData(question: string, accessToken: string): Promise<string> {
  const promptText = await buildNotionPrompt(question, accessToken);
  return generateText(promptText);
}

interface GenerateTextWithNotionWorkflowResult {
  content: string;
  pendingUpdate: null;
}


//route.tsから呼び出される関数
//引数: question ユーザーからの質問
//返り値:　notionデータを見たうえでの回答
export async function generateTextWithNotionWorkflow(
  question: string,
  accessToken: string,
  notionParentId = "",
): Promise<GenerateTextWithNotionWorkflowResult> {
  const questionText = normalizeText(question);
  if (!questionText) {
    throw new Error("質問文が必要です");
  }

  const notionData = await fetchNotionData(accessToken, questionText);
  const toolName = await buildToolCallPrompt(questionText);

  if (!toolName) {
    return {
      content: await generateText(questionText),
      pendingUpdate: null,
    };
  }

  if (toolName === "notion_update") {
    const notionUpdateContext = await resolveNotionUpdateArgs(
      accessToken,
      notionParentId,
      notionData
    );

    if (!notionUpdateContext.parentId) {
      return {
        content:
          "Notion page/database ID が設定されていません。設定画面から保存先のIDを登録してください。",
        pendingUpdate: null,
      };
    }

    const dbSchema = await fetchDbSchema(accessToken, notionUpdateContext.parentId);
    const dbprops = dbSchema?.properties?.length
      ? dbSchema.properties
      : normalizeSchemaPropertiesArray(notionUpdateContext.schemaProperties);

    const savePayload = buildNotionSavePayload(questionText, dbprops);
    const savedPage = await saveToNotion(
      accessToken,
      notionUpdateContext.parentId,
      savePayload,
      notionUpdateContext.schemaProperties
    );

    return {
      content: savedPage?.url
        ? `Notionページを更新しました: ${savedPage.url}`
        : `Notionページを更新しました: ${savedPage?.id || "保存が完了しました"}`,
      pendingUpdate: null,
    };
  }

  const toolResult = await executeNotionSearch(accessToken, questionText);
  const recallPrompt = await buildRecallPrompt(questionText, toolName, toolResult);

  return {
    content: await generateText(recallPrompt),
    pendingUpdate: null,
  };
}
