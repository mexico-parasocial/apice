import { describe, it, expect } from "vitest";
import { baseTheme } from "../theme";

/**
 * Design tokens are a public contract: components across two packages style
 * from these values, and a typo (a missing "#", a swapped hex pair) would
 * only show up as subtly-wrong UI. Cheap to lock down.
 */
describe("baseTheme", () => {
  it("exposes the seven semantic colors as hex values", () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (const [name, value] of Object.entries(baseTheme.colors)) {
      expect(value, `colors.${name}`).toMatch(hex);
    }
  });

  it("keeps the brand purple and the gold accent stable", () => {
    expect(baseTheme.colors.primary).toBe("#4A1052");
    expect(baseTheme.colors.secondary).toBe("#D4AF37");
  });

  it("names the three font roles without duplicates", () => {
    const { wordmark, heading, body } = baseTheme.fonts;
    expect(wordmark).toBeTruthy();
    expect(heading).toBeTruthy();
    expect(body).toBeTruthy();
    expect(new Set([wordmark, heading, body]).size).toBe(3);
  });

  it("spacing scales linearly from the unit", () => {
    const { spacing } = baseTheme;
    expect(spacing(0)).toBe(0);
    expect(spacing(1)).toBeGreaterThan(0);
    expect(spacing(2)).toBe(spacing(1) * 2);
    expect(spacing(0.5)).toBeCloseTo(spacing(1) / 2);
  });
});
