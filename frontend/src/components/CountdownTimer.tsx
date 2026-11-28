import { useEffect, useRef, useState } from 'react';

interface CountdownTimerProps {
  deadline: string | number | Date;
  onExpire?: () => void;
  className?: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function getRemainingMs(deadlineMs: number): number {
  return deadlineMs - Date.now();
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');

  return `${pad(days)} ${pad(hours)} ${pad(minutes)} ${pad(seconds)}`;
}

export default function CountdownTimer({ deadline, onExpire, className }: CountdownTimerProps) {
  const deadlineMs = new Date(deadline).getTime();
  const [remainingMs, setRemainingMs] = useState<number>(() => getRemainingMs(deadlineMs));
  const expiredNotified = useRef(false);

  useEffect(() => {
    expiredNotified.current = false;
    setRemainingMs(getRemainingMs(deadlineMs));

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const next = getRemainingMs(deadlineMs);
      setRemainingMs(next);

      if (next <= 0 && !expiredNotified.current) {
        expiredNotified.current = true;
        onExpire?.();
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      tick();
      intervalId = setInterval(tick, 1000);
    };

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') {
      start();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [deadlineMs, onExpire]);

  const isExpired = remainingMs <= 0;
  const isUrgent = !isExpired && remainingMs < ONE_HOUR_MS;

  const colorClass = isExpired || isUrgent ? 'text-red-600' : 'text-gray-900';

  return (
    <span
      className={`font-mono tabular-nums ${colorClass}${className ? ` ${className}` : ''}`}
      role="timer"
      aria-live="polite"
    >
      {isExpired ? 'Expired' : formatRemaining(remainingMs)}
    </span>
  );
}
