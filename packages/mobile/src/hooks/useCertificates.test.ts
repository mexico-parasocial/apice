import { describe, it, expect } from "vitest";
import axios from "axios";
import { makeCertificateHooks } from "./useCertificates";

/**
 * The download URL is handed to the OS (Linking / Share sheet) and to the
 * authenticated fetch in the native downloader — a malformed URL there
 * surfaces as a silent no-op on device. Lock the shape down.
 */
describe("makeCertificateHooks.getCertificateDownloadUrl", () => {
  const { getCertificateDownloadUrl } = makeCertificateHooks({
    axios: axios.create({ baseURL: "http://localhost:8000" }),
    serverUri: "https://api.apice.example.com",
    getAuthHeaders: () => ({}),
  });

  it("points at the certificates download route", () => {
    expect(getCertificateDownloadUrl("cert-123")).toBe(
      "https://api.apice.example.com/api/v1/certificates/cert-123/download"
    );
  });

  it("keeps the id verbatim — no encoding that would break lookups", () => {
    expect(getCertificateDownloadUrl("abc")).toContain("/certificates/abc/");
  });

  it("tolerates a trailing slash in the server URI", () => {
    const { getCertificateDownloadUrl: build } = makeCertificateHooks({
      axios: axios.create(),
      serverUri: "https://api.apice.example.com/",
      getAuthHeaders: () => ({}),
    });
    expect(build("x")).toBe(
      "https://api.apice.example.com/api/v1/certificates/x/download"
    );
  });
});
