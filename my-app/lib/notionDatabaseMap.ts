import { Redis } from "@upstash/redis";
import {
  findDatabaseIdByTitle,
  searchNotionPages,
  getDatabaseSchema,
  getPropertyTypeCounts,
  scoreTypeCounts,
} from "@/app/api/notion/notion.js";
import { TOPIC_REGISTRATION_SCHEMAS } from "@/app/api/groq/groq.js";

// 各トピックの既定データベースID（共有チームワークスペース向け）。
// 個人ワークスペースでは基本的に使われず、自動検出にも失敗した場合の最終フォールバックとしてのみ使う。
export type NotionTopicId = "shopping" | "todo" | "schedule" | "jobhunting" | "memo";

export const DEFAULT_DATABASE_IDS: Record<NotionTopicId, string> = {
  shopping: "38fa15fd-a3c1-8049-8041-ebf679d048b2",
  todo: "38fa15fd-a3c1-80bd-98d9-ddcfe8406a93",
  schedule: "38fa15fd-a3c1-80fa-a200-d99ac64b3409",
  jobhunting: "38fa15fd-a3c1-8076-80ad-dc57719ac014",
  memo: "38fa15fd-a3c1-80ed-b95d-ea990af2b963",
};

// 自動検出時に検索する、各トピックの正式なデータベース名
export const TOPIC_LABELS: Record<NotionTopicId, string> = {
  shopping: "買い物リスト",
  todo: "進捗管理",
  schedule: "スケジュール",
  jobhunting: "就活",
  memo: "未分類メモ",
};

const TOPIC_IDS = Object.keys(DEFAULT_DATABASE_IDS) as NotionTopicId[];

// タイトル完全一致で見つからなかった場合に備え、groq.jsのトピック登録スキーマ（唯一の情報源）から
// 「このトピックのデータベースに期待されるプロパティ型の個数」を組み立てる
function buildExpectedTypeCounts(): Record<NotionTopicId, Record<string, number>> {
  const result = {} as Record<NotionTopicId, Record<string, number>>;
  for (const topic of TOPIC_IDS) {
    const fields = (TOPIC_REGISTRATION_SCHEMAS as any)[topic]?.fields || [];
    const counts: Record<string, number> = {};
    for (const field of fields as { type: string }[]) {
      counts[field.type] = (counts[field.type] || 0) + 1;
    }
    result[topic] = counts;
  }
  return result;
}

const EXPECTED_TYPE_COUNTS = buildExpectedTypeCounts();

// 内容ベースマッチングを再試行するまでの間隔（見つからなかったトピックに毎回コストをかけないため）
const CONTENT_MATCH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function overrideKey(userId: string): string {
  return `notion:databases:${userId}`;
}

// 自動検出（タイトル一致・内容一致どちらも）で見つかったIDのキャッシュ
function discoveredKey(userId: string): string {
  return `notion:databases:auto:${userId}`;
}

// 内容ベースマッチングを最後に試した時刻（クールダウン管理用）
function contentAttemptKey(userId: string): string {
  return `notion:databases:contentAttempt:${userId}`;
}

function isTopicId(value: string): value is NotionTopicId {
  return (TOPIC_IDS as string[]).includes(value);
}

// 期待される型の種類数に応じて、内容マッチングの合格ラインを決める。
// 種類数が少ない（2種以下）ほど誤判定のリスクが高いため完全一致を要求し、
// 種類数が多ければ1つ程度の欠けは許容する。1種類以下（memoなど）は信号が弱すぎるため対象外。
function passesContentMatchThreshold(matched: number, total: number, distinctTypes: number): boolean {
  if (distinctTypes < 2) return false;
  if (distinctTypes === 2) return matched === total;
  return matched >= total - 1;
}

// ユーザーが個別に登録したデータベースIDのみを返す（未設定のトピックは含まない）
export async function getUserDatabaseOverrides(userId: string): Promise<Partial<Record<NotionTopicId, string>>> {
  const redis = Redis.fromEnv();
  const stored = await redis.hgetall<Record<string, string>>(overrideKey(userId));
  if (!stored) return {};

  const overrides: Partial<Record<NotionTopicId, string>> = {};
  for (const [topic, databaseId] of Object.entries(stored)) {
    if (isTopicId(topic) && databaseId) {
      overrides[topic] = databaseId;
    }
  }
  return overrides;
}

// タイトル完全一致で見つからなかったトピックについて、実際のプロパティ構成を見て一致するデータベースを探す。
// 一意に決まらない（0件・2件以上）場合は絶対に選ばず、空のオブジェクトのそのトピック分だけ省く。
async function findTopicsByContentMatch(
  apiKey: string,
  topics: NotionTopicId[],
  excludeIds: Set<string>
): Promise<Partial<Record<NotionTopicId, string>>> {
  const eligibleTopics = topics.filter((topic) => Object.keys(EXPECTED_TYPE_COUNTS[topic]).length >= 2);
  if (eligibleTopics.length === 0) return {};

  const candidates = await searchNotionPages(apiKey, "", 20, 1, "database" as any);
  const remainingCandidates = candidates.filter((page: any) => !excludeIds.has(page.id));

  const schemaResults = await Promise.allSettled(
    remainingCandidates.map((page: any) => getDatabaseSchema(apiKey, page.id))
  );

  const candidateTypeCounts = remainingCandidates
    .map((page: any, index: number) => {
      const result = schemaResults[index];
      if (result.status !== "fulfilled") return null;
      return { id: page.id as string, counts: getPropertyTypeCounts(result.value?.properties) };
    })
    .filter((entry: any): entry is { id: string; counts: Record<string, number> } => entry !== null);

  const claimed = new Set<string>();
  const matches: Partial<Record<NotionTopicId, string>> = {};

  for (const topic of eligibleTopics) {
    const expected = EXPECTED_TYPE_COUNTS[topic];
    const distinctTypes = Object.keys(expected).length;

    const passing = candidateTypeCounts.filter((candidate) => {
      if (claimed.has(candidate.id)) return false;
      const { matched, total } = scoreTypeCounts(candidate.counts, expected);
      return passesContentMatchThreshold(matched, total, distinctTypes);
    });

    if (passing.length === 1) {
      matches[topic] = passing[0].id;
      claimed.add(passing[0].id);
    }
  }

  return matches;
}

