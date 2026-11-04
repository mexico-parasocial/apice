import { describe, it, expect } from "vitest";
import {
  PUSH_UNSUPPORTED,
  canShowOsPrompt,
  permissionFromResponse,
  shouldOfferPush,
} from "./pushPermission";

describe("permissionFromResponse", () => {
  it("maps a granted response", () => {
    expect(permissionFromResponse({ granted: true, status: "granted", canAskAgain: true })).toEqual({
      state: "granted",
      canAskAgain: false,
    });
    expect(permissionFromResponse({ status: "granted" }).state).toBe("granted");
  });

  it("maps 'never asked' to undetermined (prompt available)", () => {
    expect(permissionFromResponse({ granted: false, status: "undetermined", canAskAgain: true })).toEqual({
      state: "undetermined",
      canAskAgain: true,
    });
  });

  it("keeps canAskAgain for a first denial on Android 13+, drops it once permanent", () => {
    expect(permissionFromResponse({ granted: false, status: "denied", canAskAgain: true })).toEqual({
      state: "denied",
      canAskAgain: true,
    });
    expect(permissionFromResponse({ granted: false, status: "denied", canAskAgain: false })).toEqual({
      state: "denied",
      canAskAgain: false,
    });
  });

  it("treats an unrecognised or empty response as a final denial, never a grant", () => {
    expect(permissionFromResponse({})).toEqual({ state: "denied", canAskAgain: false });
  });
});

describe("canShowOsPrompt", () => {
  it("is true only while the OS can still ask", () => {
    expect(canShowOsPrompt({ state: "undetermined", canAskAgain: true })).toBe(true);
    expect(canShowOsPrompt({ state: "denied", canAskAgain: true })).toBe(true);
    expect(canShowOsPrompt({ state: "denied", canAskAgain: false })).toBe(false);
    expect(canShowOsPrompt({ state: "granted", canAskAgain: false })).toBe(false);
    expect(canShowOsPrompt(PUSH_UNSUPPORTED)).toBe(false);
  });
});

describe("shouldOfferPush", () => {
  it("offers push unless it's already on or impossible", () => {
    expect(shouldOfferPush({ state: "undetermined", canAskAgain: true })).toBe(true);
    expect(shouldOfferPush({ state: "denied", canAskAgain: false })).toBe(true);
    expect(shouldOfferPush({ state: "granted", canAskAgain: false })).toBe(false);
    expect(shouldOfferPush(PUSH_UNSUPPORTED)).toBe(false);
  });
});
