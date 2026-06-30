import { NextResponse } from "next/server";
import { collectNotionPageInfo, searchNotionPages } from "./notion";

const defaultPageSize = 50;
const defaultMaxPages = 3;

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(1, Math.floor(numberValue)) : fallback;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : process.env.NOTION_API_KEY;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const pageSize = normalizeNumber(body.pageSize, defaultPageSize);
    const maxPages = normalizeNumber(body.maxPages, defaultMaxPages);

    if (!apiKey) {
      return NextResponse.json({ error: "apiKey が必要です" }, { status: 400 });
    }

    const pages = await searchNotionPages(apiKey, query, pageSize, maxPages);
    const results = pages.map((page) => collectNotionPageInfo(page));

    return NextResponse.json({
      source: "workspace",
      count: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーです";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
