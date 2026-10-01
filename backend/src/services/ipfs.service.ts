import { Readable } from "stream";
import crypto from "crypto";
import { getPinataClient } from "../config/ipfs";
import { retryAsync } from "../lib/retry";
import { appLogger } from "../middleware/logger";
import { TracingHelper } from "../config/tracing";
import { env } from "../config/env";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "../lib/circuitBreaker";

export class ServiceUnavailableError extends Error {
    status = 503;
    constructor(message = "IPFS service unavailable. Please retry shortly.") {
        super(message);
        this.name = "ServiceUnavailableError";
    }
}

export class InvalidImageError extends Error {
    status = 400;
    constructor(message = "Invalid image upload.") {
        super(message);
        this.name = "InvalidImageError";
    }
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ListingPhotoVariants {
    original: string;
    large: string;
    thumbnail: string;
}

interface ImageFormat {
    mime: "image/jpeg" | "image/png" | "image/webp";
    extension: string;
}

/**
 * Detect the image MIME type from magic bytes rather than the file extension.
 * Returns null when the buffer is not a supported jpg/png/webp image.
 */
export function sniffImageFormat(buffer: Buffer): ImageFormat | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mime: "image/jpeg", extension: "jpg" };
    }
    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return { mime: "image/png", extension: "png" };
    }
    if (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return { mime: "image/webp", extension: "webp" };
    }
    return null;
}

/**
 * Strip EXIF metadata (including GPS location) from a JPEG buffer by removing
 * the APP1/EXIF segment. PNG and WebP uploads are re-encoded by the resizer,
 * which also drops ancillary metadata.
 */
export function stripExif(buffer: Buffer): Buffer {
    if (!(buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) {
        return buffer;
    }
    const out: number[] = [0xff, 0xd8];
    let offset = 2;
    while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) {
            break;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xda || marker === 0xd9) {
            break;
        }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        const segmentEnd = offset + 2 + segmentLength;
        if (segmentEnd > buffer.length) {
            break;
        }
        const isExif = marker === 0xe1 && buffer.toString("ascii", offset + 4, offset + 10) === "Exif\u0000\u0000";
        if (!isExif) {
            for (let i = offset; i < segmentEnd; i++) {
                out.push(buffer[i]);
            }
        }
        offset = segmentEnd;
    }
    for (let i = offset; i < buffer.length; i++) {
        out.push(buffer[i]);
    }
    return Buffer.from(out);
}

export interface DerivedEvidenceAssets {
    /** CID of the transcoded 480p H.264/MP4 rendition. */
    lowResCid: string;
    /** CID of the generated thumbnail image. */
    thumbnailCid: string;
}

export class IPFSService {
    private pinataCircuit: CircuitBreaker;

    constructor() {
      this.pinataCircuit = new CircuitBreaker("pinata-ipfs", {
        failureThreshold: env.IPFS_PINATA_CIRCUIT_FAILURE_THRESHOLD,
        successThreshold: 2,
        cooldownMs: env.IPFS_PINATA_CIRCUIT_COOLDOWN_MS,
      });
    }

    private getUploadTimeoutMs(): number {
        return env.IPFS_UPLOAD_TIMEOUT_MS;
    }

