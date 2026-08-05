import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AuditEntry {
  actorId?: string; actorName?: string; role?: string;
  action: string; entity?: string; entityId?: string;
  summary?: string; meta?: any; ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Append-only. There is no update/delete path by design.
  record(e: AuditEntry) {
    return this.prisma.auditLog.create({ data: e as any });
  }

  list(params: { action?: string; entity?: string; take?: number; cursor?: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.action ? { action: params.action } : {}),
        ...(params.entity ? { entity: params.entity } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.take ?? 50, 200),
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  }
}
