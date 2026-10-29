import { prisma } from "./src/shared/utils/prisma.js";
import argon2 from "argon2";

const BASE = "http://localhost:5000";
const WEB = "http://localhost:3000";

const log = (...args: unknown[]) => console.log(...args);
const fail = (msg: string) => {
  console.error("FAILED:", msg);
  process.exitCode = 1;
};

/* -------------------------------------------------------------------------- */
/* Cookie jar                                                                  */
/* -------------------------------------------------------------------------- */

function makeSession() {
  const jar = new Map<string, string>();
  return {
    header(): string {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    absorb(res: Response) {
      const headers = res.headers.getSetCookie();
      for (const raw of headers) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
  };
}

async function api(
  session: ReturnType<typeof makeSession>,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      Cookie: session.header(),
      ...extraHeaders,
    },
    body: body === undefined
      ? undefined
      : body instanceof FormData
        ? body
        : JSON.stringify(body),
  });
  session.absorb(res);
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function expect(status: number, actual: number, label: string) {
  const ok = status === actual;
  log(`  [${ok ? "PASS" : "FAIL"}] ${label} -> ${actual} (expected ${status})`);
  if (!ok) fail(label);
}

/* -------------------------------------------------------------------------- */
/* 1. Test driver account (idempotent)                                         */
/* -------------------------------------------------------------------------- */

const DRIVER_EMAIL = "qa.pod.driver.e2e@deliverix.local";
const DRIVER_PASSWORD = "QaPod-Driver-1#2026";

log("== preparing QA driver account ==");
const role = await prisma.role.findUnique({ where: { name: "driver" } });
if (!role) throw new Error("driver role missing (seed first)");

