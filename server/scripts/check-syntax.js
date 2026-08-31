// Portable replacement for the manual `find server -name "*.js" | xargs
// node --check` sweep this project has been running by hand before every
// finalization. A plain Node script (not a shell one-liner) so it behaves
// identically on macOS/Linux/CI, with no dependency on `find`/`xargs`
// being available or behaving the same way everywhere.
import { readdirSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, "..");

const SKIP_DIRS = new Set(["node_modules", "uploads", ".git"]);

function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = collectJsFiles(serverRoot);
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    failed++;
    console.error(`SYNTAX ERROR: ${file}`);
    console.error(err.stderr?.toString() ?? err.message);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} file(s) failed the syntax check.`);
  process.exit(1);
}

console.log(`Syntax OK — ${files.length} file(s) checked.`);
