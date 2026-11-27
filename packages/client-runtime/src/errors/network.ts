import { msg } from "gt-i18n";

export const NETWORK_BLOCKING_HINT = msg(
  "Check the environment address, network connection, and firewall settings.",
);

/** For a host that stopped answering on an open connection, so the network path was already working. */
export const UNRESPONSIVE_HOST_HINT = msg("It may be overloaded, asleep, or off the network.");
