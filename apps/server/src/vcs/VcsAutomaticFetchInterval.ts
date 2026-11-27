import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
export class VcsAutomaticFetchInterval extends Context.Reference<Effect.Effect<Duration.Duration>>(
  "a4code/vcs/VcsAutomaticFetchInterval",
  { defaultValue: () => Effect.succeed(Duration.zero) },
) {}

export const layer = Layer.succeed(VcsAutomaticFetchInterval, Effect.succeed(Duration.zero));
