import ErrorHandler from "../../http/ErrorHandler";

/**
 * Instructor allowlist: the ATProto accounts (DIDs) allowed to publish lesson
 * videos. One variable, STREAMPLACE_ALLOWED_STREAMS, drives two enforcement
 * points that must agree:
 *
 * - the Streamplace node (docker-compose.prod.yml -> SP_ALLOWED_STREAMS)
 *   decides who may upload;
 * - this server decides whose videos a lesson may reference or play, so a
 *   mistyped or malicious AT URI can't smuggle in a stranger's video even
 *   though anyone's public record could in principle be fetched.
 *
 * Streamplace v0.11.13 treats an EMPTY list as open to every valid DID, even
 * with SP_WIDE_OPEN=false, so an empty list is never acceptable in production.
 */

/** did:plc (24 base32 chars) or did:web (host, optional :path segments). */
const DID_PATTERN =
  /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9][a-z0-9.%-]*(?::[a-z0-9._%-]+)*)$/;

export function parseDidList(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isValidDid(value: string): boolean {
  return DID_PATTERN.test(value.toLowerCase());
}

/** Entries that are not well-formed DIDs (placeholders, typos, handles). */
export function invalidDids(list: string[]): string[] {
  return list.filter((entry) => !isValidDid(entry));
}

/** Read at call time so tests (and a restarted process) see the current value. */
export function instructorAllowlist(): string[] {
  return parseDidList(process.env.STREAMPLACE_ALLOWED_STREAMS);
}

/**
 * With a list configured it is enforced everywhere. With none, local dev stays
 * open (the dev node runs wide open) but production refuses everyone.
 */
export function isInstructorAllowed(did: string): boolean {
  const list = instructorAllowlist();
  if (list.length === 0) return process.env.NODE_ENV !== "production";
  return list.includes(did.toLowerCase());
}

/** `at://did:plc:xyz/place.stream.video/rkey` -> `did:plc:xyz`. */
export function didFromAtUri(uri: string): string | null {
  const match = /^at:\/\/([^/?#]+)/i.exec(uri);
  return match ? match[1].toLowerCase() : null;
}

/** Throws a 403 unless the AT URI's repo belongs to an approved instructor. */
export function assertApprovedInstructorVideo(videoRef: string): void {
  const did = didFromAtUri(videoRef);
  if (!did || !isInstructorAllowed(did)) {
    throw new ErrorHandler(
      "This video was published by an account that is not an approved instructor",
      403
    );
  }
}
