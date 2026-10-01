import axios from "axios";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { IPFSService, ServiceUnavailableError } from "./ipfs.service";
import { getAdminAllowlistLowercase } from "../lib/accessControl";
import { env } from "../config/env";
import { enqueueEvidenceTranscode } from "../jobs/evidenceTranscode.job";

export class EvidenceAccessDeniedError extends Error {
    status = 403;
    constructor() {
        super("Access denied: you are not a party to this trade");
        this.name = "EvidenceAccessDeniedError";
    }
}

export class EvidenceTradeNotFoundError extends Error {
    status = 404;
    constructor() {
        super("Trade not found");
        this.name = "EvidenceTradeNotFoundError";
    }
}

export class EvidenceValidationError extends Error {
    status = 400;
    constructor(message = "Invalid evidence file") {
        super(message);
        this.name = "EvidenceValidationError";
    }
}

export class EvidenceHashMismatchError extends Error {
    status = 400;
    constructor(message = "Evidence content hash does not match the uploaded payload") {
        super(message);
        this.name = "EvidenceHashMismatchError";
    }
}

export class EvidenceScanError extends Error {
    status = 503;
    constructor(message = "Evidence scan service unavailable") {
        super(message);
        this.name = "EvidenceScanError";
    }
}

export interface EvidenceScanResult {
    clean: boolean;
    reason?: string;
}

export interface EvidenceScanner {
    scan(file: Express.Multer.File): Promise<EvidenceScanResult>;
}

class NoopEvidenceScanner implements EvidenceScanner {
    async scan(): Promise<EvidenceScanResult> {
        return { clean: true };
    }
}

function getEvidenceMetadataRetentionDays(): number {
    return env.EVIDENCE_METADATA_RETENTION_DAYS;
}

function isEvidenceMetadataExpired(createdAt: Date): boolean {
    const retentionMs = getEvidenceMetadataRetentionDays() * 24 * 60 * 60 * 1000;
    return Date.now() - createdAt.getTime() > retentionMs;
}

/** Normalize a client-supplied SHA-256 hex digest (trim + lowercase). */
export function normalizeSha256(value: string): string {
    return value.trim().toLowerCase();
}

/** Compute the SHA-256 hex digest of a buffer. */
export function computeSha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
}

type EvidenceDatabase = {
    trade: Pick<PrismaClient["trade"], "findUnique">;
    tradeEvidence: Pick<PrismaClient["tradeEvidence"], "findMany" | "create">;
};

export class EvidenceService {
    private ipfs: IPFSService;
    private scanner: EvidenceScanner;
    /** In-process cache: CID → resolved gateway URL */
    private readonly urlCache = new Map<string, string>();
    /** In-process gateway circuit state. */
    private readonly gatewayCircuit = new Map<string, { failures: number; openUntil: number }>();

    constructor(
        private readonly prisma: EvidenceDatabase = defaultPrisma as unknown as EvidenceDatabase,
        ipfs?: IPFSService,
        scanner?: EvidenceScanner,
    ) {
        this.ipfs = ipfs ?? new IPFSService();
        this.scanner = scanner ?? new NoopEvidenceScanner();
    }

    /** Return all evidence records for a trade. Caller must be buyer or seller. */
    async getEvidenceByTradeId(tradeId: string, callerAddress: string) {
        const trade = await this.prisma.trade.findUnique({
            where: { tradeId },
        });

        if (!trade) throw new EvidenceTradeNotFoundError();

        const caller = callerAddress.toLowerCase();
        const isAdmin = getAdminAllowlistLowercase().has(caller);
        if (
            trade.buyerAddress.toLowerCase() !== caller &&
            trade.sellerAddress.toLowerCase() !== caller &&
            !isAdmin
        ) {
            throw new EvidenceAccessDeniedError();
        }

        const records = await this.prisma.tradeEvidence.findMany({
            where: { tradeId },
            orderBy: { createdAt: "asc" },
        });

        return records.map((r) => {
            const retentionExpired = isEvidenceMetadataExpired(r.createdAt);
            const derived = r as typeof r & {
                thumbnailCid?: string | null;
                lowResCid?: string | null;
                transcodeStatus?: string | null;
                contentHash?: string | null;
            };
            return {
                id: r.id,
                cid: retentionExpired ? "redacted" : r.cid,
                filename: retentionExpired ? "redacted" : r.filename,
                mimeType: r.mimeType,
                uploadedBy: retentionExpired && !isAdmin ? "redacted" : r.uploadedBy,
                url: retentionExpired ? null : this.resolveGatewayUrl(r.cid),
                contentHash: derived.contentHash ?? null,
                thumbnailCid: retentionExpired ? null : derived.thumbnailCid ?? null,
                thumbnailUrl:
                    retentionExpired || !derived.thumbnailCid
                        ? null
                        : this.resolveGatewayUrl(derived.thumbnailCid),
                lowResCid: retentionExpired ? null : derived.lowResCid ?? null,
                lowResUrl:
                    retentionExpired || !derived.lowResCid
                        ? null
                        : this.resolveGatewayUrl(derived.lowResCid),
                transcodeStatus: derived.transcodeStatus ?? null,
                createdAt: r.createdAt,
                retentionExpired,
            };
        });
    }

