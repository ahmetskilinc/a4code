import { type OrchestrationV2DomainEvent } from "@a4code/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import * as PullRequestService from "../pullRequest/PullRequestService.ts";
import { makeLinkedThreadsChangeDetector } from "../pullRequest/linkedThreads.ts";
import { forkParked } from "../serverActivation.ts";
import * as Orchestrator from "./Orchestrator.ts";

export const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const pullRequests = yield* PullRequestService.PullRequestService;
  const linkedThreadsChange = makeLinkedThreadsChangeDetector();
  // A running linked thread can reorder its answers on every event, so reorders refresh readers at
  // most once per 10s, the cadence clients used to poll at.
  const linkedThreadReorders = yield* Queue.dropping<void>(1);

  const notifyLinkedThreads = (event: OrchestrationV2DomainEvent) => {
    switch (linkedThreadsChange(event)) {
      case "changed":
        return pullRequests.notifyLinkedThreadsChanged;
      case "reordered":
        return Queue.offer(linkedThreadReorders, undefined).pipe(Effect.asVoid);
      case null:
        return Effect.void;
    }
  };

  const start = Effect.fn("ThreadPullRequestServiceV2.start")(function* () {
    yield* forkParked(Stream.runForEach(orchestrator.streamDomainEvents, notifyLinkedThreads));
    yield* forkParked(
      Queue.take(linkedThreadReorders).pipe(
        Effect.andThen(pullRequests.notifyLinkedThreadsChanged),
        Effect.andThen(Effect.sleep("10 seconds")),
        Effect.forever,
      ),
    );
  });

  return { start };
});
