import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { EmbeddingsService } from './embeddings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LEADERSHIP } from '../auth/leadership';

@Controller('search')
export class SearchController {
  constructor(private search: SearchService, private embeddings: EmbeddingsService) {}

  // Public, like a search engine: /api/search?q=textile&city=Meerut. Every non-empty query
  // triggers a real embedding call (billed API or CPU-bound local inference) — tighter than the
  // global default so a script can't run up AI costs or peg the CPU, while still comfortably
  // covering someone typing/backspacing in the search box.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get()
  run(@Query('q') q?: string, @Query('city') city?: string,
      @Query('category') category?: string, @Query('page') page?: string) {
    return this.search.search({ q, city, category, page: page ? parseInt(page, 10) : 1 });
  }

  // Manual full reindex — useful right after a bulk import, or after adding/removing
  // GEMINI_API_KEY, rather than waiting for the next API restart's automatic backfill.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post('reindex')
  async reindex() {
    await this.embeddings.reindexMissing();
    return { ok: true };
  }
}
