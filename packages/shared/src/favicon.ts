import type { ToolActivityIcon } from "@a4code/contracts";

export function toolActivityFaviconUrl(
  icon: Exclude<ToolActivityIcon, { readonly _tag: "native-app" }>,
  appearance: "light" | "dark",
): string | null {
  const light = icon._tag === "website" ? icon.faviconUrl : icon.logoUrl;
  const dark = icon._tag === "website" ? icon.faviconUrlDark : icon.logoUrlDark;
  for (const source of appearance === "dark" ? [dark, light] : [light]) {
    if (source && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(source)) return source;
  }
  return null;
}
