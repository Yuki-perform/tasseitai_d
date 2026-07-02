import { generateText, buildNotionPromptWithMockData } from "./groq_prompt.js";
import { getSavedNotionTestData } from "../notion/notion.js";

async function testGroqCall() {
  console.log("=== Groq API テスト開始 ===\n");

  const chatPronmpt = "ほしいゲームの一覧を教えて";
  //notionのモックデータを含める
  const notionData = getSavedNotionTestData();
  const Pronmpt = await buildNotionPromptWithMockData(chatPronmpt, notionData);
  console.log("テスト用のプロンプト:", chatPronmpt);
  try {
    const result = await generateText(Pronmpt);
    console.log("✓ 成功");
    console.log(`  結果: ${result.substring(0, 100)}...`);
  } catch (error) {
    console.log("✗ エラー:", error.message);
  }
  console.log();
}

testGroqCall();