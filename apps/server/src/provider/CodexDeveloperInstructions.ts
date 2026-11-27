import type { V2TurnStartParams__AdditionalContextEntry } from "effect-codex-app-server/schema";
import { buildRuntimeInstructions } from "@a4code/provider-core/server/runtimeInstructions";

import {
  A4_CODE_BROWSER_TOOL_INSTRUCTIONS,
  A4_CODE_DEVICE_TOOL_INSTRUCTIONS,
  a4CodeOrchestrationSections,
} from "@a4code/provider-core/server/orchestrationInstructions";

/** Codex silently truncates additionalContext values over 1,000 tokens, counted as UTF-8 bytes / 4. */
export const CODEX_ADDITIONAL_CONTEXT_VALUE_MAX_BYTES = 4_000;

export interface A4CodeToolAvailability {
  readonly browser: boolean;
  readonly device: boolean;
  readonly nativeSubagents?: boolean;
}

const normalizeAvailability = (
  availability: boolean | A4CodeToolAvailability,
): A4CodeToolAvailability =>
  typeof availability === "boolean" ? { browser: availability, device: false } : availability;

/** Instructions for unavailable tools would steer the model away from its remaining automation. */
const toolInstructions = (tools: A4CodeToolAvailability): string =>
  [
    tools.browser ? A4_CODE_BROWSER_TOOL_INSTRUCTIONS : "",
    tools.device ? A4_CODE_DEVICE_TOOL_INSTRUCTIONS : "",
  ]
    .filter(Boolean)
    .join("\n\n");

export interface CodexRuntimeInfo {
  readonly model: string;
  readonly modelName?: string | undefined;
  readonly reasoningEffort?: string | undefined;
}

/** Keep this outside collaboration mode; model-catalog mode text overrides client developer_instructions. */
export function buildCodexAdditionalContext(
  runtime: CodexRuntimeInfo,
  toolsAvailable: boolean | A4CodeToolAvailability = true,
): Record<string, V2TurnStartParams__AdditionalContextEntry> {
  const availability = normalizeAvailability(toolsAvailable);
  const tools = toolInstructions(availability);
  // Split values to fit per-entry caps; number keys because Codex emits them in key order.
  return {
    ...Object.fromEntries(
      a4CodeOrchestrationSections(availability.nativeSubagents).map((section, index) => [
        `a4_code_orchestration_${String(index + 1).padStart(2, "0")}`,
        { kind: "application" as const, value: section },
      ]),
    ),
    a4_code_runtime: {
      kind: "application",
      value: buildRuntimeInstructions({ harness: "Codex", ...runtime }),
    },
    ...(tools ? { a4_code_tools: { kind: "application", value: tools } } : {}),
  };
}
