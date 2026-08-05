import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { EmbeddingsService } from './embeddings.service';
import {
  VoyageEmbeddingProvider, OpenAIEmbeddingProvider, GeminiEmbeddingProvider, LocalEmbeddingProvider,
} from './embedding.provider';

@Module({
  providers: [
    SearchService, EmbeddingsService,
    VoyageEmbeddingProvider, OpenAIEmbeddingProvider, GeminiEmbeddingProvider, LocalEmbeddingProvider,
  ],
  controllers: [SearchController],
  exports: [EmbeddingsService],
})
export class SearchModule {}
