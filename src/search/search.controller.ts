import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  // Public, like a search engine: /api/search?q=textile&city=Meerut
  @Get()
  run(@Query('q') q?: string, @Query('city') city?: string,
      @Query('category') category?: string, @Query('page') page?: string) {
    return this.search.search({ q, city, category, page: page ? parseInt(page, 10) : 1 });
  }
}
