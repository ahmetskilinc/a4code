import { assert, describe, it } from "@effect/vitest";

import {
  A4_CODE_DEVICE_TOOL_INSTRUCTIONS,
  A4_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH,
  A4_CODE_ORCHESTRATION_INSTRUCTIONS,
  a4AcpPromptWithInstructions,
  a4OrchestrationPrompt,
  a4OrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

describe("a4code device instructions", () => {
  it("route device work through device_open and give Claude the line that loads the tools", () => {
    for (const intent of ["`device_list`", "`device_open`", "`agent-device`", "ssh", "`hostId`"]) {
      assert.include(A4_CODE_DEVICE_TOOL_INSTRUCTIONS, intent);
    }
    assert.notInclude(A4_CODE_DEVICE_TOOL_INSTRUCTIONS, "ToolSearch");
    const loadLine =
      " Load them with ToolSearch `select:mcp__a4code__device_list,mcp__a4code__device_open,mcp__a4code__device_screenshot,mcp__a4code__device_close`.";
    assert.include(A4_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH, loadLine);
    assert.equal(
      A4_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH.replace(loadLine, ""),
      A4_CODE_DEVICE_TOOL_INSTRUCTIONS,
    );
  });

  it("open the app before the returned command's snapshots, screenshots and input", () => {
    assert.include(
      A4_CODE_DEVICE_TOOL_INSTRUCTIONS,
      "its snapshots, screenshots and input need `open <app>` first,",
    );
  });

  it("keep the failure rule from taking over or closing a session another thread holds", () => {
    // agent-device's DEVICE_IN_USE advice is to rerun with the owner's --session or close it first.
    assert.include(
      A4_CODE_DEVICE_TOOL_INSTRUCTIONS,
      "follow its advice once, but never reuse or close another session unless the user explicitly asked; if it still fails,",
    );
  });

  it("reach OpenCode and Cursor only when the session holds device access", () => {
    assert.include(a4OrchestrationSystemPrompt(true, true), A4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(a4OrchestrationSystemPrompt(true, false), "## a4code devices");
    assert.isUndefined(a4OrchestrationSystemPrompt(false, true));

    const firstRun = (hasDeviceTools: boolean) =>
      a4OrchestrationPrompt({
        prompt: "Check the login screen.",
        hasA4Mcp: true,
        hasDeviceTools,
        orchestrationDelivered: false,
        deviceInstructionsDelivered: false,
      });
    assert.include(firstRun(true), A4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(firstRun(false), "## a4code devices");

    const laterRun = (deviceInstructionsDelivered: boolean) =>
      a4OrchestrationPrompt({
        prompt: "Check the login screen.",
        hasA4Mcp: true,
        hasDeviceTools: true,
        orchestrationDelivered: true,
        deviceInstructionsDelivered,
      });
    assert.include(laterRun(false), A4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(laterRun(false), A4_CODE_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(laterRun(true), "Check the login screen.");

    // A provider's own guidance reaches a conversation that already had the rest.
    const providerRun = (providerInstructionsDelivered: boolean) =>
      a4OrchestrationPrompt({
        prompt: "Check the login screen.",
        hasA4Mcp: true,
        hasDeviceTools: false,
        orchestrationDelivered: true,
        deviceInstructionsDelivered: false,
        providerInstructions: "Mark awaited shells.",
        providerInstructionsDelivered,
      });
    assert.include(providerRun(false), "Mark awaited shells.");
    assert.notInclude(providerRun(false), A4_CODE_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(providerRun(true), "Check the login screen.");
  });

  it("reach ACP agents again when device access changes mid-thread", () => {
    const state = { interactionMode: "default", hasA4Mcp: true, hasDeviceTools: false } as const;
    const withDevices = a4AcpPromptWithInstructions({
      prompt: "Check the login screen.",
      state: { ...state, hasDeviceTools: true },
      previousState: state,
    });
    assert.include(withDevices, A4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.equal(
      a4AcpPromptWithInstructions({ prompt: "Again.", state, previousState: state }),
      "Again.",
    );
    assert.notInclude(a4AcpPromptWithInstructions({ prompt: "Hi.", state }), "## a4code devices");
    const withProxy = a4AcpPromptWithInstructions({
      prompt: "Render a chart.",
      state: { ...state, toolExposure: "deferred-proxy" },
    });
    assert.include(withProxy, "including `delegate_task`");
    assert.include(withProxy, "tool_call({ name, arguments })");
    assert.notInclude(a4AcpPromptWithInstructions({ prompt: "Hi.", state }), "tool_call(");
  });
});
