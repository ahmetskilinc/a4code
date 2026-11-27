# Running a4code in the background

Run a4code as a background user service on Linux, macOS, or Windows so your host stays reachable without keeping a terminal open.

## Manage the service

Install the standalone CLI on the host, then use the following commands there. [Local CLI installation](./install.md#command-line)

| Action | Command |
| --- | --- |
| Install and start the user service | `a4code service install` |
| Inspect service state and log location | `a4code service status` |
| Restart after configuration changes | `a4code service restart` |
| Stop and remove the service | `a4code service uninstall` |
| Enable or disable private network access | `a4code up --lan` or `a4code up --no-lan` |

Generate a fresh pairing link on the running host with `a4code pair`. For private Tailscale HTTPS use `a4code pair --tailscale`. [Remote access](./remote-access.md)

## Configure the service environment

Add `KEY=VALUE` entries to `service.env` in your a4code home directory (`~/.a4code/service.env` by default). Values are literal (quote spaces or `#`; no shell expansion) and survive service restarts.

```dotenv
A4CODE_PORT=3773
A4CODE_HOST=127.0.0.1
```

- `PATH`, `A4CODE_HOME`, `A4_BOOT_SERVICE_UNIT`, and `A4_SERVICE_LAUNCHER_CONTEXT` cannot be overridden here.
- Run `a4code service restart` after editing (and `chmod 600 ~/.a4code/service.env` if it holds secrets).

## Platform support

- **Linux**: Requires systemd user services with lingering enabled so a4code starts at boot and survives logout.
- **macOS**: Starts at login, stops at logout. Keep the Mac logged in and awake for unattended access. If agents can't read Desktop/Documents/Downloads, grant Full Disk Access to the `a4code` path in `~/Library/LaunchAgents/dev.a4code.app.service.plist`.
- **Windows**: Runs windowless via Task Scheduler (`a4code-<domain>-<user>`) while signed in and auto-restarts on exit. Lock the screen instead of signing out for unattended access.


## Keep the server responsive under memory pressure (Linux)

On Linux, agents run at lower priority than the server, but heavy memory use can still trigger the OOM killer. Run as your normal user:

```sh
a4code service protect
```

It previews system changes, asks for confirmation and `sudo`, and optionally protects Tailscale and SSH too. Run `a4code service restart` for OOM-killer protection to take effect, or `a4code service protect --undo` to remove it.

## Troubleshooting

Run `a4code service status` on the host to see the log path and health checks:

| Status                                 | Fix                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `linger-disabled`                      | Run `sudo loginctl enable-linger "$(id -un)"` (or `ssh -t your-server '...'`), then retry setup as your normal user. Never run a4code as root. |
| `linger-unavailable`                   | Check `loginctl show-user "$(id -un)" --property=Linger` and verify `systemd-logind`.                                                           |
| `user-manager-unavailable`             | Run `systemctl --user status` in a login session to verify systemd user support.                                                                |
| `service-disabled` / `service-stopped` | Check the log and `systemctl --user status a4code.service`, then run `a4code service install`.                                                      |
| `restart-pending`                      | Run `a4code service restart` to switch to the newly installed version.                                                                              |


## Reclaim database space

a4code automatically prunes old internal history while keeping conversations. Older databases that still hold freed space show a **Reclaim** button in **Settings → Maintenance** when at least 1 GiB is reclaimable (pauses the server/agents during repair).

For manually started servers (or CLI use), stop any hand-started server or desktop app and run:

```sh
a4code doctor          # Interactive repair (auto-stops/restarts a background service)
a4code doctor --dry-run
a4code doctor --fix    # Non-interactive recommended repairs
```

- Needs free disk space of ~2× active data size (in `TMPDIR`/`/var/tmp` and beside the database). Large databases can take over an hour.
- `a4code doctor` optionally offers to remove the legacy pre-0.1.0 `state.sqlite` backup only when all active projects and threads exist in the current database (`--fix` never deletes it automatically).
