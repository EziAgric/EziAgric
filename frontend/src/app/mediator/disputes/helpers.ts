const DEFAULT_MEDIATOR_ADDRESSES = ["GEXAMPLEMEDIATORPUBLICKEY1"];

/** Reads the mediator wallet allowlist from env, falling back to a dev default. */
export function getMediatorAddresses(
  envValue: string | undefined = process.env.NEXT_PUBLIC_MEDIATOR_WALLETS,
): string[] {
  const fromEnv = (envValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return fromEnv.length > 0 ? fromEnv : DEFAULT_MEDIATOR_ADDRESSES;
}

export function isMediatorAddress(
  address: string | null | undefined,
  mediatorAddresses: string[],
): boolean {
  return Boolean(address && mediatorAddresses.includes(address));
}

/** Formats an ISO date string as "Mon D, YYYY" for dispute list rows. */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Truncates a Stellar wallet address to "GABC...WXYZ"; short strings pass through untouched. */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
