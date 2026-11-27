/// <reference lib="dom" />
import { expect } from "e2e";

import { test, WEB } from "./a4code.ts";

test(
  "A BOM-prefixed paste keeps its fenced thread link literal and chips the link after it",
  WEB,
  async ({ a4code, app, browser, screen }) => {
    const project = await a4code.project("demo");
    const linked = await a4code.thread({
      project,
      title: "Release notes",
      messages: ["Draft the notes"],
    });
    const thread = await a4code.thread({
      project,
      title: "Follow-up",
      messages: ["Start a follow-up"],
    });
    await a4code.open(thread);
    const composer = screen.getByRole("textbox");
    await composer.tap();
    await browser.evaluate((threadId: string) => {
      const environmentId = decodeURIComponent(window.location.pathname.split("/")[1]!);
      const link = `<a4-thread://v2/${environmentId}/${threadId}>`;
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", `\uFEFF~~~\n${link}\n~~~\n${link}`);
      const editor = document.activeElement;
      if (!editor?.matches('[contenteditable="true"]')) throw new Error("Composer is not focused");
      return editor.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
      );
    }, linked.threadId);
    await composer.getByText("Plain text", { exact: true }).waitFor();
    await app.screenshot("pasted-bom-fence");
    await expect(composer.getByText(/^<a4-thread:\/\/v2\//)).toBeVisible();
    await expect(composer.getByText("Release notes", { exact: true })).toBeVisible();
  },
);
