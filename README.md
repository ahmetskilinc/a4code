# a4code

a4code is an unofficial desktop fork of T3 Code, independently maintained by Ahmet. T3 Tools, Inc. has no affiliation with this project and does not endorse or maintain it. [Original project](https://github.com/pingdotgg/t3code)

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

The fork’s default branch, `a4code`, contains the desktop app. Its `main` branch mirrors the original project, including the upstream mobile app and its artwork. For a fresh checkout, clone Ahmet’s fork as `origin` and add the original repository as `upstream`.

```sh
git clone https://github.com/ahmetskilinc/a4code.git
cd a4code
git remote add upstream https://github.com/pingdotgg/t3code.git
```

From the desktop branch, fetch the latest upstream commits and list what has landed since the last integration.

```sh
git switch a4code
git fetch --no-tags upstream main
git log --reverse --oneline HEAD..upstream/main
```

To review a full update, start a branch with `git switch -c sync/upstream` and run `git merge --no-ff --no-commit upstream/main`. Keep the desktop branding, original notices and offline defaults when resolving conflicts. The merge records the upstream revision reviewed, so the next comparison starts there. To port a single independent feature ahead of a full review, use `git cherry-pick -x <sha>`.

Run the affected tests and `vp run check:changed origin/a4code`. For startup or networking changes, exercise the packaged desktop app with a disposable profile and observe launch, idle, history and Settings for unsolicited public connections. Test direct pairing when environment access changes.

After testing, commit the merge, fast-forward `a4code` to the reviewed branch, and push it to `origin`. Update the source mirror with `git push origin refs/remotes/upstream/main:refs/heads/main`. These are maintainer operations. The desktop app can run offline.

## Source and notices

The source is distributed under the MIT license. Original copyright and trademark notices remain with the fork. [License](LICENSE) · [Trademark notice](TRADEMARK.md) · [Third-party notices](third-party-licenses)
