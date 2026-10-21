import { EmitterSubscription } from 'react-native';

export interface Notification {
  type: 'trade_funded' | 'trade_completed' | 'dispute_raised' | 'evidence_submitted';
  data: {
    tradeId?: string;
    disputeId?: string;
    [key: string]: unknown;
  };
}

type NotificationHandler = (notification: Notification) => void;

/**
 * Notification service for handling push notifications
 * In production, this would integrate with a push notification provider
 * like Firebase Cloud Messaging or Expo Notifications
 */

// Store for notification handlers
const handlers: Set<NotificationHandler> = new Set();

/**
 * Register a handler for incoming notifications
 * @param handler Function to call when a notification is received
 * @returns Subscription that can be removed
 */
export function onNotification(handler: NotificationHandler): EmitterSubscription {
  handlers.add(handler);
  
  // Return a mock subscription
  return {
    remove: () => {
      handlers.delete(handler);
    },
  } as EmitterSubscription;
}

/**
 * Remove a notification handler
 * @deprecated Use the remove method on the subscription instead
 */
export function offNotification(handler: NotificationHandler): void {
  handlers.delete(handler);
}

/**
 * Get the device push token for push notifications
 */
export async function getDeviceToken(): Promise<string | null> {
  // In production, this would fetch the actual push token
  // from FCM, Expo Push Notifications, or similar
  return null;
}

/**
 * Request notification permissions
 */
export async function requestPermissions(): Promise<boolean> {
  // In production, this would request actual permissions
  // from the OS notification system
  return true;
}

/**
 * Configure the notification service with platform-specific settings
 */
export async function configure(): Promise<void> {
  // Initialize any platform-specific notification configuration
  // This would set up FCM, APNs, or Expo Push Notifications
}

/**
 * Handle a notification that was received while the app was in the foreground
 * This is called by the native notification receiver
 */
export function handleNotification(notification: Notification): void {
  // Notify all registered handlers
  handlers.forEach((handler) => {
    try {
      handler(notification);
    } catch (error) {
      console.error('Error in notification handler:', error);
    }
  });
}

/**
 * Handle a notification tap/action
 */
export function handleNotificationTap(notification: Notification): void {
  // Route to appropriate screen based on notification type
  const { type, data } = notification;
  
  switch (type) {
    case 'trade_funded':
    case 'trade_completed':
      // Navigation would be handled by the app's navigation system
      // navigation.navigate('TradeDetail', { tradeId: data.tradeId });
      break;
    case 'dispute_raised':
    case 'evidence_submitted':
      // Navigation would be handled by the app's navigation system
      // navigation.navigate('DisputeDetail', { disputeId: data.disputeId });
      break;
    default:
      // Unknown notification type - could log for analytics
      break;
  }
}