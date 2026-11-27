import { ORCHESTRATION_V2_WS_METHODS } from "@a4code/contracts";
import { createOrchestrationEnvironmentAtoms } from "@a4code/client-runtime/state/orchestration";
import { createEnvironmentRpcCommand } from "@a4code/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";
import { environmentShell } from "./shell";

export const orchestrationEnvironment = createOrchestrationEnvironmentAtoms(connectionAtomRuntime, {
  shellState: environmentShell.stateValueAtom,
});

export const threadTitlesRead = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:orchestration:thread-titles-read",
  tag: ORCHESTRATION_V2_WS_METHODS.getThreadTitles,
});
