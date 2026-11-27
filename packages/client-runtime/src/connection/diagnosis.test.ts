import { EnvironmentAuthInvalidError } from "@a4code/contracts";
import { describe, expect, it } from "@effect/vitest";

import { presentConnectionDiagnosis } from "./diagnosis.ts";
import { mapRemoteEnvironmentError } from "./errors.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  ConnectionBlockedError,
  type ConnectionAttemptError,
  type SupervisorConnectionState,
} from "./model.ts";

const backoff = (lastFailure: ConnectionAttemptError): SupervisorConnectionState => ({
  ...AVAILABLE_CONNECTION_STATE,
  desired: true,
  network: "online",
  phase: "backoff",
  attempt: 3,
  lastFailure,
  retryAt: Date.UTC(2026, 9, 19, 12, 0, 30),
});

const diagnose = (state: SupervisorConnectionState) =>
  presentConnectionDiagnosis({ hostLabel: "Mac mini", state });
describe("presentConnectionDiagnosis", () => {
  it("reports this device as offline", () => {
    const result = diagnose({ ...AVAILABLE_CONNECTION_STATE, network: "offline" });
    expect(result?.headline).toBe("This device is offline");
    expect(result?.hops[0]?.result).toBe("failed");
  });

  it("tells a host that refused this device's login to sign in again, not to start a4code", () => {
    const failure = mapRemoteEnvironmentError(
      new EnvironmentAuthInvalidError({
        code: "auth_invalid",
        reason: "invalid_credential",
        traceId: "trace-1",
      }),
    );
    const steps = diagnose(backoff(failure))?.steps.join(" ");
    expect(steps).not.toContain("Make sure a4code is running");
    expect(steps).toMatch(/pair|sign in/i);
  });

  it("does not report hops as working when the failure names none", () => {
    const failure = new ConnectionBlockedError({
      reason: "authentication",
      detail: "Pair this environment again.",
    });
    expect(diagnose(backoff(failure))?.hops.map((hop) => hop.result)).not.toContain("ok");
  });
});
