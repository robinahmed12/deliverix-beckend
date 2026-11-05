import { describe, expect, it, vi, beforeEach } from "vitest";
import { SupportRAGService } from "../../../../src/modules/support-rag/support-rag.service.js";
import { retrieveRelevantKnowledge, DELIVERIX_KNOWLEDGE_BASE } from "../../../../src/modules/support-rag/knowledge-base.js";
import { customerContextService } from "../../../../src/modules/customers/customer-context.service.js";
import { ChatOpenAI } from "@langchain/openai";

describe("SupportRAGService & Knowledge Base Unit Tests", () => {
  let service: SupportRAGService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new SupportRAGService();
  });

  describe("Knowledge Base Retrieval", () => {
    it("retrieves cancellation policy when asked about cancelling", () => {
      const results = retrieveRelevantKnowledge("can I cancel my delivery order?");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.category === "cancellation")).toBe(true);
    });

    it("retrieves tracking policy when asked about live driver location", () => {
      const results = retrieveRelevantKnowledge("where is the driver live map location?");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.category === "tracking")).toBe(true);
    });

    it("retrieves delivery attempts policy when asking about failed attempt", () => {
      const results = retrieveRelevantKnowledge("what happens if missed delivery attempts maximum?");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.category === "failure")).toBe(true);
    });
  });

  describe("Customer Support RAG Query Processing", () => {
    const mockContext: any = {
      customer: {
        id: "cust-1",
        name: "Samantha Wright",
        email: "samantha@example.com",
        phone: "+15551112222",
      },
      savedAddresses: [
        { label: "Home", line1: "742 Evergreen Terrace", city: "Springfield", isDefault: true },
      ],
      activeOrders: [
        {
          id: "order-101",
          orderNumber: "ORD-SAM-101",
          status: "InTransit",
          pickupAddress: { line1: "Hub Central" },
          deliveryAddress: { line1: "742 Evergreen Terrace" },
          promisedWindow: {
            start: new Date("2026-11-05T14:00:00Z"),
            end: new Date("2026-11-05T18:00:00Z"),
          },
          deliveryFee: "9.99",
          currencyCode: "USD",
          items: [{ name: "Espresso Beans", quantity: 2, description: "Dark roast" }],
          latestAttempt: undefined,
          recentTimeline: [
            { status: "InTransit", reasonCode: null, timestamp: new Date("2026-11-05T15:00:00Z") },
          ],
        },
      ],
      recentCompletedOrders: [],
      summary: {
        activeOrderCount: 1,
        completedOrderCount: 0,
        hasActiveDelayedOrders: false,
      },
    };

    it("synthesizes grounded response for order tracking inquiry", async () => {
      vi.spyOn(customerContextService, "buildCustomerContext").mockResolvedValue(mockContext);

      const response = await service.processCustomerQuery("user-sam", {
        message: "Where is my order right now?",
      });

      expect(response.answer).toContain("Samantha Wright");
      expect(response.answer).toContain("ORD-SAM-101");
      expect(response.answer).toContain("InTransit");
      expect(response.customerContextSummary.relevantOrderNumber).toBe("ORD-SAM-101");
      expect(response.suggestedActions).toContain("Live Tracking");
    });

    it("enforces cancellation policy guardrails when order is in transit", async () => {
      vi.spyOn(customerContextService, "buildCustomerContext").mockResolvedValue(mockContext);

      const response = await service.processCustomerQuery("user-sam", {
        message: "I want to cancel my order please.",
      });

      expect(response.answer).toContain("ORD-SAM-101");
      expect(response.answer).toContain("InTransit");
      expect(response.answer).toContain("cannot be cancelled");
    });

    it("invokes ChatOpenAI when LLM is configured and handles conversation history", async () => {
      vi.spyOn(customerContextService, "buildCustomerContext").mockResolvedValue(mockContext);

      const mockInvoke = vi.fn().mockResolvedValue({
        content: "Hello Samantha! Your order ORD-SAM-101 is currently InTransit and expected by 6:00 PM.",
      });

      (service as any).llm = { invoke: mockInvoke };

      const response = await service.processCustomerQuery("user-sam", {
        message: "When will it arrive?",
        history: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello! How can I help?" }],
      });

      expect(mockInvoke).toHaveBeenCalled();
      expect(response.answer).toContain("ORD-SAM-101");
      expect(response.retrievedPolicies.length).toBeGreaterThan(0);
    });
  });

  describe("FAQ Catalog", () => {
    it("filters FAQs by category and search keyword", () => {
      const trackingFaqs = service.getFaqs("tracking");
      expect(trackingFaqs.length).toBeGreaterThan(0);
      expect(trackingFaqs.every((f) => f.category === "tracking")).toBe(true);

      const searchFaqs = service.getFaqs(undefined, "proof");
      expect(searchFaqs.length).toBeGreaterThan(0);
      expect(searchFaqs.some((f) => f.title.includes("Proof"))).toBe(true);
    });
  });
});
