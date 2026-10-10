"use client";

import { Box, Button, Container, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCreateRepairInvoice } from "@/lib/hooks/useRepairInvoices";
import { RepairInvoiceForm } from "@/components/accounting/invoices/RepairInvoiceForm";

export default function CreateHardwareRepairInvoicePage() {
  const router = useRouter();
  const { create, loading } = useCreateRepairInvoice();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting/hardware-repair">
          <Button startIcon={<ArrowBackIcon />}>
            Back to Hardware Repair Dashboard
          </Button>
        </Link>
        <Box flex={1}>
          <h1 style={{ margin: 0 }}>Create New Hardware Repair Invoice</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Bill a customer for repairing one of their miners
          </p>
        </Box>
      </Stack>

      <RepairInvoiceForm
        mode="create"
        submitting={loading}
        onCancel={() => router.back()}
        onSubmit={async (values) => {
          const invoice = await create(values);
          router.push(`/accounting/hardware-repair/${invoice.id}`);
        }}
      />
    </Container>
  );
}
