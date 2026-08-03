import { ValidationError, UniqueConstraintError } from "sequelize";

export function errorHandler(err, req, res, _next) {
  if (err instanceof UniqueConstraintError) {
    return res.status(409).json({ error: "Resource already exists." });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.errors.map((e) => e.message).join(", ") });
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error." });
}
