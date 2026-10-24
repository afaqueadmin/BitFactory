/**
 * Miners Table Component
 *
 * Displays a list of miners with CRUD action buttons.
 * Integrates with MUI DataGrid for efficient data rendering.
 * Supports sorting by all miner fields with visual indicators.
 */

"use client";

import React, { Dispatch, SetStateAction, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  CircularProgress,
  Alert,
  MenuItem,
  Menu,
  FormControlLabel,
  Checkbox,
  Tooltip,
  alpha,
} from "@mui/material";
import RepairNotesModal from "./RepairNotesModal";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  MoreVert as MoreVertIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
import { buildCsv, formatIsoDate } from "@/lib/helpers/admin/tableExport";
import {
  sortMiners,
  toggleSortDirection,
  type SortConfig,
  type MinerSortField,
} from "@/lib/utils/sortMiners";
import {
  formatWarrantyDate,
  getWarrantyStatus,
  WARRANTY_STATUS_LABEL,
  WarrantyStatus,
} from "@/lib/minerWarranty";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";
import {
  DaylightStatusPill,
  type DaylightTone,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/** MUI chip colour -> Daylight pill tone. */
const PILL_TONE: Record<string, DaylightTone> = {
  success: "success",
  warning: "warning",
  error: "danger",
  default: "neutral",
};

/** "DEPLOYMENT_IN_PROGRESS" -> "Deployment in progress". */
const humanizeStatus = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");

/**
 * User object from API
 */
interface User {
  id: string;
  name: string | null;
  email: string;
  luxorSubaccounts?: string[];
  segment?: string | null;
}

/**
 * Space object from API
 */
interface Space {
  id: string;
  name: string;
  location: string;
}

/**
 * Hardware object from API
 */
interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  quantity: number;
  hashRate: number | string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Pool object from API
 */
interface Pool {
  id: string;
  name: string;
  apiUrl: string;
  description?: string | null;
}

/**
 * Miner object from API
 */
interface Miner {
  id: string;
  name: string;
  status: "AUTO" | "DEPLOYMENT_IN_PROGRESS" | "UNDER_MAINTENANCE";
  hardwareId: string;
  userId: string;
  spaceId: string;
  poolId?: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  rate_per_kwh?: number;
  benchmarkHashrate?: number;
  serialNumber?: string | null;
  macAddress?: string | null;
  warrantyExpiresAt?: string | null;
  user?: User;
  space?: Space;
  hardware?: Hardware;
  pool?: Pool;
  rateHistory?: Array<{
    rate_per_kwh: number;
    createdAt: string;
  }>;
  ownershipHistory?: Array<{
    id: string;
    minerId?: string;
    owner: {
      id: string;
      name: string | null;
      email: string;
    };
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
    createdAt: string;
  }>;
  repairNotes?: Array<{
    id: string;
    note: string;
    dateOfEntry: string;
    createdAt: string;
    createdBy: {
      name: string | null;
      email: string;
    };
  }>;
  restarts?: Array<{
    id: string;
    restartedAt: string;
    note: string | null;
    createdAt: string;
    createdBy: {
      name: string | null;
      email: string;
    };
  }>;
}

interface MinersTableProps {
  miners: Miner[];
  onEdit?: (miner: Miner) => void;
  onDelete?: (minerId: string) => void;
  isLoading?: boolean;
  error?: string | null;
  showDeleted: boolean;
  setShowDeleted: Dispatch<SetStateAction<boolean>>;
  /** Hides Edit/Delete/Repair Notes actions, leaving history viewing only. */
  readOnly?: boolean;
  /** Shows a Download CSV button exporting every listed miner. */
  csvExport?: boolean;
  /** Daylight styling (admin Miners page). Franchise keeps the MUI look. */
  daylight?: boolean;
}

export default function MinersTable({
  miners,
  onEdit,
  onDelete,
  isLoading = false,
  error = null,
  showDeleted,
  setShowDeleted,
  readOnly = false,
  csvExport = false,
  daylight = false,
}: MinersTableProps) {
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<SortConfig>({
    field: "name",
    direction: "asc",
  });
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [selectedMinerId, setSelectedMinerId] = React.useState<string | null>(
    null,
  );
  const [rateHistoryOpen, setRateHistoryOpen] = React.useState(false);
  const [repairNotesOpen, setRepairNotesOpen] = React.useState(false);
  const [selectedMinerName, setSelectedMinerName] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(25);

  // Parents pass a fresh array every render, so reset paging on the set of
  // miner ids rather than the array reference (i.e. when filters change).
  const minerIdsKey = miners.map((m) => m.id).join(",");
  useEffect(() => {
    setPage(0);
  }, [minerIdsKey]);

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm || !onDelete) return;

    setDeleting(true);
    try {
      await onDelete(deleteConfirm);
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Handle menu open
   */
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    minerId: string,
  ) => {
    setAnchorEl(event.currentTarget);
    setSelectedMinerId(minerId);
  };

  /**
   * Handle menu close
   */
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMinerId(null);
  };

  /**
   * Handle edit miner
   */
  const handleEdit = (miner: Miner) => {
    handleMenuClose();
    onEdit?.(miner);
  };

  /**
   * Handle delete miner
   */
  const handleDelete = (minerId: string) => {
    handleMenuClose();
    setDeleteConfirm(minerId);
  };

  /**
   * Handle view rate history
   */
  const handleViewRateHistory = (minerId: string) => {
    handleMenuClose();
    setSelectedMinerId(minerId);
    setRateHistoryOpen(true);
  };

  /**
   * Handle view repair notes
   */
  const handleViewRepairNotes = (minerId: string, minerName: string) => {
    handleMenuClose();
    setSelectedMinerId(minerId);
    setSelectedMinerName(minerName);
    setRepairNotesOpen(true);
  };

  /**
   * Handle header cell click to sort
   */
  const handleHeaderClick = (field: MinerSortField) => {
    setPage(0);
    if (sortConfig.field === field) {
      // Same field clicked - toggle direction
      setSortConfig({
        ...sortConfig,
        direction: toggleSortDirection(sortConfig.direction),
      });
    } else {
      // New field clicked - sort ascending
      setSortConfig({ field, direction: "asc" });
    }
  };

  /**
   * Format date to readable string
   */
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  /**
   * Get status color based on value
   */
  const getStatusColor = (
    status: "AUTO" | "DEPLOYMENT_IN_PROGRESS" | "UNDER_MAINTENANCE",
  ): "success" | "default" | "warning" => {
    if (status === "AUTO") return "success";
    if (status === "UNDER_MAINTENANCE") return "warning";
    return "default";
  };

  /**
   * Chip color for a warranty status
   */
  const getWarrantyColor = (
    status: WarrantyStatus,
  ): "success" | "warning" | "error" | "default" => {
    if (status === "ACTIVE") return "success";
    if (status === "EXPIRING") return "warning";
    if (status === "EXPIRED") return "error";
    return "default";
  };

  /**
   * Memoized sorted rows
   */
  const memoizedRows = useMemo(
    () => sortMiners(miners, sortConfig),
    [miners, sortConfig],
  );

  /**
   * Downloads every listed miner (all pages, in the current sort) as CSV,
   * including fields the table only shows in tooltips (SN, MAC, warranty).
   * The parent's filters and Show Deleted already shaped `miners`. Created /
   * Deleted dates are in the viewer's timezone; warranty is a calendar date.
   */
  const handleDownloadCsv = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const csv = buildCsv(
      [
        "Name",
        "Serial Number",
        "MAC Address",
        "Model",
        "User",
        "User Email",
        "Subaccount",
        "Type",
        "Pool",
        "Space",
        "Location",
        "Power (kW)",
        "Hash Rate (TH/s)",
        "Rate (USD/kWh)",
        "Benchmark (TH/s)",
        "Warranty Expires",
        "Warranty Status",
        "Status",
        "Deleted",
        "Deleted At",
        "Created",
      ],
      memoizedRows.map((miner) => [
        miner.name,
        miner.serialNumber || "",
        miner.macAddress || "",
        miner.hardware?.model || "",
        miner.user?.name || "",
        miner.user?.email || "",
        miner.user?.luxorSubaccounts?.join(", ") || "",
        miner.user?.segment || "",
        miner.pool?.name || "Unassigned",
        miner.space?.name || "",
        miner.space?.location || "",
        String(miner.hardware?.powerUsage ?? ""),
        miner.hardware?.hashRate !== undefined
          ? parseFloat(String(miner.hardware.hashRate)).toFixed(2)
          : "",
        miner.rate_per_kwh ? Number(miner.rate_per_kwh).toFixed(4) : "",
        miner.benchmarkHashrate !== undefined &&
        miner.benchmarkHashrate !== null
          ? Number(miner.benchmarkHashrate).toFixed(2)
          : "",
        miner.warrantyExpiresAt
          ? formatIsoDate(miner.warrantyExpiresAt, "UTC")
          : "",
        WARRANTY_STATUS_LABEL[getWarrantyStatus(miner.warrantyExpiresAt)],
        miner.status,
        miner.isDeleted ? "Yes" : "No",
        miner.deletedAt ? formatIsoDate(miner.deletedAt, tz) : "",
        formatIsoDate(miner.createdAt, tz),
      ]),
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `miners-${formatIsoDate(new Date(), tz)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Page through the sorted rows; -1 is MUI's "All" option. The page is
  // clamped because the reset effect only runs after the render that needs it.
  const lastPage =
    rowsPerPage === -1
      ? 0
      : Math.max(0, Math.ceil(memoizedRows.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, lastPage);
  const pagedRows =
    rowsPerPage === -1
      ? memoizedRows
      : memoizedRows.slice(
          currentPage * rowsPerPage,
          currentPage * rowsPerPage + rowsPerPage,
        );

  /**
   * Header cell that sorts the table by `field` when clicked
   */
  const renderSortableHeader = (
    label: string,
    field: MinerSortField,
    align: "left" | "right" | "center" = "left",
  ) => (
    <TableCell
      align={align}
      onClick={() => handleHeaderClick(field)}
      sx={{
        cursor: "pointer",
        userSelect: "none",
        "&:hover": {
          backgroundColor: daylight ? d.hover : "action.selected",
          ...(daylight && { color: d.text }),
        },
      }}
    >
      {label}
      {sortConfig.field === field &&
        (sortConfig.direction === "asc" ? (
          <ArrowUpwardIcon
            sx={{ fontSize: "1rem", verticalAlign: "middle", ml: 0.25 }}
          />
        ) : (
          <ArrowDownwardIcon
            sx={{ fontSize: "1rem", verticalAlign: "middle", ml: 0.25 }}
          />
        ))}
    </TableCell>
  );

  const emptyValue = daylight ? (
    <Box component="span" sx={{ color: d.muted }}>
      —
    </Box>
  ) : (
    <Typography variant="body2" color="text.secondary" component="span">
      —
    </Typography>
  );

  return (
    <Box>
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, ...(daylight && ds.alertSx("error")) }}
        >
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 2,
          mb: 1,
        }}
      >
        {csvExport && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadCsv}
            disabled={isLoading || memoizedRows.length === 0}
            sx={daylight ? ds.outlineBtnSx : undefined}
          >
            Download CSV
          </Button>
        )}
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              sx={
                daylight
                  ? {
                      color: d.inputBorder,
                      "&.Mui-checked": { color: d.action },
                    }
                  : undefined
              }
            />
          }
          label="Show Deleted"
          sx={
            daylight
              ? {
                  mr: 0,
                  "& .MuiFormControlLabel-label": {
                    fontFamily: fonts.body,
                    fontSize: 13,
                    color: d.muted,
                  },
                }
              : undefined
          }
        />
      </Box>

      <Paper
        elevation={daylight ? 0 : 1}
        sx={{
          width: "100%",
          overflow: "hidden",
          ...(daylight && {
            bgcolor: d.surface,
            backgroundImage: "none",
            border: `1px solid ${d.border}`,
            borderRadius: RADIUS_CARD,
            boxShadow: d.shadow,
          }),
        }}
      >
        <TableContainer sx={{ maxHeight: "calc(100vh - 260px)" }}>
          <Table
            stickyHeader
            sx={
              daylight
                ? {
                    width: "100%",
                    tableLayout: "auto",
                    fontFamily: fonts.body,
                    // Sticky header needs an opaque background.
                    "& th": {
                      fontFamily: fonts.body,
                      fontWeight: 600,
                      fontSize: 10,
                      letterSpacing: ".015em",
                      textTransform: "uppercase",
                      lineHeight: 1.3,
                      color: d.muted,
                      padding: "12px 8px",
                      verticalAlign: "bottom",
                      backgroundColor: d.tableHead,
                      borderBottom: `1px solid ${d.border}`,
                    },
                    "& th:first-of-type, & td:first-of-type": { pl: "16px" },
                    "& th:last-of-type, & td:last-of-type": { pr: "16px" },
                    "& td": {
                      fontFamily: fonts.body,
                      padding: "10px 8px",
                      fontSize: 12.5,
                      color: d.text,
                      borderBottomColor: d.border,
                      // Wrap at spaces only - whole words stay intact and a
                      // wide table scrolls inside its card instead.
                      overflowWrap: "normal",
                    },
                    "& td .MuiTypography-body2": {
                      fontSize: "inherit",
                      fontFamily: "inherit",
                    },
                    "& td .MuiTypography-caption": {
                      fontFamily: "inherit",
                      fontSize: 11,
                      color: d.muted,
                    },
                    "& tbody tr:hover": { backgroundColor: d.hover },
                  }
                : {
                    width: "100%",
                    tableLayout: "auto",
                    "& th": {
                      fontWeight: "bold",
                      padding: "8px 6px",
                      fontSize: "0.8125rem",
                      lineHeight: 1.3,
                      verticalAlign: "bottom",
                      backgroundColor: "background.paper",
                      borderBottom: "2px solid",
                      borderBottomColor: "divider",
                    },
                    "& td": {
                      padding: "8px 6px",
                      fontSize: "0.8125rem",
                      overflowWrap: "anywhere",
                    },
                    "& td .MuiTypography-body2": { fontSize: "inherit" },
                  }
            }
            aria-label="miners table"
          >
            <TableHead>
              <TableRow>
                {renderSortableHeader("Name", "name")}
                {renderSortableHeader("Model", "model")}
                {renderSortableHeader("User", "user")}
                {renderSortableHeader("Subaccount", "subaccount")}
                {renderSortableHeader("Type", "segment")}
                {renderSortableHeader("Pool", "pool")}
                {renderSortableHeader("Space", "space")}
                {renderSortableHeader("Power (kW)", "powerUsage", "right")}
                {renderSortableHeader("Hash Rate (TH/s)", "hashRate", "right")}
                {renderSortableHeader("Rate (USD)", "ratePerKwh", "right")}
                {renderSortableHeader(
                  "Benchmark (TH/s)",
                  "benchmarkHashrate",
                  "right",
                )}
                {renderSortableHeader("Warranty", "warrantyExpiresAt")}
                {renderSortableHeader("Status", "status", "center")}
                {renderSortableHeader("Created", "createdAt")}
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={15} align="center" sx={{ py: 4 }}>
                    <CircularProgress
                      sx={daylight ? { color: d.action } : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : memoizedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} align="center" sx={{ py: 4 }}>
                    <Typography
                      sx={
                        daylight
                          ? {
                              color: d.muted,
                              fontFamily: fonts.body,
                              fontSize: 13,
                            }
                          : { color: "text.secondary" }
                      }
                    >
                      No miners found. Create one to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((miner) => (
                  <TableRow
                    key={miner.id}
                    hover
                    sx={{
                      "&:nth-of-type(even)": {
                        backgroundColor: daylight
                          ? d.tableHead
                          : (theme) => alpha(theme.palette.text.primary, 0.025),
                      },
                      "&:last-child td": { border: 0 },
                    }}
                  >
                    <TableCell
                      sx={{
                        fontWeight: "500",
                        ...(daylight && { whiteSpace: "nowrap" }),
                      }}
                    >
                      <Tooltip
                        title={
                          miner.serialNumber ||
                          miner.macAddress ||
                          miner.warrantyExpiresAt ? (
                            <Box sx={{ p: 0.5 }}>
                              {miner.serialNumber && (
                                <Typography variant="caption" display="block">
                                  SN: {miner.serialNumber}
                                </Typography>
                              )}
                              {miner.macAddress && (
                                <Typography variant="caption" display="block">
                                  MAC: {miner.macAddress}
                                </Typography>
                              )}
                              {miner.warrantyExpiresAt && (
                                <Typography variant="caption" display="block">
                                  Warranty until:{" "}
                                  {formatWarrantyDate(miner.warrantyExpiresAt)}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            ""
                          )
                        }
                        placement="top"
                        arrow
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontSize: "inherit",
                            fontWeight: "inherit",
                            cursor:
                              miner.serialNumber ||
                              miner.macAddress ||
                              miner.warrantyExpiresAt
                                ? "help"
                                : "auto",
                            color: daylight ? d.action : "info.main", // Info is usually a light/sky blue in MUI
                            textDecoration: "underline",
                            textUnderlineOffset: "3px",
                            ...(daylight && {
                              fontWeight: 650,
                              textDecorationColor: d.borderSky,
                            }),
                            "&:hover": {
                              color: daylight ? d.actionHover : "info.light",
                            },
                          }}
                        >
                          {miner.name}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{miner.hardware?.model || "—"}</TableCell>
                    <TableCell>
                      {miner.user?.name || miner.user?.email || "—"}
                    </TableCell>
                    <TableCell>
                      {miner.user?.luxorSubaccounts?.length
                        ? miner.user.luxorSubaccounts.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>{miner.user?.segment || "—"}</TableCell>
                    <TableCell>
                      {miner.pool?.name ? (
                        miner.pool.name
                      ) : daylight ? (
                        <Box component="span" sx={{ color: d.muted }}>
                          Unassigned
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Unassigned
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {miner.space ? (
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: "500" }}
                          >
                            {miner.space.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {miner.space.location}
                          </Typography>
                        </Box>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {miner.hardware?.powerUsage || 0}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {parseFloat(
                        String(miner.hardware?.hashRate || 0),
                      ).toFixed(2)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {miner.rate_per_kwh
                        ? Number(miner.rate_per_kwh).toFixed(4)
                        : emptyValue}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {miner.benchmarkHashrate !== undefined &&
                      miner.benchmarkHashrate !== null
                        ? Number(miner.benchmarkHashrate).toFixed(2)
                        : emptyValue}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {(() => {
                        const warrantyStatus = getWarrantyStatus(
                          miner.warrantyExpiresAt,
                        );
                        if (warrantyStatus === "NONE") {
                          return emptyValue;
                        }
                        return (
                          <Box>
                            <Typography variant="body2">
                              {formatWarrantyDate(miner.warrantyExpiresAt)}
                            </Typography>
                            {daylight ? (
                              <Box sx={{ mt: "4px" }}>
                                <DaylightStatusPill
                                  label={WARRANTY_STATUS_LABEL[warrantyStatus]}
                                  tone={
                                    PILL_TONE[getWarrantyColor(warrantyStatus)]
                                  }
                                />
                              </Box>
                            ) : (
                              <Chip
                                label={WARRANTY_STATUS_LABEL[warrantyStatus]}
                                color={getWarrantyColor(warrantyStatus)}
                                size="small"
                                variant="outlined"
                                sx={{ mt: 0.5, height: 20, fontSize: "0.7rem" }}
                              />
                            )}
                          </Box>
                        );
                      })()}
                    </TableCell>
                    <TableCell align="center">
                      {daylight ? (
                        <DaylightStatusPill
                          label={humanizeStatus(miner.status)}
                          tone={PILL_TONE[getStatusColor(miner.status)]}
                        />
                      ) : (
                        <Chip
                          label={miner.status}
                          color={getStatusColor(miner.status)}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            "& .MuiChip-label": { px: 0.75 },
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDate(miner.createdAt)}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, miner.id)}
                        disabled={isLoading}
                        title="Actions"
                        aria-label={`Actions for ${miner.name}`}
                        sx={
                          daylight
                            ? {
                                color: d.muted,
                                borderRadius: "8px",
                                "&:hover": {
                                  bgcolor: d.hover,
                                  color: d.action,
                                },
                              }
                            : undefined
                        }
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                      <Menu
                        anchorEl={anchorEl}
                        open={anchorEl !== null && selectedMinerId === miner.id}
                        onClose={handleMenuClose}
                        slotProps={
                          daylight
                            ? {
                                paper: {
                                  sx: {
                                    minWidth: 200,
                                    borderRadius: "12px",
                                    border: `1px solid ${d.border}`,
                                    bgcolor: d.surface,
                                    backgroundImage: "none",
                                    boxShadow:
                                      "0 8px 30px rgba(100,114,124,.13)",
                                    "& .MuiMenuItem-root": {
                                      minHeight: 40,
                                      fontFamily: fonts.body,
                                      fontSize: 13,
                                      color: d.text,
                                      "&:hover": { bgcolor: d.hover },
                                    },
                                    "& .MuiTypography-root": {
                                      fontFamily: fonts.body,
                                      fontSize: 13,
                                    },
                                  },
                                },
                              }
                            : undefined
                        }
                      >
                        {!readOnly && (
                          <MenuItem onClick={() => handleEdit(miner)}>
                            <EditIcon fontSize="small" sx={{ mr: 1 }} />
                            Edit
                          </MenuItem>
                        )}
                        {!readOnly && (
                          <MenuItem
                            onClick={() =>
                              handleViewRepairNotes(miner.id, miner.name)
                            }
                          >
                            <Typography fontSize="small">
                              🛠️ Repair Notes
                            </Typography>
                          </MenuItem>
                        )}
                        <MenuItem
                          onClick={() => handleViewRateHistory(miner.id)}
                        >
                          <Typography fontSize="small">
                            📈 See Miner History
                          </Typography>
                        </MenuItem>
                        {!readOnly && (
                          <MenuItem
                            disabled={miner.isDeleted}
                            onClick={() => handleDelete(miner.id)}
                            sx={{
                              color: daylight
                                ? `${d.danger} !important`
                                : "error.main",
                            }}
                          >
                            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                            Delete
                          </MenuItem>
                        )}
                      </Menu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[25, 50, 100, { value: -1, label: "All" }]}
          component="div"
          count={memoizedRows.length}
          rowsPerPage={rowsPerPage}
          page={currentPage}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          sx={{
            borderTop: "1px solid",
            borderColor: daylight ? d.border : "divider",
            ...(daylight && {
              color: d.muted,
              fontFamily: fonts.body,
              "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows, & .MuiTablePagination-select":
                { fontFamily: fonts.body, fontSize: 12.5 },
              "& .MuiIconButton-root": { color: d.muted },
            }),
            "& .MuiTablePagination-toolbar": {
              paddingLeft: { xs: 1, sm: 2 },
              paddingRight: { xs: 1, sm: 1 },
              flexWrap: "wrap",
              minHeight: { xs: 48, sm: 52 },
            },
            "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
              {
                margin: 0,
                fontSize: { xs: "0.75rem", sm: "0.875rem" },
              },
            "& .MuiTablePagination-actions": {
              marginLeft: { xs: 1, sm: 2 },
            },
          }}
        />
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" />
          Delete Miner
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            Are you sure you want to delete this miner? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteConfirm(null)}
            disabled={deleting}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={deleting && <CircularProgress size={20} />}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Activity History Modal */}
      <Dialog
        open={rateHistoryOpen}
        onClose={() => setRateHistoryOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Miner Activity History</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(() => {
              const miner = memoizedRows.find((m) => m.id === selectedMinerId);
              const rateHistory = miner?.rateHistory || [];
              const ownershipHistory = miner?.ownershipHistory || [];
              const repairHistory = miner?.repairNotes || [];
              const restartHistory = miner?.restarts || [];

              // Show miner hardware info at top of modal
              const hasSNorMAC =
                miner?.serialNumber ||
                miner?.macAddress ||
                miner?.warrantyExpiresAt;

              // Combine all histories
              const combinedHistory = [
                ...rateHistory.map((h) => ({
                  type: "rate",
                  createdAt: new Date(h.createdAt),
                  data: h,
                })),
                ...ownershipHistory.map((h) => ({
                  type: "ownership",
                  createdAt: new Date(h.createdAt),
                  data: h,
                })),
                ...repairHistory.map((h) => ({
                  type: "repair",
                  createdAt: new Date(h.dateOfEntry),
                  data: h,
                })),
                ...restartHistory.map((h) => ({
                  type: "restart",
                  createdAt: new Date(h.restartedAt),
                  data: h,
                })),
              ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

              return (
                <>
                  {hasSNorMAC && (
                    <Box
                      sx={{
                        display: "flex",
                        gap: 3,
                        p: 1.5,
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        mb: 1,
                      }}
                    >
                      {miner?.serialNumber && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Serial No.
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: "monospace", fontWeight: 600 }}
                          >
                            {miner.serialNumber}
                          </Typography>
                        </Box>
                      )}
                      {miner?.macAddress && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            MAC Address
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: "monospace", fontWeight: 600 }}
                          >
                            {miner.macAddress}
                          </Typography>
                        </Box>
                      )}
                      {miner?.warrantyExpiresAt && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Warranty Until
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {formatWarrantyDate(miner.warrantyExpiresAt)} (
                            {
                              WARRANTY_STATUS_LABEL[
                                getWarrantyStatus(miner.warrantyExpiresAt)
                              ]
                            }
                            )
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                  {combinedHistory && combinedHistory.length > 0 ? (
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
                      {combinedHistory.map((activity, index: number) => (
                        <Box
                          key={index}
                          sx={{
                            p: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                          }}
                        >
                          {activity.type === "rate" ? (
                            <>
                              <Box
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: "600" }}
                                >
                                  Rate Update: $
                                  {Number(
                                    (activity.data as { rate_per_kwh: number })
                                      .rate_per_kwh,
                                  ).toFixed(3)}
                                  /kWh
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {activity.createdAt.toLocaleDateString(
                                    "en-CA",
                                  )}{" "}
                                  {activity.createdAt.toLocaleTimeString(
                                    "en-US",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    },
                                  )}
                                </Typography>
                              </Box>
                            </>
                          ) : activity.type === "repair" ? (
                            <>
                              <Box
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  mb: 0.5,
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: "600",
                                    color: "error.main",
                                  }}
                                >
                                  🛠️ Repair Note
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {activity.createdAt.toLocaleDateString(
                                    "en-CA",
                                  )}{" "}
                                </Typography>
                              </Box>
                              <Typography
                                variant="body2"
                                sx={{ whiteSpace: "pre-wrap", mb: 0.5 }}
                              >
                                {(activity.data as { note: string }).note}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Logged by:{" "}
                                {(
                                  activity.data as {
                                    createdBy?: {
                                      name: string | null;
                                      email: string;
                                    };
                                  }
                                ).createdBy?.name ||
                                  (
                                    activity.data as {
                                      createdBy?: {
                                        name: string | null;
                                        email: string;
                                      };
                                    }
                                  ).createdBy?.email ||
                                  "Unknown"}
                              </Typography>
                            </>
                          ) : activity.type === "restart" ? (
                            <>
                              <Box
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: "600",
                                    color: "warning.main",
                                  }}
                                >
                                  🔄 Miner Restarted
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {activity.createdAt.toLocaleDateString(
                                    "en-CA",
                                  )}{" "}
                                  {activity.createdAt.toLocaleTimeString(
                                    "en-US",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    },
                                  )}
                                </Typography>
                              </Box>
                              {(activity.data as { note: string | null })
                                .note && (
                                <Typography
                                  variant="body2"
                                  sx={{ whiteSpace: "pre-wrap" }}
                                >
                                  {
                                    (activity.data as { note: string | null })
                                      .note
                                  }
                                </Typography>
                              )}
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Recorded by:{" "}
                                {(
                                  activity.data as {
                                    createdBy?: {
                                      name: string | null;
                                      email: string;
                                    };
                                  }
                                ).createdBy?.name ||
                                  (
                                    activity.data as {
                                      createdBy?: {
                                        name: string | null;
                                        email: string;
                                      };
                                    }
                                  ).createdBy?.email ||
                                  "Unknown"}
                              </Typography>
                            </>
                          ) : (
                            <>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: "600", color: "info.main" }}
                              >
                                Ownership Transfer
                              </Typography>
                              <Box
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                }}
                              >
                                <Box sx={{ display: "flex", gap: 2, flex: 1 }}>
                                  <Box sx={{ flex: 1, minWidth: "150px" }}>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      New Owner
                                    </Typography>
                                    <Typography variant="body2">
                                      {(
                                        activity.data as {
                                          owner: {
                                            name: string | null;
                                            email: string;
                                          };
                                        }
                                      ).owner?.name || "—"}
                                    </Typography>
                                    <Typography variant="body2">
                                      (
                                      {(
                                        activity.data as {
                                          owner: {
                                            name: string | null;
                                            email: string;
                                          };
                                        }
                                      ).owner?.email || "—"}
                                      )
                                    </Typography>
                                  </Box>
                                  <Box sx={{ flex: 1, minWidth: "150px" }}>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      Changed By
                                    </Typography>
                                    <Typography variant="body2">
                                      {(
                                        activity.data as {
                                          createdBy: {
                                            name: string | null;
                                            email: string;
                                          };
                                        }
                                      ).createdBy?.name ||
                                        (
                                          activity.data as {
                                            createdBy: {
                                              name: string | null;
                                              email: string;
                                            };
                                          }
                                        ).createdBy?.email ||
                                        "—"}
                                    </Typography>
                                    <Typography variant="body2">
                                      (
                                      {(
                                        activity.data as {
                                          createdBy: {
                                            name: string | null;
                                            email: string;
                                          };
                                        }
                                      ).createdBy?.email || "—"}
                                      )
                                    </Typography>
                                  </Box>
                                </Box>
                                <Box
                                  sx={{ minWidth: "150px", textAlign: "right" }}
                                >
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {activity.createdAt.toLocaleDateString(
                                      "en-CA",
                                    )}{" "}
                                    {activity.createdAt.toLocaleTimeString(
                                      "en-US",
                                      {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: false,
                                      },
                                    )}
                                  </Typography>
                                </Box>
                              </Box>
                            </>
                          )}
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ textAlign: "center", py: 2 }}
                    >
                      No activity history available for this miner.
                    </Typography>
                  )}
                </>
              );
            })()}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRateHistoryOpen(false)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Repair Notes Modal */}
      {/* Repair Notes Modal */}
      <RepairNotesModal
        open={repairNotesOpen}
        onClose={() => setRepairNotesOpen(false)}
        minerId={selectedMinerId}
        minerName={selectedMinerName}
        serialNumber={
          memoizedRows.find((m) => m.id === selectedMinerId)?.serialNumber
        }
        macAddress={
          memoizedRows.find((m) => m.id === selectedMinerId)?.macAddress
        }
      />
    </Box>
  );
}
