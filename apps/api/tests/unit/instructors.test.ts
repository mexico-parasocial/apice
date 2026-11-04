import { describe, it, expect, afterEach } from "vitest";
import {
  assertApprovedInstructorVideo,
  didFromAtUri,
  invalidDids,
  isInstructorAllowed,
  isValidDid,
  parseDidList,
} from "../../src/modules/video/instructors";

const ALICE = "did:plc:7uz5wwvtnu36wtdanvr5m2jt";
const BOB = "did:plc:abcdefghijklmnopqrstuvwx";
const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("DID parsing", () => {
  it("splits, trims, lowercases and drops empties", () => {
    expect(parseDidList(` ${ALICE.toUpperCase()} , ,${BOB},`)).toEqual([ALICE, BOB]);
    expect(parseDidList(undefined)).toEqual([]);
    expect(parseDidList("")).toEqual([]);
  });

  it("accepts did:plc and did:web, rejects placeholders and handles", () => {
    expect(isValidDid(ALICE)).toBe(true);
    expect(isValidDid("did:web:vod.apice.example.com")).toBe(true);
    expect(isValidDid("did:web:localhost%3A3000")).toBe(true);
    expect(invalidDids(["did:plc:instructor-1", "alice.bsky.social", "did:plc:change-me", ALICE])).toEqual([
      "did:plc:instructor-1",
      "alice.bsky.social",
      "did:plc:change-me",
    ]);
  });
});

describe("didFromAtUri", () => {
  it("extracts the repo DID", () => {
    expect(didFromAtUri(`at://${ALICE}/place.stream.video/3abc`)).toBe(ALICE);
    expect(didFromAtUri("https://example.com/x")).toBeNull();
  });
});

describe("isInstructorAllowed", () => {
  it("enforces the list when configured", () => {
    process.env.NODE_ENV = "production";
    process.env.STREAMPLACE_ALLOWED_STREAMS = `${ALICE}, ${BOB}`;
    expect(isInstructorAllowed(ALICE)).toBe(true);
    expect(isInstructorAllowed(BOB.toUpperCase())).toBe(true);
    expect(isInstructorAllowed("did:plc:zzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it("is open in local dev with no list, but closed in production", () => {
    delete process.env.STREAMPLACE_ALLOWED_STREAMS;
    process.env.NODE_ENV = "development";
    expect(isInstructorAllowed(ALICE)).toBe(true);
    process.env.NODE_ENV = "production";
    expect(isInstructorAllowed(ALICE)).toBe(false);
  });

  it("still enforces a configured list in dev", () => {
    process.env.NODE_ENV = "development";
    process.env.STREAMPLACE_ALLOWED_STREAMS = ALICE;
    expect(isInstructorAllowed(BOB)).toBe(false);
  });
});

describe("assertApprovedInstructorVideo", () => {
  it("passes for an allowed instructor and 403s otherwise", () => {
    process.env.STREAMPLACE_ALLOWED_STREAMS = ALICE;
    expect(() => assertApprovedInstructorVideo(`at://${ALICE}/place.stream.video/1`)).not.toThrow();
    try {
      assertApprovedInstructorVideo(`at://${BOB}/place.stream.video/1`);
      throw new Error("expected a throw");
    } catch (error: any) {
      expect(error.statusCode).toBe(403);
    }
  });
});
