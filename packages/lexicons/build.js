// Compiled at install time so plain-node contexts (prod containers, the
// indexer) can require this package without a TS loader. chdir is explicit:
// pnpm has been observed running lifecycle scripts from the workspace root.
const { execSync } = require("node:child_process");
process.chdir(__dirname);
execSync("tsc -p tsconfig.json", { stdio: "inherit" });
