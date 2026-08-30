# Community announcement — draft

Target: Bluesky (ATProto dev community), Streamplace community.
Publish after the Phase 2 live demo passes.

---

## Bluesky post (main)

📚 Ánimo, Atmosphere — meet **Ápice**, the first MOOC built on ATProto, and
`app.civic.*`, an open lexicon set for structured learning:

🎓 Instructors publish courses they OWN — records live in their repo, under
their DID, on any PDS.

🪪 Learners own their progress — `app.civic.progress` attestations are written
to the learner's own repo. Self-attested, portable, verifiable by anyone.

📺 Video is solved the ATProto way — `place.stream.video` records via our
self-hosted @stream.place node; bytes on CDN, pointers on the network.

🔍 Anyone can consume the standard — we index app.civic.* from Jetstream and
serve it back at GET /api/v1/network/courses.

Docs + lexicons: [link to repo]. Build a client, publish a course, or just
take one — it's free.

## Follow-up replies

1/ The core invariant: progress records MUST live in the learner's own repo
(`learnerDid == repo owner`). Credentials are self-attested — no trusted
third party. Your education history becomes yours, portable across apps.

2/ Design philosophy: bytes are public, the structured experience is the
product. We don't DRM the Atmosphere. Courses, lessons, and video manifests
are public records; sequencing, progress, and community are the value.

3/ For the Streamplace folks: every lesson video is a `place.stream.video`
record published through our node — fully playable through
`place.stream.playback.getVideoPlaylist`, syndication-friendly. VODs as
course materials work beautifully.

## Checklist before posting

- [ ] Phase 2 live demo recorded (instructor publish → learner completes →
      progress visible in learner's repo on pds.ls)
- [ ] Repo link with `docs/MOOC_ON_ATPROTO.md` rendered
- [ ] Ápice node syndication on stream.place confirmed (ping Eli/Streamplace
      with the node URL once the first VODs are published)
- [ ] Screenshots: admin publish flow, mobile player, pds.ls proof
