import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PREMIUM_PLAN_ID,
  PREMIUM_PRICE_EUR,
  PRICE_BOOK,
  annualSavingCents,
  annualSavingPercent,
  billingIntervalOf,
  cents,
  planForPriceId,
  planTierOf,
  priceForPlan,
} from "./pricing.ts";

test("price book matches the published prices", () => {
  assert.equal(PREMIUM_PRICE_EUR, 3.49);
  assert.equal(cents(PRICE_BOOK.standard_monthly.eur), 349);
  assert.equal(cents(PRICE_BOOK.standard_annual.eur), 3499);
  assert.equal(PRICE_BOOK.standard_annual.interval, "year");
  assert.equal(priceForPlan("standard_annual").tier, "standard");
});

test("annual billing is cheaper than twelve monthly payments", () => {
  assert.equal(cents(PREMIUM_PRICE_EUR) * 12, 4188);
  assert.equal(annualSavingCents(), 689);
  assert.equal(annualSavingPercent(), 16);
});

test("maps configured price ids to plans", () => {
  const prices = { monthly: "price_month", annual: "price_year" };
  assert.equal(planForPriceId("price_year", prices), "standard_annual");
  assert.equal(planForPriceId("price_month", prices), "standard_monthly");
  assert.equal(planForPriceId("price_unknown", prices), null);
  assert.equal(planForPriceId("", prices), null);
  assert.equal(planForPriceId(undefined, prices), null);
  assert.equal(planForPriceId("price_year", {}), null);
  // Eine noch nicht konfigurierte Jahres-Price darf den Monatspreis nicht schlucken.
  assert.equal(planForPriceId("price_month", { annual: "" }), null);
});

test("legacy premium reads as standard", () => {
  assert.equal(PREMIUM_PLAN_ID, "premium_monthly");
  assert.equal(planTierOf("premium"), "standard");
  assert.equal(planTierOf("standard_annual"), "standard");
  assert.equal(planTierOf("pro_annual"), "pro");
  assert.equal(planTierOf(""), "free");
  assert.equal(planTierOf("none"), "free");
  assert.equal(planTierOf(null), "free");
  assert.equal(planTierOf(undefined), "free");
});

test("billing interval falls back to the plan name", () => {
  assert.equal(billingIntervalOf("standard_annual", null), "year");
  assert.equal(billingIntervalOf("standard_monthly", undefined), "month");
  assert.equal(billingIntervalOf("premium", null), null);
  assert.equal(billingIntervalOf("premium", "year"), "year");
  assert.equal(billingIntervalOf("premium", "unsupported"), null);
});
