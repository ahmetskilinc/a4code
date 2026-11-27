import { describe, expect, it } from "vite-plus/test";

import {
  A4_MCP_TOOL_NAMES,
  resolveA4McpSummaryAction,
  resolveA4McpToolDefinition,
  resolveA4McpToolPresentation,
} from "./a4McpToolPresentation.ts";

describe("resolveA4McpToolPresentation", () => {
  it("recognizes every a4code tool across provider prefixes and completion suffixes", () => {
    for (const tool of A4_MCP_TOOL_NAMES) {
      const presentation = resolveA4McpToolPresentation(tool);
      for (const prefix of [
        "mcp__a4code__",
        "mcp__a4_code__",
        "mcp__a4code__",
        "a4code-code.",
        "a4code.",
        "a4code-direct.",
        "mcp__a4_code_direct__",
        "a4_code/",
        "a4code:",
        "mcp_a4code_",
        "a4code ",
        "a4code · ",
      ]) {
        expect(resolveA4McpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveA4McpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveA4McpToolPresentation("a4code-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("Delegate a child task");
    expect(resolveA4McpToolPresentation("a4code-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });
});

describe("resolveA4McpToolDefinition", () => {
  it("labels an action tool call as the action it ran", () => {
    expect(
      resolveA4McpToolDefinition("mcp__a4code__preview_act", { action: "type" })?.labels,
    ).toEqual(resolveA4McpToolDefinition("preview_type")?.labels);
    expect(resolveA4McpToolDefinition("a4_thread_transfer", { action: "fork" })?.displayName).toBe(
      resolveA4McpToolDefinition("a4_thread_fork")?.displayName,
    );
    expect(resolveA4McpToolDefinition("preview_act", { action: "unknown" })?.labels[2]).toBe(
      "Used",
    );
  });
});

describe("resolveA4McpSummaryAction", () => {
  it("summarizes an action tool by the action each call ran", () => {
    expect(resolveA4McpSummaryAction("mcp__a4code__a4_queue", { action: "list" })).toBe(
      "queue-list",
    );
    expect(resolveA4McpSummaryAction("a4_queue", { action: "edit" })).toBe("queue-edit");
    expect(resolveA4McpSummaryAction("a4_thread_transfer", { action: "status" })).toBe(
      "thread-transfers",
    );
    expect(resolveA4McpSummaryAction("a4_thread_configure", {})).toBe("thread-configuration");
    expect(resolveA4McpSummaryAction("schedule_task", { scheduledTaskId: "task-1" })).toBe(
      "schedule-update",
    );
    expect(resolveA4McpSummaryAction("delegate_task", { task: "x" })).toBe("delegate");
  });
});
