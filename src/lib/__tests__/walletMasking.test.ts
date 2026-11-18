import { describe, expect, it } from "vitest";
import {
  maskPaymentSettingsBody,
  maskTransactionAddresses,
} from "@/lib/walletMasking";

const ADDR = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const MASKED = "bc1qar…wf5mdq";

describe("maskPaymentSettingsBody", () => {
  it("masks a Luxor list response (payment_settings[].addresses[])", () => {
    const body = {
      payment_settings: [
        {
          currency_type: "BTC",
          payment_frequency: "DAILY",
          addresses: [
            {
              address_id: 1,
              address_name: ADDR,
              external_address: ADDR,
              revenue_allocation: 100,
            },
          ],
        },
      ],
      pagination: { page_number: 1 },
    };
    const out = maskPaymentSettingsBody(body);
    const a = out.payment_settings[0].addresses[0];
    expect(a.external_address).toBe(MASKED);
    expect(a.address_name).toBe(MASKED);
    expect(a.revenue_allocation).toBe(100);
    expect(out.payment_settings[0].payment_frequency).toBe("DAILY");
    expect(JSON.stringify(out)).not.toContain(ADDR);
    // Input untouched (cached copies stay full for staff).
    expect(body.payment_settings[0].addresses[0].external_address).toBe(ADDR);
  });

  it("masks a single settings object and leaves a plain label alone", () => {
    const out = maskPaymentSettingsBody({
      addresses: [{ address_name: "My wallet", external_address: ADDR }],
    });
    expect(out.addresses[0].external_address).toBe(MASKED);
    expect(out.addresses[0].address_name).toBe("My wallet");
  });
});

describe("maskTransactionAddresses", () => {
  it("masks address_name on Luxor transaction rows", () => {
    const rows = maskTransactionAddresses([
      { address_name: ADDR, transaction_category: "Payment" },
      { address_name: "", transaction_category: "Miner Revenue" },
    ]);
    expect(rows[0].address_name).toBe(MASKED);
    expect(rows[1].address_name).toBe("");
  });
});
