// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, ProviderSessionId, ThreadId } from "@a4code/contracts";
import type { OpenCodeSettings } from "../settings.ts";
import * as HostProcess from "@a4code/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as ProviderLatestVersions from "@a4code/provider-core/server/ProviderLatestVersions";
import * as IdAllocator from "@a4code/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@a4code/provider-core/server/McpProviderSessions";
import * as ProviderEventLoggers from "@a4code/provider-core/server/ProviderEventLoggers";
import * as ProviderMaintenance from "@a4code/provider-core/server/maintenanceResolver";
import * as OpenCodeRuntime from "./OpenCodeRuntime.ts";
import { OpenCodeDriver, isLocalOpenCodeServerUrl, openCodeUpdateFor } from "./driver.ts";
import * as OpenCodeServerLedger from "./OpenCodeServerLedger.ts";
import { OPENCODE_2_RESPONSES } from "./probeResponses.fixture.ts";
import * as TestProviderHost from "@a4code/provider-testing/TestProviderHost";

it("only probes a locally configured OpenCode server's installed CLI", () => {
  assert.isTrue(isLocalOpenCodeServerUrl("http://127.0.0.1:35768"));
  assert.isTrue(isLocalOpenCodeServerUrl("http://127.255.255.254:4096"));
  assert.isFalse(isLocalOpenCodeServerUrl("http://127.example.com:4096"));
  assert.isFalse(isLocalOpenCodeServerUrl("http://128.0.0.1:4096"));
  assert.isTrue(isLocalOpenCodeServerUrl("http://localhost:4096"));
  assert.isTrue(isLocalOpenCodeServerUrl("http://[::1]:4096"));
  assert.isFalse(isLocalOpenCodeServerUrl("https://remote.example.com:4096"));
  assert.isFalse(isLocalOpenCodeServerUrl(""));
  assert.isFalse(isLocalOpenCodeServerUrl("file:///tmp/opencode"));
});

const serverStarts: Array<string> = [];
const reachedServer = (operation: string) =>
  Effect.sync(() => serverStarts.push(operation)).pipe(
    Effect.andThen(
      Effect.fail(
        new OpenCodeRuntime.OpenCodeRuntimeError({
          operation,
          detail: "reached a 1.x server path",
        }),
      ),
    ),
  );
const openCode2Runtime = {
  runOpenCodeCommand: () => Effect.succeed({ stdout: "opencode v2.0.18\n", stderr: "", code: 0 }),
  startOpenCodeServerProcess: () => reachedServer("start"),
  connectToOpenCodeServer: () => reachedServer("connect"),
} as unknown as OpenCodeRuntime.OpenCodeRuntime["Service"];

const layer = Layer.mergeAll(
  IdAllocator.layer,
  McpProviderSessions.layer,
  ProviderLatestVersions.layer,
  TestProviderHost.layer(),
  Layer.succeed(
    ProviderEventLoggers.ProviderEventLoggers,
    ProviderEventLoggers.NoOpProviderEventLoggers,
  ),
  Layer.succeed(OpenCodeRuntime.OpenCodeRuntime, openCode2Runtime),
).pipe(Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)));

const create = (config: Partial<OpenCodeSettings>, http: HttpClient.HttpClient, enabled = true) =>
  OpenCodeDriver.create({
    instanceId: ProviderInstanceId.make("opencode-test"),
    displayName: undefined,
    environment: [],
    enabled,
    config: { ...OpenCodeDriver.defaultConfig(), ...config },
  }).pipe(Effect.provideService(HttpClient.HttpClient, http));

const noHttp = HttpClient.make(() => Effect.die("A local binary must not be probed over HTTP"));

