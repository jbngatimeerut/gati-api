import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmbeddingProvider, VoyageEmbeddingProvider, OpenAIEmbeddingProvider,
  GeminiEmbeddingProvider, LocalEmbeddingProvider,
} from './embedding.provider';

type ProfileFields = {
  name: string;
  company?: string | null;
  brandName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  about?: string | null;
  labels?: string | null;
};

// Turns a member's business profile into a search embedding, and keeps that embedding fresh as
// profiles change. This is the piece that lets "Food Industry" surface a Caterer or Spice Trader
// even though neither phrase appears verbatim in their profile.
@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private prisma: PrismaService,
    private voyage: VoyageEmbeddingProvider,
    private openai: OpenAIEmbeddingProvider,
    private gemini: GeminiEmbeddingProvider,
    private local: LocalEmbeddingProvider,
  ) {}

  // Quality-ranked provider order: Voyage and OpenAI's hosted models tend to lead Gemini on
  // retrieval benchmarks, so whichever of those has a key set wins; local always exists as the
  // no-key, no-cost floor so this array is never empty.
  private providersByPriority(): EmbeddingProvider[] {
    return [this.voyage, this.openai, this.gemini, this.local];
  }

  // Backfills anyone never indexed (pre-existing members, or a prior embed attempt that threw),
  // and upgrades anyone indexed under a stale provider (e.g. a GEMINI_API_KEY was added after
  // they were embedded locally). Runs once at boot, off the request path — new members are kept
  // current incrementally via reindexMember() at their own create/update call sites.
  async onModuleInit() {
    this.reindexMissing().catch((e) =>
      this.logger.warn(`Startup search-index backfill skipped: ${(e as Error).message}`),
    );
  }

  targetProviderName(): string {
    return this.providersByPriority().find((p) => p.available)!.name;
  }

  buildProfileText(m: ProfileFields): string {
    const labelWords = (m.labels ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean).join(', ');
    return [
      m.name, m.company, m.brandName, m.category, m.subCategory, m.about,
      labelWords ? `Specialties: ${labelWords}` : '',
    ].filter(Boolean).join('. ');
  }

  private async embed(text: string): Promise<{ vec: number[]; provider: string } | null> {
    if (!text.trim()) return null;
    const candidates = this.providersByPriority().filter((p) => p.available);
    for (const provider of candidates) {
      try {
        return { vec: await provider.embed(text), provider: provider.name };
      } catch (e) {
        this.logger.warn(`${provider.name} embedding failed, trying next provider: ${(e as Error).message}`);
      }
    }
    return null; // local is always in candidates and never throws in normal operation, so this only fires on a genuine outage
  }

  // Query text uses the same embed() path as a profile, so it always lands in the same vector
  // space as whichever provider actually produced it (important since the nominal "current"
  // provider and the one that actually succeeded can differ if Gemini's call fails mid-request).
  async embedQuery(q: string): Promise<{ vec: number[]; provider: string } | null> {
    return this.embed(q);
  }

  async reindexMember(id: string): Promise<void> {
    const m = await this.prisma.member.findUnique({
      where: { id },
      select: { id: true, name: true, company: true, brandName: true, category: true, subCategory: true, about: true, labels: true },
    });
    if (!m) return;
    const text = this.buildProfileText(m);
    const result = await this.embed(text);
    await this.prisma.member.update({
      where: { id },
      data: {
        searchEmbedding: result?.vec ?? [],
        searchEmbeddingProvider: result?.provider ?? null,
        searchIndexedAt: new Date(),
      },
    });
  }

  async reindexMissing(): Promise<void> {
    const target = this.targetProviderName();
    const stale = await this.prisma.member.findMany({
      where: {
        active: true,
        OR: [{ searchIndexedAt: null }, { searchEmbeddingProvider: { not: target } }],
      },
      select: { id: true },
    });
    for (const { id } of stale) await this.reindexMember(id);
    if (stale.length) this.logger.log(`Semantic search index refreshed for ${stale.length} member(s) via "${target}".`);
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
}
