import { describe, expect, it } from "vitest";
import {
  isNonBalancePaymentType,
  paymentTypeForInvoice,
} from "../paymentTypes";

describe("paymentTypeForInvoice", () => {
  it("keeps hardware invoice payments out of the hosting balance", () => {
    expect(paymentTypeForInvoice("HARDWARE_SALES")).toBe("HARDWARE_SALES");
    expect(paymentTypeForInvoice("HARDWARE_REPAIR")).toBe("HARDWARE_REPAIR");
    expect(
      isNonBalancePaymentType(paymentTypeForInvoice("HARDWARE_REPAIR")),
    ).toBe(true);
  });

  it("records hosting invoice payments as PAYMENT", () => {
    expect(paymentTypeForInvoice("ELECTRICITY_CHARGES")).toBe("PAYMENT");
    expect(paymentTypeForInvoice("HARDWARE_PURCHASE")).toBe("PAYMENT");
  });
});