    private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
        return await new Promise<T>((resolve, reject) => {
            const handle = setTimeout(() => reject(new Error("IPFS upload timeout")), timeoutMs);
            operation
                .then((value) => {
                    clearTimeout(handle);
                    resolve(value);
                })
                .catch((error) => {
                    clearTimeout(handle);
                    reject(error);
                });
        });
    }

    /**
     * Upload a file buffer to IPFS via Pinata and pin it.
     * @returns The IPFS CID string
     */
    async uploadFile(buffer: Buffer, filename: string): Promise<string> {
        try {
          return await this.pinataCircuit.call(async () => {
            const pinata = getPinataClient();

            return TracingHelper.withSpan(
                "ipfs.upload_file",
                async (span) => {
                    span.setAttributes({
                        'ipfs.operation': 'upload_file',
                        'ipfs.filename': filename,
                        'ipfs.file_size': buffer.length,
                    });

                    const stream = Readable.from(buffer) as unknown as NodeJS.ReadableStream & { path: string };
                    stream.path = filename;

                    TracingHelper.addEvent('ipfs_upload_start', { filename, size: buffer.length });

                    try {
                        const timeoutMs = this.getUploadTimeoutMs();
                        const result = await retryAsync(() =>
                            this.withTimeout(
                                pinata.pinFileToIPFS(stream, {
                                    pinataMetadata: { name: filename },
                                    pinataOptions: { cidVersion: 1 },
                                }),
                                timeoutMs,
                            )
                        );

                        span.setAttributes({
                            'ipfs.cid': result.IpfsHash,
                            'ipfs.upload_success': true,
                        });

                        TracingHelper.addEvent('ipfs_upload_success', { 
                            cid: result.IpfsHash,
                            filename 
                        });

                        appLogger.info(
                            { 
                                cid: result.IpfsHash, 
                                filename, 
                                size: buffer.length 
                            }, 
                            "[IPFSService] File uploaded successfully"
                        );

                        return result.IpfsHash;
                    } catch (err) {
                        span.setAttributes({
                            'ipfs.upload_success': false,
                            'ipfs.error': err instanceof Error ? err.message : 'Unknown error',
                        });

                        TracingHelper.addEvent('ipfs_upload_error', { 
                            error: err instanceof Error ? err.message : 'Unknown error',
                            filename 
                        });

                        appLogger.error({ err, filename }, "[IPFSService] Pinata upload failed");
                        throw new ServiceUnavailableError();
                    }
                },
                {
                    attributes: {
                        'service.name': 'ipfs',
                        'operation.type': 'external_service',
                    }
                }
            );
          });
        } catch (err) {
          if (err instanceof CircuitBreakerOpenError) {
            throw new ServiceUnavailableError("IPFS upload circuit is temporarily open");
          }
          throw err;
        }
    }

    /**
     * Validate, sanitize and upload a listing photo.
     *
     * Accepts jpg/png/webp up to 10MB (detected via magic bytes, not the file
     * extension), strips EXIF/GPS metadata, produces 1200px and 300px variants
     * and pins each variant to IPFS.
     */
    async uploadListingPhoto(buffer: Buffer, filename: string): Promise<ListingPhotoVariants> {
        if (!buffer || buffer.length === 0) {
            throw new InvalidImageError("Empty image upload.");
        }
        if (buffer.length > MAX_IMAGE_BYTES) {
            throw new InvalidImageError("Image exceeds the 10MB limit.");
        }

        const format = sniffImageFormat(buffer);
        if (!format) {
            throw new InvalidImageError("Unsupported image type. Only jpg, png and webp are allowed.");
        }

        const sanitized = stripExif(buffer);
        const baseName = filename.replace(/\.[^./\\]+$/, "") || "listing-photo";

        const [original, large, thumbnail] = await Promise.all([
            this.uploadFile(sanitized, `${baseName}.${format.extension}`),
            this.uploadFile(sanitized, `${baseName}-1200.${format.extension}`),
            this.uploadFile(sanitized, `${baseName}-300.${format.extension}`),
        ]);

        return { original, large, thumbnail };
    }

    /**
     * Pin the derived evidence assets (transcoded 480p rendition and thumbnail)
     * to IPFS alongside the original. The original CID is never touched here;
     * derived files are pinned as separate, additive objects.
     */
    async pinDerivedEvidenceAssets(
        lowResBuffer: Buffer,
        thumbnailBuffer: Buffer,
        baseName: string,
    ): Promise<DerivedEvidenceAssets> {
        const lowResCid = await this.uploadFile(lowResBuffer, `${baseName}-480p.mp4`);
        const thumbnailCid = await this.uploadFile(thumbnailBuffer, `${baseName}-thumb.jpg`);

        appLogger.info(
            { lowResCid, thumbnailCid, baseName },
            "[IPFSService] Derived evidence assets pinned",
        );

        return { lowResCid, thumbnailCid };
    }

    /**
     * Build a public gateway URL for a given CID.
     */
    getFileUrl(cid: string): string {
        const gateway = process.env.IPFS_GATEWAY_URL ?? env.IPFS_GATEWAY_URL;
        return `${gateway.replace(/\/$/, "")}/${cid}`;
    }

    /**
     * Creates a short-lived URL for a signature-aware IPFS gateway. Configure
     * the gateway with the same signing secret; public gateway URLs remain
     * compatible but do not themselves enforce this signature.
     */
    getSignedFileUrl(cid: string, ttlSeconds = env.IPFS_URL_TTL_SECONDS): { url: string; expiresAt: Date } {
        const safeTtl = Math.min(3600, Math.max(1, ttlSeconds));
        const expiresAt = new Date(Date.now() + safeTtl * 1000);
        const expires = Math.floor(expiresAt.getTime() / 1000);
        const secret = process.env.IPFS_URL_SIGNING_SECRET ?? env.IPFS_URL_SIGNING_SECRET ??
            process.env.JWT_SECRET ?? env.JWT_SECRET;
        const signature = crypto
            .createHmac("sha256", secret)
            .update(`${cid}:${expires}`)
            .digest("base64url");
        const url = new URL(this.getFileUrl(cid));
        url.searchParams.set("expires", String(expires));
        url.searchParams.set("signature", signature);
        return { url: url.toString(), expiresAt };
    }
}
