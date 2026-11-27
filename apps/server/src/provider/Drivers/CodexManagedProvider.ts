import { ProviderDriverKind, TextGenerationError, type CodexSettings } from "@a4code/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import { makeCodexTextGeneration } from "../../textGeneration/CodexTextGeneration.ts";
import * as ProviderHost from "@a4code/provider-core/server/ProviderHost";
import * as ModelCatalog from "@a4code/provider-core/server/ModelCatalog";
import { makeCodexManagedRuntime } from "../CodexManagedRuntime.ts";
import { ProviderDriverError } from "../Errors.ts";
import { createCodexAdapterV2 } from "../../orchestration-v2/Adapters/CodexAdapterV2.ts";
import { makePendingCodexProvider } from "../CodexProvider.ts";
import { makeManagedServerProvider } from "@a4code/provider-core/server/managedProvider";
import { mergeProviderInstanceEnvironment } from "@a4code/provider-core/server/instanceEnvironment";
import {
  type ProviderDriverCreateInput,
  type ProviderInstance,
} from "@a4code/provider-core/server/driver";
import { codexContinuationIdentity } from "./CodexHomeLayout.ts";
import { withInstanceIdentity } from "@a4code/provider-core/server/instanceIdentity";
const DRIVER = ProviderDriverKind.make("codex");

