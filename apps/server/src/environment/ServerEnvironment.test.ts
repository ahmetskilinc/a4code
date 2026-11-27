import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ORCHESTRATION_PROTOCOL_VERSION } from "@a4code/contracts";
import { expect, it } from "@effect/vitest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Deferred from "effect/Deferred";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as HostProcess from "@a4code/shared/HostProcess";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "./ServerEnvironment.ts";

const layerServerEnvironment = (baseDir: string) =>
  ServerEnvironment.layer.pipe(
    Layer.provide(ServerSecretStore.layer),
    Layer.provide(ServerConfig.layerTest(process.cwd(), baseDir)),
  );

const makeServerConfig = Effect.fn(function* (baseDir: string) {
  const derivedPaths = yield* ServerConfig.deriveServerPaths(baseDir, undefined);

  return {
    ...derivedPaths,
    logLevel: "Error",
    traceMinLevel: "Info",
    traceTimingEnabled: true,
    traceBatchWindowMs: 200,
    traceMaxBytes: 10 * 1024 * 1024,
    traceMaxFiles: 10,

    cwd: process.cwd(),
    baseDir,
    mode: "web",
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
    port: 0,
    host: undefined,
    desktopBootstrapToken: undefined,
    staticDir: undefined,
    devUrl: undefined,
    devAllowedOrigins: [],
    noBrowser: false,
    startupPresentation: "browser",
  } satisfies ServerConfig.ServerConfig["Service"];
});