// 手動設定・自動検出のどちらでも見つからなかったトピック名を一緒に返す
// （見つからなかった場合は共有ワークスペースの既定値にフォールバックするが、
//   呼び出し側が「本当に確認できた値か」を判断できるようにunresolvedを見せる）
export async function getUserDatabaseMap(
  userId: string,
  apiKey?: string | null
): Promise<{ databases: Record<NotionTopicId, string>; unresolved: NotionTopicId[] }> {
  const redis = Redis.fromEnv();
  const overrides = await getUserDatabaseOverrides(userId);
  const cached = (await redis.hgetall<Record<string, string>>(discoveredKey(userId))) || {};

  const databases = {} as Record<NotionTopicId, string>;
  const stillUnresolvedAfterExactMatch: NotionTopicId[] = [];

  for (const topic of TOPIC_IDS) {
    if (overrides[topic]) {
      databases[topic] = overrides[topic]!;
      continue;
    }

    if (cached[topic]) {
      databases[topic] = cached[topic];
      continue;
    }

    // 手動設定もキャッシュも無い場合のみ、Notionを検索してタイトル一致の自動検出を試みる
    let discoveredId: string | null = null;
    if (apiKey) {
      try {
        discoveredId = await findDatabaseIdByTitle(apiKey, TOPIC_LABELS[topic]);
      } catch (error) {
        console.error(`Notionデータベースの自動検出に失敗(${topic}):`, error);
      }
    }

    if (discoveredId) {
      databases[topic] = discoveredId;
      await redis.hset(discoveredKey(userId), { [topic]: discoveredId });
    } else {
      stillUnresolvedAfterExactMatch.push(topic);
    }
  }

  const unresolved: NotionTopicId[] = [];

  if (stillUnresolvedAfterExactMatch.length === 0 || !apiKey) {
    for (const topic of stillUnresolvedAfterExactMatch) {
      databases[topic] = DEFAULT_DATABASE_IDS[topic];
      unresolved.push(topic);
    }
    return { databases, unresolved };
  }

  // タイトル一致で見つからなかったトピックのみ、内容ベースマッチングを試みる（クールダウン付き）
  const usedIds = new Set(Object.values(databases));
  const attemptTimestamps = (await redis.hgetall<Record<string, string>>(contentAttemptKey(userId))) || {};
  const now = Date.now();

  const dueForAttempt = stillUnresolvedAfterExactMatch.filter((topic) => {
    const last = Number(attemptTimestamps[topic] || 0);
    return now - last >= CONTENT_MATCH_COOLDOWN_MS;
  });
  const inCooldown = stillUnresolvedAfterExactMatch.filter((topic) => !dueForAttempt.includes(topic));

  for (const topic of inCooldown) {
    databases[topic] = DEFAULT_DATABASE_IDS[topic];
    unresolved.push(topic);
  }

  if (dueForAttempt.length > 0) {
    let contentMatches: Partial<Record<NotionTopicId, string>> = {};
    try {
      contentMatches = await findTopicsByContentMatch(apiKey, dueForAttempt, usedIds);
    } catch (error) {
      console.error("Notionデータベースの内容ベース自動検出に失敗:", error);
    }

    for (const topic of dueForAttempt) {
      const matchedId = contentMatches[topic];
      if (matchedId) {
        databases[topic] = matchedId;
        await redis.hset(discoveredKey(userId), { [topic]: matchedId });
        await redis.hdel(contentAttemptKey(userId), topic);
      } else {
        databases[topic] = DEFAULT_DATABASE_IDS[topic];
        unresolved.push(topic);
        await redis.hset(contentAttemptKey(userId), { [topic]: String(now) });
      }
    }
  }

  return { databases, unresolved };
}

// databaseId が空文字なら「既定に戻す（自動検出に任せる）」扱いにする
export async function setUserDatabaseId(userId: string, topic: NotionTopicId, databaseId: string): Promise<void> {
  const redis = Redis.fromEnv();
  const trimmed = databaseId.trim();
  if (trimmed) {
    await redis.hset(overrideKey(userId), { [topic]: trimmed });
  } else {
    await redis.hdel(overrideKey(userId), topic);
    // 上書きを消したら、古い自動検出結果・クールダウンも消して次回また検索し直させる
    await redis.hdel(discoveredKey(userId), topic);
    await redis.hdel(contentAttemptKey(userId), topic);
  }
}
