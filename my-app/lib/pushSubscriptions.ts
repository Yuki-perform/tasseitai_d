import { Redis } from "@upstash/redis";

// プッシュ購読情報をユーザーごとに保存する（同じユーザーが複数端末を持つ場合に備えてSetにする）
const SUBSCRIPTIONS_KEY_PREFIX = "push:subscriptions:";

function subscriptionsKey(userId: string): string {
  return `${SUBSCRIPTIONS_KEY_PREFIX}${userId}`;
}

export async function addPushSubscription(userId: string, subscription: unknown): Promise<void> {
  const redis = Redis.fromEnv();
  await redis.sadd(subscriptionsKey(userId), JSON.stringify(subscription));
}

export async function getPushSubscriptions(userId: string): Promise<{ raw: string; subscription: any }[]> {
  const redis = Redis.fromEnv();
  const rawList = await redis.smembers(subscriptionsKey(userId));
  return rawList.map((raw) => ({
    raw: typeof raw === "string" ? raw : JSON.stringify(raw),
    subscription: typeof raw === "string" ? JSON.parse(raw) : raw,
  }));
}

export async function removePushSubscription(userId: string, raw: string): Promise<void> {
  const redis = Redis.fromEnv();
  await redis.srem(subscriptionsKey(userId), raw);
}
