import { ValidationError, UniqueConstraintError } from "sequelize";

export function errorHandler(err, req, res, _next) {
  if (err instanceof UniqueConstraintError) {
    return res.status(409).json({ error: "Resource already exists." });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.errors.map((e) => e.message).join(", ") });
  }

  // Body parser rejected an over-limit request (see JSON_BODY_LIMIT).
  // express.json() throws with `type: "entity.too.large"` and status 413.
  if (err && (err.type === "entity.too.large" || err.status === 413 || err.statusCode === 413)) {
    return res.status(413).json({ error: "Request body is too large." });
  }
  // Malformed JSON body — a client bug, not a server fault.
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON." });
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error." });
}
