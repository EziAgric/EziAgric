import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { computeAuditEntryHash } from './auditChain';

// Ensure a single instance of Prisma Client is used across the application
declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  client.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<unknown>) => {
    const model = String(params.model ?? "");
    const data = params.args?.data as Record<string, unknown> | undefined;

    if (!data) {
      return next(params);
    }

    if (model === 'User' && typeof data.walletAddress === 'string') {
      data.walletAddress = data.walletAddress.toLowerCase();
    }

    if (model === 'Trade') {
      if (typeof data.buyerAddress === 'string') {
        data.buyerAddress = data.buyerAddress.toLowerCase();
      }
      if (typeof data.sellerAddress === 'string') {
        data.sellerAddress = data.sellerAddress.toLowerCase();
      }
    }

    if (model === 'Dispute' && typeof data.initiator === 'string') {
      data.initiator = data.initiator.toLowerCase();
    }

    // Hash-chain every AdminActionAudit write so tampering with a past row is
    // detectable by re-verifying the chain (see AdminAuditService.verifyChain).
    if (model === 'AdminActionAudit' && params.action === 'create') {
      const last = await client.adminActionAudit.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
      const prevHash = last?.hash ?? '';
      const createdAt = (data.createdAt as Date | undefined) ?? new Date();
      data.createdAt = createdAt;
      data.prevHash = prevHash;
      data.hash = computeAuditEntryHash(prevHash, {
        action: data.action as string,
        actorAddress: data.actorAddress as string,
        targetReference: data.targetReference as string | null | undefined,
        note: data.note as string | null | undefined,
        createdAt,
      });
    }

    return next(params);
  });

  return client;
};

export const prisma = global.prisma ?? prismaClientSingleton();

if (env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
