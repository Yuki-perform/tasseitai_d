// 使い方：呼び出したいファイルで、
// import { generateText } from "./groq.js";　を追加してください。
// その後、generateText関数を呼び出すだけです。
//
// 例：test.js での呼び出し例があります。参考にしてください。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchNotionPages, searchDatabases, queryDatabase, fetchPageBodyText } from "../notion/notion.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

async function loadPromptTemplate(fileName) {
  const candidatePaths = [
    path.join(currentDir, fileName),
    path.join(currentDir, "..", "notion", fileName),
    path.join(currentDir, "..", "groq", fileName),
  ];

  let lastError;
  for (const candidatePath of candidatePaths) {
    try {
      return await readFile(candidatePath, "utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Prompt template not found: ${fileName}`);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isConfirmationMessage(value) {
  const text = normalizeText(value).toLowerCase();
  return /(はい|ok|okay|実行|実行して|更新して|承認|確認|問題ない|そのまま|進めて|実行してよい|実行していい)/.test(text);
}

function isCancellationMessage(value) {
  const text = normalizeText(value).toLowerCase();
  return /(いいえ|やめる|キャンセル|中止|中断|取り消し)/.test(text);
}

function buildPendingUpdateMessage(payload = {}) {
  const title = normalizeText(payload.title);
  const content = normalizeText(payload.content);
  const details = [];

  if (title) details.push(`- タイトル: ${title}`);
  if (content) details.push(`- 内容: ${content}`);

  return [
    "更新内容を確認してください。",
    ...details,
    "この内容で Notion を更新してよろしいですか？",
    "「はい」で実行します。",
  ].join("\n");
}

function normalizeToolName(rawText) {
  const text = normalizeText(rawText).toLowerCase();
  if (!text) return null;
  if (text.includes("notion_search")) return "notion_search";
  if (text.includes("notion_update")) return "notion_update";
  if (/(none|不要|なし|not needed|tool not needed)/.test(text)) return null;
  return null;
}

function normalizeKey(value) {
  return normalizeText(value)
    .replace(/[_\s-]+/g, " ")
    .trim()
    .toLowerCase();
}

function safeParseJson(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function inferNotionPropertyType(propertyKey, rawValue) {
  const key = normalizeKey(propertyKey);
  if (!key) return "rich_text";

  if (/(^title$|^name$|subject|headline|heading)/.test(key)) return "title";
  if (/(description|content|body|note|memo|summary|detail|comment|message|sentence|prompt|question)/.test(key)) return "rich_text";
  if (/(status|state|stage|type|category|priority|label|role|topic|level)/.test(key)) return "select";
  if (/(tags|labels|categories|genres|topics|people|assignees)/.test(key)) return "multi_select";
  if (/(date|due|deadline|created|updated|finished|time|start|end)/.test(key)) return "date";
  if (/(url|link|website|homepage|page|path)/.test(key)) return "url";
  if (/(email|mail)/.test(key)) return "email";
  if (/(phone|tel|mobile|contact)/.test(key)) return "phone_number";
  if (/(^(is|has|should|was|can|did|do|done)|_(is|has|done)$|checkbox|completed|active|enabled)/.test(key) || typeof rawValue === "boolean") return "checkbox";
  if (Array.isArray(rawValue)) return "multi_select";
  if (typeof rawValue === "number") return "number";
  return "rich_text";
}

function buildNotionSchemaMap(schemaProperties = {}) {
  const exactMatches = new Map();
  const groupedByType = {};

  if (!schemaProperties || typeof schemaProperties !== "object") {
    return { exactMatches, groupedByType };
  }

  Object.entries(schemaProperties).forEach(([name, value]) => {
    const type = inferNotionPropertyType(name, value);
    const key = normalizeKey(name);
    exactMatches.set(key, { name, type });
    groupedByType[type] = groupedByType[type] || [];
    groupedByType[type].push({ name, type });
  });

  return { exactMatches, groupedByType };
}

function lookupNotionProperty(rawKey, schemaMap, rawValue) {
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

function normalizeNotionTextValue(value) {
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

function buildTitleProperty(content) {
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

function buildNotionPropertyValue(type, rawValue) {
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
        : { rich_text: [{ type: "text", text: { content: valueText } }] };
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
      return parsed
        ? { date: { start: parsed } }
        : { rich_text: [{ type: "text", text: { content: valueText } }] };
    }
    case "select":
      return {
        select: {
          name: valueText || String(rawValue),
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

function createFallbackTitle(payload) {
  const values = Array.isArray(payload)
    ? payload.map(normalizeNotionTextValue)
    : Object.values(payload).map(normalizeNotionTextValue);
  const titleText = values.filter(Boolean).join(" / ").trim();
  return buildTitleProperty(titleText || "Notion update");
}

function buildNotionProperties(payload = {}, schemaProperties = {}) {
  const normalizedPayload = typeof payload === "string" ? safeParseJson(payload) || { content: payload } : payload || {};
  const schemaMap = buildNotionSchemaMap(schemaProperties);
  const properties = {};

  Object.entries(normalizedPayload).forEach(([key, value]) => {
    const propertyInfo = lookupNotionProperty(key, schemaMap, value);
    const notionValue = buildNotionPropertyValue(propertyInfo.type, value);
    if (!notionValue) return;
    if (!properties[propertyInfo.name]) {
      properties[propertyInfo.name] = notionValue;
    }
  });

  const hasTitle = Object.values(properties).some((property) => property?.title);
  if (!hasTitle) {
    properties.Title = createFallbackTitle(normalizedPayload);
  }

  return properties;
}

async function createNotionPage(accessToken, parentId, properties) {
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

  async function postPage(body) {
    const response = await fetch(notionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status} ${response.statusText} - ${responseText}`);
    }
    return JSON.parse(responseText);
  }

  try {
    return await postPage({ parent: { database_id: parentId }, properties });
  } catch (databaseError) {
    const message = databaseError instanceof Error ? databaseError.message : String(databaseError);
    if (message.includes("database_id") || message.includes("parent") || message.includes("Invalid request")) {
      throw new Error(`Notion page creation failed. parentId must be a valid database_id. ${message}`);
    }

    throw databaseError;
  }
}

export async function saveToNotion(accessToken, parentId, payload = {}, schemaProperties = {}) {
  const notionProperties = buildNotionProperties(payload, schemaProperties);
  return createNotionPage(accessToken, parentId, notionProperties);
}

// Notionデータを取得する関数（遅延実行）
async function fetchNotionData(accessToken, query = "") {
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

    const results = (data?.results || []).map((item) => ({
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
      error instanceof Error
        ? error.message
        : String(error)
    );

    return { results: [] };
  }
}

function buildNotionSearchText(rows = [], databaseTitle = "") {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  return rows
    .slice(0, 3)
    .map((row) => {
      const entries = Object.entries(row)
        .filter(([key]) => !key.startsWith("__"))
        .map(([key, value]) => `${key}: ${normalizeNotionTextValue(value)}`)
        .join(" / ");
      const body = row.__body ? `\nbody: ${normalizeNotionTextValue(row.__body)}` : "";
      return `- ${databaseTitle ? `${databaseTitle} | ` : ""}${entries}${body}`;
    })
    .join("\n");
}

function matchesNotionQuery(row = {}, question = "") {
  const query = normalizeText(question);
  if (!query) return true;

  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = Object.entries(row)
    .filter(([key]) => !key.startsWith("__"))
    .map(([, value]) => normalizeNotionTextValue(value))
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

export async function executeNotionSearch(accessToken, question = "") {
  const searchQuery = normalizeText(question);
  if (!accessToken) {
    return "Notion accessToken が設定されていません。";
  }

  try {
    const databases = await searchDatabases(accessToken);
    if (!Array.isArray(databases) || databases.length === 0) {
      return "Notion でデータベースを見つけられませんでした。";
    }

    const sections = [];
    for (const database of databases.slice(0, 5)) {
      const rows = await queryDatabase(accessToken, database.id, false);
      const enrichedRows = [];

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
export async function generateText(promptText) {
  const normalizedPromptText = normalizeText(promptText);
  if (!normalizedPromptText) {
    throw new Error("generateText requires a non-empty string promptText argument");
  }

  const groqApiKey = (process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY)?.trim();
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
    throw new Error(`GROQ API request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!res.ok) {
    const responseText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${responseText}`);
  }

  const data = await res.json().catch(() => null);
  return typeof data?.choices?.[0]?.message?.content === "string"
    ? data.choices[0].message.content.trim()
    : "";
}

//notionに対しsearchかupdateのどちらを使用するべきか判断させる。
//返り値: notion_search か notion_update のいずれかの文字列
export async function buildToolCallPrompt(userMessage) {
  const template = await loadPromptTemplate("tool_call_prompt.txt");
  const usermessage = normalizeText(userMessage);
  const judgePrompt = `${template}\nユーザー入力:${usermessage}\n判断対象: notion_search もしくは notion_update のどちらを使用すべきかを答えてください。返答はnotion_search か notion_update のいずれかの文字列のみで答えてください.`;
  return generateText(judgePrompt);
}

export async function buildRecallPrompt(userMessage, toolName, toolResult) {
  const template = await loadPromptTemplate("re_call_prompt.txt");
  return template
    .replaceAll("{{user_message}}", normalizeText(userMessage))
    .replaceAll("{{tool_name}}", normalizeText(toolName))
    .replaceAll("{{tool_result}}", normalizeText(toolResult));
}

async function buildNotionPrompt(question, accessToken) {
  if (!accessToken) {
    throw new Error("accessToken が必要です");
  }
  const questionText = normalizeText(question);
  if (!questionText) {
    throw new Error("質問文が必要です");
  }

  const notionData = await fetchNotionData(accessToken, questionText);
  const propertiesList = (notionData?.results || [])
    .flatMap((result) => result.propertiesList || [])
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

export async function generateTextFromNotionData(question, accessToken) {
  const promptText = await buildNotionPrompt(question, accessToken);
  return generateText(promptText);
}

//引数: question ユーザーからの質問
//返り値:　notionデータを見たうえでの回答
export async function generateTextWithNotionWorkflow(
  question,
  accessToken,
  notionParentId = "",
  pendingUpdate = null,
  confirmed = false
) {
  const questionText = normalizeText(question);
  if (!questionText) {
    throw new Error("質問文が必要です");
  }

  const notionData = await fetchNotionData(accessToken, questionText);
  let toolName = null;

  if (pendingUpdate && confirmed) {
    toolName = "notion_update";
  } else if (pendingUpdate && isCancellationMessage(questionText)) {
    return {
      content: "更新をキャンセルしました。",
      pendingUpdate: null,
    };
  } else {
    toolName = await buildToolCallPrompt(questionText);
  }

  if (!toolName) {
    return {
      content: await generateText(questionText),
      pendingUpdate: null,
    };
  }

  let toolResult = "";
  let nextPendingUpdate = null;

  if (toolName === "notion_update") {
    if (confirmed && pendingUpdate) {
      const savePayload = pendingUpdate.payload || {
        title: questionText,
        content: questionText,
      };

      const savedPage = await saveToNotion(
        accessToken,
        pendingUpdate.parentId || notionParentId,
        savePayload,
        pendingUpdate.schemaProperties || notionData?.results?.[0]?.properties
      );

      toolResult = savedPage?.url
        ? `Notionページを更新しました: ${savedPage.url}`
        : `Notionページを更新しました: ${savedPage?.id || "保存が完了しました"}`;
    } else if (!notionParentId) {
      toolResult = "Notion page/database ID が設定されていません。設定画面から保存先のIDを登録してください。";
    } else {
      const savePayload = {
        title: questionText,
        content: questionText,
      };

      nextPendingUpdate = {
        parentId: notionParentId,
        payload: savePayload,
        schemaProperties: notionData?.results?.[0]?.properties,
      };

      toolResult = buildPendingUpdateMessage(savePayload);
    }
  } else {
    toolResult = await executeNotionSearch(accessToken, questionText);
  }

  const recallPrompt = await buildRecallPrompt(
    questionText,
    toolName,
    toolResult
  );

  return {
    content: await generateText(recallPrompt),
    pendingUpdate: nextPendingUpdate,
  };
}

