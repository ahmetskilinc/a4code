/// <reference lib="dom" />
import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "Raising Appearance contrast strengthens the open thread details toggle",
  WEB,
  async ({ a4code, app, screen, browser }) => {
    const project = await a4code.project("appearance-contrast");
    const thread = await a4code.thread({
      project,
      title: "Panel contrast",
      messages: ["Hello"],
    });
    const readPressedBackground = async () => {
      const toggle = screen.getByRole("button", "Toggle thread details panel", { exact: true });
      await toggle.waitFor();
      if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.tap();
      await screen
        .getByRole("button", { name: "Toggle thread details panel", pressed: true })
        .waitFor();
      return browser.evaluate(() => {
        const toggle = document.querySelector(
          '[data-slot="toggle"][aria-label="Toggle thread details panel"][aria-pressed="true"]',
        );
        if (!toggle) throw new Error("No open thread details toggle");
        return getComputedStyle(toggle).backgroundColor;
      });
    };

    await browser.emulateMedia({ colorScheme: "dark" });
    await a4code.open(thread);
    const background100 = await readPressedBackground();
    await app.screenshot("contrast-100");

    await a4code.open("/settings/appearance");
    await screen.getByRole("slider", "Contrast", { exact: true }).press("End");
    await screen.getByText("200%", { exact: true }).waitFor();

    await a4code.open(thread);
    const background200 = await readPressedBackground();
    await app.screenshot("contrast-200");
    expect(background200).not.toBe(background100);
  },
);
