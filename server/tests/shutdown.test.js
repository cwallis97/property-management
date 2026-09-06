// Phase 0 SOC 2 hardening — graceful shutdown sequence. Unit-level only:
// the handler is exercised with fake server / sequelize / exit so no real
// process is killed and no real connection is closed.

import { describe, it, expect, vi } from "vitest";
import { createShutdownHandler } from "../shutdown.js";

function fakes({ closeErr = null } = {}) {
  return {
    server: { close: vi.fn((cb) => cb(closeErr)) },
    sequelize: { close: vi.fn(() => Promise.resolve()) },
    exit: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    setTimeoutFn: vi.fn(() => ({ unref: vi.fn() })),
  };
}

describe("graceful shutdown", () => {
  it("closes the server then the DB and exits 0", async () => {
    const f = fakes();
    const shutdown = createShutdownHandler(f);
    await shutdown("SIGTERM");
    expect(f.server.close).toHaveBeenCalledTimes(1);
    expect(f.sequelize.close).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledWith(0);
  });

  it("runs at most once even if a second signal arrives", async () => {
    const f = fakes();
    const shutdown = createShutdownHandler(f);
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    await shutdown("SIGTERM");
    expect(f.server.close).toHaveBeenCalledTimes(1);
    expect(f.sequelize.close).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledTimes(1);
  });

  it("exits 1 if closing the server errors", async () => {
    const f = fakes({ closeErr: new Error("still draining") });
    const shutdown = createShutdownHandler(f);
    await shutdown("SIGTERM");
    expect(f.exit).toHaveBeenCalledWith(1);
    expect(f.sequelize.close).not.toHaveBeenCalled();
  });

  it("arms a force-exit timer", async () => {
    const f = fakes();
    const shutdown = createShutdownHandler(f);
    await shutdown("SIGTERM");
    expect(f.setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));
  });
});
