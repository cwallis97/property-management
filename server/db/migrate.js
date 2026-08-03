import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { Umzug, SequelizeStorage } from "umzug";
import { sequelize } from "./sequelize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, "migrations/*.js"),
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

const command = process.argv[2] ?? "up";

async function main() {
  if (command === "up") {
    const applied = await umzug.up();
    console.log(`Applied ${applied.length} migration(s).`);
  } else if (command === "down") {
    const [reverted] = await umzug.down();
    console.log(reverted ? `Reverted migration: ${reverted.name}` : "No migrations to revert.");
  } else if (command === "down:all") {
    const reverted = await umzug.down({ to: 0 });
    console.log(`Reverted ${reverted.length} migration(s).`);
  } else if (command === "status") {
    const pending = await umzug.pending();
    const executed = await umzug.executed();
    console.log(
      `Executed (${executed.length}): ${executed.map((m) => m.name).join(", ") || "none"}`
    );
    console.log(
      `Pending (${pending.length}): ${pending.map((m) => m.name).join(", ") || "none"}`
    );
  } else {
    console.error(`Unknown command: ${command}. Use up | down | down:all | status`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
