import { prisma } from '../lib/prisma';
import { sendSms } from '../lib/sms';
import { sendEmail } from '../lib/email';

/**
 * Notification service.
 *
 * Handles in-app, SMS and email notifications for trade lifecycle events,
 * including the pre-expiry warnings sent to both buyer and seller.
 */

const WARNING_WINDOWS_MS = {
  h24: 24 * 60 * 60 * 1000,
  h2: 2 * 60 * 60 * 1000,
} as const;

type WarningWindow = keyof typeof WARNING_WINDOWS_MS;

interface NotificationPreferences {
  inApp: boolean;
  sms: boolean;
  email: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  inApp: true,
  sms: false,
  email: false,
};

async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs) {
    return DEFAULT_PREFERENCES;
  }

  return {
    inApp: prefs.inApp ?? DEFAULT_PREFERENCES.inApp,
    sms: prefs.sms ?? DEFAULT_PREFERENCES.sms,
    email: prefs.email ?? DEFAULT_PREFERENCES.email,
  };
}

async function deliver(
  userId: string,
  title: string,
  body: string,
  dedupeKey: string,
): Promise<void> {
  const prefs = await getPreferences(userId);

  if (prefs.inApp) {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        dedupeKey,
      },
    });
  }

  if (prefs.sms) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    });

    if (user?.phoneNumber) {
      await sendSms(user.phoneNumber, `${title}\n${body}`);
    }
  }

  if (prefs.email) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (user?.email) {
      await sendEmail(user.email, title, body);
    }
  }
}

/**
 * Sends the 24h and 2h pre-expiry warnings to both parties of a trade.
 *
 * Each warning is sent at most once per trade/party/window, enforced by the
 * unique `dedupeKey` on the notification record.
 */
export async function sendTradeExpiryWarnings(tradeId: string): Promise<void> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      deadline: true,
    },
  });

  if (!trade || !trade.deadline) {
    return;
  }

  const now = Date.now();
  const remaining = trade.deadline.getTime() - now;

  if (remaining <= 0) {
    return;
  }

  const windows: WarningWindow[] = [];

  if (remaining <= WARNING_WINDOWS_MS.h24) {
    windows.push('h24');
  }

  if (remaining <= WARNING_WINDOWS_MS.h2) {
    windows.push('h2');
  }

  if (windows.length === 0) {
    return;
  }

  const parties: Array<{ userId: string; role: 'buyer' | 'seller' }> = [
    { userId: trade.buyerId, role: 'buyer' },
    { userId: trade.sellerId, role: 'seller' },
  ];

  for (const window of windows) {
    const hours = window === 'h24' ? 24 : 2;

    for (const party of parties) {
      const dedupeKey = `trade-expiry:${trade.id}:${party.role}:${window}`;

      const existing = await prisma.notification.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      await deliver(
        party.userId,
        `Trade expiring in ${hours}h`,
        `Your trade ${trade.id} will expire in ${hours} hours and become eligible for an expiry refund.`,
        dedupeKey,
      );
    }
  }
}
