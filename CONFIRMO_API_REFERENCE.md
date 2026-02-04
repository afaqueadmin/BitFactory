# Confirmo API Integration - Quick Reference

## 🔗 API Endpoints

### **1. Create Payment Link**
```
POST /api/invoices/[invoiceId]/confirmo-payment
```

**Authentication:** Required (session)

**Request:** No body needed (uses invoice data)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cuid_123",
    "invoiceId": "invoice_abc",
    "confirmoInvoiceId": "conf_xyz789",
    "paymentUrl": "https://confirmo.net/pay/conf_xyz789",
    "amount": "250.00",
    "currency": "USD",
    "status": "PENDING",
    "expiresAt": "2026-02-05T00:00:00Z"
  },
  "message": "Payment link created successfully"
}
```

**Usage Example (Frontend):**
```typescript
const createPaymentLink = async (invoiceId: string) => {
  const response = await fetch(`/api/invoices/${invoiceId}/confirmo-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Redirect to payment page
    window.location.href = data.data.paymentUrl;
  }
};
```

---

### **2. Get Payment Status**
```
GET /api/invoices/[invoiceId]/confirmo-payment
```

**Authentication:** Required (session)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cuid_123",
    "status": "CONFIRMED",
    "paymentUrl": "https://confirmo.net/pay/conf_xyz789",
    "amount": "250.00",
    "paidAmount": "250.00",
    "paidCurrency": "USDT",
    "transactionHash": "0x1234abcd...",
    "confirmedAt": "2026-02-04T12:30:00Z",
    "invoice": {
      "invoiceNumber": "20260204001",
      "totalAmount": "250.00",
      "totalMiners": 10,
      "unitPrice": "25.00",
      "status": "PAID"
    }
  }
}
```

---

### **3. Webhook Endpoint** (Confirmo → Your App)
```
POST /api/webhooks/confirmo
```

**Authentication:** Webhook signature verification

**Payload (from Confirmo):**
```json
{
  "id": "conf_xyz789",
  "status": "confirmed",
  "paid_amount": "250.00",
  "paid_currency": "USDT",
  "tx_hash": "0x1234abcd...",
  "settled_amount": "250.00",
  "settled_currency": "USDC",
  "reference": "20260204001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

**Configure in Confirmo Dashboard:**
```
Webhook URL: https://my.bitfactory.ae/api/webhooks/confirmo
Events: All payment events
Secret: (copy to .env as CONFIRMO_WEBHOOK_SECRET)
```

---

## 🔄 Payment Flow

```
1. Admin creates invoice
   ↓
2. POST /api/invoices/[id]/confirmo-payment
   ↓
3. System calls Confirmo API
   ↓
4. Payment link returned
   ↓
5. Customer clicks link → Confirmo payment page
   ↓
6. Customer pays with crypto
   ↓
7. Confirmo sends webhook to /api/webhooks/confirmo
   ↓
8. System updates invoice status to PAID
   ↓
9. Creates CostPayment record
   ↓
10. Sends confirmation email
    ↓
11. Customer redirected to /invoices/[id]/payment-success
```

---

## 💾 Database Schema

### **ConfirmoPayment Table**
```prisma
model ConfirmoPayment {
  id                String   // Primary key
  invoiceId         String   // Link to Invoice (unique)
  confirmoInvoiceId String   // Confirmo's invoice ID (unique)
  paymentUrl        String   // Payment link for customer
  amount            Decimal  // USD amount
  currency          String   // USD
  settlementCurrency String? // USDC/USDT/BTC
  status            Enum     // PENDING/PROCESSING/CONFIRMED/etc
  paidAmount        Decimal? // Amount paid in crypto
  paidCurrency      String?  // BTC/ETH/USDT/etc
  transactionHash   String?  // Blockchain tx hash
  confirmedAt       DateTime?
  customerEmail     String
  notifyEmail       String
  reference         String   // Invoice number
  createdAt         DateTime
  updatedAt         DateTime
  expiresAt         DateTime?
}
```

### **Payment Statuses**
```typescript
enum ConfirmoPaymentStatus {
  PENDING      // Payment link created, waiting for customer
  PROCESSING   // Payment initiated, waiting for blockchain
  CONFIRMED    // Payment confirmed on blockchain
  COMPLETED    // Invoice marked as paid
  EXPIRED      // Payment link expired
  CANCELLED    // Cancelled by admin
  FAILED       // Payment failed
}
```

---

## 🎨 Frontend Integration Examples

### **Add "Pay with Crypto" Button to Invoice Page**

```tsx
// filepath: src/app/(dashboard)/invoices/[id]/page.tsx

import { useState } from 'react';

export default function InvoicePage({ invoice }) {
  const [loading, setLoading] = useState(false);
  
  const handleCryptoPayment = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/invoices/${invoice.id}/confirmo-payment`,
        { method: 'POST' }
      );
      
      const data = await response.json();
      
      if (data.success) {
        // Redirect to Confirmo payment page
        window.location.href = data.data.paymentUrl;
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create payment link');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      {/* Invoice details */}
      
      {invoice.status !== 'PAID' && (
        <button
          onClick={handleCryptoPayment}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg"
        >
          {loading ? 'Creating Link...' : '💳 Pay with Crypto'}
        </button>
      )}
    </div>
  );
}
```

### **Show Payment Status**

```tsx
import { useEffect, useState } from 'react';

