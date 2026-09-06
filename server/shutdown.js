// Graceful-shutdown sequence, extracted so it can be unit-tested without
// starting a real server or opening a real database connection.
//
// createShutdownHandler(deps) returns an async function to register on
// SIGTERM / SIGINT. It:
//   1. runs at most once (a second signal is ignored),
//   2. stops the HTTP server accepting connections and waits for it to
//      drain,
//   3. closes the database connection pool,
//   4. exits 0 on success, 1 on error, and 1 via a force-exit timer if
//      any step hangs past `forceExitMs`.
//
// `deps` is injectable for tests: { server, sequelize, exit, log, error,
// setTimeoutFn, forceExitMs }.
export function createShutdownHandler({
  server,
  sequelize,
  exit = process.exit,
  log = console.log,
  error = console.error,
  setTimeoutFn = setTimeout,
  forceExitMs = 10000,
} = {}) {
  let started = false;

  return async function shutdown(signal) {
    if (started) return;
    started = true;
    log(`Received ${signal} — shutting down gracefully.`);

    const forceExit = setTimeoutFn(() => {
      error("Graceful shutdown timed out — forcing exit.");
      exit(1);
    }, forceExitMs);
    if (forceExit && typeof forceExit.unref === "function") forceExit.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await sequelize.close();
      clearTimeout(forceExit);
      log("Shutdown complete.");
      exit(0);
    } catch (err) {
      error("Error during shutdown:", err);
      exit(1);
    }
  };
}