it.live("detects a home-relative OpenCode wrapper without running it", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: "a4-opencode-home with spaces-" });
    const binaryPath = NodePath.join(home, "opencode");
    const scriptPath = NodePath.join(home, "opencode.cjs");
    yield* fs.writeFileString(
      scriptPath,
      `if (process.argv.includes('--version')) {
        console.log('1.18.32');
      } else {
        const server = require('node:http').createServer((req, res) => {
          const route = new URL(req.url, 'http://localhost').pathname;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(route === '/global/health'
            ? { healthy: true, version: '1.18.32' }
            : route === '/provider'
              ? { connected: ['opencode'], default: {}, all: [{
                  id: 'opencode', name: 'OpenCode', models: {
                    'big-pickle': { id: 'big-pickle', name: 'Big Pickle' }
                  }
                }] }
              : []));
        });
        server.listen(0, '127.0.0.1', () => {
          console.log('opencode server listening on http://127.0.0.1:' + server.address().port);
        });
      }`,
    );
    const windows = (yield* HostProcess.Platform) === "win32";
    const wrapperPath = windows ? `${binaryPath}.cmd` : binaryPath;
    const node = yield* HostProcess.ExecutablePath;
    yield* fs.writeFileString(
      wrapperPath,
      windows
        ? `@echo off\r\n"${node}" "${scriptPath}" %*\r\n`
        : `#!/bin/sh\nexec "${node}" "${scriptPath}" "$@"\n`,
    );
    if (!windows) yield* fs.chmod(wrapperPath, 0o755);

    const instance = yield* OpenCodeDriver.create({
      instanceId: ProviderInstanceId.make("opencode-home"),
      displayName: undefined,
      environment: [],
      enabled: true,
      config: {
        ...OpenCodeDriver.defaultConfig(),
        binaryPath: windows ? "~/opencode.cmd" : "~/opencode",
      },
    }).pipe(Effect.provideService(HostProcess.HomeDirectory, home));
    const snapshot = yield* instance.snapshot.refresh;
    assert.strictEqual(snapshot.status, "ready");
    assert.isNull(snapshot.version);
    assert.isFalse(snapshot.models.some((model) => model.slug === "opencode/big-pickle"));
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(
        IdAllocator.layer,
        McpProviderSessions.layer,
        ProviderLatestVersions.layer,
        TestProviderHost.layer({ runBackgroundWork: false }),
        Layer.succeed(
          ProviderEventLoggers.ProviderEventLoggers,
          ProviderEventLoggers.NoOpProviderEventLoggers,
        ),
        OpenCodeRuntime.layer.pipe(Layer.provide(OpenCodeServerLedger.layerTest)),
      ).pipe(
        Layer.provideMerge(
          Layer.mergeAll(NodeServices.layer, NodeCrypto.layer, FetchHttpClient.layer),
        ),
      ),
    ),
  ),
);

// Under MISE_OFFLINE the shim cannot install OpenCode; a normal run installs 2.x first.
const lazyMiseShim = {
  ...openCode2Runtime,
  runOpenCodeCommand: ({ environment }: { readonly environment?: NodeJS.ProcessEnv }) =>
    environment?.MISE_OFFLINE === "1"
      ? Effect.fail(
          new OpenCodeRuntime.OpenCodeRuntimeError({
            operation: "runOpenCodeCommand",
            detail: "mise ERROR Failed to install opencode@latest",
          }),
        )
      : Effect.succeed({ stdout: "opencode v2.0.18\n", stderr: "", code: 0 }),
} as unknown as OpenCodeRuntime.OpenCodeRuntime["Service"];

