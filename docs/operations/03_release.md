# Build local distributions

## Desktop

Build the installer on its target operating system. Unsigned builds go to `release/`. Supply `--output-dir` to `vp run dist:desktop:artifact` for a different destination. The packaging command assembles the Electron shell, bundled server and renderer. [Platform build prerequisites and commands](./00_development.md#desktop-artifacts)

## Standalone CLI

Build on the target machine with the workspace dependencies and Rust toolchain available. First build the server and its executable.

```sh
vp run --filter a4code build
vp run --filter a4code build:exe
vp run build:resource-monitor
mkdir -p apps/server/dist/resource-monitor
cp native/resource-monitor/target/release/a4-resource-monitor apps/server/dist/resource-monitor/
```

Package the executable, bundled client, resource monitor and runtime dependencies into one distribution. Set `BUILD_VERSION` to the version of your server build. The following example targets Linux x64.

```sh
node scripts/build-cli-archive.ts --platform linux --arch x64 --version "$BUILD_VERSION"
```

The archive is written to `release-cli/`. Extract it on the destination machine and run the local installation script with the extracted directory. [Install the CLI](../user/install.md#command-line)

For a Windows desktop installer with a WSL backend, provide the matching standalone Linux archive using the packager's `--wsl-runtime` option.
