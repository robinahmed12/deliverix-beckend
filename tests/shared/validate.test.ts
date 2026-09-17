import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validate } from "../../src/shared/middleware/validate.js";

const listQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.get(
    "/items",
    validate({ query: listQuerySchema }),
    (req, res) => {
      res.json({ query: req.query });
    },
  );
  return app;
}

describe("validate middleware (query)", () => {
  // Regression: Express 5 exposes `req.query` as a getter-only accessor, so the
  // middleware must shadow it via Object.defineProperty rather than assign it.
  it("replaces req.query with parsed and coerced values", async () => {
    const res = await request(buildApp()).get("/items?pageSize=5&status=active");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ query: { pageSize: 5, status: "active" } });
  });

  it("accepts an empty query string", async () => {
    const res = await request(buildApp()).get("/items");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ query: {} });
  });

  it("returns 422 with flattened issues for invalid query params", async () => {
    const res = await request(buildApp()).get("/items?pageSize=0");

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.query).toBeDefined();
  });
});