it.layer(layer)("OpenCodeDriver runtime selection", (it) => {
  it.effect("never starts a 1.x server for an OpenCode 2 instance", () =>
    Effect.gen(function* () {
      serverStarts.length = 0;
      const instance = yield* create({}, noHttp);
      yield* Effect.flip(
        instance.textGeneration.generateThreadTitle({
          cwd: process.cwd(),
          message: "hello",
          modelSelection: { instanceId: instance.instanceId, model: "opencode/big-pickle" },
        }),
      );
      assert.deepStrictEqual(serverStarts, ["start"]);
    }),
  );

  it.effect("checks a configured server locally without requesting its model list", () =>
    Effect.gen(function* () {
      const instance = yield* create(
        { serverUrl: "https://remote.example", customModels: ["my/model"] },
        noHttp,
      );
      const info = yield* instance.snapshot.refresh;
      assert.equal(info.status, "ready");
      assert.deepEqual(
        info.models.map((model) => model.slug),
        ["openai/gpt-5", "my/model"],
      );
      assert.isUndefined(instance.snapshotForCwd);
    }),
  );
  it.effect("skips the installed CLI probe when a localhost provider is disabled", () =>
    Effect.gen(function* () {
      const probed: string[] = [];
      const runtime = {
        ...openCode2Runtime,
        runOpenCodeCommand: () =>
          Effect.sync(() => {
            probed.push("--version");
            return { stdout: "opencode v2.1.2\n", stderr: "", code: 0 };
          }),
      } as OpenCodeRuntime.OpenCodeRuntime["Service"];
      const instance = yield* create({ serverUrl: "http://127.0.0.1:4096" }, noHttp, false).pipe(
        Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, runtime),
      );

      const snapshot = yield* instance.snapshot.refresh;
      assert.isFalse(snapshot.enabled);
      assert.deepStrictEqual(probed, []);
    }),
  );

  it.effect("opens a session through OpenCode 2 that a lazy mise shim installs on first use", () =>
    Effect.gen(function* () {
      serverStarts.length = 0;
      const instance = yield* create({}, noHttp).pipe(
        Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, lazyMiseShim),
        // The background status check probes offline, which this shim always fails.
        Effect.provide(TestProviderHost.layer({ runBackgroundWork: false })),
      );

      yield* instance.orchestrationAdapter
        .openSession({
          threadId: ThreadId.make("thread-lazy-mise"),
          providerSessionId: ProviderSessionId.make("session-lazy-mise"),
          modelSelection: { instanceId: instance.instanceId, model: "opencode/big-pickle" },
          runtimePolicy: { runtimeMode: "full-access", interactionMode: "default", cwd: null },
        })
        .pipe(Effect.scoped, Effect.flip);
      assert.deepStrictEqual(serverStarts, ["start"], "the OpenCode 2 adapter starts its server");
      const capabilities = yield* instance.orchestrationAdapter.getCapabilities();
      assert.isTrue(capabilities.sessions.supportsRuntimeModeSwitchInSession);
    }),
  );

  it.effect.each([
    "1.18.32",
    "opencode v2.0.18",
    "opencode v2.2.4",
    "opencode v2.2.5",
    "opencode v2.2.6",
  ])("advertises native goal support only for supported OpenCode versions: %s", (version) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-goal-capability-" });
      const binaryPath = NodePath.join(
        root,
        "lib",
        "node_modules",
        "@opencode",
        "cli",
        "bin",
        "opencode",
      );
      yield* fs.makeDirectory(NodePath.dirname(binaryPath), { recursive: true });
      yield* fs.writeFileString(binaryPath, "");
      const instance = yield* create({ binaryPath }, noHttp).pipe(
        Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, {
          ...openCode2Runtime,
          runOpenCodeCommand: () => Effect.succeed({ stdout: version, stderr: "", code: 0 }),
        }),
      );
      yield* instance.snapshot.resolveMaintenance({ fresh: true });
      const capabilities = yield* instance.orchestrationAdapter.getCapabilities();
      assert.equal(
        capabilities.turns.supportsNativeGoals === true,
        version.endsWith("2.2.5") || version.endsWith("2.2.6"),
      );
    }),
  );

  it.effect("uses the connected OpenCode version for goal support after an upgrade", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-upgraded-goals-" });
      const binaryPath = NodePath.join(
        root,
        "lib",
        "node_modules",
        "@opencode",
        "cli",
        "bin",
        "opencode",
      );
      yield* fs.makeDirectory(NodePath.dirname(binaryPath), { recursive: true });
      yield* fs.writeFileString(binaryPath, "");
      const http = HttpClient.make((request) => {
        const path = new URL(request.url).pathname;
        if (path === "/api/info")
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                ...JSON.parse(OPENCODE_2_RESPONSES["/api/info"].body),
                version: "2.2.5",
              }),
            ),
          );
        if (path === "/api/model")
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ location: { directory: "/work" }, data: [] }),
            ),
          );
        if (path === "/api/event")
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(new ReadableStream(), {
                headers: { "content-type": "text/event-stream" },
              }),
            ),
          );
        return Effect.die(`Unexpected request: ${path}`);
      });
      const instance = yield* create({ binaryPath }, http).pipe(
        Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, {
          ...openCode2Runtime,
          runOpenCodeCommand: () =>
            Effect.succeed({ stdout: "opencode v2.2.4", stderr: "", code: 0 }),
          startOpenCodeServerProcess: ({ verify }) =>
            Effect.gen(function* () {
              const url = "http://127.0.0.1:4096";
              const version = verify ? yield* verify(url) : "2.2.5";
              return { url, version, isRunning: Effect.succeed(true), exitCode: Effect.never };
            }),
        }),
      );
      yield* instance.snapshot.resolveMaintenance({ fresh: true });
      assert.isFalse(
        (yield* instance.orchestrationAdapter.getCapabilities()).turns.supportsNativeGoals,
      );
      const session = yield* instance.orchestrationAdapter.openSession({
        threadId: ThreadId.make("upgraded-goal"),
        providerSessionId: ProviderSessionId.make("upgraded-goal"),
        modelSelection: { instanceId: instance.instanceId, model: "opencode/big-pickle" },
        runtimePolicy: { runtimeMode: "full-access", interactionMode: "default", cwd: null },
      });
      assert.isTrue(session.providerSession.capabilities.turns.supportsNativeGoals);
      assert.isTrue(
        (yield* instance.orchestrationAdapter.getCapabilities()).turns.supportsNativeGoals,
      );
    }),
  );

  it.effect("answers capability reads without waiting on an unreachable server", () =>
    Effect.gen(function* () {
      const hang = HttpClient.make(() => Effect.never);
      const instance = yield* create({ serverUrl: "http://127.0.0.1:9" }, hang);

      const capabilities = yield* instance.orchestrationAdapter
        .getCapabilities()
        .pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      assert.isDefined(capabilities.pollUnsafe());
      yield* Fiber.join(capabilities);
    }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
  );
});

