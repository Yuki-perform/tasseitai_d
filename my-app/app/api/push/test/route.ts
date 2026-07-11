import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

// VAPID設定の環境変数
const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
const contact = process.env.WEB_PUSH_CONTACT;

// VAPID認証情報の初期化
if (publicKey && privateKey && contact) {
  webpush.setVapidDetails(contact, publicKey, privateKey);
}

// デフォルト値
const DEFAULT_TITLE = 'Journee Web Push';
const DEFAULT_MESSAGE = 'Server-sent web push for testing.';

/**
 * VAPID設定が正しく構成されているかチェック
 */
function isVapidConfigured(): boolean {
  return !!(publicKey && privateKey && contact);
}

/**
 * リクエストボディをパースして検証
 */
async function parseRequestBody(request: NextRequest) {
  try {
    const body = await request.json();
    return { success: true, data: body };
  } catch (error) {
    return { success: false, error: 'Invalid JSON body' };
  }
}

/**
 * サブスクリプションオブジェクトの必須フィールドを検証
 */
function validateSubscription(subscription: any): boolean {
  return !!(
    subscription?.endpoint &&
    subscription?.keys?.p256dh &&
    subscription?.keys?.auth
  );
}

/**
 * プッシュ通知ペイロードを作成
 */
function createNotificationPayload(title: string, message: string): string {
  return JSON.stringify({ 
    title, 
    body: message 
  });
}

/**
 * プッシュ通知を送信
 */
async function sendPushNotification(subscription: any, payload: string) {
  try {
    await webpush.sendNotification(subscription, payload);
    return { success: true };
  } catch (error) {
    console.error('[web-push] sendNotification failed', error);
    return { success: false, error: 'Failed to send push notification' };
  }
}

export async function POST(request: NextRequest) {
  // VAPID設定の確認
  if (!isVapidConfigured()) {
    return NextResponse.json(
      { error: 'VAPID keys are not configured on the server' },
      { status: 500 },
    );
  }

  // リクエストボディのパース
  const parseResult = await parseRequestBody(request);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error }, 
      { status: 400 }
    );
  }

  // リクエストパラメータの抽出
  const body = parseResult.data as any;
  const subscription = body?.subscription;
  const title = body?.title ?? DEFAULT_TITLE;
  const message = body?.body ?? DEFAULT_MESSAGE;

  // サブスクリプションの検証
  if (!validateSubscription(subscription)) {
    return NextResponse.json(
      { error: 'Invalid subscription object' }, 
      { status: 400 }
    );
  }

  // 通知ペイロードの作成
  const payload = createNotificationPayload(title, message);

  // プッシュ通知の送信
  const sendResult = await sendPushNotification(subscription, payload);
  
  if (sendResult.success) {
    return NextResponse.json({ ok: true });
  } else {
    return NextResponse.json(
      { error: sendResult.error }, 
      { status: 500 }
    );
  }
}