import axios, { AxiosInstance } from "axios";

export class ConfirmoClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.CONFIRMO_API_KEY || "";

    if (!this.apiKey) {
      throw new Error("CONFIRMO_API_KEY is not configured");
    }

    this.client = axios.create({
      baseURL: "https://confirmo.net/api/v3",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Create Confirmo invoice for crypto payment
   * Uses data from your invoice creation form:
   * - Customer info (from selected user)
   * - Number of miners (totalMiners field)
   * - Unit price (unitPrice field)
   * - Total amount (totalAmount = totalMiners × unitPrice)
   */
  async createInvoice(params: CreateInvoiceParams) {
    const payload = {
      invoice: {
        amount: params.amount, // From form: totalAmount
        currencyFrom: "USD", // Always USD for electricity charges
      },
      settlement: {
        currency: params.settlementCurrency || "USDC", // Admin receives USDC
      },
      product: {
        name: `BitFactory Invoice ${params.invoiceNumber}`,
        description: `Electricity charges for ${params.totalMiners} miners @ $${params.unitPrice}/miner`,
      },
      customerEmail: params.customerEmail, // From selected user in form
      notifyEmail: params.adminEmail, // admin@bitfactory.ae
      reference: params.invoiceNumber, // Generated invoice number
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${params.invoiceId}/payment-success`,
      notifyUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/confirmo`,
    };

    try {
      const response = await this.client.post("/invoices", payload);
      return response.data;
    } catch (error: unknown) {
      console.error("Confirmo API Error:", error);
      throw new Error("Failed to create Confirmo payment. Please try again.");
    }
  }

  async getInvoiceStatus(confirmoInvoiceId: string) {
    try {
      const response = await this.client.get(`/invoices/${confirmoInvoiceId}`);
      return response.data;
    } catch (error: unknown) {
      console.error("Confirmo API Error:", error);
      throw new Error("Failed to fetch payment status");
    }
  }

  async cancelInvoice(confirmoInvoiceId: string) {
    try {
      const response = await this.client.delete(
        `/invoices/${confirmoInvoiceId}`,
      );
      return response.data;
    } catch (error: unknown) {
      console.error("Confirmo API Error:", error);
      throw new Error("Failed to cancel payment");
    }
  }
}

export interface CreateInvoiceParams {
  invoiceId: string; // Your database invoice ID
  invoiceNumber: string; // From form: generated invoice number
  amount: string; // From form: totalAmount (totalMiners × unitPrice)
  totalMiners: number; // From form: number of miners
  unitPrice: string; // From form: price per miner
  settlementCurrency?: string; // USDC, USDT, BTC (from settings)
  customerEmail: string; // From form: selected user's email
  adminEmail: string; // admin@bitfactory.ae
}
