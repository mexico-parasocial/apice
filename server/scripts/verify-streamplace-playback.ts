/**
 * Smoke test: verify that the self-hosted Streamplace node can serve an HLS
 * playlist (and optionally its segments) for a published video.
 *
 * Usage:
 *   npx ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/verify-streamplace-playback.ts <at-uri>
 *
 * Example:
 *   npx ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/verify-streamplace-playback.ts \
 *     "at://did:web:vod.apice.example.com/place.stream.video/3l7s..."
 */

import "dotenv/config";
import axios from "axios";
import { createVideoDeliveryProvider } from "../services/videoDelivery.service";

const uri = process.argv[2];
const baseUrl = process.env.STREAMPLACE_VOD_BASE_URL ?? "https://vod.apice.example.com";

async function main() {
  if (!uri) {
    console.error("❌ Usage: npx ts-node scripts/verify-streamplace-playback.ts <at-uri>");
    process.exit(1);
  }

  if (!uri.startsWith("at://")) {
    console.error("❌ videoRef must be an AT URI starting with at://");
    process.exit(1);
  }

  console.log(`🔎 Streamplace node: ${baseUrl}`);
  console.log(`🔎 Video URI:        ${uri}`);

  // 1. Node health check.
  try {
    const health = await axios.get(`${baseUrl}/`, { timeout: 10000 });
    console.log(`✅ Node reachable (HTTP ${health.status})`);
  } catch (err: any) {
    console.error(`❌ Node not reachable at ${baseUrl}: ${err.message}`);
    process.exit(1);
  }

  // 2. Resolve playback URL through the same provider the server uses.
  const provider = createVideoDeliveryProvider(uri);
  console.log(`🔎 Using provider: ${provider.name}`);

  let playbackUrl: string;
  try {
    const resolved = await provider.resolvePlaybackUrl(uri);
    playbackUrl = resolved.playbackUrl;
    console.log(`✅ Resolved playback URL: ${playbackUrl}`);
  } catch (err: any) {
    console.error(`❌ Failed to resolve playback URL: ${err.message}`);
    if (err.response?.data) {
      console.error("   Response:", err.response.data);
    }
    process.exit(1);
  }

  // 3. Fetch the HLS playlist.
  let playlist: string;
  try {
    const playlistRes = await axios.get(playbackUrl, {
      timeout: 15000,
      responseType: "text",
    });
    playlist = playlistRes.data as string;
    if (typeof playlist !== "string" || !playlist.trim().startsWith("#EXTM3U")) {
      console.error("❌ Playlist response is not a valid HLS playlist");
      console.error("   First 200 chars:", playlist?.slice(0, 200));
      process.exit(1);
    }
    console.log(`✅ Playlist fetched (${playlist.length} bytes)`);
  } catch (err: any) {
    console.error(`❌ Failed to fetch playlist: ${err.message}`);
    if (err.response?.data) {
      console.error("   Response:", err.response.data);
    }
    process.exit(1);
  }

  // 4. Sanity-check the first segment URL.
  const segmentLine = playlist
    .split("\n")
    .find((line) => line.trim() && !line.startsWith("#"));

  if (!segmentLine) {
    console.warn("⚠️  Playlist has no segment lines; it may be a master playlist.");
    console.log("\n🎉 Playback pipeline is reachable and returns a valid-looking playlist.");
    return;
  }

  const segmentUrl = new URL(segmentLine, playbackUrl).toString();
  console.log(`🔎 First segment: ${segmentUrl}`);

  try {
    const segmentRes = await axios.get(segmentUrl, {
      timeout: 15000,
      responseType: "arraybuffer",
      validateStatus: (status) => status === 200 || status === 206,
    });
    console.log(
      `✅ First segment reachable (HTTP ${segmentRes.status}, ${
        (segmentRes.data as ArrayBuffer).byteLength
      } bytes)`
    );
  } catch (err: any) {
    console.error(`❌ First segment not reachable: ${err.message}`);
    if (err.response?.status) {
      console.error(`   HTTP ${err.response.status}`);
    }
    process.exit(1);
  }

  console.log("\n🎉 Streamplace playback pipeline looks healthy!");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
