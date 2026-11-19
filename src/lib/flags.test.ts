import assert from "node:assert/strict";
import { test } from "node:test";
import { FEATURE_FLAGS, isEnabledValue } from "./flags.ts";

test("only explicit truthy values enable a flag", () => {
  for (const value of ["1", "true", " TRUE ", "True"]) {
    assert.equal(isEnabledValue(value), true, `did not enable ${value}`);
  }
  for (const value of ["0", "false", "", "   ", "yes", "on", "2", undefined, null]) {
    assert.equal(isEnabledValue(value), false, `enabled ${String(value)}`);
  }
});

test("flags keep stable setting keys and start from an absent key", () => {
  assert.deepEqual(FEATURE_FLAGS, {
    trial: "trial_enabled",
    cloudBackup: "cloud_backup_enabled",
    annualBilling: "annual_enabled",
    conversionCoupon: "conversion_coupon_enabled",
    retention: "retention_enabled",
  });
  // Ein fehlender Schlüssel liest sich als leerer Wert und ist damit aus.
  assert.equal(isEnabledValue(undefined), false);
});
