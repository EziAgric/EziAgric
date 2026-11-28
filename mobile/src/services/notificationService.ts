import { NavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';

/**
 * Deep-link payload carried by push notifications.
 * Example: { screen: 'TradeDetail', tradeId: 'abc-123' }
 */
export interface NotificationDeepLink {
  screen: 'TradeDetail';
  tradeId: string;
}

export interface NotificationPayload {
  deepLink?: NotificationDeepLink;
  [key: string]: unknown;
}

let navigationRef: NavigationContainerRef<Record<string, object | undefined>> | null = null;
let pendingDeepLink: NotificationDeepLink | null = null;

/**
 * Register the root navigation ref so notification taps can navigate.
 */
export function setNavigationRef(
  ref: NavigationContainerRef<Record<string, object | undefined>> | null,
): void {
  navigationRef = ref;
  if (ref && pendingDeepLink) {
    const link = pendingDeepLink;
    pendingDeepLink = null;
    navigateToDeepLink(link);
  }
}

/**
 * Parse a deep-link payload from a notification's data. Returns null when the
 * payload is missing or malformed so we never navigate to an invalid route.
 */
export function parseDeepLink(data: unknown): NotificationDeepLink | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const candidate = data as Partial<NotificationDeepLink>;
  if (candidate.screen !== 'TradeDetail') {
    return null;
  }
  if (typeof candidate.tradeId !== 'string' || candidate.tradeId.length === 0) {
    return null;
  }
  return { screen: 'TradeDetail', tradeId: candidate.tradeId };
}

/**
 * Navigate to the screen named by the deep-link. If navigation is not ready
 * yet (cold start), the link is queued and flushed once the ref is set.
 */
export function navigateToDeepLink(link: NotificationDeepLink): void {
  if (!navigationRef || !navigationRef.isReady()) {
    pendingDeepLink = link;
    return;
  }
  navigationRef.navigate(link.screen, { tradeId: link.tradeId });
}

/**
 * Handle a notification response (tap). Works for both background and cold
 * start: on cold start the response is read via getLastNotificationResponseAsync
 * and navigation is queued until the navigation container is ready.
 */
export function handleNotificationResponse(
  response: Notifications.NotificationResponse | null,
): void {
  if (!response) {
    return;
  }
  const link = parseDeepLink(response.notification.request.content.data);
  if (link) {
    navigateToDeepLink(link);
  }
}

/**
 * Wire up listeners for notification taps. Call once at app startup.
 * Returns a cleanup function.
 */
export function registerNotificationHandlers(): () => void {
  // Cold start: app was not running when the notification was tapped.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => handleNotificationResponse(response))
    .catch(() => {
      // Ignore: no last response available.
    });

  // Background / foreground: app already running.
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => handleNotificationResponse(response),
  );

  return () => subscription.remove();
}
