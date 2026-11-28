import React from 'react';
import { useNavigate } from 'react-router-dom';

interface EmptyStateProps {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaTo?: string;
}

const AgricultureIllustration: React.FC = () => (
  <svg
    width="160"
    height="160"
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Agriculture illustration"
  >
    <circle cx="80" cy="80" r="72" fill="#F0FDF4" />
    <path
      d="M80 128V72"
      stroke="#16A34A"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M80 96c-14 0-26-10-26-24 14 0 26 10 26 24Z"
      fill="#4ADE80"
    />
    <path
      d="M80 84c14 0 26-10 26-24-14 0-26 10-26 24Z"
      fill="#22C55E"
    />
    <path
      d="M80 72c-10 0-18-8-18-18 10 0 18 8 18 18Z"
      fill="#86EFAC"
    />
    <path
      d="M52 128h56"
      stroke="#16A34A"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <circle cx="118" cy="44" r="10" fill="#FDE68A" />
  </svg>
);

const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No trades yet',
  description = 'You have not created any trades. Start your first trade to get going.',
  ctaLabel = 'Create your first trade',
  ctaTo = '/trades/new',
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AgricultureIllustration />
      <h2 className="mt-6 text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-gray-500">{description}</p>
      <button
        type="button"
        onClick={() => navigate(ctaTo)}
        className="mt-6 inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
      >
        {ctaLabel}
      </button>
    </div>
  );
};

export default EmptyState;
