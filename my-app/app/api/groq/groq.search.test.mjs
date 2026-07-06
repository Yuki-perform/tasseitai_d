import assert from "node:assert/strict";
import test from "node:test";
import { buildNotionSearchText, matchesNotionQuery } from "./groq.js";

test("buildNotionSearchText keeps the first shopping list item visible", () => {
  const rows = [
    { title: "水", content: "飲み水" },
    { title: "紙", content: "トイレットペーパー" },
    { title: "肉", content: "鶏肉" },
    { title: "魚", content: "サバ" },
  ];

  const text = buildNotionSearchText(rows, "買い物リスト");

  assert.match(text, /水/);
  assert.match(text, /紙/);
  assert.match(text, /肉/);
  assert.match(text, /魚/);
});

test("generic shopping-list questions should not drop rows", () => {
  const row = { title: "水", content: "飲み水" };
  assert.equal(matchesNotionQuery(row, "買い物リストの内容を教えて"), true);
});
