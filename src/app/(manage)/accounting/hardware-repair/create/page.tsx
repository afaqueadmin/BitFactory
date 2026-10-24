"use client";

import { Box, Button, Container, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCreateRepairInvoice } from "@/lib/hooks/useRepairInvoices";
import { RepairInvoiceForm } from "@/components/accounting/invoices/RepairInvoiceForm";
import { DaylightThemedPage } from "@/components/daylight/DaylightMuiScope";

export default function CreateHardwareRepairInvoicePage() {
  const router = useRouter();
  const { create, loading } = useCreateRepairInvoice();

  return (
    <DaylightThemedPage>
      <Container maxWidth="md" disableGutters>
        <Stack spacing={1} sx={{ mb: 4, alignItems: "flex-start" }}>
          <Link href="/accounting/hardware-repair">
            <Button startIcon={<ArrowBackIcon />}>
              Back to Hardware Repair Dashboard
            </Button>
          </Link>
          <Box flex={1}>
            <h1 style={{ margin: 0 }}>Create New Hardware Repair Invoice</h1>
            <p style={{ margin: "8px 0 0 0", color: "var(--dl-muted, #666)" }}>
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
    </DaylightThemedPage>
  );
}
