import { getApiBaseUrl } from './config';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

export type NotificationEventType =
  | 'transaction_sent'
  | 'transaction_received'
  | 'payment_failed'
  | 'security_alert'
  | 'account_update'
  | 'marketing';

export type NotificationPreferences = Record<
  NotificationEventType,
  Record<NotificationChannel, boolean>
>;

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  'in_app',
  'email',
  'sms',
  'push',
];

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  'transaction_sent',
  'transaction_received',
  'payment_failed',
  'security_alert',
  'account_update',
  'marketing',
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences =
  NOTIFICATION_EVENT_TYPES.reduce((prefs, eventType) => {
    prefs[eventType] = NOTIFICATION_CHANNELS.reduce(
      (channels, channel) => {
        channels[channel] = channel === 'in_app';
        return channels;
      },
      {} as Record<NotificationChannel, boolean>,
    );
    return prefs;
  }, {} as NotificationPreferences);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return request<NotificationPreferences>('/preferences/notifications');
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  return request<NotificationPreferences>('/preferences/notifications', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
}
