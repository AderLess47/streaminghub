# Uploading build 9 to the Amazon Appstore

The store binary is the **Amazon flavor**, built and signed by the release
workflow from the same commit as the public download. It has no premium surface
(`BuildConfig.PREMIUM_SALES = false`, see [`../../docs/IAP-AMAZON.md`](../../docs/IAP-AMAZON.md)).

## The binary

| Field | Value |
| --- | --- |
| Workflow run | `43133391693` (`Android release`) |
| Artifact | `streaminghub-amazon-apk` |
| File | `app-amazon-release.apk` |
| Version | 1.2.6 (build 9) |
| Size | 14.314.798 bytes |
| SHA-256 | `78708203b1cfbfc3190c18bcaa05de4ef020d92cb13570037ea3814f59ccd117` |

Fetch it:

```bash
gh run download 43133391693 -n streaminghub-amazon-apk -D /tmp/amazon-apk
sha256sum /tmp/amazon-apk/app-amazon-release.apk   # must match the hash above
```

**Do not upload `https://streaminghub.org/app.apk`.** That is the `direct` flavor
with premium sales enabled (1.2.6, 14.314.804 bytes). The two differ only in that
flag, so the size is the quickest way to tell them apart.

## Console steps

1. **Upload your app file** — Appstore → your app → Upload app file, select
   `app-amazon-release.apk`. Amazon accepts `versionCode 9` over the previous
   `8`; the app id stays `de.streaminghub.app`, so existing installs upgrade.
2. **Appstore details** — title, short/long description, five bullets and 20
   keywords are in [`listing.md`](listing.md) (German) and
   [`listing-en.md`](listing-en.md) (English). Assets: `icon-114.png`,
   `icon-512.png`, `icon-firetv-1280x720.png`, `background-1920x1080.png`, five
   screenshots at 1920×1080 and `promotional-1024x500.png`.
3. **Content rating** — answer the questionnaire with
   [`content-rating.md`](content-rating.md): violence and cartoon violence **yes**
   (bundled demo trailers), everything else no, plus account creation **yes**.
4. **User data privacy** — answers per data type are in
   [`privacy-labels.md`](privacy-labels.md); privacy policy URL
   `https://streaminghub.org/privacy`.
5. **Account deletion** — deletion URL `https://streaminghub.org/account-deletion`
   (public, no sign-in), answers per question in
   [`../../docs/ACCOUNT-DELETION.md`](../../docs/ACCOUNT-DELETION.md). The app
   also links to that page from *Einstellungen → Konto & Gerät → Konto löschen*.
6. **Testing instructions** — copy the reviewer notes from
   [`listing.md`](listing.md): demo mode needs no account and no playlist,
   *Einstellungen → Demo-Modus → „Demo-Inhalte laden“*.
7. **In-app purchasing** — none. This build sells nothing and links to no
   checkout; the website's Stripe subscription is not offered for this channel.

## Verification already done on this artifact

| Check | Result |
| --- | --- |
| APK signature (`apksigner verify --print-certs`) | verified, signed with the release key |
| `aapt dump badging` | `de.streaminghub.app`, versionCode 9, versionName 1.2.6 |
| Premium surface | `BuildConfig.PREMIUM_SALES = false` asserted in the workflow before upload |
| Permissions | `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` only |
| Public download untouched | `/api/release`, `/download`, `/app.apk` all serve the direct 1.2.6 (build 9) |

## Before pressing submit

- Open the artifact once on a Fire TV device or emulator: settings → Konto &
  Gerät must show no premium row, no price, and no "Konto im Web verwalten"
  button, while pairing and "Konto löschen" still work.
- Re-read the content-rating answers if demo entries change.
- Keep this file updated with the next artifact hash; the console keeps the
  uploaded binary, not this document.
