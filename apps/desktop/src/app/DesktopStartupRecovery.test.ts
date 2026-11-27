import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopState from "./DesktopState.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";

import { listen } from "./DesktopStartupRecovery.ts";

it.effect.each([
  { visible: false, started: false, closeMain: false },
  { visible: true, started: false, closeMain: false },
  { visible: true, started: true, closeMain: false },
  { visible: true, started: false, closeMain: true },
])("closes recovery safely with closeMain=$closeMain", ({ visible, started, closeMain }) =>
  Effect.scoped(
    Effect.gen(function* () {
      const shouldRecover = !visible || !started;
      const closed = Promise.withResolvers<void>();
      const loaded: string[] = [];
      const appListeners = new Map<string, (...args: readonly unknown[]) => void>();
      const mainListeners = new Map<string, () => void>();
      let closeCount = 0;
      let mainVisible = visible;
      const main = {
        isDestroyed: () => false,
        isVisible: () => mainVisible,
        on: (event: string, listener: () => void) => mainListeners.set(event, listener),
        once: (event: string, listener: () => void) => mainListeners.set(event, listener),
      } as unknown as Electron.BrowserWindow;
      const mainRef = yield* Ref.make(Option.some(main));
      const recovery = {
        isDestroyed: () => false,
        close: () => {
          closeCount++;
          closed.resolve();
        },
        loadURL: (url: string) => {
          loaded.push(url);
          return Promise.resolve();
        },
        once: () => {},
        webContents: { setWindowOpenHandler: () => {}, on: () => {} },
      } as unknown as Electron.BrowserWindow;
      const state = yield* DesktopState.DesktopState;
      if (started) yield* SubscriptionRef.set(state.primaryBackendStartup, { _tag: "Ready" });
      yield* listen.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
              appVersion: "0.1.3",
              stateDir: "/task/state",
              logDir: "/task/logs",
              path: { join: (...parts: string[]) => parts.join("/") },
            } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
            Layer.succeed(ElectronApp.ElectronApp, {
              on: (event: string, listener: (...args: readonly unknown[]) => void) =>
                Effect.sync(() => {
                  appListeners.set(event, listener);
                }),
            } as unknown as ElectronApp.ElectronApp["Service"]),
            Layer.succeed(
              ElectronShell.ElectronShell,
              {} as ElectronShell.ElectronShell["Service"],
            ),
            Layer.succeed(ElectronTheme.ElectronTheme, {
              shouldUseDarkColors: Effect.succeed(false),
            } as ElectronTheme.ElectronTheme["Service"]),
            Layer.succeed(ElectronWindow.ElectronWindow, {
              main: Ref.get(mainRef),
              create: () => Effect.succeed(recovery),
            } as unknown as ElectronWindow.ElectronWindow["Service"]),
          ),
        ),
      );
      appListeners.get("browser-window-created")?.({}, main);
      if (started) yield* Effect.yieldNow;
      yield* SubscriptionRef.set(state.primaryBackendStartup, {
        _tag: "Failing",
        reason: "Server failed before readiness",
        managedPolicy: false,
        output: "Failure details",
      });
      yield* Effect.yieldNow;
      expect(loaded.length).toBe(shouldRecover ? 1 : 0);
      if (shouldRecover) {
        expect(decodeURIComponent(loaded[0]!)).toContain("Failure details");
        if (closeMain) yield* Ref.set(mainRef, Option.none());
        yield* SubscriptionRef.set(state.primaryBackendStartup, { _tag: "Ready" });
        yield* Effect.yieldNow;
        if (closeMain || !visible) {
          expect(closeCount).toBe(0);
          if (closeMain) {
            yield* Ref.set(mainRef, Option.some(main));
            mainVisible = false;
            appListeners.get("browser-window-created")?.({}, main);
          }
          mainListeners.get("ready-to-show")?.();
          expect(closeCount).toBe(0);
          mainVisible = true;
          const show = mainListeners.get("show");
          expect(show).toBeDefined();
          show!();
        }
        yield* Effect.promise(() => closed.promise);
        expect(closeCount).toBe(1);
      }
    }),
  ).pipe(Effect.provide(DesktopState.layer)),
);
