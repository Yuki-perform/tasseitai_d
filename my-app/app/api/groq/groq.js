// 使い方：呼び出したいファイルで、
// import { generateText } from "./groq.js";　を追加してください。
// その後、generateText関数を呼び出すだけです。
//
// 例：test.js での呼び出し例があります。参考にしてください。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchNotionPages } from "../notion/notion.js";

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

function normalizeToolName(rawText) {
  const text = normalizeText(rawText).toLowerCase();
  if (!text) return null;
  if (text.includes("notion_search")) return "notion_search";
  if (text.includes("notion_update")) return "notion_update";
  if (/(none|不要|なし|not needed|tool not needed)/.test(text)) return null;
  return null;
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

    const results = await Promise.all(
      (data?.results || []).map(async (item) => {
        const content = await getPageContent(
          accessToken,
          item.id
        );

        return {
          title: item.title,
          url: item.url,
          lastEdited: item.last_edited_time,
          properties: item.properties,
          content,
        };
      })
    );

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

export async function buildToolCallPrompt(userMessage) {
  const template = await loadPromptTemplate("tool_call_prompt.txt");
  const message = normalizeText(userMessage);
  return [
    template
      .replaceAll("{{user_message}}", message)
      .replaceAll("{{tool_name}}", "")
      .replaceAll("{{tool_result}}", ""),
    "",
    `ユーザー入力: ${message}`,
    "",
    "判断対象: notion_search もしくは notion_update のどちらを使用すべきかを答えてください。",
  ].join("\n");
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

export async function generateTextWithNotionWorkflow(question, accessToken) {
  const questionText = normalizeText(question);
  if (!questionText) {
    throw new Error("質問文が必要です");
  }

  const toolCallPrompt = await buildToolCallPrompt(questionText);
  const toolDecision = await generateText(toolCallPrompt);
  const toolName = normalizeToolName(toolDecision);

  if (!toolName) {
    return generateText(questionText);
  }

  const notionData = await fetchNotionData(accessToken, questionText);
  const recallPrompt = await buildRecallPrompt(
    questionText,
    toolName,
    JSON.stringify(notionData, null, 2)
  );

  return generateText(recallPrompt);
}

// テスト用ヘルパー関数：モックデータを使用したプロンプト構築
export async function buildNotionPromptWithMockData(question, mockNotionDataList = []) {
  const questionText = normalizeText(question);
  if (!questionText) {
    throw new Error("質問文が必要です");
  }

  const propertiesText = mockNotionDataList.join("\n");

  return [
    "以下は Notion データベースから取得した情報の一覧です。",
    "これらのデータをもとに、質問に回答してください。",
    "",
    propertiesText,
    "",
    `質問: ${questionText}`,
  ].join("\n");
}

