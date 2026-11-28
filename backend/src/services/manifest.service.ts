import crypto from "crypto";
import { PrismaClient, TradeStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { getMediatorAllowlist } from "../lib/accessControl";
import { env } from "../config/env";
import { EncryptionService } from "./encryption.service";
import { logPiiAccess } from "../lib/piiAudit";

export interface SubmitManifestInput {
    tradeId: string;
    callerAddress: string;
    driverName: string;
    driverPhone: string;
    driverIdNumber: string;
    vehicleRegistration: string;
    routeDescription: string;
    expectedDeliveryAt: string;
}

export class ManifestForbiddenError extends Error {
    status = 403;
    constructor() {
        super("Only the seller may submit a delivery manifest");
        this.name = "ManifestForbiddenError";
    }
}

export class ManifestAccessDeniedError extends Error {
    status = 403;
    constructor() {
        super("Access denied: you are not allowed to view this manifest");
        this.name = "ManifestAccessDeniedError";
    }
}

export class ManifestConflictError extends Error {
    status = 409;
    constructor() {
        super("A manifest has already been submitted for this trade");
        this.name = "ManifestConflictError";
    }
}

export class ManifestTradeStatusError extends Error {
    status = 400;
    constructor(status: string) {
        super(`Trade must be in FUNDED status to submit a manifest (current: ${status})`);
        this.name = "ManifestTradeStatusError";
    }
}

export class ManifestTradeNotFoundError extends Error {
    status = 404;
    constructor() {
        super("Trade not found");
        this.name = "ManifestTradeNotFoundError";
    }
}

export class ManifestNotFoundError extends Error {
    status = 404;
    constructor() {
        super("Manifest not found");
        this.name = "ManifestNotFoundError";
    }
}

export class ManifestValidationError extends Error {
    status = 400;
    constructor(message: string) {
        super(message);
        this.name = "ManifestValidationError";
    }
}

function sha256(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

// E.164: leading '+', country code and subscriber number, max 15 digits total.
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

function normalizeDriverPhone(driverPhone: string): string {
    const trimmed = driverPhone.trim();
    if (!E164_REGEX.test(trimmed)) {
        throw new ManifestValidationError(
            "driverPhone must be a valid E.164 phone number (e.g. +2348012345678)",
        );
    }
    return trimmed;
}

type ManifestDatabase = {
    trade: Pick<PrismaClient["trade"], "findUnique">;
    deliveryManifest: Pick<PrismaClient["deliveryManifest"], "findUnique" | "create" | "update">;
};

function isUniqueConstraintError(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002",
    );
}

function parseMediatorAllowlist(): Set<string> {
    return getMediatorAllowlist();
}

function maskDriverName(driverName: string): string {
    const initial = (driverName.trim()[0] ?? "D").toUpperCase();
    return `${initial}****`;
}

function maskDriverIdNumber(): string {
    return "ID-****";
}

function getManifestRetentionDays(): number {
    const raw = process.env.MANIFEST_PII_RETENTION_DAYS;
    if (raw !== undefined) {
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : env.MANIFEST_PII_RETENTION_DAYS;
    }
    return env.MANIFEST_PII_RETENTION_DAYS;
}

function isOutsideRetentionWindow(createdAt: Date): boolean {
    const retentionMs = getManifestRetentionDays() * 24 * 60 * 60 * 1000;
    return Date.now() - createdAt.getTime() > retentionMs;
}

export class ManifestService {
    private readonly encryptionService = new EncryptionService();

    constructor(private readonly prisma: ManifestDatabase = defaultPrisma as unknown as ManifestDatabase) { }

    async submitManifest(input: SubmitManifestInput) {
        const trade = await this.prisma.trade.findUnique({
            where: { tradeId: input.tradeId },
        });

        if (!trade) throw new ManifestTradeNotFoundError();

        // Access: caller must be the seller
        if (trade.sellerAddress.toLowerCase() !== input.callerAddress.toLowerCase()) {
            throw new ManifestForbiddenError();
        }

        // Trade must be FUNDED
        if (trade.status !== TradeStatus.FUNDED) {
            throw new ManifestTradeStatusError(trade.status);
        }

        // Check for existing manifest
        const existing = await this.prisma.deliveryManifest.findUnique({
            where: { tradeId: input.tradeId },
        });
        if (existing) throw new ManifestConflictError();

        const driverPhone = normalizeDriverPhone(input.driverPhone);
        const driverNameHash = sha256(input.driverName);
        const driverIdHash = sha256(input.driverIdNumber);

        let manifest;
        try {
            manifest = await this.prisma.deliveryManifest.create({
                data: {
                    tradeId: input.tradeId,
                    driverName: this.encryptionService.encrypt(input.driverName, input.tradeId),
                    driverPhone: this.encryptionService.encrypt(driverPhone, input.tradeId),
                    driverIdNumber: this.encryptionService.encrypt(input.driverIdNumber, input.tradeId),
                    vehicleRegistration: this.encryptionService.encrypt(input.vehicleRegistration, input.tradeId),
                    routeDescription: this.encryptionService.encrypt(input.routeDescription, input.tradeId),
                    expectedDeliveryAt: new Date(input.expectedDeliveryAt),
                    driverNameHash,
                    driverIdHash,
                },
            });
        } catch (error) {
            if (isUniqueConstraintError(error)) {
                throw new ManifestConflictError();
            }
            throw error;
        }

        return { manifestId: manifest.id, driverNameHash, driverIdHash };
    }

    async getManifestByTradeId(tradeId: string, callerAddress: string) {
        const trade = await this.prisma.trade.findUnique({ where: { tradeId } });
        if (!trade) throw new ManifestTradeNotFoundError();

        const caller = callerAddress.toLowerCase();
        const isBuyer = trade.buyerAddress.toLowerCase() === caller;
        const isSeller = trade.sellerAddress.toLowerCase() === caller;
        const isMediator = parseMediatorAllowlist().has(caller);

        if (!isBuyer && !isSeller && !isMediator) {
            throw new ManifestAccessDeniedError();
        }

        const manifest = await this.prisma.deliveryManifest.findUnique({
            where: { tradeId },
        });
        if (!manifest) throw new ManifestNotFoundError();

        const retentionExpired = isOutsideRetentionWindow(manifest.createdAt);
        const decryptedDriverName = this.encryptionService.decrypt(manifest.driverName, tradeId);
        const decryptedDriverPhone = this.encryptionService.decrypt(manifest.driverPhone, tradeId);
        const decryptedDriverIdNumber = this.encryptionService.decrypt(manifest.driverIdNumber, tradeId);
        const decryptedVehicleRegistration = this.encryptionService.decrypt(manifest.vehicleRegistration, tradeId);
        const decryptedRouteDescription = this.encryptionService.decrypt(manifest.routeDescription, tradeId);

        // Access logging on decrypt (docs/pii-encryption.md #5) — records who
        // read plaintext PII off this manifest, regardless of which view they
        // end up receiving.
        logPiiAccess({
            resource: "DeliveryManifest",
            recordId: tradeId,
            fields: ["driverName", "driverPhone", "driverIdNumber", "vehicleRegistration", "routeDescription"],
            actor: callerAddress,
            action: "manifest.view",
        });

        if (isBuyer) {
            return {
                tradeId,
                roleView: "buyer" as const,
                driverName: maskDriverName(decryptedDriverName),
                driverIdNumber: maskDriverIdNumber(),
                vehicleRegistration: decryptedVehicleRegistration,
                routeDescription: decryptedRouteDescription,
                expectedDeliveryAt: manifest.expectedDeliveryAt,
                createdAt: manifest.createdAt,
                retentionExpired,
            };
        }

        if (isMediator) {
            return {
                tradeId,
                roleView: "mediator" as const,
                driverName: decryptedDriverName,
                driverPhone: decryptedDriverPhone,
                driverNameHash: manifest.driverNameHash,
                driverIdHash: manifest.driverIdHash,
                vehicleRegistration: decryptedVehicleRegistration,
                routeDescription: decryptedRouteDescription,
                expectedDeliveryAt: manifest.expectedDeliveryAt,
                createdAt: manifest.createdAt,
                retentionExpired,
            };
        }

        return {
            tradeId,
            roleView: "seller" as const,
            driverName: decryptedDriverName,
            driverPhone: decryptedDriverPhone,
            driverIdNumber: decryptedDriverIdNumber,
            vehicleRegistration: decryptedVehicleRegistration,
            routeDescription: decryptedRouteDescription,
            expectedDeliveryAt: manifest.expectedDeliveryAt,
            createdAt: manifest.createdAt,
            retentionExpired,
        };
    }
}
