import { Injectable, Logger } from '@nestjs/common';

export interface EmbeddingProvider {
  readonly name: string;
  readonly available: boolean;
  embed(text: string): Promise<number[]>;
}

// Anthropic's recommended embeddings partner (Anthropic itself has no embeddings API). Tends to
// lead OpenAI/Gemini on retrieval-quality benchmarks, so it's tried first when its key is set.
@Injectable()
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'voyage';
  private readonly apiKey = process.env.VOYAGE_API_KEY;
  get available() { return !!this.apiKey; }

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: [text], model: 'voyage-3' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Voyage embedding request failed (${res.status}): ${body}`);
    }
    const json: any = await res.json();
    const values = json?.data?.[0]?.embedding;
    if (!Array.isArray(values)) throw new Error('Voyage embedding response missing values');
    return values as number[];
  }
}

// Strong general-purpose quality (text-embedding-3-large), no free tier — billed from the first
// call. Tried second, after Voyage.
@Injectable()
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  private readonly apiKey = process.env.OPENAI_API_KEY;
  get available() { return !!this.apiKey; }

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: text, model: 'text-embedding-3-large' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI embedding request failed (${res.status}): ${body}`);
    }
    const json: any = await res.json();
    const values = json?.data?.[0]?.embedding;
    if (!Array.isArray(values)) throw new Error('OpenAI embedding response missing values');
    return values as number[];
  }
}

// Google's free-tier embedding API (aistudio.google.com — no billing required for the free
// quota). Mid-pack quality, but genuinely free — tried third, after Voyage and OpenAI.
@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  private readonly apiKey = process.env.GEMINI_API_KEY;
  get available() { return !!this.apiKey; }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT' }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini embedding request failed (${res.status}): ${body}`);
    }
    const json: any = await res.json();
    const values = json?.embedding?.values;
    if (!Array.isArray(values)) throw new Error('Gemini embedding response missing values');
    return values as number[];
  }
}

// Fully local and offline — all-MiniLM-L6-v2 via transformers.js. Always available (no key, no
// network dependency, no cost), so semantic search works the moment this feature ships and never
// has nothing left to fall back to. Model weights (~90MB) download once to a local cache.
@Injectable()
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  readonly available = true;
  private readonly logger = new Logger(LocalEmbeddingProvider.name);
  private pipelinePromise: Promise<any> | null = null;

  private getPipeline(): Promise<any> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const { pipeline } = await import('@xenova/transformers');
        this.logger.log('Loading local embedding model (Xenova/all-MiniLM-L6-v2)…');
        return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      })();
    }
    return this.pipelinePromise;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }
}
