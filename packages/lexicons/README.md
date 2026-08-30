# @apice/lexicons

The `app.civic.*` lexicons — the open standard for MOOCs on ATProto. See
[`docs/MOOC_ON_ATPROTO.md`](../../docs/MOOC_ON_ATPROTO.md) for the full
standard document.

## Records

| NSID | Key | Purpose |
|---|---|---|
| `app.civic.course` | `tid` | Public course catalog record: title, description, tags, sections with lesson strongRefs. Owned by the instructor's DID. |
| `app.civic.lesson` | `tid` | One lesson: title, duration, order, strongRefs to its course and (optionally) its video manifest. |
| `app.civic.video` | `tid` | Video asset manifest: sources (HLS/MP4 URIs, e.g. a `place.stream.video` AT URI), duration, captions. Bytes never live on the PDS. |
| `app.civic.progress` | `tid` | Completion attestation. **Invariant:** `learnerDid` must equal the repo owner — progress is self-attested and lives on the learner's own PDS. |
| `app.civic.courseSpace` | `tid` | Permissioned access-control record (designed; unused until the revenue model lands). |

## Usage

```ts
import { lexicons } from "@apice/lexicons";
import { Lexicons } from "@atproto/lexicon";

const lex = new Lexicons();
for (const doc of lexicons) lex.add(doc);

// Validate an incoming record (e.g. from Jetstream)
lex.assertValidRecord("app.civic.course", record);
```

## Development

Source schemas live in [`/lexicons/*.json`](../../lexicons). After editing:

```bash
pnpm codegen   # regenerates src/lexicons.ts (with as const + CivicLexiconId)
pnpm typecheck
```
