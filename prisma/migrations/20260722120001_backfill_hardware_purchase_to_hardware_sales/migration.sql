-- Backfill existing invoices tagged with the old HARDWARE_PURCHASE type to HARDWARE_SALES,
-- since these invoices represent hardware sold to customers, not hardware purchased by the company.
UPDATE "invoices" SET "invoiceType" = 'HARDWARE_SALES' WHERE "invoiceType" = 'HARDWARE_PURCHASE';
