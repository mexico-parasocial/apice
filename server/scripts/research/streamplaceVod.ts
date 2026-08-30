/**
 * Research spike: validate Streamplace VOD playback for ATProto video records.
 *
 * 1. Resolves a known public DID to its PDS.
 * 2. Lists place.stream.video records.
 * 3. Tries to resolve each record through Streamplace's VOD XRPC endpoint.
 * 4. Logs response shape, latency, CORS headers, and a snippet of the HLS playlist for successes.
 */

import axios, { AxiosError } from "axios";

const PUBLIC_REPO_DID = "did:plc:rbvrr34edl5ddpuwcubjiost";
const COLLECTION = "place.stream.video";
const STREAMPLACE_VOD_BASE = "https://stream.place";

interface DidDoc {
  service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
}

async function resolvePds(did: string): Promise<string> {
  const url = did.startsWith("did:plc:")
    ? `https://plc.directory/${did}`
    : `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`;

  const { data } = await axios.get<DidDoc>(url, { timeout: 10000 });
  const pds = data.service?.find((s) => s.type === "AtprotoPersonalDataServer")?.serviceEndpoint;
  if (!pds) throw new Error("No PDS found in DID doc");
  return pds.replace(/\/$/, "");
}

async function listRecords(pds: string, did: string, collection: string, limit = 10) {
  const url = `${pds}/xrpc/com.atproto.repo.listRecords`;
  const { data } = await axios.get(url, {
    params: { repo: did, collection, limit },
    timeout: 15000,
  });
  return data as {
    records?: Array<{ uri: string; cid: string; value: any }>;
  };
}

async function resolvePlaylist(atUri: string) {
  const url = `${STREAMPLACE_VOD_BASE}/xrpc/place.stream.playback.getVideoPlaylist`;
  const start = Date.now();
  const response = await axios.get(url, {
    params: { uri: atUri },
    timeout: 15000,
    validateStatus: () => true,
    // Ask for text so we can inspect HLS bodies directly.
    responseType: "text",
  });
  const latencyMs = Date.now() - start;
  return { response, latencyMs };
}

function pickFirstMediaPlaylist(masterBody: string): string | null {
  const lines = masterBody.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("/xrpc/place.stream.playback.getVideoPlaylist")) {
      return `${STREAMPLACE_VOD_BASE}${trimmed}`;
    }
  }
  return null;
}

function pickFirstSegment(mediaBody: string): string | null {
  const lines = mediaBody.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("/xrpc/place.stream.playback.getVideoBlob")) {
      return `${STREAMPLACE_VOD_BASE}${trimmed}`;
    }
  }
  return null;
}

async function main() {
  console.log("=== Streamplace VOD Research Spike ===\n");

  console.log(`Resolving PDS for ${PUBLIC_REPO_DID}...`);
  const pds = await resolvePds(PUBLIC_REPO_DID);
  console.log(`PDS: ${pds}\n`);

  console.log(`Listing records for collection ${COLLECTION}...`);
  const recordsData = await listRecords(pds, PUBLIC_REPO_DID, COLLECTION, 10);
  const records = recordsData.records ?? [];
  console.log(`Found ${records.length} record(s)\n`);

  if (records.length === 0) {
    console.log("No records found. Cannot continue validation.");
    return;
  }

  for (const record of records) {
    console.log("---------------------------------------------------");
    console.log(`Record URI: ${record.uri}`);
    console.log(`CID: ${record.cid}`);
    console.log("Value:");
    console.log(JSON.stringify(record.value, null, 2));
    console.log();

    const { response, latencyMs } = await resolvePlaylist(record.uri);

    console.log(`Streamplace status: ${response.status} ${response.statusText}`);
    console.log(`Latency: ${latencyMs}ms`);

    if (response.status === 200) {
      console.log("CORS headers:");
      console.log(`  access-control-allow-origin: ${response.headers["access-control-allow-origin"]}`);
      console.log(`  access-control-allow-headers: ${response.headers["access-control-allow-headers"]}`);
      console.log(`  access-control-expose-headers: ${response.headers["access-control-expose-headers"]}`);
      const body = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      const lines = body.split("\n").filter((line) => line.trim().length > 0);
      console.log(`Master playlist has ${lines.length} non-empty line(s). First lines:`);
      lines.slice(0, 10).forEach((line) => console.log(`  ${line}`));

      const mediaUrl = pickFirstMediaPlaylist(body);
      if (mediaUrl) {
        const mediaStart = Date.now();
        const mediaRes = await axios.get(mediaUrl, {
          timeout: 15000,
          validateStatus: () => true,
          responseType: "text",
        });
        console.log(`Media playlist status: ${mediaRes.status}, latency: ${Date.now() - mediaStart}ms`);
        if (mediaRes.status === 200) {
          const segmentUrl = pickFirstSegment(mediaRes.data);
          if (segmentUrl) {
            const segStart = Date.now();
            const segRes = await axios.get(segmentUrl, {
              timeout: 15000,
              validateStatus: () => true,
              responseType: "arraybuffer",
              headers: { Range: "bytes=0-1023" },
            });
            console.log(
              `Segment range GET status: ${segRes.status}, latency: ${Date.now() - segStart}ms, bytes: ${segRes.data?.byteLength ?? 0}`
            );
          } else {
            console.log("No segment URL found in media playlist");
          }
        }
      } else {
        console.log("No media playlist URL found in master playlist");
      }
    } else {
      console.log("Error body:");
      console.log(JSON.stringify(response.data, null, 2));
    }
    console.log();
  }

  console.log("=== Spike complete ===");
}

main().catch((err: AxiosError | Error) => {
  console.error("Research spike failed:");
  if (axios.isAxiosError(err)) {
    console.error(`  URL: ${err.config?.url}`);
    console.error(`  Status: ${err.response?.status}`);
    console.error(`  Data: ${JSON.stringify(err.response?.data)}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
