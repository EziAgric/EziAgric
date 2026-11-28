import { Prisma, PrismaClient, TradeStatus } from "@prisma/client";
import { Response, Router } from "express";
import { z } from "zod";
import { Parser } from "json2csv";
import { prisma as defaultPrisma } from "../lib/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";

const tradeExportLimiter = createWalletRateLimiter(RATE_LIMIT_CONFIG.tradeExport);

const exportQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
  status: z.nativeEnum(TradeStatus).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
}).refine(
  (value: {
    dateFrom?: string;
    dateTo?: string;
  }) => !value.dateFrom || !value.dateTo || new Date(value.dateFrom) <= new Date(value.dateTo),
  { message: "dateFrom must be before or equal to dateTo", path: ["dateFrom"] },
);

const cooperativeExportQuerySchema = z.object({
  format: z.enum(["csv", "pdf"]).default("csv"),
  status: z.nativeEnum(TradeStatus).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
}).refine(
  (value: {
    dateFrom?: string;
    dateTo?: string;
  }) => !value.dateFrom || !value.dateTo || new Date(value.dateFrom) <= new Date(value.dateTo),
  { message: "dateFrom must be before or equal to dateTo", path: ["dateFrom"] },
);

const csvFields = [
  "tradeId",
  "buyerAddress",
  "sellerAddress",
  "amountUsdc",
  "status",
  "fundedAt",
  "deliveredAt",
  "completedAt",
  "createdAt",
  "updatedAt",
];

const cooperativeCsvFields = [
  "tradeId",
  "buyerAddress",
  "sellerAddress",
  "amountUsdc",
  "feeUsdc",
  "netUsdc",
  "status",
  "fundedAt",
  "deliveredAt",
  "completedAt",
  "createdAt",
  "updatedAt",
];

const COOPERATIVE_EXPORT_BATCH_SIZE = 500;

function caller(req: AuthRequest, res: Response): string | null {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!walletAddress) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return walletAddress;
}

function buildWhere(walletAddress: string, query: z.infer<typeof exportQuerySchema>): Prisma.TradeWhereInput {
  const where: Prisma.TradeWhereInput = {
    OR: [{ buyerAddress: walletAddress }, { sellerAddress: walletAddress }],
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }

  return where;
}

function buildCooperativeWhere(
  memberAddresses: string[],
  query: z.infer<typeof cooperativeExportQuerySchema>,
): Prisma.TradeWhereInput {
  const where: Prisma.TradeWhereInput = {
    OR: [
      { buyerAddress: { in: memberAddresses } },
      { sellerAddress: { in: memberAddresses } },
    ],
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }

  return where;
}

