"use client";

/**
 * Admin: Repair Charges. Manages the per-site repair price lists clients see
 * at /repair-charges - add, edit, reorder, hide (deactivate) and delete
 * charges, and set each site's flat hands & eyes fee and parts shop link.
 * Display only: issued Hardware Repair invoices keep their own line items.
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SaveIcon from "@mui/icons-material/Save";
import { useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import {
  RepairChargeFormInput,
  useManageRepairCharges,
  useRepairCharges,
} from "@/lib/hooks/useRepairCharges";
import {
  MAX_REPAIR_NOTE_LENGTH,
  MAX_REPAIR_TYPE_LENGTH,
  MAX_REPAIR_URL_LENGTH,
  REPAIR_PRICE_TYPES,
  REPAIR_PRICE_TYPE_LABELS,
  REPAIR_SITES,
  REPAIR_SITE_LABELS,
  RepairChargeItem,
  RepairPriceType,
  RepairSite,
  RepairSiteSettingItem,
  formatRepairPrice,
} from "@/lib/repairCharges";

const errMsg = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function AdminRepairChargesPage() {
  const ds = useDaylightAdminSx();
  const [site, setSite] = useState<RepairSite>("BRAZIL");
  const { charges, settings, loading, error } = useRepairCharges({
    includeInactive: true,
  });
  const { update, remove, reorder, busy } = useManageRepairCharges();

  const [actionError, setActionError] = useState<string | null>(null);
  // null: closed; "new": add dialog; a charge: edit dialog.
  const [editing, setEditing] = useState<RepairChargeItem | "new" | null>(null);

  const siteCharges = charges.filter((c) => c.site === site);
  const setting = settings.find((s) => s.site === site);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(errMsg(err, fallback));
    }
  };

  const handleMove = (index: number, delta: -1 | 1) => {
    const ids = siteCharges.map((c) => c.id);
    const target = index + delta;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return run(() => reorder({ site, ids }), "Failed to reorder");
  };

  const handleDelete = (charge: RepairChargeItem) => {
    if (
      !window.confirm(
        `Delete "${charge.repairType}" from ${REPAIR_SITE_LABELS[site]}? Deactivate it instead to hide it from clients but keep it.`,
      )
    ) {
      return;
    }
    return run(() => remove(charge.id), "Failed to delete repair charge");
  };

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Repair Charges"
        description="Repair price lists clients see on their Repair Charges page. Inactive rows are hidden from clients. Changing a price doesn't affect invoices already issued."
        actions={
          <>
            <Button
              variant="outlined"
              href="/repair-charges"
              target="_blank"
              endIcon={<OpenInNewIcon />}
              sx={ds.outlineBtnSx}
            >
              Client view
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setEditing("new")}
              sx={ds.primaryBtnSx}
            >
              Add repair charge
            </Button>
          </>
        }
      />

      <Tabs
        value={site}
        onChange={(_e, v: RepairSite) => {
          setSite(v);
          setActionError(null);
        }}
        aria-label="Site"
        sx={{ ...ds.tabsSx, mb: 2 }}
      >
        {REPAIR_SITES.map((s) => (
          <Tab
            key={s}
            value={s}
            label={REPAIR_SITE_LABELS[s]}
            sx={{ minHeight: 36, py: 0.5 }}
          />
        ))}
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
          {error}
        </Alert>
      )}
      {actionError && (
        <Alert
          severity="error"
          onClose={() => setActionError(null)}
          sx={{ mb: 2, ...ds.alertSx("error") }}
        >
          {actionError}
        </Alert>
      )}

      {loading ? (
        <DaylightLoading />
      ) : (
        <>
          {/* Remount per site so the form resets to that site's values. */}
          <SiteSettingsCard key={site} site={site} setting={setting} />

          {siteCharges.length === 0 ? (
            <DaylightEmptyState>
              No repair charges for {REPAIR_SITE_LABELS[site]} yet.
            </DaylightEmptyState>
          ) : (
            <Paper
              elevation={0}
              sx={{ ...ds.cardSx, p: 0, overflow: "hidden" }}
            >
              <Box sx={ds.tableSx}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Order</TableCell>
                      <TableCell>Repair type</TableCell>
                      <TableCell>Price</TableCell>
                      <TableCell>Active</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {siteCharges.map((c, i) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <IconButton
                            size="small"
                            aria-label="Move up"
                            disabled={busy || i === 0}
                            onClick={() => handleMove(i, -1)}
                          >
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label="Move down"
                            disabled={busy || i === siteCharges.length - 1}
                            onClick={() => handleMove(i, 1)}
                          >
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ opacity: c.isActive ? 1 : 0.6 }}>
                          <Box sx={{ fontWeight: 600 }}>{c.repairType}</Box>
                          {c.note && <CellNote>{c.note}</CellNote>}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {formatRepairPrice(c)}
                          <CellNote>
                            {REPAIR_PRICE_TYPE_LABELS[c.priceType]}
                          </CellNote>
                        </TableCell>
                        <TableCell>
                          <Switch
                            size="small"
                            checked={c.isActive}
                            disabled={busy}
                            inputProps={{ "aria-label": "Active" }}
                            onChange={() =>
                              run(
                                () =>
                                  update({ id: c.id, isActive: !c.isActive }),
                                "Failed to update repair charge",
                              )
                            }
                          />
                          {!c.isActive && (
                            <DaylightStatusPill label="Hidden" tone="neutral" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              disabled={busy}
                              onClick={() => setEditing(c)}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              disabled={busy}
                              onClick={() => handleDelete(c)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          )}
        </>
      )}

      {editing && (
        <RepairChargeDialog
          site={site}
          charge={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </DaylightAdminPage>
  );
}

function SiteSettingsCard({
  site,
  setting,
}: {
  site: RepairSite;
  setting?: RepairSiteSettingItem;
}) {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
  const { saveSetting, savingSetting } = useManageRepairCharges();
  const [fee, setFee] = useState(
    setting ? String(setting.handsAndEyesFee) : "",
  );
  const [partsUrl, setPartsUrl] = useState(setting?.partsUrl ?? "");
  const [status, setStatus] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  // Follow the saved values (first load, or a save) - not every refetch, so
  // unsaved edits survive other changes on the page.
  const savedFee = setting?.handsAndEyesFee;
  const savedPartsUrl = setting?.partsUrl;
  useEffect(() => {
    if (savedFee !== undefined) {
      setFee(String(savedFee));
      setPartsUrl(savedPartsUrl ?? "");
    }
  }, [savedFee, savedPartsUrl]);

  const handleSave = async () => {
    setStatus(null);
    try {
      await saveSetting({
        site,
        handsAndEyesFee: Number(fee),
        partsUrl: partsUrl.trim() || null,
      });
      setStatus({ tone: "success", text: "Saved" });
    } catch (err) {
      setStatus({ tone: "error", text: errMsg(err, "Failed to save") });
    }
  };

  return (
    <Paper elevation={0} sx={{ ...ds.cardSx, ...ds.inputSx, mb: 2 }}>
      <Typography component="h2" sx={{ ...ds.sectionTitleSx, mb: "4px" }}>
        {REPAIR_SITE_LABELS[site]} site settings
      </Typography>
      <Typography sx={{ mb: 2, fontSize: 13, color: d.muted }}>
        The hands &amp; eyes fee is fixed and applies to every repair. The parts
        link is used for website-priced rows that don&apos;t have their own
        link.
      </Typography>
      {status && (
        <Alert
          severity={status.tone}
          sx={{ mb: 2, ...ds.alertSx(status.tone) }}
        >
          {status.text}
        </Alert>
      )}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 2,
          alignItems: { sm: "flex-start" },
        }}
      >
        <TextField
          size="small"
          label="Hands & eyes fee"
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          sx={{ width: { sm: 200 } }}
          slotProps={{
            htmlInput: { min: 0, step: "0.01" },
            input: {
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            },
          }}
        />
        <TextField
          size="small"
          label="Parts shop link (optional)"
          value={partsUrl}
          onChange={(e) => setPartsUrl(e.target.value)}
          placeholder="https://"
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { maxLength: MAX_REPAIR_URL_LENGTH } }}
        />
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={savingSetting || fee === ""}
          startIcon={
            savingSetting ? <CircularProgress size={16} /> : <SaveIcon />
          }
          sx={ds.primaryBtnSx}
        >
          Save
        </Button>
      </Box>
    </Paper>
  );
}