// npm links into opencode-ai for 1.x and @opencode/cli for 2.x.
const npmGlobalInstall = (prefix: string, packagePath: ReadonlyArray<string>, bin: string) => {
  const target = NodePath.join(prefix, "lib", "node_modules", ...packagePath, "bin", bin);
  NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
  NodeFS.writeFileSync(target, "#!/bin/sh\n");
  NodeFS.chmodSync(target, 0o755);
  const link = NodePath.join(prefix, "bin", "opencode");
  NodeFS.mkdirSync(NodePath.dirname(link), { recursive: true });
  NodeFS.symlinkSync(target, link);
  return link;
};
const resolveUpdate = (generation: "v1" | "v2", binaryPath: string) =>
  ProviderMaintenance.resolveProviderMaintenanceCapabilitiesEffect(openCodeUpdateFor(generation), {
    binaryPath,
    env: { PATH: "" },
  }).pipe(
    Effect.provideService(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("resolving an update must not spawn")),
    ),
    Effect.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
  );

it.effect.skipIf(HostProcess.Platform.defaultValue() === "win32")(
  "updates npm-global OpenCode by generation and runs upgrade only for its own installer's path",
  () =>
    Effect.gen(function* () {
      const root = NodeFS.realpathSync(
        NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "a4-opencode-update-")),
      );
      const v2Prefix = NodePath.join(root, "v2");
      const v1Prefix = NodePath.join(root, "v1");
      const v2 = yield* resolveUpdate(
        "v2",
        npmGlobalInstall(v2Prefix, ["@opencode", "cli"], "opencode.exe"),
      );
      assert.deepStrictEqual(v2.update?.args, [
        "install",
        "-g",
        "--prefix",
        v2Prefix,
        "--allow-scripts=@opencode/cli",
        "@opencode/cli@latest",
      ]);
      const v1 = yield* resolveUpdate(
        "v1",
        npmGlobalInstall(v1Prefix, ["opencode-ai"], "opencode"),
      );
      assert.strictEqual(v1.update?.args.at(-1), "opencode-ai@latest");
      assert.isNull(
        (yield* resolveUpdate("v2", NodePath.join(v1Prefix, "bin", "opencode"))).update,
      );
      assert.isNull(
        (yield* resolveUpdate("v1", NodePath.join(v2Prefix, "bin", "opencode"))).update,
      );
      const executable = (...segments: ReadonlyArray<string>) => {
        const path = NodePath.join(root, ...segments);
        NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
        NodeFS.writeFileSync(path, "#!/bin/sh\n");
        NodeFS.chmodSync(path, 0o755);
        return path;
      };
      const launcher = executable("launcher", "opencode");
      const native = executable(".opencode", "bin", "opencode");
      for (const generation of ["v1", "v2"] as const) {
        assert.isNull((yield* resolveUpdate(generation, launcher)).update);
        const update = (yield* resolveUpdate(generation, native)).update;
        assert.deepStrictEqual(update?.args, ["upgrade", "--method", "curl"]);
        assert.strictEqual(update?.env?.HOME, root);
      }
    }),
);

