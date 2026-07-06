import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { generateText, generateTextWithNotionWorkflow } from "./groq.js";
import { authOptions } from "../auth/[...nextauth]/route";

function isConfirmationMessage(value: string) {
  const text = value.trim().toLowerCase();
  return /(はい|ok|okay|実行|実行して|更新して|承認|確認|問題ない|そのまま|進めて|実行してよい|実行していい)/.test(text);
}

function isCancellationMessage(value: string) {
  const text = value.trim().toLowerCase();
  return /(いいえ|やめる|キャンセル|中止|中断|取り消し)/.test(text);
}

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
      const pendingCookie = cookieStore.get("notion_pending_update")?.value ?? "";
      let pendingUpdate: any = null;

      if (pendingCookie) {
        try {
          pendingUpdate = JSON.parse(Buffer.from(pendingCookie, "base64url").toString("utf8"));
        } catch {
          pendingUpdate = null;
        }
      }

      const hasPendingUpdate = Boolean(pendingUpdate);
      const confirmed = hasPendingUpdate && isConfirmationMessage(question);
      const cancelled = hasPendingUpdate && isCancellationMessage(question);

      if (hasPendingUpdate && !confirmed && !cancelled) {
        return NextResponse.json({
          content:
            "前回の更新内容はまだ確認待ちです。更新する場合は「はい」、キャンセルする場合は「いいえ」と入力してください。",
        });
      }

      if (cancelled) {
        cookieStore.set("notion_pending_update", "", {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
        return NextResponse.json({ content: "更新をキャンセルしました。" });
      }

      const workflowResult = await generateTextWithNotionWorkflow(
        question,
        accessToken,
        notionParentId,
        pendingUpdate,
        confirmed
      );

      res = typeof workflowResult === "string" ? workflowResult : workflowResult?.content || "";
      content = res;

      if (workflowResult && typeof workflowResult === "object" && workflowResult.pendingUpdate) {
        const pendingValue = Buffer.from(JSON.stringify(workflowResult.pendingUpdate)).toString("base64url");
        cookieStore.set("notion_pending_update", pendingValue, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      } else {
        cookieStore.set("notion_pending_update", "", {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
      }
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
