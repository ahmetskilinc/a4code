import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { parseA4ProjectFile, A4ProjectFileFromJson } from "./a4ProjectFile.ts";

const decodeJson = Schema.decodeUnknownSync(A4ProjectFileFromJson);

describe("A4ProjectFileFromJson", () => {
  it("decodes lenient JSONC with comments and trailing commas", () => {
    const decoded = decodeJson(`{
      // team scripts
      "iconPath": "assets/logo.svg",
      "scripts": [
        { "name": "Dev", "command": "pnpm dev", "stopOnSettle": true, },
      ],
    }`);

    expect(decoded.iconPath).toBe("assets/logo.svg");
    expect(decoded.scripts?.[0]).toEqual({ name: "Dev", command: "pnpm dev", stopOnSettle: true });
  });
});

describe("parseA4ProjectFile", () => {
  it("reads project defaults from JSONC with a URL in a block comment", () => {
    expect(
      parseA4ProjectFile(`{
        /* See ./a4code.schema.json */
        "defaultThreadEnvMode": "worktree"
      }`),
    ).toEqual({ defaultThreadEnvMode: "worktree" });
  });
});
