import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "The right panel shortcut closes and reopens the Issues panel",
  WEB,
  async ({ a4code, app, browser, screen }) => {
    await a4code.project("demo");
    await a4code.open("/issues?selectedProjectId=demo&tracker=github&scope=example/demo&key=42");

    const toggle = screen.getByRole("button", "Toggle right panel");
    await screen.getByRole("button", { name: "Toggle right panel", pressed: true }).waitFor();

    await browser.keyboard.press("ControlOrMeta+Alt+b");
    await app.screenshot("after-close-shortcut");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await browser.keyboard.press("ControlOrMeta+Alt+b");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  },
);
