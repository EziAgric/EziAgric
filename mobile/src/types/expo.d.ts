declare module 'expo-status-bar' {
  import React from 'react';
  interface StatusBarProps {
    style?: 'auto' | 'inverted' | 'light' | 'dark';
    animated?: boolean;
    hidden?: boolean;
    hideTransitionAnimation?: 'fade' | 'slide' | 'none';
    networkActivityIndicatorVisible?: boolean;
    translucent?: boolean;
  }
  export const StatusBar: React.FC<StatusBarProps>;
}

declare module 'expo-notifications' {
  interface NotificationContent {
    title: string;
    body: string;
    data: Record<string, unknown>;
  }
  interface Notification {
    date: number;
    request: {
      content: NotificationContent;
      identifier: string;
      trigger: unknown;
    };
  }
  interface NotificationResponse {
    notification: Notification;
    actionIdentifier: string;
    userText?: string;
  }
  export function setNotificationHandler(handler: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }): void;
  export function addNotificationResponseReceivedListener(
    handler: (response: NotificationResponse) => void
  ): { remove: () => void };
}
