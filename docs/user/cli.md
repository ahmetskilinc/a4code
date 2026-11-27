# CLI reference (`a4code`)

The `a4code` command runs and manages a4code servers, background services, remote access, threads, workflows, and diagnostics. Run `a4code --help` or `a4code <command> --help` for full flags.

Use the standalone executable from your local distribution. [Install the CLI](./install.md#command-line)

## Import history from another installation

Run this before starting the server in the new destination. Supply the home that contains the old installation's `userdata/statev2.sqlite` and a new path whose parent directory exists.

```sh
a4code import-history --from /path/to/old-home --to /path/to/new-home
a4code serve --base-dir /path/to/new-home
```

The import reads a consistent SQLite snapshot, including committed changes in the write-ahead log. It copies local projects, settled thread families, archived conversations and saved attachments. A family includes its forks and subagents. Families with work that could resume automatically stay in the source home.

The new home starts with fresh settings and pairing. Reconnect your own providers and pair each device with the new server. Scheduled tasks, workflows, account credentials, peer routes, pull-request watches and automatic project scripts stay in the source installation. Commands and credentials you personally pasted into a conversation remain part of its history.

## Running and connecting

| Command                  | Description                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `a4code [path]` / `a4code start` | Start a foreground server and open the web app (optionally in a project directory).                                              |
| `a4code serve`               | Start the server without opening a browser (`--lan`, `--tailscale-serve`, `--host`, `--port`, `--base-dir`).                     |
| `a4code app [path]`          | Open a directory as a project/thread in the running desktop app.                                                                 |
| `a4code up`                  | Set up the background service and direct private network access (`--lan`, `--no-lan`, `--yes`). |
| `a4code status`              | Show how other devices can reach this host (`--json`).                                                                           |
| `a4code pair`                | Generate a one-time pairing URL / QR code (`--tailscale`, `--scope <scope>`).                                                    |

## Background service

| Command                       | Description                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a4code service`                  | Manage the background service (`install`, `status`, `restart`, `uninstall`, `protect [--undo]`). See [Background service](./background-service.md). |
| `a4code install` / `a4code uninstall` | Install or remove the `a4code` launcher and background service (keeps `~/.a4code/userdata`).                                                                |

## Threads, projects, and workflows

| Command       | Description                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a4code thread`   | Script threads on the host (`start`, `send`, `show`, `list`; supports `--wait`, `--json`, `--worktree`, `--provider`, `--model`, `--option`). See [Host scripts](./outside-agents.md#host-scripts-a4-thread). |
| `a4code project`  | Manage projects on the host (e.g. `a4code project add <path> --track <folder>`).                                                                                                                                  |
| `a4code workflow` | Start and steer durable workflows (`start`, `list`, `show`, `resume`, `cancel`, `questions`, `signal`, `withdraw`, `hooks`, `store`). See [Workflows](./workflows.md).                                        |

## Environments, auth, themes, and policy

| Command          | Description                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `a4code environment` | Link or manage peer environments (`a4code environment link <addr> --pairing-code <code> --access <mode>`, `--from <file>`).                                |
| `a4code auth`        | Issue pairing codes and manage direct sessions (`pairing create`, `session list/revoke/issue`). |
| `a4code theme`       | Manage server-published themes (`set <id>`, `clear`, `show`). See [Appearance](./appearance.md#environment-themes).                                    |
| `a4code policy`      | Validate, inspect, and generate MDM/GPO templates for [managed policies](./managed-policy.md) (`check`, `show`, `settings`, `templates`).              |

## Diagnostics and maintenance

| Command            | Description                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `a4code doctor`        | Inspect database size and reclaim disk space (`--dry-run`, `--fix`).                                       |
| `a4code browser setup` | One-time Linux host setup (AppArmor sandbox profile, libraries, fonts) for the headless preview browser.   |
| `a4code trace summary` | Summarize local server trace latency and errors (`--since 30m`, `--limit 50`).                             |
