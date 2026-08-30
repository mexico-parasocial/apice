/**
 * Attach a published Streamplace video to lessons.
 *
 * Verifies the AT URI actually resolves through the same provider the server
 * uses for playback before writing anything, so a bad URI fails here rather
 * than on stage.
 *
 * Usage:
 *   # attach to every lesson that has no video yet
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/attach-lesson-video.ts "at://did:plc:…/place.stream.video/3l7s…"
 *
 *   # attach to one specific lesson
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/attach-lesson-video.ts "at://…" --lesson <lessonId>
 *
 *   # attach only to the first lesson of each course (enough for a demo)
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/attach-lesson-video.ts "at://…" --first-only
 */

import "dotenv/config";
import axios from "axios";
import { prisma } from "../utils/db";
import { createVideoDeliveryProvider } from "../services/videoDelivery.service";

const uri = process.argv[2];
const lessonFlagIndex = process.argv.indexOf("--lesson");
const lessonId =
  lessonFlagIndex !== -1 ? process.argv[lessonFlagIndex + 1] : undefined;
const firstOnly = process.argv.includes("--first-only");

async function main() {
  const isAtUri = uri?.startsWith("at://");
  const isHttpUrl = /^https?:\/\//i.test(uri ?? "");

  if (!uri || (!isAtUri && !isHttpUrl)) {
    console.error(
      "❌ Usage: attach-lesson-video.ts <at-uri|http-url> [--lesson <id>] [--first-only]"
    );
    process.exit(1);
  }

  if (isAtUri && !uri.includes("/place.stream.video/")) {
    console.error("❌ AT URI must point to a place.stream.video record.");
    process.exit(1);
  }

  if (isHttpUrl && process.env.ALLOW_DIRECT_VIDEO_URLS !== "true") {
    console.error(
      "❌ Direct http(s) video URLs need ALLOW_DIRECT_VIDEO_URLS=true (local demos only)."
    );
    process.exit(1);
  }

  // Fail here, not on stage: confirm the video can actually be served.
  console.log("🔎 Resolving playback through the server's own provider…");
  const provider = createVideoDeliveryProvider(uri);
  const resolved = await provider.resolvePlaybackUrl(uri);
  console.log(`✅ Resolved via ${resolved.provider}`);
  console.log(`   ${resolved.playbackUrl}`);

  // The direct provider does no network call of its own, so check the URL
  // really serves media before pointing lessons at it.
  if (isHttpUrl) {
    const probe = await axios.get(uri, {
      headers: { Range: "bytes=0-1023" },
      responseType: "arraybuffer",
      validateStatus: (s) => s === 200 || s === 206,
    });
    const contentType = String(probe.headers["content-type"] ?? "");
    if (!contentType.startsWith("video/")) {
      console.error(
        `❌ ${uri} returned content-type "${contentType}", expected video/*.`
      );
      process.exit(1);
    }
    console.log(
      `✅ Serves ${contentType}` +
        (probe.status === 206 ? " with byte-range support (seekable)" : "")
    );
  }

  let targets: { id: string; title: string }[];

  if (lessonId) {
    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { id: true, title: true },
    });
    if (!lesson) {
      console.error(`❌ Lesson ${lessonId} not found.`);
      process.exit(1);
    }
    targets = [lesson];
  } else if (firstOnly) {
    const sections = await prisma.courseSection.findMany({
      where: { order: 0 },
      include: {
        lessons: { where: { order: 0 }, select: { id: true, title: true } },
      },
    });
    targets = sections.flatMap((s) => s.lessons);
  } else {
    targets = await prisma.courseLesson.findMany({
      where: { videoUrl: null },
      select: { id: true, title: true },
    });
  }

  if (targets.length === 0) {
    console.log("⚠️  No matching lessons — nothing to do.");
    return;
  }

  for (const lesson of targets) {
    await prisma.courseLesson.update({
      where: { id: lesson.id },
      data: { videoUrl: uri },
    });
    console.log(`✅ ${lesson.title}`);
  }

  console.log(`🎉 Attached video to ${targets.length} lesson(s).`);
}

main()
  .catch((err: any) => {
    console.error("❌ Failed:", err.message);
    if (err.response?.data) console.error("   Response:", err.response.data);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
