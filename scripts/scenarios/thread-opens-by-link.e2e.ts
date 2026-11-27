import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "A seeded thread opens by its link and shows its history",
  WEB,
  async ({ a4code, app, screen }) => {
    const project = await a4code.project("demo");
    const thread = await a4code.thread({
      project,
      title: "Earlier work",
      messages: ["first", "second"],
    });
    await a4code.open(thread);

    await expect(screen.getByText("second fixture turn complete", { exact: false })).toBeVisible();
    await app.screenshot("thread");
  },
);
