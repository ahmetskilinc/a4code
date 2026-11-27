import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "Closing the right panel on a Browser tab that never navigated floats nothing",
  WEB,
  async ({ a4code, app, browser, screen }) => {
    const project = await a4code.project("demo");
    const thread = await a4code.thread({ project, title: "Untouched browser", messages: ["first"] });
    await a4code.open(thread);

    await screen.getByRole("button", "Toggle right panel").tap();
    await screen.getByRole("button", "Browser B").tap();
    await screen.getByRole("textbox", "Search or enter URL").waitFor();
    await app.screenshot("browser-untouched-before-close");

    await screen.getByRole("button", "Toggle right panel").tap();
    await app.screenshot("after-close-untouched-browser");
    await expect(browser.locator('section[aria-label="Floating browser preview"]')).toBeHidden();
  },
);
