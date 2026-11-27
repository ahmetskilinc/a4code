import * as HostProcess from "@a4code/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

const PINNED_RUNTIME_DIR = "runtime";

export interface PinnedRuntimePaths {
  readonly versionDir: string;
  readonly entryPath: string;
  readonly sentinelPath: string;
}

export function pinnedRuntimeCommand(paths: PinnedRuntimePaths): {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
} {
  return { command: paths.entryPath, args: [] };
}

export function pinnedRuntimeVersionsDir(path: Path.Path, baseDir: string): string {
  return path.join(baseDir, PINNED_RUNTIME_DIR, "versions");
}

export function pinnedRuntimePaths(
  path: Path.Path,
  baseDir: string,
  version: string,
  platform: NodeJS.Platform,
): PinnedRuntimePaths {
  const versionDir = path.join(pinnedRuntimeVersionsDir(path, baseDir), version);
  return {
    versionDir,
    entryPath: path.join(versionDir, platform === "win32" ? "a4code.exe" : "a4code"),
    sentinelPath: path.join(versionDir, ".install-complete"),
  };
}

const PINNED_RUNTIME_LAUNCHERS_FILE = "launchers";

/**
 * Starts on a fresh line whatever the file ends with when the append lands: another process's
 * append may have been cut short since this one read the file. Readers skip the blank lines.
 */
const launcherRecords = (launchers: ReadonlyArray<string>) =>
  `\n${launchers.map((launcher) => `${launcher}\n`).join("")}`;

export function launcherOwnsVersionsDir(
  path: Path.Path,
  versionsDir: string,
  candidate: string,
): boolean {
  const relative = path.relative(versionsDir, path.resolve(candidate));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Node preserves argv0's spelling; resolve bare names on PATH to find the launcher symlink. */
export const resolveLauncherPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const invokedAs = yield* HostProcess.InvokedAs;
  const cwd = yield* HostProcess.WorkingDirectory;
  const environment = yield* HostProcess.Environment;
  const platform = yield* HostProcess.Platform;
  if (invokedAs.includes("/") || invokedAs.includes("\\")) {
    return path.resolve(cwd, invokedAs);
  }
  const delimiter = platform === "win32" ? ";" : ":";
  const searchPath = environment["PATH"] ?? "";
  for (const directory of searchPath.split(delimiter)) {
    // POSIX shells search the working directory for an empty entry of a nonempty PATH.
    if (directory.length === 0 && (platform === "win32" || searchPath.length === 0)) continue;
    const candidate = path.resolve(cwd, directory || ".", invokedAs);
    const info = yield* fs.stat(candidate).pipe(Effect.option);
    // Like the shell, pass over directories and non-executable files named the same.
    if (
      Option.isSome(info) &&
      info.value.type === "File" &&
      (platform === "win32" || (info.value.mode & 0o111) !== 0)
    ) {
      return candidate;
    }
  }
  return undefined;
});

/**
 * `a4code update` repoints the launcher it was started through, which may be on neither PATH nor the
 * default bin dir. Unrecorded, the next prune would remove the runtime it now points at.
 */
export const recordPinnedRuntimeLauncher = Effect.fn("cloud.pinned_runtime.record_launcher")(
  function* (input: { readonly baseDir: string; readonly launcher: string }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const launchersFile = path.join(
      input.baseDir,
      PINNED_RUNTIME_DIR,
      PINNED_RUNTIME_LAUNCHERS_FILE,
    );
    // Prune may run in another process, such as the service, whose working directory differs.
    const launcher = path.resolve(input.launcher);
    const recorded = yield* fs.readFileString(launchersFile).pipe(Effect.orElseSucceed(() => ""));
    if (recorded.split(/\r?\n/).includes(launcher)) return;
    yield* fs.writeFileString(launchersFile, launcherRecords([launcher]), { flag: "a" });
  },
);

/** Whether `candidate` is a version's own executable, `<versionsDir>/<version>/a4code[.exe]`. */
export function isVersionExecutable(
  path: Path.Path,
  versionsDir: string,
  candidate: string,
): boolean {
  const relative = path.relative(versionsDir, path.resolve(candidate));
  // On another Windows drive, relative() returns the absolute path, like `D:\a4code.exe`.
  return !path.isAbsolute(relative) && /^(?!\.\.)[^\\/]+[\\/]a4code(?:\.exe)?$/i.test(relative);
}

/** The executable a `a4code.cmd` shim written by the install script or `a4code update` runs. */
export const windowsShimTarget = (contents: string) => /^"([^"]+)"/m.exec(contents)?.[1];

/** Like {@link windowsShimTarget}, but only for a shim exactly as written; never a user's wrapper. */
export const generatedWindowsShimTarget = (contents: string) =>
  /^@echo off\r?\n"([^"]+)" %\*\s*$/.exec(contents)?.[1];

