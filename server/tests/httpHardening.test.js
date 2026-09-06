// Phase 0 SOC 2 hardening — HTTP-layer controls, exercised against a real
// Express app via supertest (the rest of the suite calls controllers
// directly). Covers security headers, fail-closed CORS, rate limiting,
// body-size limits, and the DB-probing health check.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { sequelize } from "../models/index.js";

// Import fresh so each createApp() reads the env we set for that test.
async function freshApp(env = {}) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const { createApp } = await import("../app.js");
  const app = createApp();
  // Restore immediately — the app has already captured what it needs.
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return app;
}

describe("HTTP hardening (Phase 0)", () => {
  describe("security headers", () => {
    it("sets nosniff, frame-options, referrer-policy and hides x-powered-by", async () => {
      const app = await freshApp();
      const res = await request(app).get("/api/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("does not send a Content-Security-Policy on API responses (intentional)", async () => {
      const app = await freshApp();
      const res = await request(app).get("/api/health");
      expect(res.headers["content-security-policy"]).toBeUndefined();
    });

    it("sends HSTS only in production", async () => {
      const prodApp = await freshApp({ NODE_ENV: "production", CORS_ORIGIN: "https://app.example.com" });
      const prodRes = await request(prodApp).get("/api/health");
      expect(prodRes.headers["strict-transport-security"]).toMatch(/max-age=\d+/);

      const devApp = await freshApp({ NODE_ENV: "test" });
      const devRes = await request(devApp).get("/api/health");
      expect(devRes.headers["strict-transport-security"]).toBeUndefined();
    });
  });

  describe("CORS", () => {
    it("production: an allowed origin is reflected", async () => {
      const app = await freshApp({ NODE_ENV: "production", CORS_ORIGIN: "https://app.example.com,https://staging.example.com" });
      const res = await request(app).get("/api/health").set("Origin", "https://staging.example.com");
      expect(res.headers["access-control-allow-origin"]).toBe("https://staging.example.com");
    });

    it("production: a disallowed origin is not granted CORS", async () => {
      const app = await freshApp({ NODE_ENV: "production", CORS_ORIGIN: "https://app.example.com" });
      const res = await request(app).get("/api/health").set("Origin", "https://evil.example.com");
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("production: missing CORS_ORIGIN fails closed (createApp throws, server never starts)", async () => {
      const saved = { NODE_ENV: process.env.NODE_ENV, CORS_ORIGIN: process.env.CORS_ORIGIN };
      process.env.NODE_ENV = "production";
      delete process.env.CORS_ORIGIN;
      const { createApp } = await import("../app.js");
      expect(() => createApp()).toThrow(/CORS_ORIGIN/);
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = saved.CORS_ORIGIN;
    });

    it("development: an unset allowlist still permits local use", async () => {
      const app = await freshApp({ NODE_ENV: "test", CORS_ORIGIN: undefined });
      const res = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });
  });

  describe("rate limiting", () => {
    it("returns 429 once the global budget is exceeded, with a JSON body", async () => {
      const app = await freshApp({ RATE_LIMIT_GLOBAL_MAX: "3", RATE_LIMIT_WINDOW_MS: "60000" });
      // /api/search 401s without auth, but the limiter counts it first.
      await request(app).get("/api/search?q=ab");
      await request(app).get("/api/search?q=ab");
      await request(app).get("/api/search?q=ab");
      const limited = await request(app).get("/api/search?q=ab");
      expect(limited.status).toBe(429);
      expect(limited.body.error).toMatch(/too many requests/i);
      expect(limited.headers["ratelimit-limit"]).toBeDefined();
    });

    it("never rate-limits /api/health", async () => {
      const app = await freshApp({ RATE_LIMIT_GLOBAL_MAX: "1", RATE_LIMIT_WINDOW_MS: "60000" });
      for (let i = 0; i < 5; i++) {
        const res = await request(app).get("/api/health");
        expect(res.status).not.toBe(429);
      }
    });

    it("normal low-volume traffic is unaffected", async () => {
      const app = await freshApp();
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
    });
  });

  describe("request body size limit", () => {
    it("rejects an over-limit JSON body with 413", async () => {
      const app = await freshApp({ JSON_BODY_LIMIT: "1kb" });
      const big = { blob: "x".repeat(4096) };
      const res = await request(app).post("/api/notifications/read-all").send(big);
      expect(res.status).toBe(413);
      expect(res.body.error).toMatch(/too large/i);
    });

    it("accepts a normal-sized JSON body (auth still applies afterward)", async () => {
      const app = await freshApp({ JSON_BODY_LIMIT: "1mb" });
      const res = await request(app).post("/api/notifications/read-all").send({ before: new Date().toISOString() });
      // Parsed fine; rejected later for missing auth, not for body size.
      expect(res.status).toBe(401);
    });
  });

  describe("health check probes the database", () => {
    afterEach(() => vi.restoreAllMocks());

    it("returns 200 { ok: true, database: 'ok' } when the DB is reachable", async () => {
      const app = await freshApp();
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, database: "ok" });
    });

    it("returns 503 with a generic body when the DB query fails", async () => {
      vi.spyOn(sequelize, "query").mockRejectedValueOnce(new Error("connection refused"));
      const app = await freshApp();
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ ok: false, database: "unavailable" });
      // No leak of the underlying error.
      expect(JSON.stringify(res.body)).not.toMatch(/connection refused/);
    });
  });
});
