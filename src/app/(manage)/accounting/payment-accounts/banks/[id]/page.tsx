"use client";

import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  ALL_BANKS,
  BANKS_HREF,
  BankPicker,
  CONSOLIDATED_HREF,
  ExportButtons,
  RangeControls,
  StatementCards,
  StatementTable,
  bankStatementHref,
  isDay,
  rangeQuery,
} from "@/components/accounting/bankStatement/StatementParts";
import {
  useAccountingBanks,
  useBankStatement,
} from "@/lib/hooks/usePaymentAccounts";
import { downloadExport } from "@/lib/downloadExport";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightLoading,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/**
 * Bank Statement: every payment received into (Debit) or sent from (Credit)
 * one bank, oldest first, with a running balance. USD at the rate saved
 * with each payment. Opened from Entities, Banks & Currencies -> Banks.
 *
 * The date range lives in the URL (?from=&to=), so it survives a refresh
 * and switching bank (or to "All banks") with the picker.
 */

export default function BankStatementPage() {
  return (
    <Suspense fallback={<DaylightLoading />}>
      <BankStatementContent />
    </Suspense>
  );
}

function BankStatementContent() {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const bankId = typeof params.id === "string" ? params.id : "";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = isDay(fromParam) ? fromParam : "";
  const to = isDay(toParam) ? toParam : "";
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: banks = [] } = useAccountingBanks();
  const rangeError = !!(from && to && from > to);
  const { data, isLoading, error } = useBankStatement(
    bankId,
    rangeError ? "" : from,
    rangeError ? "" : to,
  );
  const hasRange = !!(from || to) && !rangeError;

  const setRange = (f: string, t: string) =>
    router.replace(`${bankStatementHref(bankId)}${rangeQuery(f, t)}`, {
      scroll: false,
    });
  const switchBank = (target: string) =>
    router.push(
      `${target === ALL_BANKS ? CONSOLIDATED_HREF : bankStatementHref(target)}${rangeQuery(from, to)}`,
      { scroll: false },
    );

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setExporting(format);
      setExportError(null);
      const query = new URLSearchParams({
        format,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (from && !rangeError) query.set("from", from);
      if (to && !rangeError) query.set("to", to);
      const slug =
        data?.bank.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "bank";
      await downloadExport(
        `/api/accounting/banks/${bankId}/statement/export?${query.toString()}`,
        `bank-statement-${slug}-${new Date().toLocaleDateString("en-CA")}.${format}`,
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to download export",
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <DaylightAdminPage>
      <Button
        component={Link}
        href={BANKS_HREF}
        startIcon={<ArrowBackIcon />}
        sx={{ ...ds.textBtnSx("action"), mb: 1, px: 0 }}
      >
        Banks
      </Button>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { xs: "stretch", md: "flex-end" },
          justifyContent: "space-between",
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Typography component="h1" sx={{ ...ds.pageTitleSx, mb: 0 }}>
              {data ? data.bank.name : "Bank Statement"}
            </Typography>
            {data && !data.bank.isActive && (
              <DaylightStatusPill label="Inactive" tone="neutral" />
            )}
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 0.75 }}
          >
            <Typography sx={{ fontSize: 13, color: d.muted }}>
              Bank Statement
              {data && ` · ${data.bank.entity.name}`}
            </Typography>
            {data?.bank.currencies.map((code) => (
              <DaylightStatusPill key={code} label={code} tone="info" />
            ))}
          </Stack>
        </Box>
        <BankPicker banks={banks} current={bankId} onChange={switchBank} />
      </Box>

      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", lg: "center" }}
          sx={{ mb: 2.5 }}
        >
          <RangeControls from={from} to={to} onChange={setRange} />
          <ExportButtons
            disabled={!data}
            exporting={exporting}
            onExport={handleExport}
          />
        </Stack>

        {rangeError && (
          <Alert severity="warning" sx={{ mb: 2, ...ds.alertSx("warning") }}>
            The From date must be on or before the To date.
          </Alert>
        )}
        {exportError && (
          <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
            {exportError}
          </Alert>
        )}

        {isLoading ? (
          <DaylightLoading />
        ) : error || !data ? (
          <Alert severity="error" sx={{ ...ds.alertSx("error") }}>
            {error?.message ?? "Failed to load the bank statement"}
          </Alert>
        ) : (
          <>
            <StatementCards
              data={data}
              hasRange={hasRange}
              from={from}
              to={to}
            />
            <StatementTable
              data={data}
              hasRange={hasRange}
              from={from}
              to={to}
              emptyText={
                hasRange
                  ? "No payments recorded to this bank in this period"
                  : "No payments recorded to this bank yet"
              }
            />
          </>
        )}
      </Paper>
    </DaylightAdminPage>
  );
}