    /**
     * Upload a video file to IPFS and persist the evidence record.
     * Caller must be buyer or seller of the referenced trade.
     *
     * The client must supply the SHA-256 of the payload; it is recomputed
     * server-side and the upload is rejected on mismatch before pinning.
     */
    async uploadVideoEvidence(
        tradeId: string,
        callerAddress: string,
        file: Express.Multer.File,
        clientHash?: string,
    ) {
        const trade = await this.prisma.trade.findUnique({ where: { tradeId } });
        if (!trade) throw new EvidenceTradeNotFoundError();

        const caller = callerAddress.toLowerCase();
        if (
            trade.buyerAddress.toLowerCase() !== caller &&
            trade.sellerAddress.toLowerCase() !== caller
        ) {
            throw new EvidenceAccessDeniedError();
        }

        // Validate declared mime type
        const allowed = ["video/mp4", "video/webm"];
        if (!allowed.includes(file.mimetype)) {
            throw new EvidenceValidationError("Unsupported file type");
        }

        // Validate mime by magic bytes to prevent spoofed content-type uploads.
        const sniffed = this.sniffMimeType(file.buffer);
        if (!sniffed || sniffed !== file.mimetype) {
            throw new EvidenceValidationError("File content does not match declared MIME type");
        }

        // Enforce configurable size limit (default 50MB)
        const size = (file as any).size ?? file.buffer.length;
        const MAX = env.EVIDENCE_MAX_BYTES;
        if (size > MAX) {
            throw new EvidenceValidationError("File too large");
        }

        // Require a client-supplied SHA-256 and verify it against the payload
        // before any pinning happens.
        if (!clientHash || typeof clientHash !== "string") {
            throw new EvidenceValidationError("Missing required content hash (sha256)");
        }
        const declaredHash = normalizeSha256(clientHash);
        if (!/^[a-f0-9]{64}$/.test(declaredHash)) {
            throw new EvidenceValidationError("Invalid content hash: expected 64-char hex SHA-256");
        }
        const computedHash = computeSha256(file.buffer);
        if (computedHash !== declaredHash) {
            throw new EvidenceHashMismatchError();
        }

        const scan = await this.runEvidenceScan(file);
        if (!scan.clean) {
            throw new EvidenceValidationError(scan.reason || "Evidence blocked by malware scanner");
        }

        const cid = await this.ipfs.uploadFile(file.buffer, file.originalname);

        const record = await this.prisma.tradeEvidence.create({
            data: {
                tradeId,
                cid,
                filename: file.originalname,
                mimeType: file.mimetype,
                uploadedBy: caller,
                contentHash: computedHash,
            } as any,
        });

        // Kick off background transcoding + thumbnail generation. The original
        // CID above remains the canonical evidence and is never altered.
        try {
            await enqueueEvidenceTranscode({
                evidenceId: record.id,
                tradeId,
                originalCid: cid,
                filename: file.originalname,
            });
        } catch (err) {
            // Enqueue failures must not fail the upload; the job can be retried.
            // eslint-disable-next-line no-console
            console.error("Failed to enqueue evidence transcode job", err);
        }

        return {
            evidenceId: record.id,
            cid,
            contentHash: computedHash,
            ipfsUrl: this.resolveGatewayUrl(cid),
        };
    }

    /**
     * Proxy-stream a file from the IPFS gateway with optional Range support.
     * Returns an axios response stream so the route can pipe it.
     */
    async streamFromIPFS(cid: string, range?: string) {
        // Build list of gateway base URLs to try. Prefer explicit env var list.
        const urls = this.resolveGatewayU

/* … truncated 3129 chars — edit only what you need near the top … */
