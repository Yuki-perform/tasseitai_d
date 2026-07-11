// Web Push購読まわりの共通処理。
// notification-demoページ（手動テスト用）と、ホーム画面での自動購読の両方から使う。

const publicVapidKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : '';

  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; i += 1) {
    view[i] = rawData.charCodeAt(i);
  }

  return buffer;
}

export function checkPushSupport(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && typeof Notification !== 'undefined';
}

export async function registerServiceWorker(): Promise<{
  registration: ServiceWorkerRegistration;
  existingSubscription: PushSubscription | null;
}> {
  const existing = await navigator.serviceWorker.getRegistration();
  const activeReg = existing ?? (await navigator.serviceWorker.register('/sw.js'));
  const readyReg = activeReg ?? (await navigator.serviceWorker.ready);
  const existingSubscription = await readyReg.pushManager.getSubscription();

  return {
    registration: readyReg,
    existingSubscription,
  };
}

async function createPushSubscription(
  registration: ServiceWorkerRegistration,
  vapidKey: string
): Promise<PushSubscription> {
  const appServerKey = urlBase64ToArrayBuffer(vapidKey);

  return await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appServerKey,
  });
}

export async function getOrCreateSubscription(
  registration: ServiceWorkerRegistration,
  vapidKey: string
): Promise<{ subscription: PushSubscription; isExisting: boolean }> {
  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    return { subscription: existing, isExisting: true };
  }

  const newSubscription = await createPushSubscription(registration, vapidKey);
  return { subscription: newSubscription, isExisting: false };
}

// 定期通知（Cron経由）で使えるように、購読情報をサーバー側に保存しておく
export async function persistSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || '購読情報の保存に失敗しました');
  }
}

export type AutoSubscribeResult =
  | { status: 'subscribed'; isExisting: boolean }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

// 通知権限のリクエスト〜購読作成〜サーバー保存までを自動で行う。
// 既に許可・購読済みの場合も安全に呼び出せる（冪等）。
export async function autoSubscribeToPush(): Promise<AutoSubscribeResult> {
  if (!checkPushSupport()) {
    return { status: 'unsupported' };
  }

  if (!publicVapidKey) {
    return { status: 'error', message: 'VAPID公開鍵が設定されていません' };
  }

  try {
    const { registration } = await registerServiceWorker();

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return { status: 'denied' };
    }

    const { subscription, isExisting } = await getOrCreateSubscription(registration, publicVapidKey);
    await persistSubscription(subscription);

    return { status: 'subscribed', isExisting };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
