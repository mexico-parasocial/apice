import fs from "fs";
import path from "path";

/**
 * The apps/api directory, found by walking up from this file.
 *
 * Code runs from src/ under ts-node-dev and from build/src/ when compiled,
 * so paths relative to __dirname differ between the two. Non-code assets
 * (mail templates, fixtures) are not copied into build/ by tsc — resolving
 * them from the package root is what makes them work in the Docker image.
 * (They used to be resolved as `__dirname/../mails`, which only existed in
 * dev, so production could not render a single email.)
 */
export const API_ROOT = (() => {
  let dir = __dirname;
  for (;;) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error("apps/api root not found from " + __dirname);
    dir = up;
  }
})();

export const MAIL_TEMPLATES_DIR = path.join(API_ROOT, "templates", "mail");
export const FIXTURES_DIR = path.join(API_ROOT, "fixtures");

/** package.json version, read at runtime (importing it would copy it into build/). */
export const API_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(API_ROOT, "package.json"), "utf8")
).version;