function serializeTrade(trade: Record<string, unknown>) {
  return {
    tradeId: trade.tradeId,
    buyerAddress: trade.buyerAddress,
    sellerAddress: trade.sellerAddress,
    amountUsdc: trade.amountUsdc,
    status: trade.status,
    fundedAt: trade.fundedAt,
    deliveredAt: trade.deliveredAt,
    completedAt: trade.completedAt,
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
  };
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeFee(amountUsdc: unknown): number {
  const amount = toNumber(amountUsdc);
  const feeRate = toNumber((RATE_LIMIT_CONFIG as { tradeFeeRate?: number }).tradeFeeRate ?? 0);
  return Math.round(amount * feeRate * 100) / 100;
}

function serializeCooperativeTrade(trade: Record<string, unknown>) {
  const amountUsdc = toNumber(trade.amountUsdc);
  const feeUsdc = computeFee(trade.amountUsdc);
  return {
    tradeId: trade.tradeId,
    buyerAddress: trade.buyerAddress,
    sellerAddress: trade.sellerAddress,
    amountUsdc,
    feeUsdc,
    netUsdc: Math.round((amountUsdc - feeUsdc) * 100) / 100,
    status: trade.status,
    fundedAt: trade.fundedAt,
    deliveredAt: trade.deliveredAt,
    completedAt: trade.completedAt,
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
  };
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(lines: string[]): Buffer {
  const contentLines = lines.map((line, index) => {
    const y = 800 - index * 14;
    return `BT /F1 10 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });
  const content = contentLines.join("\n");

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function createTradeExportRouter(prisma: PrismaClient = defaultPrisma) {
  const router = Router();

  router.get(
    "/export",
    authMiddleware,
    tradeExportLimiter,
    validateRequest({ query: exportQuerySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const query = req.query as unknown as z.infer<typeof exportQuerySchema>;
        const where = buildWhere(walletAddress, query);

        if (query.format === "csv") {
          const trades = await prisma.trade.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          const rows = trades.map((trade: unknown) => serializeTrade(trade as any));
          const parser = new Parser({ fields: csvFields });
          const csv = parser.parse(rows);
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", "attachment; filename=\"trades-export.csv\"");
          res.status(200).send(`\ufeff${csv}`);
          return;
        }

        const skip = (query.page - 1) * query.limit;
        const [trades, total] = await Promise.all([
          prisma.trade.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: query.limit,
          }),
          prisma.trade.count({ where }),
        ]);

        res.status(200).json({
          items: trades.map((trade: unknown) => serializeTrade(trade as any)),
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/cooperative/:cooperativeId/export",
    authMiddleware,
    tradeExportLimiter,
    validateRequest({ query: cooperativeExportQuerySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const { cooperativeId } = req.params;
        const query = req.query as unknown as z.infer<typeof cooperativeExportQuerySchema>;

        const membership = await prisma.cooperativeMember.findFirst({
          where: { cooperativeId, walletAddress },
        });

        if (!membership || membership.role !== "MANAGER") {
          res.status(403).json({ error: "Forbidden: cooperative manager access required" });
          return;
        }

        const members = await prisma.cooperativeMember.findMany({
          where: { cooperativeId },
          select: { walletAddress: true },
        });
        const memberAddresses = members.map((member: { walletAddress: string }) => member.walletAddress);

        if (memberAddresses.length === 0) {
          res.status(200).json({ items: [], totals: { amountUsdc: 0, feeUsdc: 0, netUsdc: 0 } });
          return;
        }

        const where = buildCooperativeWhere(memberAddresses, query);

        if (query.format === "csv") {
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="cooperative-${cooperativeId}-statement.csv"`,
          );

          const parser = new Parser({ fields: cooperativeCsvFields, header: true });
          res.write(`\ufeff${parser.parse([])}\n`);

          let cursor: string | undefined;
          let totals = { amountUsdc: 0, feeUsdc: 0, netUsdc: 0 };

          for (;;) {
            const batch = await prisma.trade.findMany({
              where,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: COOPERATIVE_EXPORT_BATCH_SIZE,
              ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            });

            if (batch.length === 0) break;

            const rows = batch.map((trade: unknown) => {
              const row = serializeCooperativeTrade(trade as any);
              totals.amountUsdc += row.amountUsdc;
              totals.feeUsdc += row.feeUsdc;
              totals.netUsdc += row.netUsdc;
              return row;
            });

            res.write(`${parser.parse(rows)}\n`);
            cursor = (batch[batch.length - 1] as { id: string }).id;
            if (batch.length < COOPERATIVE_EXPORT_BATCH_SIZE) break;
          }

          const totalsRow = [
            "TOTALS",
            "",
            "",
            totals.amountUsdc.toFixed(2),
            totals.feeUsdc.toFixed(2),
            totals.netUsdc.toFixed(2),
            "",
            "",
            "",
            "",
            "",
            "",
          ];
          res.write(`${parser.parse([totalsRow as unknown as Record<string, unknown>])}\n`);
          res.end();
          return;
        }

        const lines: string[] = [
          `Cooperative Statement - ${cooperativeId}`,
          `Generated: ${new Date().toISOString()}`,
          `Range: ${query.dateFrom ?? "start"} to ${query.dateTo ?? "now"}`,
          "",
          "Trade ID | Buyer | Seller | Amount | Fee | Net | Status",
        ];

        let totals = { amountUsdc: 0, feeUsdc: 0, netUsdc: 0 };
        let cursor: string | undefined;

        for (;;) {
          const batch = await prisma.trade.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: COOPERATIVE_EXPORT_BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          });

          if (batch.length === 0) break;

          batch.forEach((trade: unknown) => {
            const row = serializeCooperativeTrade(trade as any);
            totals.amountUsdc += row.amountUsdc;
            totals.feeUsdc += row.feeUsdc;
            totals.netUsdc += row.netUsdc;
            lines.push(
              `${row.tradeId} | ${row.buyerAddress} | ${row.sellerAddress} | ${row.amountUsdc.toFixed(2)} | ${row.feeUsdc.toFixed(2)} | ${row.netUsdc.toFixed(2)} | ${row.status}`,
            );
          });

          cursor = (batch[batch.length - 1] as { id: string }).id;
          if (batch.length < COOPERATIVE_EXPORT_BATCH_SIZE) break;
        }

        lines.push("");
        lines.push(
          `TOTALS | Amount: ${totals.amountUsdc.toFixed(2)} | Fees: ${totals.feeUsdc.toFixed(2)} | Net: ${totals.netUsdc.toFixed(2)}`,
        );

        const pdf = buildPdf(lines);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="cooperative-${cooperativeId}-statement.pdf"`,
        );
        res.status(200).send(pdf);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export const tradeExportRoutes = createTradeExportRouter();
