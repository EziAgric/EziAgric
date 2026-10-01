"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPrefs {
  tradeUpdates: boolean;
  disputeAlerts: boolean;
  vaultActivity: boolean;
  systemAnnouncements: boolean;
}

interface AppPrefs {
  network: "mainnet" | "testnet";
  currency: "USD" | "EUR" | "GBP";
  autoSignOut: "15" | "30" | "60" | "never";
}

interface ValidationErrors {
  [key: string]: string;
}

// ─── Notification matrix ──────────────────────────────────────────────────────

type NotificationChannel = "inApp" | "email" | "sms" | "push";

type NotificationEventKey =
  | "tradeUpdates"
  | "disputeAlerts"
  | "vaultActivity"
  | "systemAnnouncements";

interface NotificationEvent {
  key: NotificationEventKey;
  label: string;
  description: string;
}

const NOTIFICATION_CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: "inApp", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "push", label: "Push" },
];

const NOTIFICATION_EVENTS: NotificationEvent[] = [
  {
    key: "tradeUpdates",
    label: "Trade updates",
    description: "Status changes on your trades and escrows.",
  },
  {
    key: "disputeAlerts",
    label: "Dispute alerts",
    description: "New messages and rulings on open disputes.",
  },
  {
    key: "vaultActivity",
    label: "Vault activity",
    description: "Deposits, withdrawals, and vault events.",
  },
  {
    key: "systemAnnouncements",
    label: "System announcements",
    description: "Product news and maintenance notices.",
  },
];

type NotificationMatrix = Record<
  NotificationEventKey,
  Record<NotificationChannel, boolean>
>;

