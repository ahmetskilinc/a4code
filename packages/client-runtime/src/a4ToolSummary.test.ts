import { compactA4McpToolOutput } from "@a4code/shared/toolOutput";
import { describe, expect, it } from "vite-plus/test";

import { summarizeA4ToolCalls, type A4ToolSummaryCall } from "./a4ToolSummary.ts";

function completed(input: unknown, output?: unknown): A4ToolSummaryCall {
  return { input, output, outcome: "completed" };
}

describe("summarizeA4ToolCalls", () => {
  it("reads provider result envelopes without treating JSON in the message as result data", () => {
    const result = { messageId: "message-1", threadId: "actual-thread" };
    const json = JSON.stringify(result);
    const outputs = [
      result,
      { structuredContent: result },
      [{ type: "text", text: json }],
      { content: [{ text: { text: json } }], isError: false },
      json,
    ];
    const calls = outputs.map((output) =>
      completed(
        {
          toolName: "a4_thread_send",
          args: { threadId: "input-thread", message: '{"threadId":"fake"}' },
        },
        output,
      ),
    );
    expect(summarizeA4ToolCalls("thread-send", calls).label).toBe("Sent 1 message to 1 thread");
    expect(
      summarizeA4ToolCalls("thread-send", [
        completed({ toolName: "a4_thread_send", args: { threadId: "input-thread" } }),
        completed({ threadId: "input-thread" }),
      ]).label,
    ).toBe("Sent 2 messages to 1 thread");
  });

  it("counts the pull requests batch link and unlink calls changed", () => {
    const urls = ["https://github.com/o/r/pull/1", "https://github.com/o/r/pull/1", "not-a-pr"];
    const links = completed({ urls }, { linkedCount: 1 });
    expect(summarizeA4ToolCalls("link-pr", [links, completed({ number: 3 })]).label).toBe(
      "Linked 2 pull requests",
    );
    expect(summarizeA4ToolCalls("link-pr", [completed({ urls }, {})]).label).toBe(
      "Linked pull requests",
    );
    const batch = completed({ states: ["merged"] }, { unlinkedCount: 2 });
    expect(summarizeA4ToolCalls("unlink-pr", [batch, completed({ number: 3 })]).label).toBe(
      "Unlinked 3 pull requests",
    );
    const uncounted = completed({ states: ["merged"] }, { isError: false });
    expect(summarizeA4ToolCalls("unlink-pr", [uncounted]).label).toBe("Unlinked pull requests");
  });

  it("tells opened and merged pull requests from found ones and auto-merges", () => {
    const create = (created: boolean) => completed({ title: "t" }, { number: 1, created });
    expect(summarizeA4ToolCalls("create-pr", [create(true)]).label).toBe("Opened 1 pull request");
    expect(summarizeA4ToolCalls("create-pr", [create(false)]).label).toBe(
      "Found 1 open pull request",
    );
    expect(summarizeA4ToolCalls("create-pr", [create(true), create(false)]).label).toBe(
      "Opened 1 pull request, found 1 open",
    );
    const merge = (auto: boolean, state: string) => completed({ auto }, { number: 1, state });
    expect(summarizeA4ToolCalls("merge-pr", [merge(false, "merged")]).label).toBe(
      "Merged 1 pull request",
    );
    expect(summarizeA4ToolCalls("merge-pr", [merge(false, "open")]).label).toBe(
      "Queued 1 pull request to merge",
    );
    expect(summarizeA4ToolCalls("merge-pr", [merge(true, "open")]).label).toBe(
      "Queued 1 pull request to merge",
    );
    expect(
      summarizeA4ToolCalls("merge-pr", [merge(true, "merged"), merge(true, "open")]).label,
    ).toBe("Merged 1 pull request, queued 1");
    expect(summarizeA4ToolCalls("review-pr", [completed({ verdict: "approve" }, {})]).label).toBe(
      "Reviewed 1 pull request",
    );
  });

  it("counts the checks a CI rerun restarted, and the ones the host refused", () => {
    const rerun = (...outcomes: boolean[]) =>
      completed(
        {},
        { checks: outcomes.map((outcome, index) => ({ name: `c${index}`, rerun: outcome })) },
      );
    expect(summarizeA4ToolCalls("ci-rerun", [rerun(true, true)])).toEqual({
      label: "Re-ran 2 checks",
      failedCount: 0,
    });
    expect(summarizeA4ToolCalls("ci-rerun", [rerun(true, false)])).toEqual({
      label: "Re-ran 1 check, 1 refused",
      failedCount: 1,
    });
    expect(summarizeA4ToolCalls("ci-rerun", [rerun(false)])).toEqual({
      label: "Could not re-run 1 check",
      failedCount: 1,
    });
    expect(summarizeA4ToolCalls("ci-rerun", [rerun()]).label).toBe(
      "Found no failed checks to re-run",
    );
  });

  it("preserves pull request summary outcomes after MCP tool output compaction", () => {
    const createExisting = completed(
      { title: "t" },
      compactA4McpToolOutput("a4code.pull_request_create", {
        number: 1,
        repository: "o/r",
        url: "https://github.com/o/r/pull/1",
        created: false,
      }),
    );
    expect(summarizeA4ToolCalls("create-pr", [createExisting]).label).toBe(
      "Found 1 open pull request",
    );

    const mergeQueued = completed(
      { auto: false },
      compactA4McpToolOutput("a4code.pull_request_merge", { number: 1, state: "open" }),
    );
    const mergeLanded = completed(
      { auto: true },
      compactA4McpToolOutput("a4code.pull_request_merge", { number: 2, state: "merged" }),
    );
    expect(summarizeA4ToolCalls("merge-pr", [mergeQueued]).label).toBe(
      "Queued 1 pull request to merge",
    );
    expect(summarizeA4ToolCalls("merge-pr", [mergeLanded]).label).toBe("Merged 1 pull request");

    const guidesMixed = completed(
      {},
      compactA4McpToolOutput("a4code.write_pull_request_guides", {
        guides: [
          { number: 1, outcome: "started", detail: null },
          { number: 2, outcome: "failed", detail: "Guides disabled" },
        ],
      }),
    );
    expect(summarizeA4ToolCalls("write-pr-guides", [guidesMixed])).toEqual({
      label: "Started 1 review guide, 1 failed",
      failedCount: 1,
    });

    const rerunMixed = completed(
      {},
      compactA4McpToolOutput("a4code.ci_rerun", {
        checks: [
          { name: "test", rerun: true, detail: null },
          { name: "external", rerun: false, detail: "Cannot rerun" },
        ],
      }),
    );
    const rerunEmpty = completed({}, compactA4McpToolOutput("a4code.ci_rerun", { checks: [] }));
    expect(summarizeA4ToolCalls("ci-rerun", [rerunMixed])).toEqual({
      label: "Re-ran 1 check, 1 refused",
      failedCount: 1,
    });
    expect(summarizeA4ToolCalls("ci-rerun", [rerunEmpty]).label).toBe(
      "Found no failed checks to re-run",
    );
  });

  it("excludes failed and unfinished sends even if the provider reports completed", () => {
    const calls: A4ToolSummaryCall[] = [
      completed({ threadId: "success" }, { messageId: "ok", threadId: "success" }),
      completed(
        { threadId: "failed" },
        { isError: true, structuredContent: { threadId: "failed" } },
      ),
      completed({ threadId: "failed" }, [
        { type: "text", text: JSON.stringify({ _tag: "OrchestratorMcpFailure" }) },
      ]),
      { input: { threadId: "cancelled" }, output: undefined, outcome: "unfinished" },
    ];
    expect(summarizeA4ToolCalls("thread-send", calls)).toEqual({
      label: "Sent 1 message to 1 thread",
      failedCount: 2,
    });
    expect(summarizeA4ToolCalls("thread-send", [calls[1]!])).toEqual({
      label: "Tried to send 1 message to 1 thread",
      failedCount: 1,
    });
  });

  it("does not confuse a child's failure or wait timeout with failure of the orchestration call", () => {
    const failedChild = { taskId: "task-1", status: "failed", summary: "command not found" };
    expect(
      summarizeA4ToolCalls("delegate", [completed({}, failedChild), completed({}, failedChild)]),
    ).toEqual({
      label: "Delegated 1 task",
      failedCount: 0,
    });
    expect(
      summarizeA4ToolCalls(
        "task-status",
        Array.from({ length: 4 }, () => completed({ taskId: "task-1" }, failedChild)),
      ).label,
    ).toBe("Checked task status 4 times");
    expect(
      summarizeA4ToolCalls("thread-wait", [
        completed({ threadId: "thread-1" }, { threadId: "thread-1", timedOut: true }),
      ]),
    ).toEqual({
      label: "Waited on 1 thread",
      failedCount: 0,
    });
  });
});
