import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { generateText, generateTextWithNotionWorkflow } from "./groq.js";
import { authOptions } from "../auth/[...nextauth]/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    let content;
    let res = "";

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

      //理想の処理:contentにNotionデータを見たうえでの回答が入る
      const cookieStore = await cookies();
      const notionParentId = cookieStore.get("notion_page_id")?.value ?? "";
      content = await generateTextWithNotionWorkflow(question, accessToken, notionParentId);
      res = typeof content === "string" ? content : "";
    } else if (prompt) {
      content = await generateText(prompt);
      res = typeof content === "string" ? content : "";
    } else {
      return NextResponse.json({ error: "prompt または question が必要です" }, { status: 400 });
    }

    return NextResponse.json({ content: res || content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーです";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
