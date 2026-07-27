-- Add HARDWARE_SALES as a new PaymentType value.
-- Payments recorded against invoices with invoiceType = HARDWARE_SALES should be
-- tagged HARDWARE_SALES instead of the generic PAYMENT, so they can be distinguished
-- from electricity-charge payments in cost_payments.
ALTER TYPE "PaymentType" ADD VALUE 'HARDWARE_SALES';
