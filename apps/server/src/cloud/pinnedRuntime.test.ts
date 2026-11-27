// @effect-diagnostics nodeBuiltinImport:off - node:path.win32 stands in for a Windows host in one test.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodePath from "node:path";

import * as HostProcess from "@a4code/shared/HostProcess";

import {
  findPosixLauncher,
  isVersionExecutable,
  posixLauncherScript,
  resolveLauncherPath,
} from "./pinnedRuntime.ts";

it("isVersionExecutable accepts only <version>/a4code, never another drive or program", () => {
  const win32 = NodePath.win32 as unknown as Path.Path;
  assert.isTrue(isVersionExecutable(win32, "C:\\a4code\\versions", "C:\\a4code\\versions\\1.0.0\\a4code.exe"));
  assert.isFalse(isVersionExecutable(win32, "C:\\a4code\\versions", "D:\\a4code.exe"));
  assert.isFalse(
    isVersionExecutable(win32, "C:\\a4code\\versions", "C:\\a4code\\versions\\1.0.0\\node.exe"),
  );
});

// NTFS reports no exec bits, and these lookups pass over files without them.
const posixHost = HostProcess.Platform.defaultValue() !== "win32";

it.layer(NodeServices.layer)("launcher lookup on PATH", (it) => {
  it.effect.skipIf(!posixHost)(
    "resolves an empty entry of a nonempty PATH against the working directory",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "a4-launcher-path-" });
        const launcher = path.join(root, "a4code");
        yield* fs.writeFileString(launcher, "", { mode: 0o755 });
        const missing = path.join(root, "missing");
        const lookup = (platform: NodeJS.Platform, searchPath: string) =>
          resolveLauncherPath.pipe(
            Effect.provideService(HostProcess.InvokedAs, "a4code"),
            Effect.provideService(HostProcess.Platform, platform),
            Effect.provideService(HostProcess.Environment, { PATH: searchPath }),
            Effect.provideService(HostProcess.WorkingDirectory, root),
          );

        assert.equal(yield* lookup("linux", `:${missing}`), launcher);
        assert.equal(yield* lookup("linux", `${missing}:`), launcher);
        assert.equal(yield* lookup("linux", `${missing}::${missing}`), launcher);
        // An empty PATH searches nothing, and Windows has no such rule.
        assert.isUndefined(yield* lookup("linux", ""));
        assert.isUndefined(yield* lookup("win32", `;${missing}`));
      }),
  );

  it.effect.skipIf(!posixHost)("finds a launcher script through an empty PATH entry", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "a4-launcher-path-" });
      const versionsDir = path.join(root, ".a4code", "runtime", "versions");
      const executable = path.join(versionsDir, "1.0.0", "a4code");
      yield* fs.makeDirectory(path.dirname(executable), { recursive: true });
      yield* fs.writeFileString(executable, "", { mode: 0o755 });
      const bin = path.join(root, "bin");
      yield* fs.makeDirectory(bin);
      yield* fs.writeFileString(path.join(bin, "a4code"), posixLauncherScript(executable), {
        mode: 0o755,
      });
      const script = yield* fs.realPath(path.join(bin, "a4code"));
      const missing = path.join(root, "missing");
      const lookup = (searchPath: string) =>
        findPosixLauncher({ launchedAs: executable, versionsDir }).pipe(
          Effect.provideService(HostProcess.Environment, {
            PATH: searchPath,
            A4CODE_INSTALL_BIN_DIR: missing,
          }),
          Effect.provideService(HostProcess.WorkingDirectory, bin),
        );

      assert.equal(yield* lookup(`:${missing}`), script);
      assert.equal(yield* lookup(`${missing}:`), script);
      // An empty PATH searches nothing, not even the working directory.
      assert.isUndefined(yield* lookup(""));
    }),
  );
});
