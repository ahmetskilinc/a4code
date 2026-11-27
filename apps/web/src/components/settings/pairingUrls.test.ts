import { describe, expect, it } from "vite-plus/test";
import { resolveDesktopPairingUrl } from "./pairingUrls";

describe("direct environment pairing", () => {
  it.each(["http://192.168.1.44:3773", "https://host.tailnet.example.ts.net:3773"])(
    "keeps the credential on the selected backend %s",
    (endpoint) => {
      expect(resolveDesktopPairingUrl(endpoint, "PAIRCODE")).toBe(
        endpoint + "/pair#token=PAIRCODE",
      );
    },
  );
});
