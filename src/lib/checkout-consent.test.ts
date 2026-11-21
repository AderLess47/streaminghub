import assert from "node:assert/strict";
import { test } from "node:test";
import { consentFeedback, missingConsent } from "./checkout-consent.ts";

const messages = {
  termsRequired: "AGB fehlen",
  withdrawalRequired: "Widerrufsverzicht fehlt",
};

test("ohne Zustimmung fehlt zuerst der AGB-Schritt", () => {
  assert.equal(missingConsent({ terms: false, withdrawal: false }), "terms");
});

test("nach dem AGB-Häkchen nennt die Meldung sofort den Widerrufsverzicht", () => {
  // Regression: Vorher blieb die alte AGB-Meldung stehen, bis erneut geklickt
  // wurde, und das bereits gültige Häkchen blieb als ungültig markiert.
  assert.deepEqual(
    consentFeedback({ terms: true, withdrawal: false }, true, messages),
    { field: "withdrawal", message: "Widerrufsverzicht fehlt" },
  );
});

test("ohne Klickversuch erscheint keine Meldung", () => {
  assert.equal(consentFeedback({ terms: false, withdrawal: false }, false, messages), null);
  assert.equal(consentFeedback({ terms: true, withdrawal: false }, false, messages), null);
});

test("mit beiden Häkchen verschwindet die Meldung", () => {
  assert.equal(missingConsent({ terms: true, withdrawal: true }), null);
  assert.equal(consentFeedback({ terms: true, withdrawal: true }, true, messages), null);
});
