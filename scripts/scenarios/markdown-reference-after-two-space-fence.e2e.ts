import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "A long Markdown preview resolves a reference after an indented fence",
  WEB,
  async ({ a4code, app, screen }) => {
    const markdown =
      "[Release notes][release]\n\n" +
      "Background for this release. ".repeat(180) +
      "\n\n## Appendix\n\n  ```text\n  example\n  ```\n[release]: https://example.com/releases\n";
    const project = await a4code.project("documentation", { "release.md": markdown });
    const thread = await a4code.thread({
      project,
      title: "Release",
      messages: ['See :codex-file-citation{path="release.md"}'],
    });
    await a4code.open(thread);

    await screen.getByRole("button", /^Agent See/).tap();
    await screen.getByRole("link", /^release\.md/).tap();
    await screen.getByRole("button", "Show rendered markdown").tap();
    await screen.getByText("Background for this release.", { exact: false }).waitFor();
    await app.screenshot("indented-fence-reference");
    await expect(screen.getByRole("link", "Release notes")).toBeVisible();
  },
);