const DEFAULT_NOTIFICATION_MATRIX: NotificationMatrix = {
  tradeUpdates: { inApp: true, email: true, sms: false, push: true },
  disputeAlerts: { inApp: true, email: true, sms: true, push: true },
  vaultActivity: { inApp: true, email: false, sms: false, push: false },
  systemAnnouncements: { inApp: true, email: true, sms: false, push: false },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-default bg-card p-5 md:p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <hr className="border-border-default" />;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && (
          <p className="text-xs text-text-secondary mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
          checked ? "bg-gold" : "bg-bg-elevated"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-text-primary shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function SelectField({
  label,
  description,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && (
          <p className="text-xs text-text-secondary mt-0.5">{description}</p>
        )}
        {error && (
          <p className="text-xs text-status-danger mt-1 flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10a1 1 0 110 2 1 1 0 010-2zm0-7a1 1 0 011 1v4a1 1 0 11-2 0V5a1 1 0 011-1z" />
            </svg>
            {error}
          </p>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${label}-error` : undefined}
        className={`rounded-lg border ${error ? "border-status-danger" : "border-border-default"} bg-bg-input text-text-primary text-sm px-3 py-2 focus:outline-none focus:border-border-focus transition-colors sm:w-44`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NotificationMatrixTable({
  matrix,
  disabled,
  onToggle,
}: {
  matrix: NotificationMatrix;
  disabled?: boolean;
  onToggle: (event: NotificationEventKey, channel: NotificationChannel) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-left text-xs uppercase tracking-widest text-text-muted font-medium pb-3 pr-4">
              Event
            </th>
            {NOTIFICATION_CHANNELS.map((channel) => (
              <th
                key={channel.key}
                scope="col"
                className="text-center text-xs uppercase tracking-widest text-text-muted font-medium pb-3 px-2"
              >
                {channel.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_EVENTS.map((event) => (
            <tr key={event.key} className="border-t border-border-default">
              <th scope="row" className="text-left py-3 pr-4 font-normal align-top">
                <p className="text-sm font-medium text-text-primary">
                  {event.label}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {event.description}
                </p>
              </th>
              {NOTIFICATION_CHANNELS.map((channel) => {
                const checked = matrix[event.key][channel.key];
                return (
                  <td key={channel.key} className="text-center py-3 px-2 align-top">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggle(event.key, channel.key)}
                      aria-label={`${event.label} via ${channel.label}`}
                      className="h-4 w-4 cursor-pointer rounded border-border-default bg-bg-input accent-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const {
    address,
    isAuthenticated,
    isWalletConnected,
    isWalletDetected,
    isLoading,
    connectWallet,
    authenticate,
    logout,
  } = useAuth();

  const [notifications, setNotifications] = useState<NotificationPrefs>({
    tradeUpdates: true,
    disputeAlerts: true,
    vaultActivity: false,
    systemAnnouncements: true,
  });

  const [notificationMatrix, setNotificationMatrix] =
    useState<NotificationMatrix>(DEFAULT_NOTIFICATION_MATRIX);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );

  const [prefs, setPrefs] = useState<AppPrefs>({
    network: "testnet",
    currency: "USD",
    autoSignOut: "30",
  });

  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );

  function setNotif<K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K],
  ) {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  }

  function setPref<K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setValidationErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function validatePreferences(): boolean {
    const errors: ValidationErrors = {};

    if (!prefs.network) {
      errors.network = "Network selection is required";
    }

    if (!prefs.currency) {
      errors.currency = "Currency selection is required";
    }

    if (!prefs.autoSignOut) {
      errors.autoSignOut = "Auto sign-out preference is required";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCopyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleNotificationToggle(
    event: NotificationEventKey,
    channel: NotificationChannel,
  ) {
    const previous = notificationMatrix;
    const next: NotificationMatrix = {
      ...previous,
      [event]: { ...previous[event], [channel]: !previous[event][channel] },
    };

    // Optimistic update — apply immediately, roll back on failure.
    setNotificationMatrix(next);
    setNotificationError(null);
    setIsSavingNotifications(true);

    try {
      const response = await fetch("/api/preferences/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications: next }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    } catch {
      setNotificationMatrix(previous);
      setNotificationError(
        "Could not save notification preferences. Please try again.",
      );
    } finally {
      setIsSavingNotifications(false);
    }
  }

  function handleSavePreferences() {
    if (!validatePreferences()) {
      return;
    }

    // Preferences are local-only for now; extend with API call as needed.
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }

  const walletStatus = isLoading
    ? "Checking…"
    : isAuthenticated
      ? "Authenticated"
      : isWalletConnected
        ? "Wallet linked — sign in to authenticate"
        : isWalletDetected
          ? "Freighter detected — permission required"
          : "Freighter not detected";

  return (
    <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your wallet, notifications, and application preferences.
          </p>
        </div>

        {/* ── Wallet & Identity ── */}
        <SectionCard
          title="Wallet & Identity"
          description="Your Stellar wallet is your identity on Amana."
        >
          <div className="rounded-xl border border-border-default bg-bg-elevated px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-text-muted">
                Wallet address
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isAuthenticated
                    ? "bg-emerald-muted text-emerald"
                    : isWalletConnected
                      ? "bg-gold-muted text-gold"
                      : "bg-bg-elevated text-text-muted border border-border-default"
                }`}
              >
                {isAuthenticated
                  ? "Authenticated"
                  : isWalletConnected
                    ? "Connected"
                    : "Disconnected"}
              </span>
            </div>

            {address ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-text-primary font-mono break-all">
                  {address}
                </code>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="shrink-0 rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-border-focus transition-colors"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                Connect a Stellar wallet to link your identity.
              </p>
            )}

            <p className="text-xs text-text-muted">{walletStatus}</p>

            <div className="flex flex-wrap gap-2 pt-1">
              {!isWalletConnected && (
                <button
                  type="button"
                  onClick={connectWallet}
                  className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg-primary hover:opacity-90 transition-opacity"
                >
                  Connect wallet
                </button>
              )}
              {isWalletConnected && !isAuthenticated && (
                <button
                  type="button"
                  onClick={authenticate}
                  className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg-primary hover:opacity-90 transition-opacity"
                >
                  Sign in
                </button>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:border-border-focus transition-colors"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── Notifications ── */}
        <SectionCard
          title="Notifications"
          description="Choose which channels deliver each type of notification."
        >
          <NotificationMatrixTable
            matrix={notificationMatrix}
            disabled={isSavingNotifications}
            onToggle={handleNotificationToggle}
          />

          {notificationError && (
            <p className="text-xs text-status-danger flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10a1 1 0 110 2 1 1 0 010-2zm0-7a1 1 0 011 1v4a1 1 0 11-2 0V5a1 1 0 011-1z" />
              </svg>
              {notificationError}
            </p>
          )}

          <Divider />

          <Toggle
            checked={notifications.tradeUpdates}
            onChange={(v) => setNotif("tradeUpdates", v)}
            label="Trade updates"
            description="Status changes on your trades and escrows."
          />
          <Toggle
            checked={notifications.disputeAlerts}
            onChange={(v) => setNotif("disputeAlerts", v)}
            label="Dispute alerts"
            description="New messages and rulings on open disputes."
          />
          <Toggle
            checked={notifications.vaultActivity}
            onChange={(v) => setNotif("vaultActivity", v)}
            label="Vault activity"
            description="Deposits, withdrawals, and vault events."
          />
          <Toggle
            checked={notifications.systemAnnouncements}
            onChange={(v) => setNotif("systemAnnouncements", v)}
            label="System announcements"
            description="Product news and maintenance notices."
          />
        </SectionCard>

        {/* ── Application preferences ── */}
        <SectionCard
          title="Application preferences"
          description="Defaults applied across the app."
        >
          <SelectField
            label="Network"
            description="Network used for new transactions."
            value={prefs.network}
            onChange={(v) => setPref("network", v as AppPrefs["network"])}
            options={[
              { value: "mainnet", label: "Mainnet" },
              { value: "testnet", label: "Testnet" },
            ]}
            error={validationErrors.network}
          />
          <SelectField
            label="Currency"
            description="Display currency for balances and prices."
            value={prefs.currency}
            onChange={(v) => setPref("currency", v as AppPrefs["currency"])}
            options={[
              { value: "USD", label: "USD" },
              { value: "EUR", label: "EUR" },
              { value: "GBP", label: "GBP" },
            ]}
            error={validationErrors.currency}
          />
          <SelectField
            label="Auto sign-out"
            description="Sign out automatically after inactivity."
            value={prefs.autoSignOut}
            onChange={(v) => setPref("autoSignOut", v as AppPrefs["autoSignOut"])}
            options={[
              { value: "15", label: "15 minutes" },
              { value: "30", label: "30 minutes" },
              { value: "60", label: "60 minutes" },
              { value: "never", label: "Never" },
            ]}
            error={validationErrors.autoSignOut}
          />

          <Divider />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Theme</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Switch between light and dark appearance.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <Divider />

          <div className="flex items-center justify-between gap-4">
            <div>
              {saveSuccess && (
                <p className="text-xs text-emerald">Preferences saved.</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSavePreferences}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg-primary hover:opacity-90 transition-opacity"
            >
              Save preferences
            </button>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
