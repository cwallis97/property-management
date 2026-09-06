import { Sequelize } from "sequelize";
import { databaseDialectOptions } from "../config/security.js";

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy server/.env.example to server/.env and configure it."
  );
}

// TLS behavior is resolved in config/security.js#databaseDialectOptions:
//   DB_SSL=true                  -> encrypted connection
//   DB_SSL_REJECT_UNAUTHORIZED   -> defaults "true" (verify the server
//                                   certificate); set "false" only for a
//                                   provider that cannot present a
//                                   verifiable chain
//   DB_SSL_CA                    -> optional PEM CA bundle (contents, not
//                                   a path) for such providers
// Local development (DB_SSL unset / "false") gets no SSL options.
export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: databaseDialectOptions(),
});