const versionOutput: { current: string | undefined } = { current: undefined };
const versionProbes: Array<string> = [];
const changingRuntime = {
  runOpenCodeCommand: ({ binaryPath }: { readonly binaryPath: string }) =>
    Effect.sync(() => versionProbes.push(binaryPath)).pipe(
      Effect.andThen(
        versionOutput.current === undefined
          ? Effect.fail(
              new OpenCodeRuntime.OpenCodeRuntimeError({
                operation: "version",
                detail: "no version",
              }),
            )
          : Effect.succeed({ stdout: versionOutput.current, stderr: "", code: 0 }),
      ),
    ),
  startOpenCodeServerProcess: () => reachedServer("start"),
  connectToOpenCodeServer: () => reachedServer("connect"),
} as unknown as OpenCodeRuntime.OpenCodeRuntime["Service"];
const layerUpdate = Layer.mergeAll(
  IdAllocator.layer,
  McpProviderSessions.layer,
  ProviderLatestVersions.layer,
  TestProviderHost.layer(),
  Layer.succeed(
    ProviderEventLoggers.ProviderEventLoggers,
    ProviderEventLoggers.NoOpProviderEventLoggers,
  ),
  Layer.succeed(OpenCodeRuntime.OpenCodeRuntime, changingRuntime),
).pipe(Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)));

it.layer(layerUpdate)("OpenCodeDriver updates", (it) => {
  it.effect.skipIf(HostProcess.Platform.defaultValue() === "win32")(
    "offers no package update for an unknown version and follows a changed one on a fresh read",
    () =>
      Effect.gen(function* () {
        const root = NodeFS.realpathSync(
          NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "a4-opencode-driver-update-")),
        );
        const binaryPath = npmGlobalInstall(NodePath.join(root, "v1"), ["opencode-ai"], "opencode");
        const instance = yield* OpenCodeDriver.create({
          instanceId: ProviderInstanceId.make("opencode-update"),
          displayName: undefined,
          environment: [],
          enabled: true,
          config: { ...OpenCodeDriver.defaultConfig(), binaryPath },
        }).pipe(Effect.provideService(HttpClient.HttpClient, noHttp));

        versionOutput.current = undefined;
        const unknown = yield* instance.snapshot.resolveMaintenance({ fresh: true });
        assert.isNull(unknown.update);
        assert.isNull(unknown.packageName);

        versionOutput.current = "1.18.32\n";
        const v1 = yield* instance.snapshot.resolveMaintenance({ fresh: true });
        assert.strictEqual(v1.packageName, "opencode-ai");

        versionOutput.current = "opencode v2.0.18\n";
        const v2 = yield* instance.snapshot.resolveMaintenance({ fresh: true });
        assert.strictEqual(v2.packageName, "@opencode/cli");
        assert.isNull(v2.update);
      }),
  );

  it.effect(
    "opens sessions through OpenCode 2 after the binary is upgraded in place from 1.x",
    () =>
      Effect.gen(function* () {
        versionOutput.current = "1.18.18\n";
        const instance = yield* create({}, noHttp);
        // Let the startup status check claim the refresh permit, then wait behind it so it
        // cannot probe after the upgrade below.
        yield* Effect.yieldNow;
        yield* instance.snapshot.refresh;
        serverStarts.length = 0;
        const openSession = instance.orchestrationAdapter
          .openSession({
            threadId: ThreadId.make("thread-upgraded"),
            providerSessionId: ProviderSessionId.make("session-upgraded"),
            modelSelection: { instanceId: instance.instanceId, model: "opencode/big-pickle" },
            runtimePolicy: { runtimeMode: "full-access", interactionMode: "default", cwd: null },
          })
          .pipe(Effect.scoped, Effect.flip);

        yield* openSession;
        assert.deepStrictEqual(serverStarts, ["connect"], "1.x opens through the 1.x adapter");

        versionOutput.current = "opencode v2.2.4\n";
        serverStarts.length = 0;
        yield* openSession;
        assert.notInclude(
          serverStarts,
          "connect",
          "after upgrading to 2.x, the next session must not open through the 1.x adapter",
        );
        assert.include(serverStarts, "start", "the OpenCode 2 adapter starts its server");
      }),
  );
});
