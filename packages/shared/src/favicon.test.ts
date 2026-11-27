import { describe, expect, it } from "@effect/vitest";
import { toolActivityFaviconUrl } from "./favicon.ts";

describe("toolActivityFaviconUrl", () => {
  it("never loads a remote website icon or provider logo from a transcript", () => {
    const url = "https://example.com/private";
    expect(
      toolActivityFaviconUrl({ _tag: "website", pageUrl: url, faviconUrl: url }, "light"),
    ).toBeNull();
    expect(toolActivityFaviconUrl({ _tag: "themed-logo", logoUrl: url }, "dark")).toBeNull();
  });

  it("uses an embedded image when the preferred dark icon is remote", () => {
    const embedded = "data:image/png;base64,AA==";
    expect(
      toolActivityFaviconUrl(
        {
          _tag: "themed-logo",
          logoUrl: embedded,
          logoUrlDark: "https://example.com/dark.png",
        },
        "dark",
      ),
    ).toBe(embedded);
  });
});
