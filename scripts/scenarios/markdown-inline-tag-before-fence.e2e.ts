import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "A Markdown preview keeps sample headings inside a fence after an inline tag",
  WEB,
  async ({ a4code, app, screen }) => {
    const markdown =
      "Background for this release. ".repeat(180) +
      "\n<span>\n```md\nSample Markdown\n\n# Sample heading\n```\n";
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
    await screen.getByText("Sample Markdown", { exact: false }).waitFor();
    await app.screenshot("sample-heading");
    await expect(screen.getByRole("heading", "Sample heading")).not.toBeVisible();
  },
);
