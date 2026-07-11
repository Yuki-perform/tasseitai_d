import { Redis } from "@upstash/redis";

// ログイン済み全ユーザーのNotionアクセストークンを保存しておく場所。
// cronにはログインセッションが無いため、各ユーザーの通知を作るにはここから読み出す。
const USERS_KEY = "notion:users";
const TOKEN_KEY_PREFIX = "notion:token:";

function tokenKey(userId: string): string {
  return `${TOKEN_KEY_PREFIX}${userId}`;
}

export async function saveNotionToken(userId: string, accessToken: string): Promise<void> {
  const redis = Redis.fromEnv();
  await redis.set(tokenKey(userId), accessToken);
  await redis.sadd(USERS_KEY, userId);
}

export async function getNotionToken(userId: string): Promise<string | null> {
  const redis = Redis.fromEnv();
  const token = await redis.get<string>(tokenKey(userId));
  return token ?? null;
}

export async function getAllNotionUserIds(): Promise<string[]> {
  const redis = Redis.fromEnv();
  const ids = await redis.smembers(USERS_KEY);
  return ids as string[];
}