export const makeManagedCodexProvider = Effect.fn("makeManagedCodexProvider")(function* (
  input: ProviderDriverCreateInput<CodexSettings>,
) {
  const { instanceId, enabled, displayName, accentColor, config } = input;
  const host = yield* ProviderHost.ProviderHost;
  const runtime = yield* makeCodexManagedRuntime({
    instanceId,
    enabled,
    config,
    environment: yield* mergeProviderInstanceEnvironment(input.environment),
  });
  const continuationIdentity = codexContinuationIdentity(runtime.homeLayout);
  const stamp = withInstanceIdentity({
    instanceId,
    driverKind: DRIVER,
    displayName,
    accentColor,
    continuationGroupKey: continuationIdentity.continuationKey,
  });
  const catalog = (yield* ModelCatalog.ModelCatalog).bundled(DRIVER);
  const bundledModels =
    catalog?.models.map((model) => ModelCatalog.catalogServerModel(catalog, model)) ?? [];
  const setup = { canAuthenticate: true, canInstall: true };
  const runtimePaths = {
    homePath: runtime.homeLayout.sharedHomePath,
    shadowHomePath: runtime.homeLayout.mode === "authOverlay" ? runtime.homePath : null,
  };
  const pending = makePendingCodexProvider({ ...config, enabled, customModels: [] }).pipe(
    Effect.map((draft) =>
      stamp({
        ...draft,
        models: [],
        setup,
        runtimePaths,
      }),
    ),
  );
  const check = Effect.gen(function* () {
    const base = yield* pending;
    if (!enabled) return base;
    const executable = yield* runtime.installation.resolve().pipe(Effect.option);
    if (Option.isNone(executable))
      return {
        ...base,
        installed: false,
        models: [],
        message: "Set up Codex to get started.",
        auth: { status: "unauthenticated" as const },
      };
    const saved = yield* runtime.auth.read.pipe(Effect.orElseSucceed(() => Option.none()));
    if (Option.isSome(saved) && !saved.value.scopes.includes("chatgpt.tokens.use.direct"))
      return {
        ...base,
        installed: true,
        version: executable.value.version,
        models: [],
        message:
          "Signed in with ChatGPT, but token sharing is disabled. Sign in again and enable token sharing, or use another provider.",
        auth: {
          status: "unauthenticated" as const,
          label: "ChatGPT",
          ...(saved.value.email?.trim() ? { email: saved.value.email.trim() } : {}),
        },
      };
    if (Option.isNone(saved))
      return {
        ...base,
        installed: true,
        version: executable.value.version,
        models: [],
        message: "Sign in with ChatGPT to use Codex.",
        auth: { status: "unauthenticated" as const },
      };
    const { message: _pendingMessage, ...draft } = base;
    return {
      ...draft,
      installed: true,
      status: "ready" as const,
      version: executable.value.version,
      models: bundledModels.map((model) => ({
        ...model,
        capabilities: model.capabilities
          ? {
              ...model.capabilities,
              optionDescriptors:
                model.capabilities.optionDescriptors?.filter(
                  (option) => option.id !== "serviceTier",
                ) ?? [],
            }
          : null,
      })),
      auth: {
        status: "authenticated" as const,
        type: "chatgpt",
        label: "ChatGPT",
        subscriptionSharing: true,
        profileId: saved.value.clientId,
        ...(saved.value.email?.trim() ? { email: saved.value.email.trim() } : {}),
      },
    };
  });
  const snapshot = yield* makeManagedServerProvider({
    resolveMaintenance: () => Effect.succeed({ provider: DRIVER, packageName: null, update: null }),
    getSettings: host.settings.get,
    streamSettings: host.settings.changes,
    haveSettingsChanged: () => false,
    initialSnapshot: () => pending,
    checkProvider: check,
    refreshOnInterval: false,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new ProviderDriverError({
          driver: DRIVER,
          instanceId,
          detail: "Could not prepare managed Codex.",
          cause,
        }),
    ),
  );
  yield* runtime.auth.controller.subscribe("managed-codex-snapshot").pipe(
    Stream.filter((state) => ["idle", "succeeded", "failed", "cancelled"].includes(state.phase)),
    // Sign-out interrupts in-flight probes; keep listening for its subsequent idle refresh.
    Stream.runForEach(() => snapshot.refresh.pipe(Effect.ignoreCause({ log: true }))),
    Effect.forkScoped,
  );
  const resolveRuntime = runtime.auth.controller.withAccess!(runtime.resolve);
  // Launch settings bind the refresh command to the signed-in profile. The registry
  // already wraps openSession in withAccess, so resolve without re-entering it.
  const models = snapshot.getSnapshot.pipe(Effect.map((value) => value.models));
  const orchestrationAdapter = yield* createCodexAdapterV2(input, {
    onUsageLimits: (update) => snapshot.applyUsageLimits(update),
    models,
    resolveRuntime: runtime.resolve,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new ProviderDriverError({
          driver: DRIVER,
          instanceId,
          detail: "Failed to build Codex orchestration adapter.",
          cause,
        }),
    ),
  );
  const nativeGeneration = yield* makeCodexTextGeneration(
    config,
    undefined,
    models,
    resolveRuntime,
  );
  const protect = <A>(operation: string, effect: Effect.Effect<A, TextGenerationError>) =>
    runtime.auth.controller.withAccess!(effect).pipe(
      Effect.scoped,
      Effect.mapError(
        (cause) =>
          new TextGenerationError({
            operation,
            detail: "detail" in cause ? cause.detail : "Codex text generation failed.",
          }),
      ),
    );
  const textGeneration: ProviderInstance["textGeneration"] = {
    generateCommitMessage: (value) =>
      protect("generateCommitMessage", nativeGeneration.generateCommitMessage(value)),
    generatePrContent: (value) =>
      protect("generatePrContent", nativeGeneration.generatePrContent(value)),
    generateBranchName: (value) =>
      protect("generateBranchName", nativeGeneration.generateBranchName(value)),
    generateThreadTitle: (value) =>
      protect("generateThreadTitle", nativeGeneration.generateThreadTitle(value)),
    generateReviewGuide: (value) =>
      protect("generateReviewGuide", nativeGeneration.generateReviewGuide(value)),
    generateTranscriptionPostProcessing: (value) =>
      protect(
        "generateTranscriptionPostProcessing",
        nativeGeneration.generateTranscriptionPostProcessing(value),
      ),
  };
  return {
    instanceId,
    driverKind: DRIVER,
    continuationIdentity,
    displayName,
    accentColor,
    enabled,
    snapshot,
    orchestrationAdapter,
    textGeneration,
    auth: runtime.auth.controller,
  } satisfies ProviderInstance;
});
