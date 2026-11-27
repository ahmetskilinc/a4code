# Remote access

The desktop app starts with its own local environment. You can also add an environment running on another computer you control. The host runs the agent and must stay awake while you use it.

## Pair on a LAN

1. On a desktop host, open **Settings → Sharing & access** and enable **Network access**. On a CLI host, start `a4code serve --lan`, or use `a4code up --lan` for a background service.
2. Create a pairing link on the host under **Sharing & access** or run `a4code pair`. Select the LAN address that the other computer can reach.
3. On the other desktop, open **Settings → Environments → Add environment** and enter the pairing details. A pairing link grants access to the host and expires after use.

To restrict an individual session, issue the link with the required `--scope` values. Review and revoke paired sessions in **Sharing & access**. Turning off a saved environment disconnects it on that client.

## Pair over private Tailscale

Join both computers to the same tailnet and allow them to reach each other in your Tailscale access rules. Use the host's Tailscale address when creating a direct pairing link. For HTTPS, use the host's **Tailscale HTTPS** settings, or run the following on a CLI host with a running a4code server.

```sh
a4code pair --tailscale
```

This publishes the running server to your tailnet through Tailscale Serve. Enter the resulting link on the other desktop. The host still requires pairing. Use `--tailscale-serve-port <port>` if another service occupies 443. Use **Settings → Environments → Add route** to add a second address to an already paired machine.

## SSH

Install a compatible a4code standalone CLI on the SSH host and make it available on the remote account's `PATH`. Test the same SSH alias and account you intend to use with `ssh my-host a4code --version`. In **Settings → Environments → Add environment**, choose SSH and enter the host or SSH config alias. Desktop uses the SSH connection to reach the remote environment. [Install the host CLI](./install.md#command-line)

## Browser on a remote environment

To reach a service on the remote machine, open it from the thread’s **Servers** list. Desktop can forward a remote port to `localhost` through the host’s preview tunnel. See **Forwarded ports** in the command palette to manage the forwards. The host controls access under **Settings → Sharing & access → Preview tunnel**.

### Browser host setup

The local desktop browser uses Electron. Agent-controlled browser tabs on a remote host use headless Chromium. On a minimal Linux machine, `sudo a4code browser setup` installs the required system libraries and configures the browser sandbox. Run the server itself as your normal user. [Built-in browser](./browser.md)

## Link another environment

Enable **Settings → Labs → Linked environments** on both machines. On the source machine open **Settings → Environments → Linked environments → Link**, select or enter the reachable LAN or Tailscale address, and use a pairing code from the destination. Choose the access level. A link grants access in one direction. To revoke it, use **Sharing & access** on the destination or **Forget** on the source.

### Read a linked machine's threads

Open a delegated task or thread link to follow the remote thread in the right panel. Select **Connect to interact** to pair the desktop with its host and make changes.

## Desktop app as a remote only

Turn off **Settings → Environments → Local environment** to drive remote environments without running a local backend.

## Troubleshooting

Start with **Settings → Environments**, select the machine, and inspect its connection details. Check that the host is awake, its server is running, the selected address is reachable, and the pairing link is current. On a CLI host, `a4code status` shows the configured exposure. For an always-on host, see [Background service](./background-service.md).
