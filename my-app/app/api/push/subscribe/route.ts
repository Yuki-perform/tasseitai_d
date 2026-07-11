import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { addPushSubscription } from "@/lib/pushSubscriptions";

function validateSubscription(subscription: any): boolean {
  return !!(
    subscription?.endpoint &&
    subscription?.keys?.p256dh &&
    subscription?.keys?.auth
  );
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "Notionと連携されていません" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subscription = body?.subscription;
  if (!validateSubscription(subscription)) {
    return NextResponse.json({ error: "Invalid subscription object" }, { status: 400 });
  }

  // 同じendpointの購読が既にあれば実質的に重複しないよう、文字列化したものをユーザーごとのSetに追加する
  await addPushSubscription(session.userId, subscription);

  return NextResponse.json({ ok: true });
}
