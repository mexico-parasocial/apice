import { describe, it, expect } from "vitest";
import { assessVideo, formatBytes, formatDuration } from "./videoPreflight";

const MB = 1024 * 1024;
const base = { name: "leccion.mp4", type: "video/mp4" };

describe("formatters", () => {
  it("formats sizes and durations", () => {
    expect(formatBytes(120 * MB)).toBe("120 MB");
    expect(formatBytes(1.5 * 1024 * MB)).toBe("1.5 GB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatDuration(200)).toBe("3:20");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

describe("assessVideo", () => {
  it("passes a healthy lesson clip and summarises it", () => {
    // 30 MB over 160 s ≈ 1.5 Mbps — the documented target.
    const r = assessVideo({ ...base, size: 30 * MB, durationSeconds: 160, width: 1080, height: 1920 });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.summary).toBe("2:40 · 1080×1920 · 30 MB · 1.6 Mbps");
  });

  it("blocks empty files, non-video files and oversized files", () => {
    expect(assessVideo({ ...base, size: 0 }).errors).toContain("El archivo está vacío.");
    expect(assessVideo({ name: "notas.pdf", type: "application/pdf", size: MB }).errors[0]).toMatch(/No parece un archivo de video/);
    const big = assessVideo({ ...base, size: 3 * 1024 * MB, durationSeconds: 600 }, 2 * 1024 * MB);
    expect(big.errors[0]).toMatch(/Pesa 3\.0 GB y el máximo es 2\.0 GB/);
  });

  it("falls back to the file extension when the browser reports no type", () => {
    expect(assessVideo({ name: "clip.mkv", type: "", size: MB, durationSeconds: 10 }).errors).toEqual([]);
    expect(assessVideo({ name: "clip.txt", type: "", size: MB }).errors).toHaveLength(1);
  });

  it("warns, without blocking, about a heavy bitrate", () => {
    // 600 MB over 10 min ≈ 8.4 Mbps
    const r = assessVideo({ ...base, size: 600 * MB, durationSeconds: 600 });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/8\.4 Mbps.*datos prepago/);
  });

  it("warns, without blocking, when the browser can't read the duration", () => {
    const r = assessVideo({ ...base, size: 10 * MB });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/no pudo leer la duración/);
  });

  it("does not stack the metadata warning on top of a blocking error", () => {
    const r = assessVideo({ name: "a.pdf", type: "application/pdf", size: MB });
    expect(r.warnings).toEqual([]);
  });

  it("warns about sub-second clips", () => {
    expect(assessVideo({ ...base, size: MB, durationSeconds: 0.4 }).warnings[0]).toMatch(/menos de un segundo/);
  });
});
