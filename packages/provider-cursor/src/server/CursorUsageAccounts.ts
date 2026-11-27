import type { ProviderInstanceId } from "@a4code/contracts";
import * as ProviderHost from "@a4code/provider-core/server/ProviderHost";
import type { ProviderUsageScan } from "@a4code/provider-core/server/usage";
import * as Context from "effect/Context";
import * as Digest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { CURSOR_ACCOUNT_CACHE_FILE_NAME, decodeCursorAccountCaches } from "./accountCache.ts";
import { readStoredCursorApiKey } from "./credentialStore.ts";

const decodeCacheFile = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Unknown as unknown as Schema.Codec<unknown>),
);

export class CursorUsageAccounts extends Context.Service<
  CursorUsageAccounts,
  {
    readonly scan: (input: {
      readonly instances: ReadonlyArray<{
        readonly instanceId: ProviderInstanceId;
        readonly environment: NodeJS.ProcessEnv;
      }>;
      readonly windowStartMs: number;
      readonly retentionCutoffMs: number;
    }) => Effect.Effect<ReadonlyArray<ProviderUsageScan>>;
  }
>()("@a4code/provider-cursor/server/CursorUsageAccounts") {}

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const host = yield* ProviderHost.ProviderHost;
  const digest = yield* Digest.Digest;

  const cachePath = path.join(host.paths.stateDir, CURSOR_ACCOUNT_CACHE_FILE_NAME);
  const readCaches = yield* Effect.cached(
    fileSystem.readFileString(cachePath).pipe(
      Effect.flatMap(decodeCacheFile),
      Effect.orElseSucceed(() => null),
      Effect.map(decodeCursorAccountCaches),
    ),
  );

  const accountSource = Effect.fn("CursorUsageAccounts.accountSource")(function* (
    apiKey: string,
    windowStartMs: number,
  ) {
    const credentialHash = yield* digest.digest(Digest.sha256, new TextEncoder().encode(apiKey));
    const cache = (yield* readCaches).get(`api-key:${Hex.encode(credentialHash)}`);
    if (cache === undefined) return null;
    const source = `cursor-account:${cache.accountKey}`;
    return {
      dir: source,
      hostId: "cursor.com",
      volumeId: cache.accountKey,
      files: [
        {
          path: source,
          records: cache.records.filter((record) => record.timestampMs >= windowStartMs),
        },
      ],
    } satisfies ProviderUsageScan;
  });

  const scan: CursorUsageAccounts["Service"]["scan"] = Effect.fn("CursorUsageAccounts.scan")(
    function* ({ instances, windowStartMs, retentionCutoffMs }) {
      const apiKeys = yield* Effect.forEach(instances, ({ instanceId, environment }) =>
        environment.CURSOR_API_KEY?.trim()
          ? Effect.succeed(environment.CURSOR_API_KEY.trim())
          : readStoredCursorApiKey(instanceId).pipe(
              Effect.provideService(ProviderHost.ProviderHost, host),
              Effect.orElseSucceed(() => undefined),
            ),
      );
      const uniqueApiKeys = [...new Set(apiKeys.filter((apiKey) => apiKey !== undefined))];
      if (uniqueApiKeys.length > 0) {
        const sources: ReadonlyArray<ProviderUsageScan | null> = yield* Effect.forEach(
          uniqueApiKeys,
          (apiKey) => accountSource(apiKey, Math.max(windowStartMs, retentionCutoffMs)),
          { concurrency: 2 },
        );
        const byAccount = new Map<string, ProviderUsageScan>();
        for (const source of sources) {
          if (source !== null) byAccount.set(source.dir, source);
        }
        return [...byAccount.values()];
      }
      return [];
    },
  );

  return CursorUsageAccounts.of({ scan });
});

export const layer = Layer.effect(CursorUsageAccounts, make);
