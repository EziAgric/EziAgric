"use client";

import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { getAdminAddresses, isAdminAddress } from "@/lib/adminAccess";
import { isAdminUIEnabled } from "@/lib/featureFlags";

interface UseAdminResult {
  isAdmin: boolean;
  isAdminUIEnabled: boolean;
  canAccessAdmin: boolean;
  adminAddresses: string[];
}

/**
 * Hook to check if the current authenticated user is an admin
 * based on the NEXT_PUBLIC_ADMIN_WALLETS environment variable
 * and whether the admin UI feature flag is enabled
 */
export function useAdmin(): UseAdminResult {
  const { address } = useAuth();

  const adminAddresses = useMemo(() => {
    return getAdminAddresses();
  }, []);

  const isAdmin = useMemo(() => {
    return isAdminAddress(address, adminAddresses);
  }, [address, adminAddresses]);

  const adminUIEnabled = useMemo(() => {
    return isAdminUIEnabled();
  }, []);

  // User can access admin features only if they're an admin AND the feature flag is enabled
  const canAccessAdmin = isAdmin && adminUIEnabled;

  return {
    isAdmin,
    isAdminUIEnabled: adminUIEnabled,
    canAccessAdmin,
    adminAddresses,
  };
}
