import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { collectNotionPageInfo, searchNotionPages } from "../notion";
import { authOptions } from "../auth/[...nextauth]/route";

const defaultPageSize = 50;
const defaultMaxPages = 3;

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(1, Math.floor(numberValue)) : fallback;
}

export async function POST(request: Request) {
  try {
    // NextAuthのセッションからaccessTokenを取得
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const accessToken = (session as any)?.accessToken;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Notion access tokenが取得できません。Notionで再度ログインしてください。" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const pageSize = normalizeNumber(body.pageSize, defaultPageSize);
    const maxPages = normalizeNumber(body.maxPages, defaultMaxPages);

    const pages = await searchNotionPages(accessToken, query, pageSize, maxPages);
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
