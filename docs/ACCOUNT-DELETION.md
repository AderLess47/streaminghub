# Account deletion (Amazon requirement)

Amazon's User Data Privacy Policy requires apps that support account creation or
sign-in to let users request account deletion, and to provide a **direct web
link** to the deletion option in the submission form. The link must lead to the
deletion page itself, not to the general website, and it must work for users who
cannot sign in (for example after uninstalling the app). Since June 2025 the
account/data deletion questions must be answered completely or new releases are
blocked.

Sources: `developer.amazon.com/docs/app-submission/user-account-and-data-deletion.html`,
`developer.amazon.com/docs/policy-center/user-data-privacy.html`

## Status

| Requirement | State |
| --- | --- |
| Deletion possible while signed in | Yes — `/dashboard/settings` → „Kontolöschung beantragen“ |
| Public deletion page without sign-in | Yes — `https://streaminghub.org/account-deletion` (German + English) |
| Direct link, not the general site | Yes — the URL opens the deletion instructions directly |
| States what is deleted | Yes — section „Was gelöscht wird“ |
| States what is retained and why | Yes — section „Was wir aufbewahren müssen“, cross-referenced to the privacy policy |
| Reachable without account | Yes, no cookie or login needed |
| Documented in the privacy policy | Yes — deletion by dashboard or email to service@streaminghub.org |

## Answers for the Amazon console

- **Does your app allow users to create an account?** Yes. Accounts are created
  on streaminghub.org; device pairing in the app is optional.
- **Can users request account deletion?** Yes.
- **Deletion URL:** `https://streaminghub.org/account-deletion`
- **Can users request deletion of some data without deleting the account?**
  Yes — by email to service@streaminghub.org (for example to remove a stored
  M3U URL, or to request a data export).
- **What is retained and why?** Billing records while commercial/tax retention
  periods apply, security logs for at most 90 days, and support requests for an
  open case for at most 24 months.

The page itself lives in `src/app/account-deletion/page.tsx`; all wording is in
`src/i18n/de.ts` / `en.ts` under `accountDeletion`, so other locales fall back to
English. `scripts/smoke-test.mjs` asserts that the page answers with 200 and its
heading.
