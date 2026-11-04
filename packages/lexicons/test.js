"use strict";
// Sanity check run by `pnpm --filter @apice/lexicons test`: every schema
// parses as a valid lexicon document and the published ids match the files.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { lexicons, CIVIC_LEXICON_IDS, createCivicValidator } = require("./index.js");

const files = fs
  .readdirSync(path.join(__dirname, "schemas"))
  .filter((f) => f.endsWith(".json"))
  .sort();
assert.deepStrictEqual(
  files,
  CIVIC_LEXICON_IDS.map((id) => `${id}.json`).sort(),
  "index.js must load every file in schemas/"
);

const lex = createCivicValidator();

// Credentials use a deterministic (hash) rkey so re-publishing upserts; the
// lexicon must allow that.
lex.assertValidRecord("app.civic.progress", {
  $type: "app.civic.progress",
  learnerDid: "did:plc:learner",
  courseRef: { uri: "at://did:plc:i/app.civic.course/abc", cid: "bafyreib2rxk3rybk3aobmv5cjuql3bm2twh4jo5uxgf5y5xhj4bvb6vgxa" },
  completedAt: new Date().toISOString(),
  progressPercent: 100,
});
assert.strictEqual(
  lexicons.find((d) => d.id === "app.civic.progress").defs.main.key,
  "any"
);

// Records with strongRefs validate (regression: the indexer used to load the
// civic docs alone and rejected every course/lesson/progress record).
lex.assertValidRecord("app.civic.lesson", {
  $type: "app.civic.lesson",
  ...sampleLesson(),
});

function sampleLesson() {
  const doc = lexicons.find((d) => d.id === "app.civic.lesson").defs.main.record;
  const ref = { uri: "at://did:plc:i/app.civic.course/abc", cid: "bafyreib2rxk3rybk3aobmv5cjuql3bm2twh4jo5uxgf5y5xhj4bvb6vgxa" };
  const out = {};
  for (const name of doc.required) {
    const prop = doc.properties[name];
    if (prop.type === "ref") out[name] = ref;
    else if (prop.type === "integer") out[name] = prop.minimum ?? 0;
    else if (prop.format === "datetime") out[name] = new Date().toISOString();
    else out[name] = "x";
  }
  return out;
}

console.log(`ok — ${lexicons.length} lexicons`);
