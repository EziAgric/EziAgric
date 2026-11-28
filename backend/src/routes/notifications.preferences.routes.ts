import { PrismaClient } from "@prisma/client";
import { Response, Router } from "express";
import { z } from "zod";
import { prisma as defaultPrisma } from "../lib/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";

const notificationChannelSchema = z.enum(["email", "push", "in-app"]);
const preferencesSchema = z.record(
  z.string().min(1),
  z.array(notificationChannelSchema).max(3),
);

// Supported notification locales: English, Hausa, Yoruba, Igbo, Nigerian Pidgin.
export const SUPPORTED_LOCALES = ["en", "ha", "yo", "ig", "pcm"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

const localeSchema = z.enum(SUPPORTED_LOCALES);

const preferencesBodySchema = z.object({
  preferences: preferencesSchema.optional(),
  locale: localeSchema.optional(),
});

type Preferences = Record<string, Array<"email" | "push" | "in-app">>;

type PreferenceRecord = { preferences: unknown; locale?: string | null };

type PreferencePrisma = PrismaClient & {
  notificationPreference?: {
    findUnique: (args: any) => Promise<PreferenceRecord | null>;
    upsert: (args: any) => Promise<PreferenceRecord>;
  };
};

function caller(req: AuthRequest, res: Response): string | null {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!walletAddress) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return walletAddress;
}

function normalizePreferences(value: unknown): Preferences {
  const parsed = preferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

// Fall back to English when the stored locale is missing or unsupported.
export function normalizeLocale(value: unknown): SupportedLocale {
  const parsed = localeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LOCALE;
}

export function createNotificationPreferencesRouter(
  prisma: PreferencePrisma = defaultPrisma as PreferencePrisma,
) {
  const router = Router();

  router.get("/notifications/preferences", authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const walletAddress = caller(req, res);
      if (!walletAddress) return;

      const record = await prisma.notificationPreference?.findUnique({
        where: { userAddress: walletAddress },
      });

      res.status(200).json({
        preferences: normalizePreferences(record?.preferences),
        locale: normalizeLocale(record?.locale),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/notifications/preferences",
    authMiddleware,
    validateRequest({ body: preferencesBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const incoming = (req.body?.preferences ?? {}) as Preferences;
        const existing = await prisma.notificationPreference?.findUnique({
          where: { userAddress: walletAddress },
        });
        const merged = {
          ...normalizePreferences(existing?.preferences),
          ...incoming,
        };
        const locale =
          req.body?.locale !== undefined
            ? normalizeLocale(req.body.locale)
            : normalizeLocale(existing?.locale);

        const saved = await prisma.notificationPreference?.upsert({
          where: { userAddress: walletAddress },
          create: { userAddress: walletAddress, preferences: merged, locale },
          update: { preferences: merged, locale },
        });

        res.status(200).json({
          preferences: normalizePreferences(saved?.preferences ?? merged),
          locale: normalizeLocale(saved?.locale ?? locale),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export const notificationPreferencesRoutes = createNotificationPreferencesRouter();