export default function PaymentStatus({ invoiceId }) {
  const [payment, setPayment] = useState(null);
  
  useEffect(() => {
    const fetchStatus = async () => {
      const response = await fetch(
        `/api/invoices/${invoiceId}/confirmo-payment`
      );
      const data = await response.json();
      if (data.success) {
        setPayment(data.data);
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30s
    
    return () => clearInterval(interval);
  }, [invoiceId]);
  
  if (!payment) return null;
  
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold">Crypto Payment Status</h3>
      <p>Status: {payment.status}</p>
      {payment.paidCurrency && (
        <p>Paid with: {payment.paidCurrency}</p>
      )}
      {payment.transactionHash && (
        <p className="text-xs">
          Tx: {payment.transactionHash.slice(0, 20)}...
        </p>
      )}
    </div>
  );
}
```

---

## 📧 Email Template Integration

### **Add to Invoice Email Template**

```typescript
// In your email service

const confirmoPayment = await prisma.confirmoPayment.findUnique({
  where: { invoiceId: invoice.id }
});

if (confirmoPayment) {
  emailHtml += `
    <div style="margin: 30px 0; padding: 20px; background: #f0f9ff; 
                border-radius: 8px; text-align: center;">
      <h3 style="color: #1e40af;">💳 Pay with Cryptocurrency</h3>
      <p>Click the button below to pay with Bitcoin, Ethereum, USDT, or other cryptocurrencies:</p>
      <a href="${confirmoPayment.paymentUrl}" 
         style="display: inline-block; padding: 15px 40px; background: #3b82f6; 
                color: white; text-decoration: none; border-radius: 8px; 
                font-weight: bold; margin: 15px 0;">
        Pay Now with Crypto →
      </a>
      <p style="font-size: 12px; color: #666; margin-top: 10px;">
        Amount: $${invoice.totalAmount}<br>
        Supported: BTC, ETH, USDT, USDC, and more
      </p>
    </div>
  `;
}
```

---

## 🧪 Testing with Confirmo Sandbox

Confirmo provides a sandbox environment for testing:

1. **Get Sandbox API Key:**
   - Login to Confirmo dashboard
   - Switch to "Sandbox Mode"
   - Copy sandbox API key

2. **Update .env for testing:**
   ```bash
   CONFIRMO_API_KEY=your_sandbox_api_key
   ```

3. **Test Payment Flow:**
   - Create test invoice
   - Generate payment link
   - Use test cryptocurrency addresses
   - Verify webhook is called
   - Check invoice status updates

4. **Switch to Production:**
   - Replace with production API key
   - Update webhook URL
   - Test with small real payment

---

## 🐛 Debugging

### **Check Payment Link Creation**
```bash
# Server logs should show:
Creating Confirmo payment with invoice data: {
  invoiceNumber: '20260204001',
  customer: 'customer@example.com',
  totalMiners: 10,
  unitPrice: '25',
  totalAmount: '250'
}

Confirmo payment created successfully: {
  confirmoInvoiceId: 'conf_xyz789',
  paymentUrl: 'https://confirmo.net/pay/conf_xyz789'
}
```

### **Check Webhook Processing**
```bash
# Server logs should show:
📨 Confirmo webhook received: {
  id: 'conf_xyz789',
  status: 'confirmed',
  reference: '20260204001',
  timestamp: '2026-02-04T12:30:00.000Z'
}

Payment confirmed, updating invoice status to PAID

✅ Webhook processed successfully: {
  confirmoInvoiceId: 'conf_xyz789',
  invoiceNumber: '20260204001',
  status: 'CONFIRMED'
}
```

### **Common Issues**

1. **"Crypto payment is not enabled"**
   - Check: `confirmoEnabled` in `payment_details` table
   - Fix: Set to `true`

2. **"Failed to create Confirmo payment"**
   - Check: `CONFIRMO_API_KEY` in .env
   - Check: Internet connection
   - Check: Confirmo API status

3. **"Webhook not receiving data"**
   - Check: Webhook URL configured in Confirmo dashboard
   - Check: Firewall allows incoming webhooks
   - Check: HTTPS certificate valid

4. **"Invalid signature"**
   - Check: `CONFIRMO_WEBHOOK_SECRET` matches Confirmo dashboard
   - Update secret if mismatch

---

## 📊 Monitoring

### **Database Queries**

```sql
-- Check all Confirmo payments
SELECT * FROM confirmo_payments ORDER BY "createdAt" DESC;

-- Check pending payments
SELECT * FROM confirmo_payments WHERE status = 'PENDING';

-- Check confirmed payments today
SELECT * FROM confirmo_payments 
WHERE status = 'CONFIRMED' 
  AND "confirmedAt" >= CURRENT_DATE;

-- Check invoices with crypto payments
SELECT i.*, cp.status as crypto_status, cp."paymentUrl"
FROM invoices i
LEFT JOIN confirmo_payments cp ON cp."invoiceId" = i.id
WHERE cp.id IS NOT NULL;
```

### **Audit Trail**

All Confirmo activities are logged in `audit_logs`:

```sql
SELECT * FROM audit_logs 
WHERE "entityType" IN ('ConfirmoPayment', 'Invoice')
  AND action IN ('INVOICE_UPDATED', 'INVOICE_PAID')
ORDER BY "createdAt" DESC;
```

---

## 🎯 Success Metrics

Track these metrics:
- Total payments via crypto
- Conversion rate (payment links created vs completed)
- Average time to payment confirmation
- Most used cryptocurrencies
- Failed payment reasons

```sql
-- Payment statistics
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM confirmo_payments
GROUP BY status;

-- Popular cryptocurrencies
SELECT 
  "paidCurrency",
  COUNT(*) as count,
  SUM(amount) as total_usd
FROM confirmo_payments
WHERE status = 'CONFIRMED'
GROUP BY "paidCurrency"
ORDER BY count DESC;
```

---

**🚀 You're all set! The Confirmo integration is ready to accept cryptocurrency payments safely.**
