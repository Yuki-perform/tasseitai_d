import assert from "node:assert/strict";

const originalFetch = global.fetch;
const originalGROQApiKey = process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = "test-key";

global.fetch = async () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: "notion_update" } }],
  }),
  text: async () => "notion_update",
});

try {
  const { buildToolCallPrompt, buildRecallPrompt, generateTextWithNotionWorkflow } = await import("./groq.js");

  const toolPrompt = await buildToolCallPrompt("会議の内容を教えて");
  assert.match(toolPrompt, /^(notion_search|notion_update)$/);

  const recallPrompt = await buildRecallPrompt(
    "会議の内容を教えて",
    "notion_search",
    "タイトル: 会議メモ"
  );
  assert.match(recallPrompt, /実行した操作/);
  assert.match(recallPrompt, /notion_search/);
  assert.match(recallPrompt, /会議メモ/);
  assert.equal(typeof generateTextWithNotionWorkflow, "function");

  console.log("groq workflow helper tests passed");
} finally {
  global.fetch = originalFetch;
  process.env.GROQ_API_KEY = originalGROQApiKey;
}
