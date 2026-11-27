# FAQ

## Is a4code a harness?

No. A harness turns an LLM into an agent (tools, execution loop, and results)—like Claude Code's Agent SDK or Codex App Server. a4code drives those harnesses through one fast interface; it does not work without at least one installed agent.

Bring your own: Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, Kiro, Pi, Muse Code, fx, or any [ACP agent](./providers-acp.md). See [Provider setup](./install.md#providers).

## Why use a4code instead of Claude Code or the Codex app?

- **Bring your own subscription**: Use Claude, Codex, and every other agent you already have installed in one place.
- **Remote-first**: Run `a4code up` on any box and drive it from anywhere.
- **Open source (MIT)**: Fork the source code under your own branding if you ever want something different.

## Can I use a4code with my Claude Code subscription?

Yes.

## What does a4code cost?

a4code runs locally. Any charges come from the providers or services you choose.

## Can I use a second machine?

Run an environment on that host and pair over your LAN or private Tailscale network, or add its SSH alias in the desktop app. [Remote access](./remote-access.md)

## Can I use an API key or OpenRouter instead of a subscription?

Yes. Add another provider instance in **Settings → Providers** with its own environment variables and endpoint (your subscription setup stays untouched). See [OpenRouter for Claude](./providers-claude.md#openrouter-and-local-routers) and [Providers](./install.md#providers).

## Does a4code support local models?

No. a4code focuses on frontier coding agents.

## Where do my prompts go?

The desktop app sends a turn to the environment you selected. Its agent can send prompts, repository context and tool results to its configured provider. Choosing a browser destination, Git remote, remote MCP server or webhook can also send data to that destination.

## Worktrees are eating my disk. How do I clean them up?

Enable automatic cleanup or run **Delete now** in **Settings → Worktrees → Cleanup**. See [Storage cleanup](./project-settings.md#storage-cleanup).

## Is there voice input?

Yes—on-device speech on iOS, Android, and macOS 26+ desktop, or via a paired environment on web/desktop/mobile. See [Voice input](./voice-input.md).

## Does it work on Windows, Mac, and Linux?

Yes, all three (desktop app and CLI). Note: there is no standalone `a4code` binary for Intel Macs (use the desktop app there), and Windows users can also run agents inside WSL. See [Install](./install.md).

## Why is my provider not showing up?

Usually the provider CLI is not installed, not signed in, or not on the `PATH` of the **server machine** (especially with version managers). Authenticate on the server machine first (e.g. `codex login` or `claude auth login`) and set **Binary path** in **Settings → Providers** if needed.
