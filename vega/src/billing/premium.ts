/**
 * Premium-Kauf als Zustandsautomat – Port von PremiumPurchaseController.kt.
 *
 * Grundregel unverändert: Premium entsteht nie im Client. Ein Kaufbeleg geht an
 * den Server, und nur `premiumActive` aus der Serverantwort zählt.
 */

export const DEFAULT_PREMIUM_SKU = "premium_monthly";

export type PremiumOffer = { sku: string; displayPrice: string | null; available: boolean };

export type BillingReceipt = { receiptId: string; appUserId: string; productId: string };

export type BillingOutcome =
  | { kind: "purchased"; receipt: BillingReceipt }
  | { kind: "already_owned" }
  | { kind: "pending" }
  | { kind: "failed"; message: string }
  | { kind: "unavailable" };

export type SubmissionResult = {
  premiumActive: boolean;
  currentPeriodEnd?: string;
  message?: string;
};

export interface PremiumBilling {
  offer(sku: string): Promise<PremiumOffer>;
  purchase(sku: string): Promise<BillingOutcome>;
  restore(sku: string): Promise<BillingOutcome>;
  /** Bestätigt die Erfüllung erst, nachdem der Server zugestimmt hat. */
  acknowledge(receiptId: string): Promise<void>;
}

export const unavailableBilling: PremiumBilling = {
  async offer(sku) {
    return { sku, displayPrice: null, available: false };
  },
  async purchase() {
    return { kind: "unavailable" };
  },
  async restore() {
    return { kind: "unavailable" };
  },
  async acknowledge() {
    return;
  },
};

export type PremiumBillingState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; displayPrice: string | null }
  | { kind: "purchasing" }
  | { kind: "pending" }
  | { kind: "active"; currentPeriodEnd?: string }
  | { kind: "error"; message: string };

type Deps = {
  billing: PremiumBilling;
  submitReceipt: (receipt: BillingReceipt) => Promise<SubmissionResult>;
  refreshSubscription: () => Promise<SubmissionResult>;
  sku?: string;
};

export class PremiumPurchaseController {
  private state: PremiumBillingState = { kind: "loading" };
  private readonly listeners = new Set<(state: PremiumBillingState) => void>();
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  getState(): PremiumBillingState {
    return this.state;
  }

  subscribe(listener: (state: PremiumBillingState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private set(next: PremiumBillingState): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  async load(): Promise<void> {
    this.set({ kind: "loading" });
    try {
      const offer = await this.deps.billing.offer(this.deps.sku ?? DEFAULT_PREMIUM_SKU);
      this.set(offer.available ? { kind: "ready", displayPrice: offer.displayPrice } : { kind: "unavailable" });
    } catch {
      this.set({ kind: "unavailable" });
    }
  }

  async purchase(): Promise<void> {
    this.set({ kind: "purchasing" });
    let outcome: BillingOutcome;
    try {
      outcome = await this.deps.billing.purchase(this.deps.sku ?? DEFAULT_PREMIUM_SKU);
    } catch (error) {
      outcome = {
        kind: "failed",
        message: error instanceof Error ? error.message : "Der Kauf konnte nicht gestartet werden.",
      };
    }
    await this.handle(outcome, false);
  }

  async restore(): Promise<void> {
    this.set({ kind: "purchasing" });
    let outcome: BillingOutcome;
    try {
      outcome = await this.deps.billing.restore(this.deps.sku ?? DEFAULT_PREMIUM_SKU);
    } catch (error) {
      outcome = {
        kind: "failed",
        message: error instanceof Error ? error.message : "Der Kauf konnte nicht wiederhergestellt werden.",
      };
    }
    if (outcome.kind === "unavailable") {
      await this.refresh();
      return;
    }
    await this.handle(outcome, true);
  }

  /** Fragt den Abo-Status beim Server nach (Verlängerung, Kündigung). */
  async refresh(): Promise<void> {
    this.set({ kind: "loading" });
    try {
      const result = await this.deps.refreshSubscription();
      this.set(
        result.premiumActive
          ? { kind: "active", currentPeriodEnd: result.currentPeriodEnd }
          : { kind: "error", message: result.message ?? "Kein aktives Premium-Abo gefunden." },
      );
    } catch (error) {
      this.set({
        kind: "error",
        message: error instanceof Error ? error.message : "Der Abo-Status konnte nicht geladen werden.",
      });
    }
  }

  private async handle(outcome: BillingOutcome, restoring: boolean): Promise<void> {
    switch (outcome.kind) {
      case "purchased":
        await this.submit(outcome.receipt);
        return;
      case "already_owned":
        if (restoring) {
          this.set({ kind: "error", message: "Kein Kauf auf diesem Gerät gefunden." });
        } else {
          await this.restore();
        }
        return;
      case "pending":
        this.set({ kind: "pending" });
        return;
      case "failed":
        this.set({ kind: "error", message: outcome.message });
        return;
      case "unavailable":
        this.set({ kind: "unavailable" });
        return;
    }
  }

  private async submit(receipt: BillingReceipt): Promise<void> {
    let result: SubmissionResult;
    try {
      result = await this.deps.submitReceipt(receipt);
    } catch (error) {
      this.set({
        kind: "error",
        message: error instanceof Error ? error.message : "Der Kaufbeleg konnte nicht geprüft werden.",
      });
      return;
    }

    if (!result.premiumActive) {
      this.set({
        kind: "error",
        message: result.message ?? "Der Kaufbeleg wurde vom Server nicht bestätigt.",
      });
      return;
    }

    try {
      await this.deps.billing.acknowledge(receipt.receiptId);
    } catch {
      // Die Erfüllung ist bestätigt; ein fehlgeschlagenes Acknowledge darf den
      // freigeschalteten Zustand nicht zurücksetzen.
    }
    this.set({ kind: "active", currentPeriodEnd: result.currentPeriodEnd });
  }
}
