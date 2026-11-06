import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { env } from "../../config/env.js";
import { customerContextService } from "../customers/customer-context.service.js";
import { DELIVERIX_KNOWLEDGE_BASE, type KnowledgeChunk } from "./knowledge-base.js";
import { pgVectorStore, type VectorKnowledgeChunk } from "./vector-store.js";
import type { SupportChatInput } from "./support-rag.schemas.js";

export interface SupportChatResponse {
  answer: string;
  retrievedPolicies: Array<{ id: string; title: string; category: string; similarity?: number | undefined }>;
  customerContextSummary: {
    customerName: string;
    activeOrdersCount: number;
    relevantOrderNumber: string | null;
  };
  suggestedActions: string[];
}

export class SupportRAGService {
  private llm: ChatOpenAI | null = null;

  constructor() {
    this.initLLM();
  }

  private initLLM() {
    if (env.OPENROUTER_API_KEY) {
      this.llm = new ChatOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        modelName: env.OPENROUTER_MODEL,
        temperature: 0.2,
        maxTokens: 800,
        configuration: {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": "https://deliverix.local",
            "X-Title": "Deliverix Customer Support Concierge",
          },
        },
      });
    }
  }

  /**
   * Main RAG conversation pipeline:
   * 1. Retrieves customer's authoritative live order & profile state (CUS-006, PRIV-005).
   * 2. Retrieves relevant Deliverix delivery policies and SOPs.
   * 3. Prompts the OpenRouter LLM with grounded context.
   * 4. Synthesizes suggested customer actions based on state.
   */
  async processCustomerQuery(userId: string, input: SupportChatInput): Promise<SupportChatResponse> {
    // 1. Dynamic Customer Context Retrieval
    const fullCustomerContext = await customerContextService.buildCustomerContext(userId);

    // Filter context if specific orderId is targeted
    const relevantActiveOrder = input.orderId
      ? fullCustomerContext.activeOrders.find((o) => o.id === input.orderId)
      : fullCustomerContext.activeOrders[0];

    const customerMarkdown = customerContextService.formatContextForPrompt(fullCustomerContext);

    // 2. Semantic Knowledge Base Retrieval (pgvector dense cosine similarity search)
    await pgVectorStore.ensureKnowledgeBaseVectorized();
    const relevantChunks = await pgVectorStore.searchSimilar(input.message, 3);
    const policyMarkdown = relevantChunks
      .map((c) => `### Policy: ${c.title}\n${c.content}`)
      .join("\n\n");

    // 3. Build Suggested Actions based on current active order status
    const suggestedActions = this.computeSuggestedActions(relevantActiveOrder?.status);

    // 4. Construct Grounded Prompt
    const systemPrompt = `You are the Deliverix AI Customer Support Concierge. You help customers with delivery inquiries, tracking, rescheduling, and delivery policies.

### CRITICAL OPERATING RULES:
1. ONLY state facts present in the CUSTOMER CONTEXT and DELIVERIX DELIVERY POLICIES below. NEVER invent tracking details, courier names, or statuses.
2. Address Changes: Destination addresses, packages, or services CANNOT be modified once an order has been picked up (BR-003, ORD-007).
3. Cancellation: Orders can only be cancelled while in 'Pending' or 'ReadyForPickup' (ORD-008). Once picked up, cancel is not allowed.
4. Rescheduling: Customers can reschedule orders in 'Pending', 'ReadyForPickup', or 'Failed' (prior to next attempt).
5. Delivery Attempts: Deliverix allows a maximum of 3 attempts before returning to sender (ATT-006).
6. Be concise, polite, empathetic, and clear. Format key details with bullet points.

---
### CURRENT CUSTOMER CONTEXT:
${customerMarkdown}

---
### RELEVANT DELIVERIX POLICIES:
${policyMarkdown}`;

    // 5. Build conversation history
    const messages: BaseMessage[] = [new SystemMessage(systemPrompt)];

    if (input.history && input.history.length > 0) {
      for (const h of input.history) {
        if (h.role === "user") messages.push(new HumanMessage(h.content));
        else if (h.role === "assistant") messages.push(new AIMessage(h.content));
      }
    }

    messages.push(new HumanMessage(input.message));

    // 6. Invoke LLM or Grounded Fallback
    let answer = "";
    if (this.llm) {
      try {
        const response = await this.llm.invoke(messages);
        answer = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      } catch (err) {
        // Fallback to grounded local synthesis if API fails or rate limited
        answer = this.synthesizeGroundedFallback(input.message, fullCustomerContext, relevantChunks);
      }
    } else {
      // Deterministic grounded response when no API key is provided (local dev / tests)
      answer = this.synthesizeGroundedFallback(input.message, fullCustomerContext, relevantChunks);
    }

    return {
      answer,
      retrievedPolicies: relevantChunks.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        ...(c.similarity !== undefined ? { similarity: c.similarity } : {}),
      })),
      customerContextSummary: {
        customerName: fullCustomerContext.customer.name,
        activeOrdersCount: fullCustomerContext.activeOrders.length,
        relevantOrderNumber: relevantActiveOrder ? relevantActiveOrder.orderNumber : null,
      },
      suggestedActions,
    };
  }

  /**
   * Computes contextual quick-action buttons for customer UI.
   */
  private computeSuggestedActions(orderStatus?: string): string[] {
    if (!orderStatus) {
      return ["View FAQ", "Contact Human Support", "Track Delivery"];
    }

    switch (orderStatus) {
      case "Pending":
      case "ReadyForPickup":
        return ["Track Order", "Cancel Order", "Reschedule Window"];
      case "Assigned":
      case "PickedUp":
      case "InTransit":
      case "OutForDelivery":
        return ["Live Tracking", "Delivery Instructions", "Contact Support"];
      case "Failed":
        return ["Reschedule Retry Attempt", "Check Failure Reason", "Contact Support"];
      default:
        return ["View Order History", "Contact Support"];
    }
  }

  /**
   * Deterministic grounded response synthesizer used when OpenRouter API is unavailable or in offline/test mode.
   */
  private synthesizeGroundedFallback(
    query: string,
    context: Awaited<ReturnType<typeof customerContextService.buildCustomerContext>>,
    policies: KnowledgeChunk[],
  ): string {
    const qLower = query.toLowerCase();
    const activeOrder = context.activeOrders[0];

    if (qLower.includes("where") || qLower.includes("track") || qLower.includes("status")) {
      if (activeOrder) {
        const attemptInfo = activeOrder.latestAttempt?.failureReasonCode
          ? ` Last attempt had note: ${activeOrder.latestAttempt.failureReasonCode}.`
          : "";
        return `Hello ${context.customer.name}! Your order **#${activeOrder.orderNumber}** is currently **${activeOrder.status}**.${attemptInfo} You can view full tracking events in your customer timeline.`;
      }
      return `Hello ${context.customer.name}! You do not currently have any active orders out for delivery. You can review your past completed deliveries in your order history.`;
    }

    if (qLower.includes("cancel")) {
      if (activeOrder) {
        if (activeOrder.status === "Pending" || activeOrder.status === "ReadyForPickup") {
          return `Your order **#${activeOrder.orderNumber}** is currently in **${activeOrder.status}** status, so you are eligible to cancel it directly through the app before driver pickup.`;
        }
        return `Order **#${activeOrder.orderNumber}** is currently in **${activeOrder.status}** status. Under Deliverix policy, orders cannot be cancelled once a driver has already picked up the package.`;
      }
      return `Orders can be cancelled free of charge while in 'Pending' or 'ReadyForPickup' status before courier pickup.`;
    }

    if (qLower.includes("reschedule") || qLower.includes("change time") || qLower.includes("address")) {
      return `Under Deliverix policy, delivery rescheduling is available for orders in 'Pending', 'ReadyForPickup', or after a 'Failed' attempt. Material address modifications cannot be made once the package is in transit.`;
    }

    if (policies.length > 0 && policies[0]) {
      return `According to Deliverix policy on **${policies[0].title}**:\n\n${policies[0].content}`;
    }

    return `Hello ${context.customer.name}, I am your Deliverix Support Concierge. How can I assist you with your orders or delivery today?`;
  }

  /**
   * Public FAQ catalog
   */
  getFaqs(category?: string, search?: string): KnowledgeChunk[] {
    let result = DELIVERIX_KNOWLEDGE_BASE;
    if (category) {
      result = result.filter((k) => k.category === category);
    }
    if (search) {
      const sLower = search.toLowerCase();
      result = result.filter((k) => k.title.toLowerCase().includes(sLower) || k.content.toLowerCase().includes(sLower));
    }
    return result;
  }
}

export const supportRAGService = new SupportRAGService();
