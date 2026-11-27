// @effect-diagnostics nodeBuiltinImport:off - The standalone installer runs outside the app runtime.
import * as NodeChildProcess from "node:child_process";
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";

it.skipIf(process.platform === "win32")("installs a complete local distribution and preserves an occupied version", async () => {
  const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "a4code-local-install-"));
  try {
    const source = NodePath.join(root, "standalone build");
    const base = NodePath.join(root, "profile");
    const target = NodePath.join(base, "runtime/versions/1.2.3");
    await NodeFs.mkdir(source);
    await NodeFs.writeFile(NodePath.join(source, "a4code"), [
      "#!/bin/sh",
      "case \"$1\" in",
      "  --version) echo 'a4code v1.2.3' ;;",
      "  install) test -f \"$(dirname \"$0\")/client.txt\" ;;",
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"), { mode: 0o755 });
    await NodeFs.writeFile(NodePath.join(source, "client.txt"), "local");
    const install = () => NodeChildProcess.spawnSync("sh", [NodePath.join(import.meta.dirname, "install.sh"), source], {
      env: { ...process.env, A4CODE_HOME: base },
      encoding: "utf8",
    });
    expect(install().status).toBe(0);
    expect(install().status).toBe(0);
    expect(await NodeFs.readFile(NodePath.join(target, ".install-complete"), "utf8")).toBe("1.2.3\n");
    await NodeFs.unlink(NodePath.join(target, ".install-complete"));
    expect(install().status).not.toBe(0);
    expect(await NodeFs.readFile(NodePath.join(target, "client.txt"), "utf8")).toBe("local");
  } finally {
    await NodeFs.rm(root, { recursive: true, force: true });
  }
});
