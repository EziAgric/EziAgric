import React from 'react';

export type TradeStatus = 'Created' | 'Funded' | 'Settled' | 'Disputed';

interface StatusBadgeProps {
  status: TradeStatus | string;
  className?: string;
}

interface BadgeStyle {
  label: string;
  className: string;
}

const STATUS_STYLES: Record<string, BadgeStyle> = {
  Created: {
    label: 'Created',
    className:
      'bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600',
  },
  Funded: {
    label: 'Funded',
    className:
      'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-300 dark:bg-blue-900 dark:text-blue-100 dark:ring-blue-700',
  },
  Settled: {
    label: 'Settled',
    className:
      'bg-green-100 text-green-800 ring-1 ring-inset ring-green-300 dark:bg-green-900 dark:text-green-100 dark:ring-green-700',
  },
  Disputed: {
    label: 'Disputed',
    className:
      'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-400 dark:bg-amber-900 dark:text-amber-50 dark:ring-amber-600',
  },
};

const FALLBACK_STYLE: BadgeStyle = {
  label: 'Unknown',
  className:
    'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const style = STATUS_STYLES[status] ?? {
    ...FALLBACK_STYLE,
    label: typeof status === 'string' && status.length > 0 ? status : FALLBACK_STYLE.label,
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className} ${className}`.trim()}
      data-status={status}
    >
      {style.label}
    </span>
  );
};

export default StatusBadge;
