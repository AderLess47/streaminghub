# Uploading build 10 to the Amazon Appstore

The store binary is the **Amazon flavor**, built and signed by the release
workflow from the same commit as the public download. Since phase P4 it sells
premium through Amazon In-App Purchasing
(`BuildConfig.PREMIUM_SALES = true`, `BuildConfig.PREMIUM_CHANNEL = "amazon"`,
see [`../../docs/IAP-AMAZON.md`](../../docs/IAP-AMAZON.md)). Do not submit it
before the console item and the server secrets in *In-app purchasing* below are
in place – the card would otherwise end in a purchase that cannot be verified.

## The binary

| Field | Value |
| --- | --- |
| Workflow run | `43195656027` (`Android release`) |
| Artifact | `streaminghub-amazon-apk` |
| File | `app-amazon-release.apk` |
| Version | 1.3.0 (build 10) |
| Size | 14.478.659 bytes |
| SHA-256 | `203495b56d3f6a7b6fc1d5fde2c66b455ddb8cdd5f8941c55216276336cb8db9` |
| Signing certificate (SHA-256) | `34aefdb6f9dc697f4e5cd85794e0cb3b39756ef1b0086b24637016c8774ed07e` |

Fetch it:

```bash
gh run download 43195656027 -n streaminghub-amazon-apk -D /tmp/amazon-apk
sha256sum /tmp/amazon-apk/app-amazon-release.apk   # must match the hash above
```

**Do not upload `https://streaminghub.org/app.apk`.** That is the `direct` flavor
(1.3.0, 14.331.189 bytes,
`6ecc115c1c02681b8188c6fafb2a9c398ea98c60cc7fb3ee172b2335e585f170`): same code,
but premium is sold on the website instead of through Amazon IAP. Both builds
now show a premium surface, so the size and the hash are the reliable way to
tell them apart.

## In-app purchasing

1. **Console item** — Appstore → your app → *In-App Purchasing* → create a
   **Subscription** with SKU `premium_monthly`, term *1 Month*, price per
   [`../../docs/IAP-AMAZON.md`](../../docs/IAP-AMAZON.md) § 12. The SKU is
   compiled in as `DEFAULT_PREMIUM_SKU`; a different SKU needs a code change and
   a new build.
2. **Server secret** — `AMAZON_RVS_SHARED_SECRET` is set (the RVS client already
   answers `503 not_configured` without it, and the purchase flow stops there).
3. **Receipt notifications** — register the SNS topic for RTN and copy its ARN
   into the `AMAZON_RTN_TOPIC_ARN` secret, then run the *Configure Amazon
   secrets* workflow so the Fly app receives it. Until then the webhook rejects
   every notification and the daily sync only repairs via the RVS pull.
4. **Testing accounts** — add your testers in App Tester, set
   `AMAZON_RVS_SANDBOX=1` on the Fly app while they buy test transactions, and
   remove it before real customers.
5. **Live App Testing** — upload this APK to a LAT round, buy and restore with a
   test account, and watch the settings card switch to “Abo aktiv” with the
   renewal date the server reported.

## Console steps

1. **Upload your app file** — Appstore → your app → Upload app file, select
   `app-amazon-release.apk`. Amazon accepts `versionCode 10` over the previous
   `9`; the app id stays `de.streaminghub.app`, so existing installs upgrade.
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
   *Einstellungen → Demo-Modus → „Demo-Inhalte laden“*. Add how to reach the
   subscription: *Einstellungen → Konto & Gerät*, the premium card sits directly
   below the account row.
7. **In-app purchasing** — offered, see the section above. The app sells exactly
   one subscription and no consumables; all other content stays free.

## Verification already done on this artifact

| Check | Result |
| --- | --- |
| APK signature (`apksigner verify --print-certs`) | verified, `CN=StreamingHub`, release key as above |
| `aapt dump badging` | `de.streaminghub.app`, versionCode 10, versionName 1.3.0 |
| Premium surface | `PREMIUM_SALES = true` and `PREMIUM_CHANNEL = "amazon"` asserted in the workflow before upload |
| Appstore SDK | `amazon-appstore-sdk:3.0.9` asserted on the `amazonReleaseRuntimeClasspath` |
| Permissions | `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` only – the SDK adds none |
| Public download untouched by this flavor | `/api/release`, `/download`, `/app.apk` serve the direct 1.3.0 (build 10), checksum `6ecc115c…` |
| Purchase logic | 49 JVM/Robolectric tests per flavor, including server-confirmation-before-fulfilment |

## Before pressing submit

- Open the artifact once on a Fire TV device: the settings screen must show the
  premium card with the Amazon price, a purchase must arrive as “Abo aktiv” only
  after the server confirmed it, and restoring on a second install must bring the
  subscription back.
- **Premium gates no shipped feature yet.** Amazon requires described
  functionality to work, and a subscription that unlocks nothing is a refund and
  rejection risk. Treat this as the blocker to clear before submission (`docs/IAP-AMAZON.md` § 0).
- Re-read the content-rating answers if demo entries change.
- Keep this file updated with the next artifact hash; the console keeps the
  uploaded binary, not this document.
