/**
 * src/app/(manage)/subaccounts/page.tsx
 * Luxor Workspace Subaccounts (V2 API) - view only.
 *
 * Lists every Luxor subaccount across the workspace sites, read through the
 * /api/luxor proxy (server-side auth, subaccounts.view). The app never
 * creates, changes or deletes anything on Luxor, Braiins or any other pool:
 * subaccounts are managed in the pool's own dashboard.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import StorageIcon from "@mui/icons-material/Storage";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import StatCard from "@/components/daylight/StatCard";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { Subaccount } from "@/lib/luxor";

/**
 * Response structure from the /api/luxor proxy route
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * Subaccount list response from GET endpoint
 */
interface SubaccountListData {
  subaccounts: Subaccount[];
}

/**
 * Component state for the subaccount list
 */
interface SubaccountsState {
  subaccounts: Subaccount[];
  loading: boolean;
  error: string | null;
}

export default function SubaccountsPage() {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
  const [state, setState] = useState<SubaccountsState>({
    subaccounts: [],
    loading: true,
    error: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch all subaccounts across all sites (site_id is optional):
   * GET /pool/subaccounts?page_number=1&page_size=10
   * The response includes site information for each subaccount.
   */
  const fetchSubaccounts = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      const response = await fetch(`/api/luxor?endpoint=subaccounts`);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<SubaccountListData> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch subaccounts");
      }

      const subaccountsList =
        (data.data as SubaccountListData)?.subaccounts || [];

      setState((prev) => ({
        ...prev,
        subaccounts: subaccountsList,
        loading: false,
        error: null,
      }));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(
        "[Luxor Subaccounts] Error fetching subaccounts:",
        errorMsg,
      );
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, []);

  useEffect(() => {
    fetchSubaccounts();
  }, [fetchSubaccounts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchSubaccounts();
    setIsRefreshing(false);
  };

  if (state.loading) {
    return (
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }

  const siteCount = new Set(
    state.subaccounts.map((subaccount) => subaccount.site?.name),
  ).size;

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Luxor Workspace Subaccounts"
        description="View all subaccounts across all workspace sites. Subaccounts are added and removed in Luxor itself."
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isRefreshing}
            sx={ds.outlineBtnSx}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {/* Error Alert */}
      {state.error && (
        <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
          <Box component="strong" sx={{ display: "block", mb: "2px" }}>
            Error
          </Box>
          {state.error}
        </Alert>
      )}

      {/* Stat Cards */}
      {state.subaccounts.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(240px, 100%), 1fr))",
            gap: { xs: "12px", sm: "16px", md: "20px" },
            mb: { xs: "20px", md: "24px" },
          }}
        >
          <StatCard
            title="Total Subaccounts"
            value={state.subaccounts.length}
            tone="sky"
            icon={<StorageIcon />}
          />
          <StatCard
            title="Workspace Sites"
            value={siteCount}
            caption="With at least one subaccount"
            tone="mint"
            icon={<LocationOnIcon />}
          />
        </Box>
      )}

      {/* Subaccounts Table */}
      {state.subaccounts.length > 0 ? (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ ...ds.tableCardSx, mb: { xs: "20px", md: "24px" } }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Subaccount Name</TableCell>
                <TableCell>ID</TableCell>
                <TableCell>Site</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {state.subaccounts.map((subaccount) => (
                <TableRow key={subaccount.id}>
                  <TableCell sx={{ "&&&": { fontWeight: 650 } }}>
                    {subaccount.name}
                  </TableCell>
                  <TableCell
                    sx={{
                      "&&&": {
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                        fontSize: 12,
                        color: d.muted,
                      },
                    }}
                  >
                    {subaccount.id}
                  </TableCell>
                  <TableCell>{subaccount.site.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ mb: { xs: "20px", md: "24px" } }}>
          <DaylightEmptyState>
            <StorageIcon
              sx={{ fontSize: 40, color: d.inputBorder, mb: 1 }}
              aria-hidden
            />
            <Box sx={{ fontSize: 15, fontWeight: 650, color: d.text }}>
              No subaccounts available
            </Box>
          </DaylightEmptyState>
        </Box>
      )}
    </DaylightAdminPage>
  );
}
