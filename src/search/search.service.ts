import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const OFFICE_RANK: Record<string, number> = {
  APEX_ADMIN: 0, CONVENER: 1, CO_CONVENER: 2, GROUP_HEAD: 3,
  GROUP_LEAD: 4, GROUP_SECRETARY: 5, TREASURER: 6, TECHNOLOGY_COORDINATOR: 7,
  CHAPTER_ADMIN: 8,
};
const isLeader = (role: string) => role in OFFICE_RANK;
const LABELS: Record<string, string> = {
  APEX_ADMIN: 'Super Admin', CONVENER: 'Convener', CO_CONVENER: 'Co-Convener',
  GROUP_HEAD: 'Group Head', GROUP_LEAD: 'Group Lead', GROUP_SECRETARY: 'Group Secretary',
  TREASURER: 'Treasurer', TECHNOLOGY_COORDINATOR: 'Technology Coordinator', CHAPTER_ADMIN: 'Chapter Admin',
};

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(params: { q?: string; city?: string; category?: string; page?: number }) {
    const q = params.q?.trim();
    const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });

    const where: any = {
      active: { not: false },
      ...(params.category ? { category: contains(params.category) } : {}),
      ...(params.city ? { chapter: { city: contains(params.city) } } : {}),
      ...(q ? {
        OR: [
          { name: contains(q) }, { company: contains(q) }, { brandName: contains(q) },
          { category: contains(q) }, { subCategory: contains(q) }, { about: contains(q) },
        ],
      } : {}),
    };

    // Small/medium directories: fetch matches and rank in memory
    // (leadership first, then verified, then score). Swap to Meilisearch at scale.
    const rows = await this.prisma.member.findMany({
      where,
      take: 200,
      select: {
        name: true, slug: true, company: true, brandName: true, category: true, subCategory: true,
        verified: true, role: true, photoUrl: true, website: true, gatiScore: true,
        chapter: { select: { city: true, name: true, brandName: true, logoUrl: true } },
      },
    });

    rows.sort((a, b) => {
      const la = isLeader(a.role) ? OFFICE_RANK[a.role] : 99;
      const lb = isLeader(b.role) ? OFFICE_RANK[b.role] : 99;
      if (la !== lb) return la - lb;
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if (b.gatiScore !== a.gatiScore) return b.gatiScore - a.gatiScore;
      return a.name.localeCompare(b.name);
    });

    const results = rows.map((r) => ({
      ...r,
      isLeader: isLeader(r.role),
      roleLabel: LABELS[r.role] || r.role.replace(/_/g, ' '),
      profilePath: `/m/${r.slug}`,
    }));

    return { total: results.length, page: 1, results };
  }
}
