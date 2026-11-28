"use client";

import { useMemo } from "react";
import { useFreighterIdentity } from "./useFreighterIdentity";
import { getAdminAddresses, isAdminAddress } from "@/lib/adminAccess";

/** Whether the connected wallet address is on the admin allowlist. Re-evaluates as the wallet changes. */
export function useIsAdmin(): boolean {
  const { address } = useFreighterIdentity();
  const adminAddresses = useMemo(() => getAdminAddresses(), []);

  return isAdminAddress(address, adminAddresses);
}