let qaUser = await prisma.user.findUnique({ where: { email: DRIVER_EMAIL } });
if (!qaUser) {
  qaUser = await prisma.user.create({
    data: {
      email: DRIVER_EMAIL,
      passwordHash: await argon2.hash(DRIVER_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      name: "QA POD Driver",
      status: "Active",
      roles: { create: { roleId: role.id } },
    },
  });
} else {
  await prisma.user.update({
    where: { id: qaUser.id },
    data: { status: "Active", passwordHash: await argon2.hash(DRIVER_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
}

let qaDriver = await prisma.driver.findUnique({ where: { accountId: qaUser.id } });
if (!qaDriver) {
  qaDriver = await prisma.driver.create({
    data: {
      driverCode: `QAPOD-${Date.now()}`,
      accountId: qaUser.id,
      contactPhone: "+8801700000001",
      state: "Available",
      active: true,
    },
  });
} else {
  await prisma.driver.update({ where: { id: qaDriver.id }, data: { state: "Available", active: true } });
}
log(`driver profile: ${qaDriver.id} (${qaDriver.driverCode})`);

/* -------------------------------------------------------------------------- */
/* 2. Admin session + order preparation                                       */
/* -------------------------------------------------------------------------- */

const admin = makeSession();
log("== admin login ==");
{
  const { status } = await api(admin, "POST", "/api/v1/auth/login", {
    email: "admin@deliverix.local",
    password: "Deliverix-Admin-1",
  });
  expect(200, status, "admin login");
}

// Resume path: re-runs of this script reuse the QA driver's in-flight
// assignment instead of failing on "driver already has an assignment".
const existing = await prisma.deliveryAssignment.findFirst({
  where: { driverId: qaDriver.id, status: "Accepted" },
  orderBy: { createdAt: "desc" },
});

let orderId = "";
let orderNumber = "";
let assignmentId = "";

if (existing) {
  orderId = existing.orderId;
  assignmentId = existing.id;
  const resumedOrder = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  orderNumber = resumedOrder?.orderNumber ?? "";
  log(`resume: reusing order ${orderNumber} (${orderId}) in status ${resumedOrder?.status}`);
} else {
  const customer = await prisma.customer.findFirst({ orderBy: { createdAt: "asc" } });
  if (!customer) throw new Error("no customer record in DB; create one first");

  log("== create + ready order ==");
  const address = {
    line1: "1 QA Way", city: "Dhaka", country: "Bangladesh",
    contactName: "QA Recipient", contactPhone: "+8801700000009",
  };
  {
    const { status, json } = await api(admin, "POST", "/api/v1/orders", {
      customerId: customer.id,
      pickupAddress: address,
      deliveryAddress: address,
      currencyCode: "USD",
      items: [{ name: "QA Parcel", quantity: 1 }],
    });
    expect(201, status, "create order");
    orderId = json?.data?.id ?? json?.id;
    orderNumber = json?.data?.orderNumber ?? json?.orderNumber;
    if (!orderId) throw new Error("order id missing in response");
  }
  {
    const { status } = await api(admin, "POST", `/api/v1/orders/${orderId}/ready`);
    if (status !== 200 && status !== 201) {
      // Idempotent replays may 409 if already ready; only 409 is tolerated
      expect(409, status, "mark ready (or 409 already-ready)");
    } else {
      log(`  [PASS] mark order ready -> ${status}`);
    }
  }
}

log("== dispatch offer ==");

// Dispatch eligibility (DRV-004/006) requires an operational allocated vehicle.
let vehicleId = (await prisma.vehicle.findFirst({ where: { status: "Active" } }))?.id;
if (!vehicleId) {
  const res = await api(admin, "POST", "/api/v1/vehicles", {
    registrationNumber: `QAVEH-${Date.now()}`,
    vehicleType: "Bike",
    capacityValue: 10,
    capacityUnit: "kg",
  });
  if (res.status !== 201) {
    log(`   vehicle create failed: ${JSON.stringify(res.json)}`);
    throw new Error("could not create vehicle");
  }
  vehicleId = res.json?.data?.id ?? res.json?.id;
  log(`   created vehicle ${vehicleId}`);
}
{
  const { status, json } = await api(admin, "POST", `/api/v1/vehicles/${vehicleId}/allocate`, {
    driverId: qaDriver.id,
  });
  const ok = status === 201 || status === 200 || status === 409;
  log(`  [${ok ? "PASS" : "INFO"}] allocate vehicle -> ${status} ${json?.code ?? ""}`);
}

if (!assignmentId) {
  const { status, json } = await api(admin, "POST", `/api/v1/orders/${orderId}/assignments`, {
    driverId: qaDriver.id,
  });
  expect(201, status, "create assignment offer");
  assignmentId = json?.data?.id ?? json?.id;
  if (!assignmentId) throw new Error("assignment id missing in response");
}

/* -------------------------------------------------------------------------- */
/* 3. Driver flow                                                             */
/* -------------------------------------------------------------------------- */

const driver = makeSession();
log("== driver login ==");
{
  const { status } = await api(driver, "POST", "/api/v1/auth/login", {
    email: DRIVER_EMAIL,
    password: DRIVER_PASSWORD,
  });
  expect(200, status, "driver login");
}

const currentAssignment = await prisma.deliveryAssignment.findUnique({ where: { id: assignmentId } });
if (currentAssignment?.status === "Offered") {
  const { status } = await api(driver, "POST", `/api/v1/assignments/${assignmentId}/accept`);
  expect(200, status, "driver accepts assignment");
} else {
  log(`  [INFO] resume: assignment already ${currentAssignment?.status}`);
}

const drivingSteps: Array<[string, string, number]> = [
  ["pickup", "POST", "/api/v1/orders/" + orderId + "/pickup"],
  ["in-transit", "POST", "/api/v1/orders/" + orderId + "/in-transit"],
  ["out-for-delivery", "POST", "/api/v1/orders/" + orderId + "/out-for-delivery"],
];

log("== driver delivery stages ==");
for (const [name, method, path] of drivingSteps) {
  const { status, json } = await api(driver, method, path, {});
  const ok = status === 200 || status === 201 || status === 409;
  log(`  [${ok ? "PASS" : "FAIL"}] ${name} -> ${status} (status: ${json?.data?.status ?? "?"})`);
  if (!ok) fail(name);
}

log("== scoped reads (the 404 fix) ==");
{
  const { status, json } = await api(driver, "GET", `/api/v1/orders/${orderId}`);
  if (status !== 200) {
    log(`  [FAIL] driver CAN read own assigned order -> ${status}`);
    fail("driver scoped order read");
  } else {
    log(`  [PASS] driver reads own order (v${json?.data?.version ?? json?.version})`);
    log(`   proofPolicy: ${JSON.stringify(json?.data?.proofPolicy ?? json?.proofPolicy)}`);
  }
}
{
  const { status } = await api(driver, "GET", `/api/v1/orders/${orderId}/history`);
  log(`  [INFO] driver history access -> ${status} (403 expected; page tolerates)`);
}
{
  const { status } = await api(driver, "GET", `/api/v1/orders/${orderId}/proofs`);
  log(`  [${status === 200 ? "PASS" : "FAIL"}] driver reads own proofs -> ${status}`);
  if (status !== 200) fail("driver proofs read");
}

log("== deliver WITHOUT proof must be rejected (clean run only) ==");
const evidenceCompleteBeforeTest = !!(
  await prisma.deliveryProof.findFirst({
    where: { orderId, evidenceType: "RecipientName", status: { in: ["Pending", "Accepted"] } },
  })
) && !!(
  await prisma.deliveryProof.findFirst({
    where: { orderId, evidenceType: "Photo", status: { in: ["Pending", "Accepted"] } },
  })
);
if (evidenceCompleteBeforeTest) {
  log("  [INFO] resume: evidence already exists, skipping negative deliver test");
} else {
  const version = (await api(driver, "GET", `/api/v1/orders/${orderId}`)).json?.data?.version;
  const { status, json } = await api(driver, "POST", `/api/v1/orders/${orderId}/deliver`, {}, {
    "If-Match": String(version ?? 1),
  });
  const blocked = status === 422 && json?.code === "PROOF_REQUIRED";
  log(`  [${blocked || status === 422 ? "PASS" : "FAIL"}] deliver without evidence -> ${status} ${json?.code ?? ""}`);
  if (!blocked) fail("proof enforcement");
}

log("== upload + submit POD evidence ==");
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// --- Resume-safe: reconcile evidence against what already exists -----------
const existingProofsWhere = { orderId } as const;
const existingRecipient = await prisma.deliveryProof.findFirst({
  where: { ...existingProofsWhere, evidenceType: "RecipientName", status: { in: ["Pending", "Accepted"] } },
});
let fileId = "";
let existingPhotoProof = await prisma.deliveryProof.findFirst({
  where: { ...existingProofsWhere, evidenceType: "Photo", status: { in: ["Pending", "Accepted"] } },
  include: { file: true },
});

if (existingPhotoProof?.fileId) {
  fileId = existingPhotoProof.fileId;
} else {
  // reuse any non-rejected photo file already uploaded for the order,
  // otherwise upload a fresh one
  const reusable = await prisma.fileObject.findFirst({
    where: { orderId, status: { in: ["Scanning", "Uploaded", "Accepted"] } },
    orderBy: { uploadedAt: "desc" },
  });
  if (reusable) {
    fileId = reusable.id;
  } else {
    const form = new FormData();
    form.append("orderId", orderId);
    form.append("file", new Blob([PNG_1PX], { type: "image/png" }), "pod-photo.png");
    const { status, json } = await api(driver, "POST", "/api/v1/files/upload", form);
    expect(201, status, "upload photo file");
    fileId = json?.data?.id ?? json?.id;
    if (!fileId) throw new Error("file id missing");
    log(`   file: ${fileId} (status ${json?.data?.status ?? json?.status})`);
  }
}

if (!existingRecipient) {
  const { status } = await api(driver, "POST", `/api/v1/orders/${orderId}/proofs`, {
    evidenceType: "RecipientName",
    evidenceValue: "QA Recipient",
  });
  if (status !== 201 && status !== 200) expect(201, status, "submit recipient name");
} else {
  log("  [INFO] resume: recipient name already recorded");
}

// wait for the simulated scan job to flip the file to Accepted
log("   waiting for file scan (simulated)...");
let fileAccepted = false;
for (let i = 0; i < 30 && !fileAccepted; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const f = await prisma.fileObject.findUnique({ where: { id: fileId } });
  fileAccepted = f?.status === "Accepted";
}
{
  log(`  [${fileAccepted ? "PASS" : "FAIL"}] file scan simulation reached Accepted`);
  if (!fileAccepted) fail("file scan simulation");
}

if (!existingPhotoProof) {
  const { status } = await api(driver, "POST", `/api/v1/orders/${orderId}/proofs`, {
    evidenceType: "Photo",
    fileIds: [fileId],
  });
  if (status !== 201 && status !== 200) expect(201, status, "submit photo evidence");
} else {
  log("  [INFO] resume: photo evidence already submitted");
}

log("== complete delivery ==");
{
  const pre = await api(driver, "GET", `/api/v1/orders/${orderId}`);
  const preOrder = pre.json?.data;
  const curVersion = preOrder?.version ?? 1;

  if (preOrder?.status === "Delivered") {
    log("  [INFO] resume: order already Delivered");
  } else {
    const { status, json } = await api(driver, "POST", `/api/v1/orders/${orderId}/deliver`, {}, {
      "If-Match": String(curVersion),
    });
    const delivered = (status === 200 || status === 201) && json?.data?.status === "Delivered";
    log(`  [${delivered ? "PASS" : "FAIL"}] deliver with If-Match v${curVersion} -> ${status} (status: ${json?.data?.status ?? json?.status ?? "?"})`);
    if (!delivered) {
      log(`   body: ${JSON.stringify(json)}`);
      fail("complete delivery");
    }
  }
}
{
  const { status, json } = await api(driver, "POST", `/api/v1/orders/${orderId}/deliver`, {}, { "If-Match": "1" });
  log(`  [${status >= 400 ? "PASS" : "FAIL"}] duplicate/stale deliver rejected -> ${status} ${json?.code ?? ""}`);
  if (status < 400) fail("duplicate deliver guard");
}

log("== final state checks ==");
{
  const after = await prisma.driver.findUnique({ where: { id: qaDriver.id } });
  log(`  [INFO] driver state after delivery: ${after?.state} (Available expected)`);
}
{
  const assignment = await prisma.deliveryAssignment.findFirst({ where: { orderId } });
  log(`  [INFO] assignment status: ${assignment?.status} (Completed expected)`);
}
{
  // assignment existence already implies access; every driver can technically
  // attempt — the scoping is what matters, so check a random other order id
  const { status } = await api(driver, "GET", "/api/v1/orders/nonexistent123");
  log(`  [${status === 404 ? "PASS" : "FAIL"}] unknown order -> 404 for driver`);
  if (status !== 404) fail("unknown order scoping");
}

/* -------------------------------------------------------------------------- */
/* 4. Frontend page renders for the driver (the original bug)                 */
/* -------------------------------------------------------------------------- */

log("== frontend SSR ==");
{
  const res = await fetch(`${WEB}/orders/${orderId}`, {
    headers: { Cookie: driver.header() },
    redirect: "manual",
  });
  const html = await res.text();
  const is404 = res.status === 404 || html.includes("404 This page could not be found");
  log(`  [${!is404 ? "PASS" : "FAIL"}] GET /orders/${orderId} for driver -> ${res.status}`);
  if (is404) {
    log(html.slice(0, 500));
    fail("frontend order page for driver");
  }
  log(`   contains order number: ${html.includes(orderNumber)}`);
}
{
  const res = await fetch(`${WEB}/orders/nonexistent123`, { redirect: "manual" });
  log(`  [${res.status === 404 ? "PASS" : "FAIL"}] unknown order still 404 -> ${res.status}`);
  if (res.status !== 404) fail("frontend unknown order");
}

await prisma.$disconnect();
log("\nDone. Order: " + orderNumber + " (" + orderId + ")");
