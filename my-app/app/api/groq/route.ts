import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { generateText, generateTextFromNotionData } from "./groq.js";
import { authOptions } from "../auth/[...nextauth]/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    let content;

    if (question) {
      // セッションからaccessTokenを取得
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
      content = await generateTextFromNotionData(question, accessToken);
    } else if (prompt) {
      content = await generateText(prompt);
    } else {
      return NextResponse.json({ error: "prompt または question が必要です" }, { status: 400 });
    }

    return NextResponse.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーです";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