it.layer(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))("ServerEnvironmentLive", (it) => {
  it.effect("advertises local maintenance without remote installation or update capabilities", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const baseDir = yield* fs.makeTempDirectoryScoped();
      const config = yield* makeServerConfig(baseDir);
      yield* fs.makeDirectory(config.stateDir, { recursive: true });
      for (const mode of ["web", "desktop"] as const) {
        const environment = yield* ServerEnvironment.ServerEnvironment.pipe(
          Effect.provide(
            ServerEnvironment.layer.pipe(Layer.provide(ServerConfig.layer({ ...config, mode }))),
          ),
        );
        const { capabilities } = yield* environment.getDescriptor;
        expect(capabilities.serverInstallation).toBeUndefined();
        expect(capabilities.serverSelfUpdate).toBeUndefined();
        expect(capabilities.desktopAppUpdate).toBeUndefined();
        expect(capabilities).toMatchObject({
          settledWorktreeCleanup: true,
          storageCleanupRun: true,
          projectWorktreeCleanup: true,
          worktreesDirectory: true,
          threadAutoSettlementScope: true,
        });
      }
    }),
  );
  it.effect("names the environment and its machine from the overrides", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "a4-server-environment-override-test-",
      });
      const descriptor = yield* Effect.gen(function* () {
        const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
        return yield* serverEnvironment.getDescriptor;
      }).pipe(
        Effect.provide(
          layerServerEnvironment(baseDir).pipe(
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromEnv({
                  env: {
                    A4CODE_ENVIRONMENT_LABEL: " MacBook ",
                    A4CODE_ENVIRONMENT_MACHINE_KIND: "laptop",
                  },
                }),
              ),
            ),
          ),
        ),
      );
      expect(descriptor.label).toBe("MacBook");
      expect(descriptor.platform.machine).toBe("laptop");
    }),
  );
  it.effect.each([
    { platform: "darwin", architecture: "arm64", supported: true },
    { platform: "linux", architecture: "x64", supported: true },
    { platform: "linux", architecture: "x64", libc: "musl", supported: false },
    { platform: "win32", architecture: "arm64", supported: false },
    { platform: "linux", architecture: "arm", supported: false },
  ] as const)("advertises voice transcription on $platform-$architecture: $supported", (host) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "a4-server-environment-speech-test-",
      });
      const descriptor = yield* Effect.gen(function* () {
        const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
        return yield* serverEnvironment.getDescriptor;
      }).pipe(
        Effect.provide(layerServerEnvironment(baseDir)),
        Effect.provideService(HostProcess.Platform, host.platform),
        Effect.provideService(HostProcess.Architecture, host.architecture),
        Effect.provideService(HostProcess.LinuxLibc, "libc" in host ? host.libc : "gnu"),
      );
      expect(descriptor.capabilities.voiceTranscription).toBe(host.supported);
    }),
  );
  it.effect.each([
    { name: "missing", content: undefined },
    { name: "empty", content: "" },
    { name: "whitespace-only", content: " \t\n" },
  ])("concurrent initializers recover a $name environment id file", ({ content }) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const random = yield* SecureRandom.SecureRandom;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "a4-server-environment-concurrent-test-",
      });
      const serverConfig = yield* makeServerConfig(baseDir);
      yield* fileSystem.makeDirectory(serverConfig.stateDir, { recursive: true });
      if (content !== undefined) {
        yield* fileSystem.writeFileString(serverConfig.environmentIdPath, content);
      }
      const bothGenerated = yield* Deferred.make<void>();
      const bothReadEmpty = yield* Deferred.make<void>();
      const firstInitialized = yield* Deferred.make<void>();
      let remaining = 2;
      let emptyReads = 0;
      const readIdentity = Effect.gen(function* () {
        const identity = yield* ServerEnvironment.ServerEnvironmentIdentity;
        return yield* identity.getEnvironmentId;
      }).pipe(
        Effect.tap(() => Deferred.succeed(firstInitialized, undefined)),
        Effect.provide(Layer.fresh(ServerEnvironment.layerIdentity)),
        Effect.provideService(ServerConfig.ServerConfig, serverConfig),
        Effect.provideService(FileSystem.FileSystem, {
          ...fileSystem,
          readFileString: (path) =>
            fileSystem.readFileString(path).pipe(
              Effect.tap(
                Effect.fn(function* (value) {
                  if (path !== serverConfig.environmentIdPath || remaining > 0 || value.trim()) {
                    return;
                  }
                  if (++emptyReads === 2) {
                    yield* Deferred.succeed(bothReadEmpty, undefined);
                    yield* Deferred.await(firstInitialized);
                  } else {
                    yield* Deferred.await(bothReadEmpty);
                  }
                }),
              ),
            ),
        }),
        Effect.provideService(SecureRandom.SecureRandom, {
          ...random,
          uuidV4: (() =>
            Effect.gen(function* () {
              const id = yield* random.uuidV4();
              if (--remaining === 0) {
                yield* Deferred.succeed(bothGenerated, undefined);
              }
              yield* Deferred.await(bothGenerated);
              return id;
            })) as SecureRandom.SecureRandom["Service"]["uuidV4"],
        }),
      );

      const [first, second] = yield* Effect.all([readIdentity, readIdentity], {
        concurrency: "unbounded",
      });
      const persisted = yield* fileSystem.readFileString(serverConfig.environmentIdPath);

      expect(first).toBe(second);
      expect(persisted.trim()).toBe(first);
    }),
  );

  it.effect("persists the environment id across service restarts", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "a4-server-environment-test-",
      });

      const first = yield* Effect.gen(function* () {
        const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
        return yield* serverEnvironment.getDescriptor;
      }).pipe(Effect.provide(layerServerEnvironment(baseDir)));
      const second = yield* Effect.gen(function* () {
        const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
        return yield* serverEnvironment.getDescriptor;
      }).pipe(Effect.provide(layerServerEnvironment(baseDir)));

      expect(first.environmentId).toBe(second.environmentId);
      expect(first.orchestrationProtocolVersion).toBe(ORCHESTRATION_PROTOCOL_VERSION);
      expect(second.capabilities.repositoryIdentity).toBe(true);
      expect(second.capabilities.connectionProbe).toBe(true);
      expect(second.capabilities.attachmentUploads).toBe(true);
      expect(second.capabilities.fileAttachments).toEqual({ maxUploadBytes: 50 * 1024 * 1024 });
      expect(second.capabilities.pullRequests).toBe(true);
      expect(second.capabilities.requiredWorktreeBootstrap).toBe(true);
      expect(second.capabilities.usagePriceOverrides).toBe(true);
      expect(second.capabilities.threadActiveReorder).toBe(true);
      expect(second.capabilities.threadTitleRegeneration).toBe(true);
      expect(second.capabilities.threadPullRequests).toBe(true);
      expect(second.capabilities.threadPullRequestLinking).toBe(true);
      expect(second.capabilities.serverResolvedCommandContext).toBe(true);
      expect(second.capabilities.projectProviderInstanceOverrides).toBe(true);
    }),
  );
});
