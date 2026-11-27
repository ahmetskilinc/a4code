import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "A Markdown preview uses the first reference destination",
  WEB,
  async ({ a4code, app, screen }) => {
    const markdown =
      "[Release notes][release]\n\n" +
      "[release]:\n  https://example.com/current\n\n" +
      "Background for this release. ".repeat(180) +
      "\n\n## Appendix\n\n[release]: https://example.com/previous\n";
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
    const link = screen.getByRole("link", "Release notes");
    await link.waitFor();
    await app.screenshot("first-reference");
    await expect(link).toHaveAttribute("href", "https://example.com/current");
  },
);
