"use client";

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import SubdirectoryArrowRightIcon from "@mui/icons-material/SubdirectoryArrowRight";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { sortInvoiceLineItems } from "@/lib/accounting/hostingMonths";

export interface SavedLineItem {
  id: string;
  parentLineItemId?: string | null;
  hardwareId?: string | null;
  model: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  lineItemType?:
    "HARDWARE" | "HOSTING_COLOCATION" | "REPAIR" | "DISCOUNT" | null;
  billingMonth?: string | null;
}

interface InvoiceLineItemsTableProps {
  lineItems: SavedLineItem[];
  quantityLabel: string;
}

/**
 * Read-only line items for Hosting & Colocation and Hardware Sales invoices.
 * Each discount sits under its row; Subtotal and Discounts lines are shown
 * when the invoice has any.
 */
export function InvoiceLineItemsTable({
  lineItems,
  quantityLabel,
}: InvoiceLineItemsTableProps) {
  const rows = sortInvoiceLineItems(lineItems);
  const discounts = lineItems.filter((li) => li.lineItemType === "DISCOUNT");
  const discountTotal = discounts.reduce(
    (sum, li) => sum + Math.abs(Number(li.totalPrice)),
    0,
  );
  const subtotal = lineItems
    .filter((li) => li.lineItemType !== "DISCOUNT")
    .reduce((sum, li) => sum + Number(li.totalPrice), 0);

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Model</TableCell>
          <TableCell align="right">{quantityLabel}</TableCell>
          <TableCell align="right">Unit Price (USD)</TableCell>
          <TableCell align="right">Total Price (USD)</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((item) =>
          item.lineItemType === "DISCOUNT" ? (
            <TableRow
              key={item.id}
              sx={{ backgroundColor: "rgba(46, 125, 50, 0.06)" }}
            >
              <TableCell sx={{ pl: 3 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    fontStyle: "italic",
                  }}
                >
                  <SubdirectoryArrowRightIcon
                    fontSize="small"
                    sx={{ color: "success.main" }}
                  />
                  {item.model}
                </Box>
              </TableCell>
              <TableCell align="right">—</TableCell>
              <TableCell align="right">—</TableCell>
              <TableCell align="right" sx={{ color: "success.dark" }}>
                −<CurrencyDisplay value={Math.abs(Number(item.totalPrice))} />
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={item.id}>
              <TableCell>{item.model}</TableCell>
              <TableCell align="right">{item.quantity}</TableCell>
              <TableCell align="right">
                <CurrencyDisplay value={item.unitPrice} />
              </TableCell>
              <TableCell align="right">
                <CurrencyDisplay value={item.totalPrice} />
              </TableCell>
            </TableRow>
          ),
        )}
        {discounts.length > 0 && (
          <>
            <TableRow>
              <TableCell colSpan={3} align="right">
                Subtotal
              </TableCell>
              <TableCell align="right">
                <CurrencyDisplay value={subtotal} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell
                colSpan={3}
                align="right"
                sx={{ color: "success.dark" }}
              >
                Discounts
              </TableCell>
              <TableCell align="right" sx={{ color: "success.dark" }}>
                −<CurrencyDisplay value={discountTotal} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={3} align="right" sx={{ fontWeight: "bold" }}>
                Total
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold" }}>
                <CurrencyDisplay value={subtotal - discountTotal} />
              </TableCell>
            </TableRow>
          </>
        )}
      </TableBody>
    </Table>
  );
}
