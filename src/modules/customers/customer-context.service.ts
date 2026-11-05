import { prisma } from "../../shared/utils/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";

export interface CustomerRAGOrder {
  id: string;
  orderNumber: string;
  status: string;
  pickupAddress: Record<string, unknown>;
  deliveryAddress: Record<string, unknown>;
  promisedWindow: {
    start: Date | null;
    end: Date | null;
  };
  deliveryFee: string;
  currencyCode: string;
  items: Array<{
    name: string;
    quantity: number;
    description: string | null;
  }>;
  latestAttempt?: {
    attemptNumber: number;
    status: string;
    failureReasonCode: string | null;
    failureReasonText: string | null;
  } | undefined;
  recentTimeline: Array<{
    status: string;
    reasonCode: string | null;
    timestamp: Date;
  }>;
}

export interface CustomerRAGContext {
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  savedAddresses: Array<{
    label: string | null;
    line1: string;
    city: string;
    region: string | null;
    postalCode: string | null;
    isDefault: boolean;
  }>;
  activeOrders: CustomerRAGOrder[];
  recentCompletedOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
    returnedAt: Date | null;
  }>;
  summary: {
    activeOrderCount: number;
    completedOrderCount: number;
    hasActiveDelayedOrders: boolean;
  };
}

export class CustomerContextService {
  /**
   * Builds an authoritative, PII-sanitized context payload for the authenticated customer.
   * This guarantees strict customer boundary isolation (CUS-006, PRIV-005) when grounding LLM responses.
   */
  async buildCustomerContext(userId: string): Promise<CustomerRAGContext> {
    const customer = await prisma.customer.findUnique({
      where: { accountId: userId },
      include: {
        addresses: {
          where: { deletedAt: null },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!customer) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "No customer profile linked to this user account");
    }

    const activeStatuses = [
      "Pending",
      "ReadyForPickup",
      "Assigned",
      "PickedUp",
      "InTransit",
      "OutForDelivery",
      "Failed",
      "ReturnInProgress",
    ];

    const [activeOrdersRaw, recentCompletedOrdersRaw] = await Promise.all([
      prisma.deliveryOrder.findMany({
        where: {
          customerId: customer.id,
          status: { in: activeStatuses as never },
        },
        include: {
          items: true,
          attempts: {
            include: { failureReason: true },
            orderBy: { attemptNumber: "desc" },
            take: 1,
          },
          statusHistory: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.deliveryOrder.findMany({
        where: {
          customerId: customer.id,
          status: { in: ["Delivered", "Cancelled", "Returned"] as never },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveredAt: true,
          cancelledAt: true,
          returnedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const now = new Date();
    let hasActiveDelayedOrders = false;

    const activeOrders: CustomerRAGOrder[] = activeOrdersRaw.map((order) => {
      const latestAttempt = order.attempts[0];
      const isOverdue = order.promisedAtEnd ? order.promisedAtEnd < now : false;
      if (isOverdue) hasActiveDelayedOrders = true;

      const orderResult: CustomerRAGOrder = {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        pickupAddress: order.pickupAddress as Record<string, unknown>,
        deliveryAddress: order.deliveryAddress as Record<string, unknown>,
        promisedWindow: {
          start: order.promisedAtStart,
          end: order.promisedAtEnd,
        },
        deliveryFee: order.deliveryFee ? order.deliveryFee.toString() : "0.00",
        currencyCode: order.currencyCode,
        items: order.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          description: it.description,
        })),
        recentTimeline: order.statusHistory.map((sh) => ({
          status: sh.toStatus,
          reasonCode: sh.reasonCode,
          timestamp: sh.createdAt,
        })),
      };

      if (latestAttempt) {
        orderResult.latestAttempt = {
          attemptNumber: latestAttempt.attemptNumber,
          status: latestAttempt.status,
          failureReasonCode: latestAttempt.failureReason?.code ?? null,
          failureReasonText: latestAttempt.failureReasonText,
        };
      }

      return orderResult;
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      savedAddresses: customer.addresses.map((a) => ({
        label: a.label,
        line1: a.line1,
        city: a.city,
        region: a.region,
        postalCode: a.postalCode,
        isDefault: a.isDefault,
      })),
      activeOrders,
      recentCompletedOrders: recentCompletedOrdersRaw.map((ro) => ({
        id: ro.id,
        orderNumber: ro.orderNumber,
        status: ro.status,
        deliveredAt: ro.deliveredAt,
        cancelledAt: ro.cancelledAt,
        returnedAt: ro.returnedAt,
      })),
      summary: {
        activeOrderCount: activeOrders.length,
        completedOrderCount: recentCompletedOrdersRaw.length,
        hasActiveDelayedOrders,
      },
    };
  }

  /**
   * Formats the customer context into a concise markdown text block suitable for injecting
   * into LangChain prompt templates or system messages.
   */
  formatContextForPrompt(ctx: CustomerRAGContext): string {
    const lines: string[] = [];
    lines.push(`## Customer Profile`);
    lines.push(`- Name: ${ctx.customer.name}`);
    lines.push(`- Email: ${ctx.customer.email ?? "None"}`);
    lines.push(`- Saved Addresses: ${ctx.savedAddresses.length}`);
    for (const addr of ctx.savedAddresses) {
      lines.push(`  * [${addr.label ?? "Address"}] ${addr.line1}, ${addr.city}${addr.isDefault ? " (Default)" : ""}`);
    }

    lines.push(`\n## Active Orders (${ctx.activeOrders.length})`);
    if (ctx.activeOrders.length === 0) {
      lines.push(`No active orders at this time.`);
    } else {
      for (const order of ctx.activeOrders) {
        lines.push(`- Order #${order.orderNumber} (Status: ${order.status})`);
        if (order.promisedWindow.end) {
          lines.push(
            `  * Promised Delivery Window: ${order.promisedWindow.start?.toISOString() ?? ""} - ${order.promisedWindow.end.toISOString()}`,
          );
        }
        lines.push(`  * Items: ${order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}`);
        if (order.latestAttempt?.failureReasonCode) {
          lines.push(
            `  * Latest Attempt Failed: Reason: ${order.latestAttempt.failureReasonCode} (${order.latestAttempt.failureReasonText ?? "No details"})`,
          );
        }
        if (order.recentTimeline.length > 0 && order.recentTimeline[0]) {
          lines.push(
            `  * Latest Event: ${order.recentTimeline[0].status} at ${order.recentTimeline[0].timestamp.toISOString()}`,
          );
        }
      }
    }

    lines.push(`\n## Recent Order History (${ctx.recentCompletedOrders.length})`);
    for (const ro of ctx.recentCompletedOrders) {
      lines.push(`- Order #${ro.orderNumber}: ${ro.status} (Delivered: ${ro.deliveredAt?.toISOString() ?? "N/A"})`);
    }

    return lines.join("\n");
  }
}

export const customerContextService = new CustomerContextService();
