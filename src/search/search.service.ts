import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';

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

// Below this cosine similarity, a member is considered unrelated to the query and only shown if
// they also literally contain the search text — keeps "Food Industry" from also matching
// everyone by pure noise while still catching cross-domain matches (Caterer, Spice Trader, ...).
const SEMANTIC_MATCH_THRESHOLD = 0.28;

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService, private embeddings: EmbeddingsService) {}

  async search(params: { q?: string; city?: string; category?: string; page?: number }) {
    const q = params.q?.trim();
    const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });

    const where: any = {
      active: { not: false },
      ...(params.category ? { category: contains(params.category) } : {}),
      ...(params.city ? { chapter: { city: contains(params.city) } } : {}),
    };

    // Filters (chapter/city/category) narrow the candidate pool at the DB level; AI semantic
    // ranking then runs only within that pool, so filters refine results without fighting the
    // semantic understanding.
    const rows = await this.prisma.member.findMany({
      where,
      take: 500,
      select: {
        id: true, name: true, slug: true, company: true, brandName: true, category: true, subCategory: true,
        about: true, verified: true, role: true, photoUrl: true, website: true, gatiScore: true, labels: true,
        searchEmbedding: true, searchEmbeddingProvider: true,
        premiumCategory: { select: { priority: true, color: true, active: true } },
        chapter: { select: { city: true, name: true, brandName: true, logoUrl: true } },
      },
    });

    const queryEmbed = q ? await this.embeddings.embedQuery(q) : null;
    const qLower = q?.toLowerCase();

    let scored = rows.map((r) => {
      let semanticScore = 0;
      if (queryEmbed && r.searchEmbeddingProvider === queryEmbed.provider && r.searchEmbedding.length) {
        semanticScore = EmbeddingsService.cosineSimilarity(queryEmbed.vec, r.searchEmbedding);
      }
      const literalMatch = qLower
        ? [r.name, r.company, r.brandName, r.category, r.subCategory, r.about, r.labels]
            .some((f) => f?.toLowerCase().includes(qLower))
        : false;
      return { ...r, semanticScore, literalMatch };
    });

    if (q) {
      // A member who is neither a literal text match nor semantically close to the query isn't
      // a relevant result — this is what actually narrows 500 candidates down to "Food Industry"
      // -shaped businesses instead of returning everyone.
      scored = scored.filter((r) => r.literalMatch || r.semanticScore >= SEMANTIC_MATCH_THRESHOLD);
    }

    scored.sort((a, b) => {
      if (q) {
        // Exact substring hits are the least ambiguous signal, so they lead; among the rest,
        // rank by how semantically close the AI judges them to the query.
        if (a.literalMatch !== b.literalMatch) return a.literalMatch ? -1 : 1;
        if (Math.abs(b.semanticScore - a.semanticScore) > 0.02) return b.semanticScore - a.semanticScore;
      }
      const la = isLeader(a.role) ? OFFICE_RANK[a.role] : 99;
      const lb = isLeader(b.role) ? OFFICE_RANK[b.role] : 99;
      if (la !== lb) return la - lb;
      // Premium category priority sits after leadership rank but ahead of verified/gatiScore —
      // it's a paid/business distinction, not a substitute for the community's actual hierarchy.
      const pa = a.premiumCategory?.active ? a.premiumCategory.priority : Number.MAX_SAFE_INTEGER;
      const pb = b.premiumCategory?.active ? b.premiumCategory.priority : Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if (b.gatiScore !== a.gatiScore) return b.gatiScore - a.gatiScore;
      return a.name.localeCompare(b.name);
    });

    const top = scored.slice(0, 200);

    // One batched query for payment status across the page's members — members stay listed
    // either way (per the directory-transparency requirement), this only adds a badge.
    const due = await this.prisma.paymentRequest.findMany({
      where: { memberId: { in: top.map((r) => r.id) }, status: 'DUE' },
      select: { memberId: true, dueAt: true },
    });
    const now = Date.now();
    const paymentByMember = new Map<string, { paymentDue: boolean; paymentOverdue: boolean }>();
    for (const d of due) {
      const prev = paymentByMember.get(d.memberId) || { paymentDue: false, paymentOverdue: false };
      prev.paymentDue = true;
      if (d.dueAt && d.dueAt.getTime() < now) prev.paymentOverdue = true;
      paymentByMember.set(d.memberId, prev);
    }

    const results = top.map((r) => {
      const { searchEmbedding, searchEmbeddingProvider, semanticScore, literalMatch, about, premiumCategory, ...rest } = r;
      return {
        ...rest,
        isLeader: isLeader(r.role),
        roleLabel: LABELS[r.role] || r.role.replace(/_/g, ' '),
        profilePath: `/m/${r.slug}`,
        premiumColor: premiumCategory?.active ? premiumCategory.color : null,
        paymentDue: paymentByMember.get(r.id)?.paymentDue ?? false,
        paymentOverdue: paymentByMember.get(r.id)?.paymentOverdue ?? false,
      };
    });

    return { total: results.length, page: 1, results };
  }
}
