export interface KnowledgeChunk {
  id: string;
  category: "tracking" | "cancellation" | "rescheduling" | "failure" | "pod" | "returns" | "general";
  title: string;
  content: string;
  keywords: string[];
}

export const DELIVERIX_KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    id: "kb-tracking-01",
    category: "tracking",
    title: "Order Tracking & Real-Time Status",
    keywords: ["track", "tracking", "status", "where is my order", "live location", "driver location", "map", "timeline"],
    content: `Deliverix provides real-time delivery order tracking through the customer portal.
- Order Statuses:
  * Pending: Order placed and awaiting warehouse readiness validation.
  * ReadyForPickup: Order packed, labeled, and placed in the dispatch queue.
  * Assigned: An eligible driver accepted the assignment offer.
  * PickedUp: Driver physically took custody of the package at pickup facility.
  * InTransit: Package is in motion between facility and destination area.
  * OutForDelivery: Driver is in your immediate neighborhood for drop-off.
  * Delivered: Successfully completed with valid Proof of Delivery.
  * Failed: An attempt could not be completed; details and reason are recorded.
  * ReturnInProgress: Package is being returned to the warehouse/sender.
  * Returned: Physical return receipt confirmed.
  * Cancelled: Order cancelled before pickup.
- Driver Live Location: For privacy and safety, live driver GPS coordinates are only shown when the order is actively in InTransit or OutForDelivery, and are automatically removed once the delivery reaches a terminal state (Delivered, Cancelled, or Returned).`,
  },
  {
    id: "kb-rescheduling-01",
    category: "rescheduling",
    title: "Delivery Rescheduling & Address Modifications",
    keywords: ["reschedule", "change time", "change date", "change address", "new address", "window", "promise", "delay"],
    content: `Deliverix allows customers to reschedule delivery windows under specific conditions:
- Permitted States for Rescheduling: Orders in 'Pending', 'ReadyForPickup', or 'Failed' (prior to a retry attempt).
- Original Promise Preservation (RSC-001): Rescheduling records a new planned delivery window while preserving the original promised date/time window for on-time performance auditing.
- Material Details Lock (BR-003, ORD-007): Destination address, package contents, and service tier CANNOT be modified once the driver has physically picked up the order ('PickedUp', 'InTransit', 'OutForDelivery'). If you moved or entered an invalid address, please contact customer support immediately.`,
  },
  {
    id: "kb-cancellation-01",
    category: "cancellation",
    title: "Order Cancellation Policy",
    keywords: ["cancel", "cancellation", "stop order", "don't want", "mistake", "refund"],
    content: `Customers can cancel orders directly through self-service before custody transfer:
- Permitted States: Orders can be cancelled while in 'Pending' or 'ReadyForPickup' status.
- Reassignment & Release (ORD-008): Cancelling an order automatically releases any active driver reservation or offer atomically without penalty.
- Post-Pickup Cancellation: Once an order reaches 'PickedUp', it is physically with the courier and cannot be cancelled directly through the app. If you refuse delivery, the driver will mark the attempt as Failed (RECIPIENT_REFUSED) and initiate a return.`,
  },
  {
    id: "kb-failure-01",
    category: "failure",
    title: "Delivery Attempts & Failure Handling",
    keywords: ["failed", "attempt", "missed delivery", "not home", "gate code", "access restricted", "retry", "maximum attempts"],
    content: `Deliverix follows strict protocols when a delivery attempt cannot be completed:
- Maximum Attempts (ATT-006): Orders support up to three (3) delivery execution attempts.
- Failure Reasons (ATT-004): Drivers must select an official failure reason code:
  * CUSTOMER_UNAVAILABLE: Recipient was not at destination and no safe drop location was authorized.
  * INCORRECT_ADDRESS: Address is missing apartment/suite number or does not physically exist.
  * ACCESS_RESTRICTED: Gated community, locked gate, or security guard denied entry without prior access code.
  * RECIPIENT_REFUSED: Recipient actively declined the package.
  * OTHER: Documented exception explained by the driver.
- What Happens Next: You will receive an immediate notification and email with the attempt outcome and instructions to schedule a retry. If all 3 attempts fail, the package automatically enters 'ReturnInProgress'.`,
  },
  {
    id: "kb-pod-01",
    category: "pod",
    title: "Proof of Delivery (POD) Standards",
    keywords: ["proof", "pod", "photo", "signature", "delivered", "stolen", "missing", "who signed"],
    content: `Every completed delivery requires verifiable Proof of Delivery (POD) meeting Deliverix quality standards (POD-001..006):
- Requirements: Recipient name plus at least one clear photo showing the package placed at your designated drop-off location (or digital signature when required by service tier).
- Security & Anti-Malware: Uploaded proof photos undergo server-side validation and scanning before being permanently linked to your order.
- Privacy (FILE-008): Proof images are stored in secure private object storage and can only be viewed by the customer who placed the order or authorized support staff.`,
  },
  {
    id: "kb-returns-01",
    category: "returns",
    title: "Returns and Facility Custody",
    keywords: ["return", "return in progress", "returned to sender", "warehouse", "facility", "custody"],
    content: `When an order cannot be delivered or return is authorized:
- Custody Tracking (RET-001..005): Every physical transfer between the driver and the warehouse/merchant is timestamped and cryptographically logged.
- Confirmation: Once received and verified by facility staff, the order status changes to 'Returned' and return receipts are issued.`,
  },
  {
    id: "kb-support-01",
    category: "general",
    title: "Contacting Deliverix Support & Escalation",
    keywords: ["support", "agent", "human", "help", "phone", "contact", "email", "hours"],
    content: `Need human assistance?
- Live Chat & AI Concierge: Available 24/7 for order status, FAQ, and rescheduling guidance.
- Email Support: support@deliverix.local (response within 2 business hours).
- Operational Hours: Fleet deliveries run 7 days a week from 8:00 AM to 9:00 PM local time.`,
  },
];

/**
 * Basic semantic keyword retriever that ranks knowledge chunks by query relevance.
 */
export function retrieveRelevantKnowledge(query: string, topK: number = 3): KnowledgeChunk[] {
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (queryTokens.length === 0) {
    return DELIVERIX_KNOWLEDGE_BASE.slice(0, topK);
  }

  const scored = DELIVERIX_KNOWLEDGE_BASE.map((chunk) => {
    let score = 0;
    const titleLower = chunk.title.toLowerCase();
    const contentLower = chunk.content.toLowerCase();

    for (const token of queryTokens) {
      if (chunk.keywords.some((kw) => kw.includes(token))) score += 5;
      if (titleLower.includes(token)) score += 3;
      if (contentLower.includes(token)) score += 1;
    }

    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, topK).map((s) => s.chunk);
}
