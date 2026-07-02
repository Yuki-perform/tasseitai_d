// 使い方：呼び出したいファイルで、
// import { generateText } from "./groq.js";　を追加してください。
// その後、generateText関数を呼び出すだけです。
//
// 例：test.js での呼び出し例があります。参考にしてください。

import { runNotionFetchTest } from "../../notion/notion.js";

// Notionデータを取得する関数（遅延実行）
async function fetchNotionData(accessToken) {
  if (!accessToken) {
    throw new Error("accessToken が必要です");
  }
  try {
    const data = await runNotionFetchTest([`accessToken=${accessToken}`], {});
    return {
      ...data,
      results: data.results.map(item => ({
        properties: item.properties,
        propertiesList: item.propertiesList
      }))
    };
  } catch (error) {
    console.error("Notionデータ取得エラー:", error.message);
    return { results: [] };
  }
}


// Node標準fetchを使う
//入力: promptText (string) - ユーザからの質問や指示
//出力: 生成されたテキスト (string) - GROQ APIからの応答
export async function generateText(promptText) {
  if (typeof promptText !== "string" || promptText.trim() === "") {
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
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
            { 
            role: "user", content: promptText.trim() 
            },
            {
            role: "system", content: "あなたは優秀なアシスタントです。"
            }
        ],
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

async function buildNotionPrompt(question, accessToken) {
  if (!accessToken) {
    throw new Error("accessToken が必要です");
  }
  const questionText = typeof question === "string" ? question.trim() : "";
  if (!questionText) {
    throw new Error("質問文が必要です");
  }
  
  const notionData = await fetchNotionData(accessToken);
  const propertiesList = (notionData?.results || [])
    .flatMap(result => result.propertiesList || [])
    .flat();
  const propertiesText = propertiesList.join('\n');

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

// テスト用ヘルパー関数：モックデータを使用したプロンプト構築
export async function buildNotionPromptWithMockData(question, mockNotionDataList = []) {
  const questionText = typeof question === "string" ? question.trim() : "";
  if (!questionText) {
    throw new Error("質問文が必要です");
  }
  
  const propertiesText = mockNotionDataList.join('\n');

  return [
    "以下は Notion データベースから取得した情報の一覧です。",
    "これらのデータをもとに、質問に回答してください。",
    "",
    propertiesText,
    "",
    `質問: ${questionText}`,
  ].join("\n");
}

