'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Role = 'manager' | 'member';

interface Member {
  id: string;
  name: string;
  address: string;
  role: Role;
  joinedAt: string;
}

interface Trade {
  id: string;
  counterparty: string;
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  date: string;
}

interface CooperativeStats {
  totalMembers: number;
  totalTrades: number;
  totalVolume: number;
  activeTrades: number;
}

interface Cooperative {
  id: string;
  name: string;
  description: string;
  members: Member[];
  trades: Trade[];
  stats: CooperativeStats;
}

const CURRENT_USER_ROLE: Role = 'manager';

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Trade['status'] }) {
  const styles: Record<Trade['status'], string> = {
    completed: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function CooperativeDashboardPage() {
  const params = useParams<{ id: string }>();
  const cooperativeId = params?.id;

  const [cooperative, setCooperative] = useState<Cooperative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteAddress, setInviteAddress] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const isManager = CURRENT_USER_ROLE === 'manager';

  const loadCooperative = useCallback(async () => {
    if (!cooperativeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cooperatives/${cooperativeId}`);
      if (!res.ok) throw new Error('Failed to load cooperative');
      const data: Cooperative = await res.json();
      setCooperative(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cooperative');
    } finally {
      setLoading(false);
    }
  }, [cooperativeId]);

  useEffect(() => {
    loadCooperative();
  }, [loadCooperative]);

  const handleExport = useCallback(() => {
    if (!cooperative) return;
    const header = ['id', 'counterparty', 'amount', 'currency', 'status', 'date'];
    const rows = cooperative.trades.map((t) =>
      [t.id, t.counterparty, t.amount, t.currency, t.status, t.date].join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cooperative-${cooperative.id}-trades.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [cooperative]);

  const handleInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!cooperativeId) return;
      setInviteError(null);
      if (!inviteAddress.trim()) {
        setInviteError('Address is required');
        return;
      }
      setInviting(true);
      try {
        const res = await fetch(`/api/cooperatives/${cooperativeId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: inviteAddress.trim(), role: inviteRole }),
        });
        if (!res.ok) throw new Error('Failed to invite member');
        setInviteAddress('');
        setInviteRole('member');
        setInviteOpen(false);
        await loadCooperative();
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : 'Failed to invite member');
      } finally {
        setInviting(false);
      }
    },
    [cooperativeId, inviteAddress, inviteRole, loadCooperative],
  );

  const stats = useMemo(() => cooperative?.stats, [cooperative]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-gray-500">Loading cooperative…</p>
      </div>
    );
  }

  if (error || !cooperative) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-red-600">{error ?? 'Cooperative not found'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{cooperative.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{cooperative.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export trades
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Invite member
            </button>
          )}
        </div>
      </header>

      {stats && (
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Members" value={stats.totalMembers} />
          <StatCard label="Total trades" value={stats.totalTrades} />
          <StatCard label="Active trades" value={stats.activeTrades} />
          <StatCard label="Volume" value={formatCurrency(stats.totalVolume, 'USD')} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Members</h2>
        <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {cooperative.members.map((member) => (
            <li
              key={member.id}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-gray-900">{member.name}</p>
                <p className="text-xs text-gray-500">{member.address}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  {member.role}
                </span>
                <span className="text-xs text-gray-400">Joined {member.joinedAt}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Trades</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Counterparty</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Amount</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cooperative.trades.map((trade) => (
                <tr key={trade.id}>
                  <td className="px-4 py-2 text-gray-900">{trade.counterparty}</td>
                  <td className="px-4 py-2 text-gray-900">
                    {formatCurrency(trade.amount, trade.currency)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={trade.status} />
                  </td>
                  <td className="px-4 py-2 text-gray-500">{trade.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isManager && inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">Invite member</h3>
            <form onSubmit={handleInvite} className="mt-4 space-y-4">
              <div>
                <label htmlFor="invite-address" className="block text-sm font-medium text-gray-700">
                  Wallet address
                </label>
                <input
                  id="invite-address"
                  type="text"
                  value={inviteAddress}
                  onChange={(e) => setInviteAddress(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="G..."
                />
              </div>
              <div>
                <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700">
                  Role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {inviting ? 'Inviting…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
