import { OpenAIEmbeddings } from "@langchain/openai";
import { prisma } from "../../shared/utils/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/utils/logger.js";
import { DELIVERIX_KNOWLEDGE_BASE, retrieveRelevantKnowledge, type KnowledgeChunk } from "./knowledge-base.js";

export interface VectorKnowledgeChunk extends KnowledgeChunk {
  similarity?: number;
}

export class PgVectorStore {
  private embeddings: OpenAIEmbeddings | null = null;
  private hasInitialized = false;

  constructor() {
    this.initEmbeddings();
  }

  private initEmbeddings() {
    if (env.OPENROUTER_API_KEY) {
      this.embeddings = new OpenAIEmbeddings({
        apiKey: env.OPENROUTER_API_KEY,
        model: "text-embedding-3-small",
        configuration: {
          baseURL: "https://openrouter.ai/api/v1",
        },
      });
    }
  }

  /**
   * Ensures the PostgreSQL `support_knowledge_chunks` table has the domain knowledge chunks
   * and their 1536-dimensional embeddings indexed using pgvector HNSW.
   */
  async ensureKnowledgeBaseVectorized(): Promise<void> {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    if (!this.embeddings) {
      logger.warn("OpenRouter API key not configured. Skipping pgvector knowledge base embedding generation.");
      return;
    }

    try {
      // Check how many chunks are already populated
      const count = await prisma.supportKnowledgeChunk.count();
      if (count >= DELIVERIX_KNOWLEDGE_BASE.length) {
        return;
      }

      logger.info({ currentCount: count, total: DELIVERIX_KNOWLEDGE_BASE.length }, "Seeding support knowledge base chunks into pgvector...");

      for (const chunk of DELIVERIX_KNOWLEDGE_BASE) {
        const textToEmbed = `${chunk.title}\n${chunk.content}\nKeywords: ${chunk.keywords.join(", ")}`;
        const vector = await this.embeddings.embedQuery(textToEmbed);
        const vectorStr = `[${vector.join(",")}]`;

        await prisma.$executeRawUnsafe(
          `
          INSERT INTO support_knowledge_chunks (id, category, title, content, keywords, embedding, "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6::vector, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            keywords = EXCLUDED.keywords,
            embedding = EXCLUDED.embedding,
            "updatedAt" = NOW();
          `,
          chunk.id,
          chunk.category,
          chunk.title,
          chunk.content,
          chunk.keywords,
          vectorStr,
        );
      }

      logger.info("Successfully seeded knowledge base embeddings in PostgreSQL via pgvector.");
    } catch (err: unknown) {
      logger.error({ err }, "Failed to seed knowledge base embeddings into pgvector.");
    }
  }

  /**
   * Searches the support knowledge base using pgvector cosine similarity distance (`<=>`).
   * Falls back gracefully to lexical matching if embeddings or database search are unavailable.
   */
  async searchSimilar(query: string, topK: number = 3): Promise<VectorKnowledgeChunk[]> {
    if (this.embeddings) {
      try {
        const queryVector = await this.embeddings.embedQuery(query);
        const vectorStr = `[${queryVector.join(",")}]`;

        const rows = await prisma.$queryRawUnsafe<
          Array<{
            id: string;
            category: KnowledgeChunk["category"];
            title: string;
            content: string;
            keywords: string[];
            similarity: number;
          }>
        >(
          `
          SELECT id, category, title, content, keywords,
                 (1 - (embedding <=> $1::vector)) AS similarity
          FROM support_knowledge_chunks
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $2;
          `,
          vectorStr,
          topK,
        );

        if (rows && rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            category: r.category,
            title: r.title,
            content: r.content,
            keywords: r.keywords || [],
            similarity: Number(r.similarity),
          }));
        }
      } catch (err: unknown) {
        logger.warn({ err }, "pgvector similarity search failed; falling back to lexical matching.");
      }
    }

    // Fallback: lexical keyword matching
    const lexicalChunks = retrieveRelevantKnowledge(query, topK);
    return lexicalChunks.map((c) => ({ ...c, similarity: 1.0 }));
  }
}

export const pgVectorStore = new PgVectorStore();
