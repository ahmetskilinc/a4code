/// <reference lib="dom" />
import { expect } from "e2e";

import { makeState, runPromise, test, WEB } from "./a4code.ts";

const NOTE = "userdata/themes/nightfall.json/notes.txt";
const BODY = "Notes for the original Nightfall palette";

test(
  "Publishing a theme preserves files in an existing directory under the same name",
  WEB,
  async ({ a4code, app, browser, screen }) => {
    const project = await a4code.project("theme-workspace", {
      [NOTE]: BODY,
      "nightfall.json": JSON.stringify({
        name: "Nightfall",
        appearance: "dark",
        canvas: "#1a1b26",
        accent: "#7aa2f7",
      }),
    });
    const thread = await a4code.thread({
      project,
      title: "Theme notes",
      messages: [`See :codex-file-citation{path="${NOTE}" line_range_start="1"}`],
    });
    const { cli } = makeState(project);
    await runPromise(cli(["theme", "set", `${project}/nightfall.json`], [0, 1]));

    await a4code.open(thread);
    await screen.getByRole("button", /^Agent See/).tap();
    await screen.getByRole("link", /^notes\.txt/).tap();

    try {
      await expect
        .poll(() =>
          browser.evaluate(() => {
            for (const host of document.querySelectorAll("*")) {
              const content = host.shadowRoot?.querySelector("[data-content]");
              if (content) return content.textContent ?? "";
            }
            return null;
          }),
        )
        .toContain(BODY);
    } finally {
      await app.screenshot("open-original-theme-notes");
    }
  },
);
