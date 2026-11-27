import * as DateTime from "effect/DateTime";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";
import type { ConnectionHop, SupervisorConnectionState } from "./model.ts";

export type ConnectionHopResult = "ok" | "failed" | "unchecked";

export interface ConnectionDiagnosisHop {
  readonly hop: ConnectionHop;
  readonly label: string;
  readonly result: ConnectionHopResult;
}

export interface ConnectionDiagnosis {
  /** Names the part that failed, e.g. "Mac mini's tunnel is offline". */
  readonly headline: string;
  readonly hops: ReadonlyArray<ConnectionDiagnosisHop>;
  readonly steps: ReadonlyArray<string>;
  readonly facts: ReadonlyArray<readonly [label: string, value: string]>;
}

export interface ConnectionDiagnosisInput {
  readonly hostLabel: string;
  readonly state: SupervisorConnectionState;
  readonly clientVersion?: string | undefined;
  readonly serverVersion?: string | null | undefined;
}

export function presentConnectionDiagnosis(
  input: ConnectionDiagnosisInput,
  resolve: MFunctionType = mFallback,
): ConnectionDiagnosis | null {
  const { hostLabel: host, state } = input;
  const failure = state.lastFailure;
  const offline = state.network === "offline" || state.phase === "offline";
  if (!offline && !failure) return null;

  const failedLocally = offline || failure?.hop === "device";
  const hops: ConnectionDiagnosisHop[] = [
    {
      hop: "device",
      label: resolve(msg("This device")),
      result: failedLocally ? "failed" : failure?.hop === "server" ? "ok" : "unchecked",
    },
    {
      hop: "server",
      label: host,
      result: failedLocally ? "unchecked" : "failed",
    },
  ];
  let headline = resolve(msg("a4code on {host} did not answer", { host }));
  let steps = [
    resolve(msg("Make sure a4code is running on {host}.", { host })),
    resolve(msg("Retry. If it keeps failing, copy the diagnostics.")),
  ];
  if (offline) {
    headline = resolve(msg("This device is offline"));
    steps = [resolve(msg("Reconnect this device to the environment's network."))];
  } else if (failure?._tag === "ConnectionBlockedError" && failure.serverUpdateRequired) {
    headline = resolve(msg("{host} runs an older a4code", { host }));
    steps = [resolve(msg("Install matching builds on this device and {host}.", { host }))];
  } else if (failure?.failureCause === "clock_skew") {
    headline = resolve(msg("This device's clock is off"));
    steps = [
      resolve(
        msg("Turn on automatic date and time on this device and on {host}, then retry.", { host }),
      ),
    ];
  } else if (failure?.reason === "authentication" || failure?.reason === "permission") {
    headline = resolve(msg("a4code on {host} did not accept this device", { host }));
    steps = [resolve(msg("Pair it again with a new pairing link from {host}.", { host }))];
  } else if (failedLocally) {
    headline = resolve(msg("This device could not prepare the connection"));
    steps = [resolve(msg("Restart a4code on this device."))];
  }
  const facts: Array<readonly [string, string]> = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") facts.push([label, String(value)]);
  };
  add(
    resolve(msg("Cause", { $context: "diagnostics field label" })),
    failure?.failureCause ?? failure?.reason,
  );
  add(resolve(msg("HTTP status")), failure?.httpStatus);
  add(
    resolve(msg("Attempts", { $context: "diagnostics field label" })),
    input.state.attempt > 0 ? input.state.attempt : null,
  );
  add(
    resolve(msg("Next retry")),
    input.state.retryAt === null
      ? null
      : DateTime.formatIso(DateTime.makeUnsafe(input.state.retryAt)),
  );
  add(
    resolve(msg("Route", { $context: "diagnostics field label" })),
    resolve(msg("Direct", { $context: "connection route" })),
  );
  add(resolve(msg("App version")), input.clientVersion);
  add(resolve(msg("Host version")), input.serverVersion);
  add(resolve(msg("Error", { $context: "diagnostics field label" })), failure?.detail);
  add(resolve(msg("Trace ID")), failure?.traceId);

  return { headline, hops, steps, facts };
}

const HOP_MARK = { ok: "ok", failed: "FAILED", unchecked: "not checked" } as const;

/** One plain-text block for bug reports. */
export function connectionDiagnosisText(hostLabel: string, diagnosis: ConnectionDiagnosis): string {
  return [
    `a4code connection to ${hostLabel}: ${diagnosis.headline}`,
    "",
    ...diagnosis.hops.map((hop) => `${hop.label}: ${HOP_MARK[hop.result]}`),
    "",
    ...diagnosis.facts.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
}
