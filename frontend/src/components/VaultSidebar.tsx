import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useVaultBalance } from '../hooks/useVaultBalance';
import { useVault } from '../hooks/useVault';
import { Skeleton } from './ui/Skeleton';

export function VaultSidebar() {
  const { address } = useAccount();
  const { vault } = useVault();
  const { data: balance, isLoading } = useVaultBalance(address);

  const [formattedBalance, setFormattedBalance] = useState<string>('0.00');

  useEffect(() => {
    if (balance !== undefined && vault?.decimals !== undefined) {
      setFormattedBalance(formatUnits(balance, vault.decimals));
    }
  }, [balance, vault?.decimals]);

  return (
    <aside className="flex w-72 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Vault</h2>
        {vault?.symbol && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {vault.symbol}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-gray-500">Balance</span>
        {isLoading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <span className="text-2xl font-bold text-gray-900">{formattedBalance}</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-gray-500">Value</span>
        {isLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <span className="text-sm text-gray-700">
            {balance !== undefined ? `${formattedBalance} ${vault?.symbol ?? ''}`.trim() : '—'}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : (
          <>
            <button
              type="button"
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Deposit
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Withdraw
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
