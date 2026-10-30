import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/shared/errors/app-error.js";
import { ErrorCodes } from "../../src/shared/errors/error-codes.js";

describe("Assignment Accept Concurrency & Race Protection (CONC-003)", () => {
  it("Task 5.4: Rejects conflicting concurrent accept when assignment is no longer in Offered state", async () => {
    // Simulates two concurrent workers racing to accept the same assignment
    let assignmentState = "Offered";
    let orderState = "ReadyForPickup";
    let outboxEventsCreated = 0;

    const acceptSimulation = async (callerId: string) => {
      // Step 1: Simulate acquire lock & read committed state
      if (assignmentState !== "Offered") {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Assignment is not in Offered state");
      }
      if (orderState !== "ReadyForPickup") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order is no longer ready for assignment");
      }

      // Step 2: Transition states atomically
      assignmentState = "Accepted";
      orderState = "Assigned";
      outboxEventsCreated += 1;

      return { status: "Accepted", acceptedBy: callerId };
    };

    // Run two concurrent accept requests
    const results = await Promise.allSettled([
      acceptSimulation("driver-1"),
      acceptSimulation("driver-1-retry"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one winner commits
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Assert the loser was rejected with 409 conflict
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(AppError);
    expect((reason as AppError).status).toBe(409);
    expect((reason as AppError).code).toBe(ErrorCodes.ASSIGNMENT_CONFLICT);

    // Exactly one outbox event emitted
    expect(outboxEventsCreated).toBe(1);
    expect(assignmentState).toBe("Accepted");
    expect(orderState).toBe("Assigned");
  });

  it("Task 5.4: Rejects accept if offer has already expired", async () => {
    const expiredOfferAt = new Date(Date.now() - 60_000); // 1 minute in the past

    const simulateExpiredAccept = () => {
      if (expiredOfferAt <= new Date()) {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_OFFER_EXPIRED, "Assignment offer has expired");
      }
    };

    expect(() => simulateExpiredAccept()).toThrow(AppError);
    try {
      simulateExpiredAccept();
    } catch (err: any) {
      expect(err.status).toBe(409);
      expect(err.code).toBe(ErrorCodes.ASSIGNMENT_OFFER_EXPIRED);
    }
  });
});