function RepairChargeDialog({
  site,
  charge,
  onClose,
}: {
  site: RepairSite;
  charge: RepairChargeItem | null;
  onClose: () => void;
}) {
  const { create, update, busy } = useManageRepairCharges();
  const [repairType, setRepairType] = useState(charge?.repairType ?? "");
  const [priceType, setPriceType] = useState<RepairPriceType>(
    charge?.priceType ?? "FIXED",
  );
  const [amount, setAmount] = useState(
    charge?.amount !== null && charge?.amount !== undefined
      ? String(charge.amount)
      : "",
  );
  const [amountMax, setAmountMax] = useState(
    charge?.amountMax !== null && charge?.amountMax !== undefined
      ? String(charge.amountMax)
      : "",
  );
  const [note, setNote] = useState(charge?.note ?? "");
  const [linkUrl, setLinkUrl] = useState(charge?.linkUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const input: Omit<RepairChargeFormInput, "site"> = {
      repairType,
      priceType,
      amount: priceType === "EXTERNAL" || amount === "" ? null : Number(amount),
      amountMax:
        priceType === "RANGE" && amountMax !== "" ? Number(amountMax) : null,
      note: note.trim() || null,
      linkUrl: priceType === "EXTERNAL" ? linkUrl.trim() || null : null,
    };
    try {
      if (charge) {
        await update({ id: charge.id, ...input });
      } else {
        await create({ site, ...input });
      }
      onClose();
    } catch (err) {
      setError(errMsg(err, "Failed to save repair charge"));
    }
  };

  const dollar = {
    input: {
      startAdornment: <InputAdornment position="start">$</InputAdornment>,
    },
    htmlInput: { min: 0, step: "0.01" },
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {charge ? "Edit" : "Add"} repair charge - {REPAIR_SITE_LABELS[site]}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Repair type"
            value={repairType}
            onChange={(e) => setRepairType(e.target.value)}
            required
            autoFocus
            slotProps={{ htmlInput: { maxLength: MAX_REPAIR_TYPE_LENGTH } }}
          />
          <TextField
            select
            label="Price type"
            value={priceType}
            onChange={(e) => setPriceType(e.target.value as RepairPriceType)}
          >
            {REPAIR_PRICE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {REPAIR_PRICE_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>
          {priceType !== "EXTERNAL" && (
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label={priceType === "RANGE" ? "From (USD)" : "Price (USD)"}
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                fullWidth
                slotProps={dollar}
              />
              {priceType === "RANGE" && (
                <TextField
                  label="To (USD)"
                  type="number"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  required
                  fullWidth
                  slotProps={dollar}
                />
              )}
            </Box>
          )}
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Per board, depends on model"
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: MAX_REPAIR_NOTE_LENGTH } }}
          />
          {priceType === "EXTERNAL" && (
            <TextField
              label="Price link (optional)"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://"
              helperText="Leave empty to use the site's parts shop link."
              slotProps={{ htmlInput: { maxLength: MAX_REPAIR_URL_LENGTH } }}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={busy || !repairType.trim()}
          startIcon={busy ? <CircularProgress size={16} /> : undefined}
        >
          {charge ? "Save" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
