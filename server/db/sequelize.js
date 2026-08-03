import { Sequelize } from "sequelize";

const { DATABASE_URL, DB_SSL } = process.env;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy server/.env.example to server/.env and configure it."
  );
}

export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions:
    DB_SSL === "true"
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
});
