import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Metric from "effect/Metric";
import { describe } from "vite-plus/test";

import * as Metrics from "./Metrics.ts";

const TOTAL_COUNTERS = Object.values(Metrics).filter(
  (value): value is Metric.Counter<number> => Metric.isMetric(value) && value.type === "Counter",
);

describe("Metrics", () => {
  it.effect("keeps total counters monotonic", () =>
    Effect.gen(function* () {
      assert.isAbove(TOTAL_COUNTERS.length, 0);
      for (const counter of TOTAL_COUNTERS) {
        const state = yield* Metric.value(counter);
        assert.isTrue(state.incremental, counter.id);
      }
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );
});
