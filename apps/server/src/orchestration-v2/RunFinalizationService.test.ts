import { assert, it } from "@effect/vitest";
import { CheckpointRef, CheckpointScopeId, RunId, ThreadId } from "@a4code/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";
import * as WorkspaceEntries from "../workspace/WorkspaceEntries.ts";
import * as CheckpointCapture from "./CheckpointCaptureService.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as RunFinalization from "./RunFinalizationService.ts";

const finalizationLayer = (
  scopeId: CheckpointScopeId,
  runId: RunId,
  steps: string[],
  refresh: (typeof RunFinalization.RunFinalizationObserver)["Service"]["refresh"],
) => {
  const usedRepositoryScopeId = CheckpointScopeId.make(`${scopeId}_api`);
  const idleRepositoryScopeId = CheckpointScopeId.make(`${scopeId}_docs`);
  const repositoryCheckpoint = (repositoryScopeId: CheckpointScopeId, checkpointRunId: RunId) => ({
    scopeId: repositoryScopeId,
    runId: checkpointRunId,
    ordinalWithinScope: 1,
    appRunOrdinal: null,
    status: "ready" as const,
    ref: CheckpointRef.make(`refs/a4code/test/${repositoryScopeId}`),
  });
  return RunFinalization.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(CheckpointCapture.CheckpointCaptureServiceV2)({
          execute: () =>
            Effect.sync(() => {
              steps.push("checkpoint");
            }),
        }),
        Layer.mock(ProjectionStore.ProjectionStoreV2)({
          getCheckpointContext: () =>
            Effect.succeed({
              runs: [],
              checkpointScopes: [
                { id: scopeId, runId, kind: "root_run" as const, cwd: "/repo" },
                {
                  id: usedRepositoryScopeId,
                  runId,
                  kind: "manual" as const,
                  cwd: "/api",
                  repositoryPath: "/api",
                },
                {
                  id: idleRepositoryScopeId,
                  runId,
                  kind: "manual" as const,
                  cwd: "/docs",
                  repositoryPath: "/docs",
                },
              ],
              checkpoints: [
                repositoryCheckpoint(usedRepositoryScopeId, runId),
                repositoryCheckpoint(idleRepositoryScopeId, RunId.make("run_before")),
              ],
            }),
        }),
        Layer.succeed(RunFinalization.RunFinalizationObserver, {
          refresh,
          refreshAfterTurn: () => Effect.void,
          refreshRepositories: ({ cwds }) =>
            Effect.sync(() => {
              steps.push(`repositories:${cwds.join(",")}`);
            }),
        }),
      ),
    ),
  );
};

it.effect("completes finalization when the post-checkpoint workspace refresh fails", () => {
  const threadId = ThreadId.make("thread_refresh_failure");
  const runId = RunId.make("run_refresh_failure");
  const scopeId = CheckpointScopeId.make("scope_refresh_failure");
  const captured: string[] = [];
  const layer = finalizationLayer(scopeId, runId, captured, () =>
    Effect.gen(function* () {
      captured.push("refresh");
      return yield* new RunFinalization.RunFinalizationRefreshError({
        cwd: "/repo",
        cause: new Error("Git command timed out"),
      });
    }),
  );
  return Effect.gen(function* () {
    const service = yield* RunFinalization.RunFinalizationService;
    yield* service.finalize({ threadId, runId, scopeId });
    // Only the tracked repository this run checkpointed is refreshed.
    assert.deepEqual(captured, ["checkpoint", "refresh", "repositories:/api"]);
  }).pipe(Effect.provide(layer));
});

it.effect("completes finalization without waiting for the display refresh", () => {
  const threadId = ThreadId.make("thread_slow_refresh");
  const runId = RunId.make("run_slow_refresh");
  const scopeId = CheckpointScopeId.make("scope_slow_refresh");
  const steps: string[] = [];
  const release = Deferred.makeUnsafe<void>();
  const refreshed = Deferred.makeUnsafe<void>();
  const layer = finalizationLayer(scopeId, runId, steps, () =>
    Deferred.await(release).pipe(Effect.andThen(Deferred.succeed(refreshed, undefined))),
  );
  return Effect.gen(function* () {
    const service = yield* RunFinalization.RunFinalizationService;
    const finalize = yield* service
      .finalize({ threadId, runId, scopeId })
      .pipe(Effect.timeoutOption("1 minute"), Effect.forkChild({ startImmediately: true }));
    yield* TestClock.adjust("1 minute");
    assert.isTrue(
      Option.isSome(yield* Fiber.join(finalize)),
      "finalization waited on the display refresh, blocking the thread's next turn",
    );
    yield* Deferred.succeed(release, undefined);
    yield* Deferred.await(refreshed);
  }).pipe(Effect.provide(layer));
});

it.effect("refreshes local workspace data after a run without a forge lookup", () => {
  const refreshed: string[] = [];
  const local = {
    isRepo: true,
    hasPrimaryRemote: true,
    isDefaultRef: false,
    refName: "feature",
    hasWorkingTreeChanges: false,
    workingTree: { files: [], insertions: 0, deletions: 0 },
  };
  return Effect.gen(function* () {
    const observer = yield* RunFinalization.RunFinalizationObserver;
    yield* observer.refresh({
      cwd: "/repo",
      threadId: ThreadId.make("thread"),
      runId: RunId.make("run"),
    });
    assert.deepEqual(refreshed.toSorted(), ["status:/repo", "workspace:/repo"]);
  }).pipe(
    Effect.provide(
      RunFinalization.layerObserver.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.mock(WorkspaceEntries.WorkspaceEntries)({
              refresh: (cwd) =>
                Effect.sync(() => {
                  refreshed.push("workspace:" + cwd);
                }),
            }),
            Layer.mock(VcsStatusBroadcaster.VcsStatusBroadcaster)({
              refreshLocalStatus: (cwd) =>
                Effect.sync(() => {
                  refreshed.push("status:" + cwd);
                  return local;
                }),
            }),
          ),
        ),
      ),
    ),
  );
});
