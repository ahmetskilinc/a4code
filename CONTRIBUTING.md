# Working on a4code

Use a separate checkout for development and keep its data home separate from the desktop app you use for real projects. Start the desktop build with `vp run dev:desktop`. [Development runbook](docs/operations/00_development.md)

## Changes

Describe the desktop behavior you are changing, which environment it affects, and how you verified it. Keep local pairing, Tailscale and SSH usable when changing connections. Run focused tests with `vp test run <files>` and use `vp run check:changed` before submitting a change. [Repository guidance](AGENTS.md) · [Testing](docs/internals/15_testing.md)

## Reports

Include the app version, platform, steps to reproduce and relevant local diagnostics. Review logs for credentials and project data before sharing them. Send security-sensitive reports privately to the maintainer of the fork you use. [Security model](SECURITY.md)
