# Managed policy

A managed policy lets an administrator set defaults, lock settings, and restrict capabilities (such as maximum permission mode, allowed providers, or remote access) for every user on a machine. The a4code server enforces the policy for all connected clients (desktop, web, and mobile).

## Roll out a policy

1. Author a JSON policy (see [Write a policy](#write-a-policy)). Do **not** include secrets—all local users can read the policy.
2. Validate it: `a4code policy check policy.json`.
3. Deploy via MDM/GPO or a file to [one supported location](#where-the-policy-goes).
4. Restart a4code on the machine (policies load at startup only).
5. Verify with `a4code policy show`.

## Write a policy

```json
{
  "schemaVersion": 1,
  "organization": "Example Corp",
  "supportUrl": "https://it.example.com/a4code",
  "settings": {
    "defaultRuntimeMode": { "value": "approval-required", "locked": false },
    "enableAgentBrowserAccess": { "value": false, "locked": true }
  },
  "limits": {
    "maxRuntimeMode": "auto-accept-edits",
    "clients": ["desktop", "local-browser"]
  }
}
```

`schemaVersion` and `organization` are required. Locked controls display your organization name and optional `supportUrl` in Settings.

## Where the policy goes

Use **one** source per machine (having both a native policy and a policy file prevents a4code from starting):

| OS          | Native policy                                                                     | Policy file (admin-writable only)                 |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| **macOS**   | Device configuration profile for `dev.a4code.app`                             | `/Library/Application Support/A4Code/policy.json` |
| **Windows** | GPO template or `Policy` (`REG_SZ`) under `HKLM\SOFTWARE\Policies\A4Code\A4Code` | `C:\Program Files\A4Code\policy.json`             |
| **Linux**   | —                                                                                 | `/etc/a4code/policy.json`                         |

- **macOS profile**: Generate `macos/a4code.mobileconfig` with `a4code policy templates <dir> --policy policy.json` (or `plutil -convert xml1 -o dev.a4code.app.plist policy.json`). Deploy as a single device profile (profiles cannot represent `null`; use a policy file if needed).
- **Windows GPO**: Generate `windows/a4code.admx` and `windows/en-US/a4code.adml` with `a4code policy templates <dir>`, import into `PolicyDefinitions`/Intune under **Computer Configuration → Administrative Templates → a4code**, set **Organization**, run `gpupdate /target:computer /force`, and restart a4code.
- **Windows registry**: Set `Policy` (`REG_SZ`) to single-line JSON (do not mix with GPO template values).

## Check what the server loaded

Run `a4code policy show` as the user running a4code to inspect the installed policy, fingerprint, and whether the running server has loaded it. After any policy change or removal, restart the desktop app or run `a4code service restart`. Removing a policy restores the user's own saved settings.

> Note: a4code **refuses to start** if a policy is unreadable, invalid, uses unknown keys from a newer version, or conflicts with another policy source. Always validate with `a4code policy check` and upgrade a4code before deploying newer keys.

## Settings

Run `a4code policy settings` to list every manageable path from `settings.json` and its default.

- `"locked": false` sets a default (users can override).
- `"locked": true` enforces the value across Settings and project overrides.

Key constraints:

- Lock `worktreeCleanup` together with `storageCleanup` worktree rules.
- Manage `idleCompaction` (not legacy `compactIdleThreads`).
- Lock `providerInstances.<id>` as a whole, or pin per-driver fields under [`limits.providers.instances`](#providers).

## Limits

```json
{
  "schemaVersion": 1,
  "organization": "Example Corp",
  "limits": {
    "maxRuntimeMode": "auto-accept-edits",
    "clients": ["desktop"],
    "webhookTasks": false,
    "browserCookieImport": false,
    "previewTunnel": false,
    "worktreeLayoutCommands": false,
    "providers": {
      "allowedDrivers": ["claudeAgent", "codex"],
      "instances": {
        "claudeAgent": {
          "locked": true,
          "environment": [{ "name": "CLAUDE_CODE_USE_BEDROCK", "value": "1" }]
        }
      }
    }
  }
}
```

### Permission modes

`maxRuntimeMode` caps all threads (`approval-required`, `auto-accept-edits`, `auto`, or `full-access`). Threads above the cap cannot run until lowered.

When `maxRuntimeMode` is set, users cannot modify provider launch settings (`binaryPath`, `launchArgs`, config home, or env vars)—pin required values (including absolute `binaryPath`s so user `PATH` entries can't shadow them) in `providers.instances`. Leave `acpRegistry` out of `allowedDrivers` if you don't want users adding arbitrary ACP Registry agents.

### Client access

`clients` allows any subset of `desktop`, `local-browser`, and `remote` (keep `desktop` on desktop machines).

- Omitting `remote` restricts the server to loopback, revokes paired devices, disables LAN and Tailscale Serve, and refuses startup if a Tailscale Serve route still forwards to a4code (or if a legacy service has LAN enabled—run `a4code up --no-lan`).

### Other capabilities

- `webhookTasks: false`: Disables scheduled-task and workflow webhooks.
- `browserCookieImport: false`: Disables importing cookies from other browsers.
- `previewTunnel: false`: Disables remote `localhost` tunneling and port forwarding (streams tabs instead).
- `worktreeLayoutCommands: false`: Disables `a4code.json` `worktreeLayout` `create`/`remove` commands.

### Providers

- `providers.allowedDrivers`: Whitelist of driver IDs (`codex`, `claudeAgent`, `cursor`, `grok`, `opencode`, `antigravity`, `fx`, `kiro`, `pi`, `muse`, `acpRegistry`).
- `providers.instances`: Sets or locks (`"locked": true`) fields across all instances of a driver (e.g., Bedrock/gateway env vars, `binaryPath`, `launchArgs`). Locking `codex` (or using `maxRuntimeMode`) disables ChatGPT-managed Codex; locking `opencode` disables external `serverUrl`.

## What a policy does not cover

- **Provider CLIs**: Restrict underlying CLIs with their own managed settings (e.g., Claude Code managed settings).
- **WSL**: Managed Windows desktop disables its WSL environment; a server started manually inside WSL reads `/etc/a4code/policy.json` in that distro.
- **Local admins / port forwarding**: Administrators can modify policies or a4code binaries, and users can still port-forward loopback sockets with external tools. Use OS/MDM controls for binary integrity and network isolation.
