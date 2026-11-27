# Outside agents

Connect external agents (Claude Code or Codex in your terminal, ChatGPT, or any OAuth-capable MCP client) to your a4code environment over MCP to read projects/threads, launch and message threads, and monitor events.

## Quick setup

Open the command palette (`Cmd/Ctrl+K`) and run **Use a4code in another app (MCP)** (or open **Settings → Sharing & access**), pick your app, and follow the prompts.

- To also reach other machines through the same connection, enable **Settings → Labs → Linked environments** and [link them](./remote-access.md#link-another-environment).
- To copy the raw MCP endpoint (`https://<environment-address>/mcp`), open an environment's menu in **Settings → Environments → Copy MCP URL**. OAuth requires `https://` or `localhost` (plain `http://` LAN/Tailscale addresses cannot complete OAuth).

### CLI clients

- **Claude Code**:
  ```sh
  claude mcp add --transport http a4code https://<environment-address>/mcp
  claude mcp login a4code   # add --no-browser on headless hosts
  ```
- **Codex**:
  ```sh
  codex mcp add a4code --url https://<environment-address>/mcp
  codex mcp login a4code    # add --no-browser on headless hosts
  ```

## Approve access and permissions

The first time an outside agent connects, approve its sign-in page (using an already-authorized browser or a one-time pairing code from **Settings → Sharing & access** / `a4code auth pairing create`).

- **Read only**: Inspect projects, threads, providers, and models.
- **Supervised → Full access**: Also launch, message, and stop threads up to the granted permission mode. Managing [workflow runs](./workflows.md) or using approval-skipping agent modes requires **Full access** (or your policy's maximum mode).
- Sign-ins last **30 days**; revoke anytime in **Settings → Sharing & access**.

## Available tools and limits

Tools that act as a running a4code thread (`delegate_task`, `create_threads`, `request_secret`, `html_render`, `preview_*`, `device_*`, `a4_worktree_handoff`) only work for agents running **inside** a4code.

- Use `a4_thread_launch` + `a4_thread_wait` / `a4_thread_read` to run and follow work.
- Pass `projectId` or `threadId` explicitly (or `allProjects: true` on `a4_thread_list`).
- **MCP Events (`io.modelcontextprotocol/events`)**: Bots can poll, stream, or subscribe via HTTPS webhooks (up to 1-hour leases; latest 1,000 milestones buffered in memory) for turn, approval, PR watch, and workflow events. For local webhook testing, set `A4CODE_MCP_WEBHOOK_ALLOWED_HOSTS=localhost,127.0.0.1` on the server.

## Host scripts (`a4code thread`)

On the server machine itself, drive threads directly without OAuth:

```sh
id=$(a4code thread start . "Find why the tests are slow")
a4code thread send "$id" "Now fix it" --wait
a4code thread show "$id"
a4code thread list
```

- Pass `--worktree <base-branch>`, `--title` / `--generate-title`, `--provider <id> --model <slug>`, `--option id=value` (e.g. `reasoningEffort=high` for Codex, `effort=high` for Claude), or `-` to read the prompt from stdin.
- `--wait` prints the reply and exits `1` on failure/stop or `2` when waiting for user input. Add `--json` for structured output including the thread ID.
