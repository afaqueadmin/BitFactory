"use client";

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  ALL_BANKS,
  BANKS_HREF,
  BankLabel,
  BankPicker,
  CONSOLIDATED_HREF,
  ExportButtons,
  RangeControls,
  StatementCards,
  StatementTable,
  bankStatementHref,
  formatUsd,
  isDay,
  plural,
  rangeQuery,
} from "@/components/accounting/bankStatement/StatementParts";
import {
  AccountingBank,
  consolidatedStatementQuery,
  useAccountingBanks,
  useAccountingEntities,
  useConsolidatedStatement,
} from "@/lib/hooks/usePaymentAccounts";
import { downloadExport } from "@/lib/downloadExport";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/**
 * Consolidated Bank Statement: the payments of several banks (default: all)
 * in one table with one running balance and a Bank column (the PDF export
 * also has a "By bank" summary). Filters live in the URL: ?entity=<id>&bank=<id>,<id>&from&to.
 *
 * There is no transfer between our own banks in the app yet, so adding
 * banks together counts nothing twice.
 */

export default function ConsolidatedStatementPage() {
  return (
    <Suspense fallback={<DaylightLoading />}>
      <ConsolidatedStatementContent />
    </Suspense>
  );
}

function ConsolidatedStatementContent() {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = isDay(fromParam) ? fromParam : "";
  const to = isDay(toParam) ? toParam : "";
  const entityId = searchParams.get("entity") ?? "";
  const bankParam = searchParams.get("bank") ?? "";
  const bankIds = useMemo(
    () => bankParam.split(",").filter(Boolean),
    [bankParam],
  );
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: allBanks = [] } = useAccountingBanks();
  const { data: entities = [] } = useAccountingEntities();
  const rangeError = !!(from && to && from > to);
  const qFrom = rangeError ? "" : from;
  const qTo = rangeError ? "" : to;
  const { data, isLoading, error } = useConsolidatedStatement(
    entityId,
    bankIds,
    qFrom,
    qTo,
  );
  const hasRange = !!(from || to) && !rangeError;

  /** Replace the URL with these filters (empty values dropped). */
  const go = (next: {
    entity?: string;
    banks?: string[];
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    const entity = next.entity ?? entityId;
    const banks = next.banks ?? bankIds;
    if (entity) q.set("entity", entity);
    if (banks.length) q.set("bank", banks.join(","));
    router.replace(
      `${CONSOLIDATED_HREF}${rangeQuery(next.from ?? from, next.to ?? to, q)}`,
      { scroll: false },
    );
  };
  const openBank = (target: string) => {
    if (target === ALL_BANKS) return;
    router.push(`${bankStatementHref(target)}${rangeQuery(from, to)}`, {
      scroll: false,
    });
  };

  const bankOptions = useMemo(
    () =>
      allBanks
        .filter((b) => !entityId || b.entityId === entityId)
        .sort(
          (a, b) =>
            a.entity.name.localeCompare(b.entity.name) ||
            Number(b.isActive) - Number(a.isActive) ||
            a.name.localeCompare(b.name),
        ),
    [allBanks, entityId],
  );
  const selectedBanks = bankOptions.filter((b) => bankIds.includes(b.id));

  const bankLabels = useMemo(
    () =>
      new Map<string, BankLabel>(
        (data?.banks ?? []).map((b) => [
          b.id,
          { name: b.name, entityName: b.entity.name, isActive: b.isActive },
        ]),
      ),
    [data?.banks],
  );

  const scopeText = !data
    ? ""
    : data.allBanks
      ? data.entity
        ? `All banks of ${data.entity.name}`
        : "All banks"
      : data.banks.map((b) => b.name).join(", ");

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setExporting(format);
      setExportError(null);
      const query = consolidatedStatementQuery(entityId, bankIds, qFrom, qTo);
      query.set("format", format);
      await downloadExport(
        `/api/accounting/banks/statement/export?${query.toString()}`,
        `bank-statement-all-banks-${new Date().toLocaleDateString("en-CA")}.${format}`,
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
          <Typography component="h1" sx={{ ...ds.pageTitleSx, mb: 0 }}>
            Consolidated Bank Statement
          </Typography>
          <Typography sx={{ fontSize: 13, color: d.muted, mt: 0.75 }}>
            {scopeText || "Payments of every bank in one statement"}
          </Typography>
        </Box>
        <BankPicker banks={allBanks} current={ALL_BANKS} onChange={openBank} />
      </Box>

      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", md: "center" }}
          sx={{ mb: 2, ...ds.inputSx }}
        >
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Entity</InputLabel>
            <Select
              label="Entity"
              value={entities.some((e) => e.id === entityId) ? entityId : ""}
              onChange={(e) => go({ entity: e.target.value, banks: [] })}
            >
              <MenuItem value="">All entities</MenuItem>
              {entities.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                  {!e.isActive && " (inactive)"}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete<AccountingBank, true>
            multiple
            size="small"
            options={bankOptions}
            value={selectedBanks}
            groupBy={(b) => b.entity.name}
            getOptionLabel={(b) =>
              `${b.name}${b.isActive ? "" : " (inactive)"}`
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, value) => go({ banks: value.map((b) => b.id) })}
            limitTags={3}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Banks"
                placeholder={selectedBanks.length ? "" : "All banks"}
                InputLabelProps={{ ...params.InputLabelProps, shrink: true }}
              />
            )}
            sx={{ flex: 1, minWidth: { md: 280 } }}
          />
        </Stack>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", lg: "center" }}
          sx={{ mb: 2.5 }}
        >
          <RangeControls
            from={from}
            to={to}
            onChange={(f, t) => go({ from: f, to: t })}
          />
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
            {error?.message ?? "Failed to load the consolidated statement"}
          </Alert>
        ) : (
          <>
            <StatementCards
              data={data}
              hasRange={hasRange}
              from={from}
              to={to}
            />
            {data.unbanked.count > 0 && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="flex-start"
                sx={{ mt: -1.5, mb: 3, color: d.muted, fontSize: 12.5 }}
              >
                <InfoOutlinedIcon sx={{ fontSize: 16, mt: "1px" }} />
                <span>
                  {plural(data.unbanked.count, "payment")} (
                  {formatUsd(data.unbanked.amountUsd)})
                  {hasRange ? " in this period" : ""}{" "}
                  {data.unbanked.count === 1 ? "has" : "have"} no bank recorded,
                  so {data.unbanked.count === 1 ? "it is" : "they are"} not on
                  any bank statement and not included here.
                </span>
              </Stack>
            )}
            <StatementTable
              data={data}
              hasRange={hasRange}
              from={from}
              to={to}
              banks={bankLabels}
              emptyText={
                data.banks.length === 0
                  ? "No banks to show"
                  : hasRange
                    ? "No payments recorded to these banks in this period"
                    : "No payments recorded to these banks yet"
              }
            />
          </>
        )}
      </Paper>
    </DaylightAdminPage>
  );
}
