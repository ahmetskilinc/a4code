import { cursorRateModel } from "./accountUsage.ts";
import type { UsageRecord } from "@a4code/provider-core/server/usage";

export interface CursorAccountCache {
  readonly accountKey: string;
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly fetchedAtMs: number;
  readonly records: readonly UsageRecord[];
}

export const CURSOR_ACCOUNT_CACHE_FILE_NAME = "usage-cursor-account-cache-v2.json";
const CURSOR_ACCOUNT_CACHE_VERSION = 2;

type SerializedRecord = readonly [
  timestampMs: number,
  modelIndex: number,
  sessionIndex: number,
  uncachedInputTokens: number,
  cachedInputTokens: number,
  cacheCreationTokens: number,
  outputTokens: number,
  reportedCostUsd: number | null,
  dedupeKey: string | null,
];

interface SerializedAccount {
  readonly accountKey: string;
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly fetchedAtMs: number;
  readonly records: readonly SerializedRecord[];
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Drop a malformed account whole; surviving records would leave gaps in a range marked complete. */
export function decodeCursorAccountCaches(document: unknown): Map<string, CursorAccountCache> {
  const caches = new Map<string, CursorAccountCache>();
  if (typeof document !== "object" || document === null) return caches;
  const root = document as {
    readonly version?: unknown;
    readonly strings?: unknown;
    readonly accounts?: unknown;
  };
  const strings = root.strings;
  if (
    root.version !== CURSOR_ACCOUNT_CACHE_VERSION ||
    !Array.isArray(strings) ||
    !strings.every((value): value is string => typeof value === "string") ||
    typeof root.accounts !== "object" ||
    root.accounts === null
  ) {
    return caches;
  }
  const stringAt = (index: unknown): string | undefined =>
    typeof index === "number" ? strings[index] : undefined;

  const decodeRecord = (row: unknown): UsageRecord | null => {
    if (!Array.isArray(row)) return null;
    const [
      timestampMs,
      modelIndex,
      sessionIndex,
      uncached,
      cached,
      creation,
      output,
      cost,
      key,
    ]: readonly unknown[] = row;
    const model = stringAt(modelIndex);
    const sessionId = stringAt(sessionIndex);
    if (
      !isFiniteNumber(timestampMs) ||
      model === undefined ||
      sessionId === undefined ||
      !isFiniteNumber(uncached) ||
      !isFiniteNumber(cached) ||
      !isFiniteNumber(creation) ||
      !isFiniteNumber(output) ||
      (cost !== null && !isFiniteNumber(cost)) ||
      (key !== null && typeof key !== "string")
    ) {
      return null;
    }
    return {
      provider: "cursor",
      timestampMs,
      model,
      rateModel: cursorRateModel(model),
      sessionId,
      totals: {
        uncachedInputTokens: uncached,
        cachedInputTokens: cached,
        cacheCreationTokens: creation,
        outputTokens: output,
        reasoningTokens: 0,
      },
      reportedCostUsd: cost,
      speed: "standard",
      dedupeKey: key,
    };
  };

  for (const [credentialKey, raw] of Object.entries(root.accounts)) {
    if (typeof raw !== "object" || raw === null) continue;
    const account = raw as Partial<Record<keyof SerializedAccount, unknown>>;
    if (
      typeof account.accountKey !== "string" ||
      !isFiniteNumber(account.sinceMs) ||
      !isFiniteNumber(account.untilMs) ||
      !isFiniteNumber(account.fetchedAtMs) ||
      !Array.isArray(account.records)
    ) {
      continue;
    }
    const records: UsageRecord[] = [];
    for (const row of account.records) {
      const record = decodeRecord(row);
      if (record === null) break;
      records.push(record);
    }
    if (records.length !== account.records.length) continue;
    caches.set(credentialKey, {
      accountKey: account.accountKey,
      sinceMs: account.sinceMs,
      untilMs: account.untilMs,
      fetchedAtMs: account.fetchedAtMs,
      records,
    });
  }
  return caches;
}
