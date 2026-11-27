import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "Browser's Search engine is read-only while a project is selected",
  WEB,
  async ({ a4code, app, browser, screen }) => {
    await a4code.project("demo");
    await a4code.open("/settings/browser");

    await screen.getByRole("button", "Project scope: All projects").tap();
    await screen.getByRole("menuitemradio").filter({ hasText: "demo" }).tap();
    await expect(screen.getByRole("button", "Project scope: demo")).toBeVisible();
    await app.screenshot("project-selected");

    // A project cannot override a device preference, so the control must not offer an edit.
    await expect(browser.locator('[inert] [aria-label="Search engine"]')).toBeVisible();
  },
);
