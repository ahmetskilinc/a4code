import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test("An invalid host filter keeps the Issues page open", WEB, async ({ a4code, app, browser }) => {
  await a4code.project("demo");
  await a4code.open("/issues?host=true");

  await app.screenshot("issues-invalid-host");
  await expect(browser.locator("h1")).toHaveText("Issues");
});
