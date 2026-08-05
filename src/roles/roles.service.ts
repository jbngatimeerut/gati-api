import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ROLES, Capability, Scope } from '../hierarchy/permissions';

@Injectable()
export class RolesService implements OnModuleInit {
  private cache = new Map<string, any>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() { await this.reload(); }

  async reload() {
    let rows: any[] = [];
    try { rows = await this.prisma.roleDef.findMany({ where: { active: true } }); } catch { /* pre-migrate */ }
    this.cache.clear();
    const source = rows.length ? rows : DEFAULT_ROLES;
    for (const r of source) this.cache.set(r.key, r);
  }

  get(key: string) { return this.cache.get(key) ?? DEFAULT_ROLES.find((r) => r.key === key); }
  capabilities(key: string): Capability[] { return this.get(key)?.capabilities ?? []; }
  scope(key: string): Scope { return (this.get(key)?.scopeLevel ?? 'SELF') as Scope; }
  canOnboard(key: string): string[] { return this.get(key)?.canOnboard ?? []; }
  has(key: string, cap: Capability) { return this.capabilities(key).includes(cap); }
  all() { return Array.from(this.cache.values()).sort((a, b) => a.rank - b.rank); }

  // Super-admin can edit/add roles at runtime.
  async upsert(def: any) {
    const saved = await this.prisma.roleDef.upsert({ where: { key: def.key }, update: def, create: def });
    await this.reload();
    return saved;
  }
}
