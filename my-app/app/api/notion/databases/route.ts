import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import {
  DEFAULT_DATABASE_IDS,
  getUserDatabaseOverrides,
  setUserDatabaseId,
  type NotionTopicId,
} from "@/lib/notionDatabaseMap";

const TOPIC_IDS = Object.keys(DEFAULT_DATABASE_IDS) as NotionTopicId[];

function isTopicId(value: unknown): value is NotionTopicId {
  return typeof value === "string" && (TOPIC_IDS as string[]).includes(value);
}

// 現在のユーザーが設定しているデータベースID一覧（未設定のトピックは既定値をplaceholderとして返す）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "Notionと連携されていません" }, { status: 401 });
  }

  const overrides = await getUserDatabaseOverrides(session.userId);
  return NextResponse.json({ overrides, defaults: DEFAULT_DATABASE_IDS });
}

// 1トピック分のデータベースIDを保存（空文字を送ると既定値に戻る）
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "Notionと連携されていません" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as any;
  const topic = body?.topic;
  const databaseId = typeof body?.databaseId === "string" ? body.databaseId : "";

  if (!isTopicId(topic)) {
    return NextResponse.json({ error: "不明なtopicです" }, { status: 400 });
  }

  await setUserDatabaseId(session.userId, topic, databaseId);
  return NextResponse.json({ ok: true });
}
