import { ProviderDriverKind, settingsSecretLiteral } from "@a4code/contracts";
import { OpenCodeSettings } from "../settings.ts";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as OpenCode2TextGeneration from "./v2/textGeneration.ts";
import { makeOpenCodeTextGeneration } from "./textGeneration.ts";
import * as ProviderLatestVersions from "@a4code/provider-core/server/ProviderLatestVersions";
import * as ProviderHost from "@a4code/provider-core/server/ProviderHost";
import { expandHomePath } from "@a4code/provider-core/server/pathExpansion";
import { AgentScope } from "@a4code/shared/AgentScope";
import * as HostProcess from "@a4code/shared/HostProcess";
import { compareSemverVersions } from "@a4code/shared/semver";
import * as OpenCodeAdapterV2 from "./adapter.ts";
import * as OpenCode2AdapterV2 from "./v2/adapter.ts";
import type * as ProviderAdapter from "@a4code/provider-core/server/ProviderAdapter";
import type { ProviderTextGeneration } from "@a4code/provider-core/server/textGeneration";
import { ProviderDriverError } from "@a4code/provider-core/server/errors";
import { openCodeUsageReader, type OpenCodeUsageReaderEnv } from "./usage.ts";
import { makePendingOpenCodeProvider } from "./status.ts";
import {
  makeManagedServerProvider,
  readLocalCliStatus,
} from "@a4code/provider-core/server/managedProvider";
import * as OpenCodeRuntime from "./OpenCodeRuntime.ts";
import {
  makeOpenCodeRuntimeProbe,
  probeOpenCodeRuntime,
  probeOpenCodeBinary,
  type ProbedOpenCode,
} from "./versionProbe.ts";
import * as OpenCodeServerOwner from "./OpenCodeServerOwner.ts";
import * as OpenCode2Client from "./v2/OpenCode2Client.ts";
import * as OpenCode2Server from "./v2/OpenCode2Server.ts";
import { replaceOutdatedService } from "./v2/OpenCode2Service.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "@a4code/provider-core/server/driver";
import { withInstanceIdentity } from "@a4code/provider-core/server/instanceIdentity";
import { mergeProviderInstanceEnvironment } from "@a4code/provider-core/server/instanceEnvironment";
import { providerProbeEnvironment } from "@a4code/provider-core/server/snapshotProbe";
import {
  makeCachedProviderMaintenanceResolution,
  makeManualOnlyProviderMaintenanceCapabilities,
  makePackageManagedProviderMaintenanceResolver,
  normalizeCommandPath,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "@a4code/provider-core/server/maintenanceResolver";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "@a4code/provider-core/server/snapshotSettings";
const decodeOpenCodeSettings = Schema.decodeSync(OpenCodeSettings);

const DRIVER_KIND = ProviderDriverKind.make("opencode");

// A loopback server runs on this environment, but can outlive its CLI installation.
// Its reported version may therefore differ from the installed executable after an update.
export function isLocalOpenCodeServerUrl(serverUrl: string): boolean {
  const url = URL.parse(serverUrl.trim());
  if (url?.protocol !== "http:" && url?.protocol !== "https:") return false;
  return (
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(url.hostname)
  );
}

function isOpenCodeNativeCommandPath(commandPath: string): boolean {
  const normalized = normalizeCommandPath(commandPath);
  return (
    normalized.endsWith("/.opencode/bin/opencode") ||
    normalized.endsWith("/.opencode/bin/opencode.exe")
  );
}

function openCodeNativeHome(commandPath: string): string | null {
  const slashed = commandPath.replaceAll("\\", "/");
  const match = /\/\.opencode\/bin\/opencode(?:\.exe)?$/i.exec(slashed);
  if (!match) return null;
  return match.index === 0 ? "/" : slashed.slice(0, match.index);
}

/** Update only within the installed package generation; 2.x converts the shared database in place. */
export const openCodeUpdateFor = (generation: ProbedOpenCode["generation"]) =>
  makePackageManagedProviderMaintenanceResolver({
    provider: DRIVER_KIND,
    npmPackageName: generation === "v2" ? "@opencode/cli" : "opencode-ai",
    nativeUpdate: {
      // `isOpenCodeNativeCommandPath` is the curl installer's own binary. Name the
      // method so OpenCode does not have to infer it from `process.execPath`, which
      // fails when the binary is launched through a wrapper or shim.
      args: ["upgrade", "--method", "curl"],
      isCommandPath: isOpenCodeNativeCommandPath,
      requiresCommandPath: true,
      // The curl installer writes to `$HOME/.opencode/bin`, so point HOME at the install it replaces.
      env: (context) => {
        const home =
          openCodeNativeHome(context.realCommandPath) ??
          openCodeNativeHome(context.resolvedCommandPath);
        return home ? { HOME: home } : {};
      },
    },
    // mise's `opencode` follows releases into 2.x, so it would upgrade 1.x across that line.
    mise: { tool: "opencode", upgrade: generation === "v2" },
  });

type OpenCodeRuntimeProbe = Effect.Success<
  ReturnType<typeof makeOpenCodeRuntimeProbe<OpenCodeRuntime.OpenCodeRuntimeError>>
>;

function byOpenCodeRuntime<A, E, R, PE>(
  probed: Effect.Effect<ProbedOpenCode | undefined, PE>,
  paths: { readonly v1: Effect.Effect<A, E, R>; readonly v2: Effect.Effect<A, E, R> },
): Effect.Effect<A, E, R> {
  return probed.pipe(
    Effect.orElseSucceed(() => undefined),
    Effect.flatMap((result) => (result?.generation === "v2" ? paths.v2 : paths.v1)),
  );
}

// Hot reads use the last successful probe; session opens await it to select the correct protocol.
function selectOpenCodeRuntimeAdapter(input: {
  readonly probe: OpenCodeRuntimeProbe;
  readonly resolve: Effect.Effect<ProbedOpenCode, OpenCodeRuntime.OpenCodeRuntimeError>;
  readonly v1: ProviderAdapter.ProviderAdapterV2["Service"];
  readonly v2: ProviderAdapter.ProviderAdapterV2["Service"];
}): ProviderAdapter.ProviderAdapterV2["Service"] {
  const pick = <PE>(probed: Effect.Effect<ProbedOpenCode | undefined, PE>) =>
    byOpenCodeRuntime(probed, { v1: Effect.succeed(input.v1), v2: Effect.succeed(input.v2) });
  const hot = pick(Effect.map(input.probe.lastSuccess, Option.getOrUndefined));
  return {
    instanceId: input.v1.instanceId,
    driver: DRIVER_KIND,
    getCapabilities: Effect.fn("OpenCodeDriver.getCapabilities")(function* () {
      const probed = Option.getOrUndefined(yield* input.probe.lastSuccess);
      const adapter = yield* pick(Effect.succeed(probed));
      const capabilities = yield* adapter.getCapabilities();
      return {
        ...capabilities,
        turns: {
          ...capabilities.turns,
          supportsNativeGoals:
            capabilities.turns.supportsNativeGoals ??
            (probed?.generation === "v2" && compareSemverVersions(probed.version, "2.2.5") >= 0),
        },
      };
    }),
    planSelectionTransition: (transition) =>
      Effect.flatMap(hot, (adapter) => adapter.planSelectionTransition(transition)),
    openSession: (session) =>
      Effect.flatMap(pick(input.resolve), (adapter) => adapter.openSession(session)),
  };
}

function selectOpenCodeRuntimeTextGeneration(
  resolve: Effect.Effect<ProbedOpenCode, OpenCodeRuntime.OpenCodeRuntimeError>,
  v1: ProviderTextGeneration,
  v2: ProviderTextGeneration,
): ProviderTextGeneration {
  return {
    generateCommitMessage: (input) =>
      byOpenCodeRuntime(resolve, {
        v1: v1.generateCommitMessage(input),
        v2: v2.generateCommitMessage(input),
      }),
    generatePrContent: (input) =>
      byOpenCodeRuntime(resolve, {
        v1: v1.generatePrContent(input),
        v2: v2.generatePrContent(input),
      }),
    generateBranchName: (input) =>
      byOpenCodeRuntime(resolve, {
        v1: v1.generateBranchName(input),
        v2: v2.generateBranchName(input),
      }),
    generateThreadTitle: (input) =>
      byOpenCodeRuntime(resolve, {
        v1: v1.generateThreadTitle(input),
        v2: v2.generateThreadTitle(input),
      }),
    generateReviewGuide: (input) =>
      byOpenCodeRuntime(resolve, {
        v1: v1.generateReviewGuide(input),
        v2: v2.generateReviewGuide(input),
      }),
    generateTranscriptionPostProcessing: (input) =>
      byOpenCodeRuntime(resolve, {
        v1: v1.generateTranscriptionPostProcessing(input),
        v2: v2.generateTranscriptionPostProcessing(input),
      }),
  };
}

export type OpenCodeDriverEnv =
  | OpenCodeAdapterV2.OpenCodeAdapterV2DriverEnv
  | ProviderHost.ProviderHost
  | ChildProcessSpawner.ChildProcessSpawner
  | Digest.Digest
  | SecureRandom.SecureRandom
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | ProviderLatestVersions.ProviderLatestVersions
  | OpenCodeRuntime.OpenCodeRuntime
  | Path.Path;

export const OpenCodeDriver: ProviderDriver<
  OpenCodeSettings,
  OpenCodeDriverEnv,
  OpenCodeUsageReaderEnv
> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "OpenCode",
    supportsMultipleInstances: true,
  },
  configSchema: OpenCodeSettings,
  defaultConfig: (): OpenCodeSettings => decodeOpenCodeSettings({}),
  usage: openCodeUsageReader,
  create: Effect.fn("OpencodeDriver.create")(function* ({
    instanceId,
    displayName,
    accentColor,
    environment,
    enabled,
    config,
  }) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const openCodeRuntime = yield* OpenCodeRuntime.OpenCodeRuntime;
    const agentScope = yield* AgentScope;
    const httpClient = yield* HttpClient.HttpClient;
    const host = yield* ProviderHost.ProviderHost;
    const processEnv = yield* mergeProviderInstanceEnvironment(environment);
    const continuationIdentity = defaultProviderContinuationIdentity({
      driverKind: DRIVER_KIND,
      instanceId,
    });
    const stampIdentity = withInstanceIdentity({
      instanceId,
      driverKind: DRIVER_KIND,
      displayName,
      accentColor,
      continuationGroupKey: continuationIdentity.continuationKey,
    });
    const effectiveConfig = {
      ...config,
      enabled,
      binaryPath: expandHomePath(config.binaryPath, yield* HostProcess.HomeDirectory),
      // The instance registry has already read a referenced password from its secret provider.
      serverPassword: settingsSecretLiteral(config.serverPassword),
    } satisfies OpenCodeSettings;
    const probeRuntime = (probeEnv: NodeJS.ProcessEnv) =>
      probeOpenCodeRuntime(effectiveConfig, probeEnv).pipe(
        Effect.provideService(HttpClient.HttpClient, httpClient),
        Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, openCodeRuntime),
      );
    const runtimeProbe = yield* makeOpenCodeRuntimeProbe(
      probeRuntime(providerProbeEnvironment(processEnv)),
    );
    // A mise shim cannot install OpenCode offline; a session or text generation the user started
    // may, so without a cached result it probes once online and caches what mise installed.
    const resolveRuntime =
      effectiveConfig.serverUrl.trim().length > 0
        ? runtimeProbe.get
        : runtimeProbe.lastSuccess.pipe(
            Effect.flatMap(
              Option.match({
                onSome: Effect.succeed,
                onNone: () => probeRuntime(processEnv).pipe(Effect.tap(runtimeProbe.record)),
              }),
            ),
          );
    const noUpdate = makeManualOnlyProviderMaintenanceCapabilities({
      provider: DRIVER_KIND,
      packageName: null,
    });
    const maintenanceFor = (probed: typeof runtimeProbe.get) =>
      probed.pipe(
        Effect.map((result) => result.generation),
        Effect.option,
        Effect.flatMap((generation) =>
          Option.isNone(generation)
            ? Effect.succeed(noUpdate)
            : resolveProviderMaintenanceCapabilitiesEffect(openCodeUpdateFor(generation.value), {
                binaryPath: effectiveConfig.binaryPath,
                env: processEnv,
                npmCacheDir: pathService.join(host.paths.providerStatusCacheDir, "npm"),
              }),
        ),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, pathService),
      );
    const cachedMaintenance = yield* makeCachedProviderMaintenanceResolution(
      maintenanceFor(
        isLocalOpenCodeServerUrl(effectiveConfig.serverUrl)
          ? probeOpenCodeBinary(
              effectiveConfig.binaryPath,
              providerProbeEnvironment(processEnv),
            ).pipe(
              Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, openCodeRuntime),
              Effect.catch(() => runtimeProbe.get),
            )
          : runtimeProbe.get,
      ),
    );
    const resolveMaintenance = (options?: { readonly fresh?: boolean }) =>
      !effectiveConfig.enabled
        ? Effect.succeed(noUpdate)
        : options?.fresh === true
          ? runtimeProbe.refresh.pipe(
              Effect.ignore,
              Effect.andThen(cachedMaintenance({ fresh: true })),
            )
          : cachedMaintenance();
    const openCodeV1Adapter = yield* OpenCodeAdapterV2.OpenCodeAdapterV2Driver.create({
      instanceId,
      displayName,
      accentColor,
      environment,
      enabled,
      config: effectiveConfig,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderDriverError({
            driver: DRIVER_KIND,
            instanceId,
            detail: "Failed to build OpenCode orchestration adapter.",
            cause,
          }),
      ),
    );
    const openCode2Server = yield* OpenCode2Server.make({
      binaryPath: effectiveConfig.binaryPath,
      serverUrl: effectiveConfig.serverUrl,
      serverPassword: effectiveConfig.serverPassword,
      directory: host.paths.cwd,
      environment: processEnv,
    }).pipe(
      Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, openCodeRuntime),
      Effect.provideService(
        OpenCode2Client.OpenCode2Client,
        yield* OpenCode2Client.make.pipe(Effect.provideService(HttpClient.HttpClient, httpClient)),
      ),
    );
    const orchestrationAdapter = selectOpenCodeRuntimeAdapter({
      probe: runtimeProbe,
      resolve: resolveRuntime,
      v1: openCodeV1Adapter,
      v2: yield* OpenCode2AdapterV2.make(instanceId).pipe(
        Effect.provideService(OpenCode2Server.OpenCode2Server, openCode2Server),
      ),
    });
    const serverOwner = yield* OpenCodeServerOwner.make({
      binaryPath: effectiveConfig.binaryPath,
      directory: host.paths.cwd,
      ...(effectiveConfig.serverPassword ? { serverPassword: effectiveConfig.serverPassword } : {}),
      environment: processEnv,
    });
    const textGeneration = selectOpenCodeRuntimeTextGeneration(
      resolveRuntime,
      yield* makeOpenCodeTextGeneration(effectiveConfig).pipe(
        Effect.provideService(OpenCodeServerOwner.OpenCodeServerOwner, serverOwner),
      ),
      yield* OpenCode2TextGeneration.make().pipe(
        Effect.provideService(OpenCode2Server.OpenCode2Server, openCode2Server),
      ),
    );

    const serverUrl = effectiveConfig.serverUrl.trim();
    const afterUpdate =
      serverUrl.length > 0
        ? replaceOutdatedService({
            binaryPath: effectiveConfig.binaryPath,
            serverUrl,
            environment: processEnv,
          }).pipe(
            Effect.ensuring(openCode2Server.forget),
            Effect.mapError(
              (cause) =>
                new ProviderDriverError({
                  driver: DRIVER_KIND,
                  instanceId,
                  detail: "Failed to replace the OpenCode service after an update.",
                  cause,
                }),
            ),
            Effect.provideService(AgentScope, agentScope),
            Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, openCodeRuntime),
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, pathService),
          )
        : Effect.void;

    const checkLocalProvider = makePendingOpenCodeProvider(effectiveConfig).pipe(
      Effect.map(stampIdentity),
      Effect.flatMap(
        readLocalCliStatus({
          binaryPath: effectiveConfig.binaryPath,
          environment: processEnv,
          configuredServer: Boolean(effectiveConfig.serverUrl.trim()),
        }),
      ),
    );
    const snapshotSettings = yield* makeProviderSnapshotSettingsSource(effectiveConfig);
    const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<OpenCodeSettings>>({
      resolveMaintenance,
      getSettings: snapshotSettings.getSettings,
      streamSettings: snapshotSettings.streamSettings,
      haveSettingsChanged: haveProviderSnapshotSettingsChanged,
      initialSnapshot: () => checkLocalProvider,
      checkProvider: checkLocalProvider,
      refreshOnInterval: false,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderDriverError({
            driver: DRIVER_KIND,
            instanceId,
            detail: `Failed to build OpenCode snapshot: ${cause.message ?? String(cause)}`,
            cause,
          }),
      ),
    );

    return {
      instanceId,
      driverKind: DRIVER_KIND,
      continuationIdentity,
      displayName,
      accentColor,
      enabled,
      snapshot,
      invalidateCaches: openCode2Server.forget,
      afterUpdate,
      orchestrationAdapter,
      textGeneration,
    } satisfies ProviderInstance;
  }),
};
