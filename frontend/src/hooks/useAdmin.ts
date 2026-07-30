"use client";

import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { getAdminAddresses, isAdminAddress } from "@/lib/adminAccess";

interface UseAdminResult {
  isAdmin: boolean;
  adminAddresses: string[];
}

/**
 * Hook to check if the current authenticated user is an admin
 * based on the NEXT_PUBLIC_ADMIN_WALLETS environment variable
 */
export function useAdmin(): UseAdminResult {
  const { address } = useAuth();

  const adminAddresses = useMemo(() => {
    return getAdminAddresses();
  }, []);

  const isAdmin = useMemo(() => {
    return isAdminAddress(address, adminAddresses);
  }, [address, adminAddresses]);

  return {
    isAdmin,
    adminAddresses,
  };
}
