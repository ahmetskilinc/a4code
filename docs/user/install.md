# Install a4code

## Desktop app

Build the desktop app on the operating system you plan to run. Install Vite+ and the native build prerequisites for your platform, then install the pinned workspace dependencies from the repository root. A fresh build can download development dependencies and Electron. [Build prerequisites](../operations/00_development.md#desktop-artifacts)

```sh
vp i
```

| Platform | Run from the repository root | Open in `release/` |
| --- | --- | --- |
| macOS | `vp run dist:desktop:dmg` | The disk image, then drag a4code to Applications |
| Linux x64 | `vp run dist:desktop:linux` | The AppImage, after marking it executable |
| Windows | `vp run dist:desktop:win` | The Windows installer |

For development, run `vp run dev:desktop` from the same checkout. To install a newer desktop build, quit the running app and install the replacement you built. Use the same data home to retain your projects and conversations.

## Command line

The optional standalone CLI is useful on SSH hosts and for importing history. Obtain a locally built archive matching the host's operating system and architecture, unpack it, and run the installer script from this checkout. Pass the extracted directory containing the executable and its adjacent resources. [Build a standalone archive](../operations/03_release.md#standalone-cli)

On macOS or Linux, use the shell script.

```sh
sh scripts/install.sh /path/to/extracted-a4code
a4code --version
```

On Windows, use PowerShell.

```powershell
.\scripts\install.ps1 C:\path\to\extracted-a4code
a4code --version
```

You can also run the executable directly from the extracted directory. Keep its resources alongside it. Before starting the desktop app for the first time, you can import history into its new data home. [History import](./cli.md#import-history-from-another-installation)

## Providers

Install and authenticate the coding agent on the machine that will run it. For example, run `codex login` for an existing Codex installation or `claude auth login` for Claude Code. Select that provider in **Settings → Providers**. If the app cannot find the executable, set **Binary path** there. [Provider guides](./README.md#providers)
