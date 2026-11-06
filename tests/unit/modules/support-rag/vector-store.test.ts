import { describe, expect, it, vi, beforeEach } from "vitest";
import { PgVectorStore } from "../../../../src/modules/support-rag/vector-store.js";
import { prisma } from "../../../../src/shared/utils/prisma.js";

describe("PgVectorStore Unit Tests", () => {
  let store: PgVectorStore;

  beforeEach(() => {
    vi.restoreAllMocks();
    store = new PgVectorStore();
  });

  it("queries similar chunks via pgvector cosine distance when embeddings are available", async () => {
    const mockEmbeddings = {
      embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
    (store as unknown as { embeddings: unknown }).embeddings = mockEmbeddings;

    vi.spyOn(prisma, "$queryRawUnsafe").mockResolvedValue([
      {
        id: "kb-cancellation-01",
        category: "cancellation",
        title: "Order Cancellation Policy",
        content: "Cancellation is allowed before pickup.",
        keywords: ["cancel"],
        similarity: 0.88,
      },
    ]);

    const results = await store.searchSimilar("can I cancel my delivery?", 2);

    expect(mockEmbeddings.embedQuery).toHaveBeenCalledWith("can I cancel my delivery?");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("kb-cancellation-01");
    expect(results[0]?.similarity).toBe(0.88);
  });

  it("falls back to lexical keyword search when pgvector query fails", async () => {
    const mockEmbeddings = {
      embedQuery: vi.fn().mockRejectedValue(new Error("Network timeout")),
    };
    (store as unknown as { embeddings: unknown }).embeddings = mockEmbeddings;

    const results = await store.searchSimilar("where is my order tracking?", 2);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category === "tracking")).toBe(true);
  });
});
