-- Add HARDWARE_SALES as a new InvoiceType value.
-- HARDWARE_PURCHASE is kept in the enum for backward compatibility with historical data;
-- new hardware invoices (sold to customers) should use HARDWARE_SALES going forward.
ALTER TYPE "InvoiceType" ADD VALUE 'HARDWARE_SALES';
