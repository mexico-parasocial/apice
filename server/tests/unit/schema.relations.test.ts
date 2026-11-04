import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * The delete semantics of User live in schema.prisma, not in deleteUser: the
 * database cascades or blocks. A relation to User declared without onDelete
 * defaults to RESTRICT, which is how deleting a user once failed for anyone
 * who had ever asked a question. These tests pin the design.
 */

const schema = fs.readFileSync(
  path.join(__dirname, "../../prisma/schema.prisma"),
  "utf8"
);

type Relation = { model: string; field: string; target: string; optional: boolean; onDelete?: string };

function relations(): Relation[] {
  const out: Relation[] = [];
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*(\w+)\s+(\w+)(\?)?\s+@relation\(([^)]*)\)/);
      if (!m) continue;
      out.push({
        model,
        field: m[1],
        target: m[2],
        optional: m[3] === "?",
        onDelete: m[4].match(/onDelete:\s*(\w+)/)?.[1],
      });
    }
  }
  return out;
}

describe("schema relations", () => {
  it("finds the relations it is meant to check", () => {
    expect(relations().filter((r) => r.target === "User").length).toBeGreaterThanOrEqual(10);
  });

  it("never lets a relation block deleting a user", () => {
    const blocking = relations()
      .filter((r) => r.target === "User")
      .filter((r) => !r.onDelete || ["Restrict", "NoAction"].includes(r.onDelete))
      .map((r) => `${r.model}.${r.field}`);

    expect(blocking).toEqual([]);
  });

  it("cascades the INE verification and community content", () => {
    const byModel = Object.fromEntries(
      relations()
        .filter((r) => r.target === "User")
        .map((r) => [r.model, r.onDelete])
    );

    for (const model of ["INEVerification", "Question", "Answer", "Review", "ReviewReply"]) {
      expect(byModel[model], model).toBe("Cascade");
    }
  });

  it("keeps orders: unlinked from a deleted user, blocking a course delete", () => {
    const order = relations().filter((r) => r.model === "Order");

    expect(order.find((r) => r.target === "User")).toMatchObject({
      optional: true,
      onDelete: "SetNull",
    });
    expect(order.find((r) => r.target === "Course")).toMatchObject({
      onDelete: "Restrict",
    });
  });
});