/**
 * The `a4code` script the install scripts and `a4code update` write on macOS and Linux. Exec by absolute
 * path: through a symlink, argv0 is the link, and the Cursor SDK looks for its helpers beside it.
 */
export const posixLauncherScript = (executable: string) =>
  `#!/bin/sh\nexec '${executable.replaceAll("'", "'\\''")}' "$@"\n`;

/** The executable a script exactly as {@link posixLauncherScript} writes it runs; never a user's wrapper. */
export const readPosixLauncherTarget = Effect.fn("cloud.pinned_runtime.read_posix_launcher")(
  function* (launcher: string) {
    const fs = yield* FileSystem.FileSystem;
    // Stat first so a runtime binary found the same way is never read whole.
    const info = yield* fs.stat(launcher).pipe(Effect.option);
    if (Option.isNone(info) || info.value.type !== "File" || info.value.size > 4096n) {
      return undefined;
    }
    const contents = yield* fs.readFileString(launcher).pipe(Effect.option);
    if (Option.isNone(contents)) return undefined;
    const quoted = /^#!\/bin\/sh\nexec '((?:[^']|'\\'')*)' "\$@"\n$/.exec(contents.value)?.[1];
    return quoted?.replaceAll("'\\''", "'");
  },
);

/**
 * The `a4code` this executable was started through on macOS or Linux: a legacy symlink into this
 * home's runtime/versions, or, since a script execs the executable and argv0 names it, an unedited
 * {@link posixLauncherScript} that runs it.
 */
export const findPosixLauncher = Effect.fn("cloud.pinned_runtime.find_posix_launcher")(
  function* (input: { readonly launchedAs: string; readonly versionsDir: string }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const environment = yield* HostProcess.Environment;
    const linkTarget = yield* fs.readLink(input.launchedAs).pipe(Effect.option);
    if (Option.isSome(linkTarget)) {
      const resolved = path.resolve(path.dirname(input.launchedAs), linkTarget.value);
      return isVersionExecutable(path, input.versionsDir, resolved) ? input.launchedAs : undefined;
    }
    const realPath = (file: string) =>
      fs.realPath(file).pipe(Effect.orElseSucceed(() => undefined));
    const executable = yield* realPath(input.launchedAs);
    const realVersionsDir = yield* realPath(input.versionsDir);
    if (
      executable === undefined ||
      realVersionsDir === undefined ||
      !isVersionExecutable(path, realVersionsDir, executable)
    ) {
      return undefined;
    }
    const recorded = yield* fs
      .readFileString(path.join(path.dirname(input.versionsDir), "launchers"))
      .pipe(Effect.orElseSucceed(() => ""));
    const cwd = yield* HostProcess.WorkingDirectory;
    const searchPath = environment["PATH"] ?? "";
    const candidates = [
      // PATH first, resolved like the shell does: it decides which a4code the user runs. An empty
      // entry of a nonempty PATH is the working directory; an empty PATH searches nothing.
      ...(searchPath.length === 0 ? [] : searchPath.split(":")).map((directory) =>
        path.resolve(cwd, directory || ".", "a4code"),
      ),
      path.join(
        environment["A4CODE_INSTALL_BIN_DIR"] ||
          path.join(yield* HostProcess.HomeDirectory, ".local", "bin"),
        "a4code",
      ),
      ...recorded.split(/\r?\n/),
    ].filter((candidate) => path.isAbsolute(candidate));
    for (const candidate of candidates) {
      // The script itself, so an alias that links to it keeps working.
      const script = yield* realPath(candidate);
      if (script === undefined) continue;
      // Like the shell, pass over a script nobody can execute.
      const info = yield* fs.stat(script).pipe(Effect.option);
      if (Option.isNone(info) || (info.value.mode & 0o111) === 0) continue;
      const target = yield* readPosixLauncherTarget(script);
      if (target !== undefined && (yield* realPath(target)) === executable) return script;
    }
    return undefined;
  },
);

/** Writes {@link posixLauncherScript} at `launcher` in one rename, replacing a legacy symlink rather than writing through it. */
export const writePosixLauncher = Effect.fn("cloud.pinned_runtime.write_posix_launcher")(
  function* (input: {
    readonly launcher: string;
    readonly executable: string;
    /** Fail instead of replacing a file that is there, even one created after the caller looked. */
    readonly exclusive: boolean;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staging = yield* fs.makeTempFileScoped({
      directory: path.dirname(input.launcher),
      prefix: ".a4-",
    });
    yield* fs.writeFileString(staging, posixLauncherScript(input.executable));
    yield* fs.chmod(staging, 0o755);
    yield* input.exclusive ? fs.link(staging, input.launcher) : fs.rename(staging, input.launcher);
  },
  Effect.scoped,
);
