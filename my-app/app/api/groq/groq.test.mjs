import assert from "node:assert/strict";
import {
  buildToolCallPrompt,
  buildRecallPrompt,
  generateTextWithNotionWorkflow,
} from "./groq.js";

const toolPrompt = await buildToolCallPrompt("会議の内容を教えて");
assert.match(toolPrompt, /ユーザー入力/);
assert.match(toolPrompt, /notion_search|notion_update/);

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
