const DEFAULT_ADMIN_ADDRESSES: string[] = [];

/** Reads the admin wallet allowlist from env; no dev fallback (admin access defaults to nobody). */
export function getAdminAddresses(
  envValue: string | undefined = process.env.NEXT_PUBLIC_ADMIN_WALLETS,
): string[] {
  const fromEnv = (envValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_ADDRESSES;
}

export function isAdminAddress(
  address: string | null | undefined,
  adminAddresses: string[],
): boolean {
  return Boolean(address && adminAddresses.includes(address));
}
