# Ápice Branding

Ápice is the mobile learning platform for courses on politics and quality of relationships. The shared mobile package lives in `Ápice/packages/mobile` and is consumed by `apice-mobile`.

## Name

**Ápice** — peak, summit, the highest point. The brand signals reaching the top of one's civic and relational potential.

## Logo

Branded logo components live in the Expo app:

- Vector logo component: `apice-mobile/assets/images/logo-apice.tsx`
- App icon: `apice-mobile/assets/images/icon.png`
- Adaptive icon: `apice-mobile/assets/images/adaptive-icon.png`
- Splash: `apice-mobile/assets/images/splash.png`
- Favicon: `apice-mobile/assets/images/favicon.png`

## Colors

The app uses a light, white-forward palette with purple and gold accents.

| Token | Value | Usage |
|---|---|---|
| `--apice-background` | `#FFFFFF` | primary app background |
| `--apice-primary` | `#4A1052` | headers, primary CTAs, roadmap nodes |
| `--apice-accent` | `#D4AF37` / gold | highlights, progress, premium accents |
| `--apice-surface` | `#F9F5FA` | cards, soft surfaces |
| `--apice-text` | `#1A1A1A` | primary text on light surfaces |
| `--apice-muted` | `#7A7A7A` | secondary text, placeholders |

## Expo config

`app.json` is configured for:

- Name: `Ápice`
- Slug: `apice`
- Scheme: `apice`
- iOS bundle ID: `com.apice.app`
- Android package: `com.apice.app`
- User interface style: `light`
- Adaptive icon background: `#4A1052`

## Shared package

- Package name: `@apice/mobile`
- Source: `Ápice/packages/mobile/src`
- Theme entry: `@apice/mobile/theme`

## Next steps

- Replace placeholder splash artwork with final Ápice-branded illustrations.
- Update the admin panel logo and favicon to match the new brand.
- ~~Audit any remaining Smash-specific copy and assets for removal or replacement.~~ Done (2026-08-29): SSBU dataset tooling deleted, Dojo/boss naming generalized to lesson-road/checkpoint, Smash gameplay demo clip replaced with a synthetic test clip.
