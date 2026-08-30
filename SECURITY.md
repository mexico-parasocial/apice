# Security Policy

Ápice handles data that deserves particular care:

- **Government ID images** — INE (Mexican voter ID) verification photos.
- **Payment records** — Stripe orders for paid courses.
- **Learner activity** — who studied what, when, tied to Bluesky DIDs. For a
  political community's education platform, this is sensitive by nature; the
  ATProto design keeps records in learners' own repos precisely so the
  platform doesn't have to be trusted with them.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Preferred channels, in order:

1. **GitHub private vulnerability reporting** — use "Report a security
   vulnerability" on this repository's Security tab.
2. **A private GitHub security advisory or a direct message to the
   maintainers** via the mexico-parasocial organisation.

Include what you can of: the affected endpoint/file, reproduction steps,
impact assessment, and any proof-of-concept. A rough but early report beats a
polished but late one.

## What we consider a security issue

- Authentication/authorization bypasses (e.g. reaching another user's
  enrollment, certificate, or lesson video).
- Injection of any kind (SQL via Prisma raw queries, XSS in the admin panel,
  unsafe redirects).
- Exposure of secrets, tokens, or the data categories above.
- SSRF or signature-validation flaws in the Stripe webhook or ATProto OAuth
  flows.
- Stored payloads that execute in an administrator's browser (admin renders
  learner-supplied URLs).

## Scope

The application code in this repository. Issues in third-party services we
run (Streamplace, SeaweedFS, Postgres images) belong upstream, though we
appreciate a heads-up if they're exploitable through our configuration.

## Response expectations

- Acknowledgement within **72 hours**.
- Assessment and a fix (or documented mitigation) for accepted reports within
  **14 days** where feasible.
- Credit in the release notes, if you wish.

We will not pursue good-faith researchers who responsibly disclose.
