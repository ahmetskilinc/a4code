# a4code

a4code is a desktop workspace for coding agents. Open a project on your machine, start a thread with an installed provider, review its diff, and run commands in the project terminal. The desktop app starts its own local server and stores project and conversation history on the host.

## Run the desktop app

From the repository root, using the project's Vite+ toolchain.

```sh
vp i
vp run dev:desktop
```

For a standalone installation, build the installer for your operating system and open the artifact from `release/`. Platform prerequisites and build commands are in the [installation guide](docs/user/install.md).

## Use your environment

Choose an installed agent in **Settings → Providers**. Agents run under your host account and use the credentials and endpoints you configure. An agent using a cloud model contacts its provider when you use it. You can also connect the desktop app to a host you control over a private network or SSH. [Provider guides](docs/user/README.md#providers) · [LAN, Tailscale and SSH](docs/user/remote-access.md)

Prompts, files and terminal output stay in the selected environment unless a provider, tool, integration or action you choose sends them elsewhere. The desktop app has no product analytics, hosted accounts or release feed.

## Existing history

Use `a4code import-history` before first launch to copy local projects and settled conversations into a fresh home. The original installation keeps its own data and credentials. [History import](docs/user/cli.md#import-history-from-another-installation)

## Bring in upstream features

The fork’s default branch, `a4code`, contains the desktop app. Its `main` branch tracks the original project. For a fresh checkout, clone Ahmet’s fork as `origin` and add the original repository as `upstream`.

```sh
git clone https://github.com/ahmetskilinc/a4code.git
cd a4code
git remote add upstream https://github.com/pingdotgg/t3code.git
```

The desktop fork was built from upstream commit `e18c8fc2e5b778e6b435e0596cd785d580f54785`. Start the first review there. For later reviews, use the upstream SHA where the last review ended. This range lists upstream activity, including features you may already have ported.

```sh
git fetch origin
git fetch --no-tags upstream
git log --reverse --oneline e18c8fc2e5..upstream/main
```

To advance the fork’s `main` mirror after fetching, run `git push origin refs/remotes/upstream/main:refs/heads/main`. Git accepts the push when the mirror can fast-forward.

Inspect a feature with `git show <sha>`. On a clean checkout, create a topic branch from the desktop branch and apply the feature’s commits in dependency order.

```sh
git switch --no-track -c port/feature-name origin/a4code
git cherry-pick -x <sha>
```

Keep the upstream SHA in the commit message when adapting a change by hand. Run the affected tests and `vp run check:changed`. For changes to startup or networking, launch the packaged desktop app with a disposable profile and check launch, idle, history and Settings for unsolicited public connections. Exercise direct pairing if the change touches environment access.

## Source and notices

The source is distributed under the MIT license. Original copyright and trademark notices remain with the fork. [License](LICENSE) · [Trademark notice](TRADEMARK.md) · [Third-party notices](third-party-licenses)
