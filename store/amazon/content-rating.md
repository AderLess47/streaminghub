# Amazon content rating questionnaire: answers

Answers for the **Content rating** step of the Amazon Appstore submission for
StreamingHub 1.3.0 (build 10). Amazon asks about *Subject Matter* (violence,
cartoon violence, drugs, nudity, sex, intolerance, profanity, academic) and
*Additional Information* (account creation/personal data, advertisements,
gambling, location detection or location-based services), then derives the
maturity rating shown on the detail page.

The app itself ships no catalogue: it is a player for an M3U playlist the user
supplies. The only content we bundle is an **opt-in demo library** of public test
assets (see below), so the subject-matter answers describe that demo plus our own
UI text — not streams the user adds.

## Subject matter

| Question | Answer | Reason |
| --- | --- | --- |
| Violence | **Yes** | Two bundled demo entries contain brief, non-graphic action: the *Sintel* trailer (fantasy sword combat) and the *Tears of Steel* trailer (live-action VFX, robots destroyed, explosions). No blood, gore, or harm to real people is depicted. |
| Cartoon Violence | **Yes** | *Big Buck Bunny* (demo film and delivered as one Mux test stream) is slapstick cartoon violence: a rabbit is teased and retaliates with traps. |
| Drugs | **No** | No drug, alcohol or tobacco content in the app, the demo library or the listing. |
| Nudity | **No** | None in the demo library or the UI. |
| Sex | **No** | None; no sexual themes or references. |
| Intolerance | **No** | No discriminatory or intolerant content. |
| Profanity | **No** *(verify)* | UI text and listing copy are clean. The two live-action trailers carry dialogue; listen to both before submitting. If either contains strong language, answer **Yes (mild)** — under-declaring is what gets a submission rejected. |
| Academic | **No** | The app makes no academic or educational claims. |

## Additional information

| Question | Answer | Reason |
| --- | --- | --- |
| Account creation or other personal information collected | **Yes** | Accounts are created on `streaminghub.org`; pairing a device sends device name, platform, app version and IP. See `privacy-labels.md`. |
| Advertisements | **No** | No ad SDK, no ad slots, no sponsored entries. Verified: no ads dependency in `android/app/build.gradle.kts`. |
| Gambling | **No** | No wagering, no simulated gambling, no casino content. |
| Location detection or location-based services | **No** | App requests no location permission (only `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`). |

## Bundled demo content (what a reviewer actually sees)

Enabled explicitly in *Einstellungen → Demo-Modus*, removable again from the same
card (`DemoLibrary.kt`):

| Entry | Source | Content |
| --- | --- | --- |
| Demo Live Eins / Drei | Mux HLS test streams | Big Buck Bunny and a test pattern; cartoon slapstick |
| Demo Live Zwei | Apple HLS test stream | Test pattern (bipbop), no narrative content |
| Demo Film: Tears of Steel | Mux HLS (Blender, CC BY) | Live-action sci-fi trailer, robot combat, explosions |
| Demo Film: Big Buck Bunny | `media.w3.org` MP4 | Cartoon slapstick |
| Demo Serie: Sintel Trailer | `download.blender.org` (Blender, CC BY) | Fantasy trailer, sword combat, a dragon |

The EPG is generated relative to the current time and says explicitly that it is
sample data; no broadcaster or programme data is represented.

## Expected rating and how to change it

- With the demo library as it is: expect **Guidance Suggested** (mild violence,
  cartoon violence), possibly **All Ages** if Amazon weights the player shell
  above the opt-in demo.
- For **All Ages**, drop the two live-action trailers from `DemoLibrary` (keep
  Big Buck Bunny, which is cartoon slapstick) or ship without demo mode. That is
  a one-file change plus its tests — say so before the submission if a lower
  rating matters more than a richer reviewer demo.
- Do **not** answer "No" to violence just because the demo is optional: the demo
  is part of the submitted binary and reviewers do open it.

## Notes for the testing instructions

- Demo mode needs no account and no playlist: *Einstellungen → Demo-Modus →
  „Demo-Inhalte laden“*, then back to the start screen.
- All demo streams are public test assets; two of them are open movies under
  CC BY, the rest are vendor test streams. No broadcaster, studio or third-party
  brand is represented.
- Playlist, EPG and playback progress stay on the device; nothing is uploaded.
- No in-app purchases and no external purchase links in the app. Premium is sold
  on the website only, and the app merely shows the status. **Open point:** Amazon
  requires digital content to be sold through Amazon IAP; confirm with the policy
  review whether a web-sold subscription that unlocks playback is acceptable, or
  whether the premium gate must be removed for the Amazon build — see
  [`../../docs/IAP-AMAZON.md`](../../docs/IAP-AMAZON.md).

## Before submitting

1. Listen to the Sintel and Tears of Steel trailers and settle the profanity
   answer.
2. Decide whether the demo keeps the two live-action trailers (Guidance
   Suggested) or is reduced to cartoon content (All Ages).
3. Re-check these answers whenever demo entries, ads or purchases change — a
   mismatched rating is itself a rejection reason.

## Sources

- App submission, *Content rating*: `developer.amazon.com/docs/app-submission/target-app.html`
- Restricted content policy: `developer.amazon.com/docs/policy-center/restricted-content.html`
- Age rating labels (All Ages / Guidance Suggested / Mature / Adult):
  Amazon Appstore rating definitions
