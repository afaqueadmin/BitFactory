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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      console.error("[Confirmo] NEXT_PUBLIC_APP_URL is not configured!");
      throw new Error(
        "NEXT_PUBLIC_APP_URL must be configured for Confirmo payments",
      );
    }

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
      returnUrl: `${appUrl}/invoices/${params.invoiceId}/payment-success`,
      notifyUrl: `${appUrl}/api/webhooks/confirmo`,
    };

    console.log(
      "[Confirmo] Creating invoice with payload:",
      JSON.stringify(payload, null, 2),
    );

    try {
      const response = await this.client.post("/invoices", payload);
      console.log("[Confirmo] Invoice created successfully:", response.data);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { message?: string; error?: string };
        };
      };
      console.error("Confirmo API Error - Full details:", {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        payload: payload,
      });

      const errorMessage =
        axiosError.response?.data?.message ||
        axiosError.response?.data?.error ||
        "Failed to create Confirmo payment";
      throw new Error(`Confirmo Error: ${errorMessage}`);
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
