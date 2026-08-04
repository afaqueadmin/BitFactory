"use client";

/**
 * src/app/(manage)/franchisees/[id]/page.tsx
 * Franchise Details Page
 *
 * Admin-facing read view for a single franchise: core business details,
 * the customers attached to it, and a summary of its incentive activity.
 */

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Snackbar,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  MonetizationOn as IncentivesIcon,
  PeopleAlt as PeopleAltIcon,
} from "@mui/icons-material";
import AdminValueCard from "@/components/admin/AdminValueCard";
import EditFranchiseeModal from "@/components/EditFranchiseeModal";
import { useUser } from "@/lib/hooks";
import { formatValue } from "@/lib/helpers/formatValue";

interface Franchise {
  id: string;
  businessName: string;
  authorizedPersonName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  franchiseCode: string;
  isActive: boolean;
  createdAt: string;
  franchisee: {
    id: string;
    name: string;
    email: string;
    luxorSubaccountName: string | null;
  };
  createdBy: { id: string; name: string; email: string };
  _count?: { users: number };
}

interface FranchiseCustomer {
  id: string;
  name: string | null;
  email: string;
  companyName: string | null;
  phoneNumber: string | null;
  createdAt: string;
  segment: string | null;
  minerCount: number;
}

type IncentiveType =
  | "HARDWARE_SALE"
  | "OWN_MACHINE_HOSTING_REBATE"
  | "CLIENT_HOSTING_COMMISSION";

interface IncentiveRate {
  id: string;
  incentiveType: IncentiveType;
  rateBasis: "FLAT_PER_UNIT" | "PERCENTAGE" | null;
  flatAmount: string | null;
  percentage: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface IncentiveEntry {
  id: string;
  status: "ACCRUED" | "REVERSED";
  amount: string;
  payoutBatch: { id: string; paidDate: string } | null;
}

interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

const TYPE_LABELS: Record<IncentiveType, string> = {
  HARDWARE_SALE: "Hardware Sale",
  OWN_MACHINE_HOSTING_REBATE: "Own-Machine Hosting Rebate",
  CLIENT_HOSTING_COMMISSION: "Client Hosting Commission",
};

function describeRate(rate: IncentiveRate): string {
  if (rate.incentiveType === "CLIENT_HOSTING_COMMISSION") {
    return `${rate.percentage}% of client invoice`;
  }
  if (rate.incentiveType === "OWN_MACHINE_HOSTING_REBATE") {
    return `${formatValue(Number(rate.flatAmount), "currency")} / machine / month`;
  }
  return rate.rateBasis === "PERCENTAGE"
    ? `${rate.percentage}% of sale amount`
    : `${formatValue(Number(rate.flatAmount), "currency")} / unit`;
}

export default function FranchiseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const franchiseId = params.id as string;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [notification, setNotification] = useState("");

  const {
    data: franchiseRes,
    isLoading: franchiseLoading,
    error: franchiseError,
  } = useQuery<ApiResponse<Franchise>>({
    queryKey: ["franchise", franchiseId],
    queryFn: async () => {
      const res = await fetch(`/api/franchisees/${franchiseId}`);
      const data: ApiResponse<Franchise> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch franchise");
      }
      return data;
    },
    enabled: !!franchiseId,
  });

  const {
    data: customersRes,
    isLoading: customersLoading,
    error: customersError,
  } = useQuery<ApiResponse<FranchiseCustomer[]>>({
    queryKey: ["franchiseCustomers", franchiseId],
    queryFn: async () => {
      const res = await fetch(`/api/franchisees/${franchiseId}/customers`);
      const data: ApiResponse<FranchiseCustomer[]> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch franchise customers");
      }
      return data;
    },
    enabled: !!franchiseId,
  });

  const {
    data: ratesData,
    isLoading: ratesLoading,
    error: ratesError,
  } = useQuery<{ rates: IncentiveRate[] }>({
    queryKey: ["incentiveRates", franchiseId],
    queryFn: async () => {
      const res = await fetch(
        `/api/incentives/rates?franchiseId=${franchiseId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch incentive rates");
      return res.json();
    },
    enabled: !!franchiseId,
  });

  const {
    data: entriesData,
    isLoading: entriesLoading,
    error: entriesError,
  } = useQuery<{ entries: IncentiveEntry[] }>({
    queryKey: ["incentiveEntries", franchiseId, "summary"],
    queryFn: async () => {
      const res = await fetch(
        `/api/incentives/entries?franchiseId=${franchiseId}&limit=1000`,
      );
      if (!res.ok) throw new Error("Failed to fetch incentive entries");
      return res.json();
    },
    enabled: !!franchiseId,
  });

  const franchise = franchiseRes?.data;
  const customers = customersRes?.data || [];
  const rates = ratesData?.rates ?? [];
  const currentRates = (
    [
      "HARDWARE_SALE",
      "OWN_MACHINE_HOSTING_REBATE",
      "CLIENT_HOSTING_COMMISSION",
    ] as IncentiveType[]
  )
    .map((type) =>
      rates.find((r) => r.incentiveType === type && !r.effectiveTo),
    )
    .filter((r): r is IncentiveRate => Boolean(r));

  const entries = entriesData?.entries ?? [];
  const unpaidEntries = entries.filter(
    (e) => e.status === "ACCRUED" && !e.payoutBatch,
  );
  const totalUnpaid = unpaidEntries.reduce(
    (sum, e) => sum + Number(e.amount),
    0,
  );

  const loading = franchiseLoading;
  const error = franchiseError instanceof Error ? franchiseError.message : null;

  const handleEditSuccess = (text: string) => {
    setNotification(text);
    setEditModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["franchise", franchiseId] });
  };

  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
          <IconButton onClick={() => router.push("/franchisees")} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: "bold" }}>
              {loading ? "Loading..." : franchise?.businessName || "Franchise"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Franchise details, associated customers, and incentives
            </Typography>
          </Box>
          {franchise && (
            <Stack direction="row" spacing={1}>
              {isAdmin && (
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => setEditModalOpen(true)}
                >
                  Edit
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<IncentivesIcon />}
                onClick={() =>
                  router.push(`/franchisees/${franchiseId}/incentives`)
                }
              >
                Manage Incentives
              </Button>
            </Stack>
          )}
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Error Loading Franchise
            </Typography>
            <Typography variant="body2">{error}</Typography>
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : !franchise ? (
          !error && (
            <Paper sx={{ p: 4, textAlign: "center" }}>
              <Typography variant="h6" color="text.secondary">
                Franchise not found
              </Typography>
              <Button
                sx={{ mt: 2 }}
                variant="outlined"
                onClick={() => router.push("/franchisees")}
              >
                Back to Franchisees
              </Button>
            </Paper>
          )
        ) : (
          <>
            {/* Core details */}
            <Paper sx={{ p: 3, mb: 4 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                flexWrap="wrap"
                gap={2}
                sx={{ mb: 2 }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Franchise Details
                </Typography>
                <Chip
                  label={franchise.isActive ? "Active" : "Inactive"}
                  color={franchise.isActive ? "success" : "default"}
                  variant="outlined"
                />
              </Stack>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "1fr 1fr",
                    md: "1fr 1fr 1fr",
                  },
                  gap: 3,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Authorized Person
                  </Typography>
                  <Typography variant="body1">
                    {franchise.authorizedPersonName}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Contact
                  </Typography>
                  <Typography variant="body1">{franchise.email}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {franchise.phoneNumber}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Address
                  </Typography>
                  <Typography variant="body1">
                    {franchise.address}, {franchise.city}, {franchise.state}{" "}
                    {franchise.postalCode}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Franchise Code
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: "monospace" }}>
                    {franchise.franchiseCode}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Franchisee (Owner)
                  </Typography>
                  <Typography variant="body1">
                    {franchise.franchisee?.name || "-"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {franchise.franchisee?.email}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body1">
                    {new Date(franchise.createdAt).toLocaleDateString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    by {franchise.createdBy?.name || franchise.createdBy?.email}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Summary cards */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
                gap: 3,
                mb: 4,
              }}
            >
              <AdminValueCard
                title="Associated Customers"
                value={franchise._count?.users ?? customers.length}
              />
              <AdminValueCard
                title="Unpaid Incentives"
                borderColor="#FF9800"
                value={entriesLoading ? 0 : totalUnpaid}
                type="currency"
              />
              <AdminValueCard
                title="Unpaid Incentive Entries"
                borderColor="#FF9800"
                value={entriesLoading ? 0 : unpaidEntries.length}
              />
            </Box>

            {/* Associated customers */}
            <Paper sx={{ p: 3, mb: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Associated Customers
              </Typography>

              {customersError ? (
                <Alert severity="error">
                  {customersError instanceof Error
                    ? customersError.message
                    : "Failed to load customers"}
                </Alert>
              ) : customersLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : customers.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <PeopleAltIcon
                    sx={{
                      fontSize: 48,
                      color: "text.secondary",
                      mb: 1,
                      opacity: 0.5,
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    No customers are attached to this franchise yet.
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>Email</TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>
                          Company
                        </TableCell>
                        <TableCell sx={{ fontWeight: "bold" }} align="right">
                          Miners
                        </TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>
                          Joined
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {customers.map((customer) => (
                        <TableRow
                          key={customer.id}
                          hover
                          onClick={() =>
                            router.push(`/customers/${customer.id}`)
                          }
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>{customer.name || "-"}</TableCell>
                          <TableCell>{customer.email}</TableCell>
                          <TableCell>{customer.companyName || "-"}</TableCell>
                          <TableCell align="right">
                            {customer.minerCount}
                          </TableCell>
                          <TableCell>
                            {new Date(customer.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>

            {/* Incentive information */}
            <Paper sx={{ p: 3 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Incentive Information
                </Typography>
                <Button
                  size="small"
                  onClick={() =>
                    router.push(`/franchisees/${franchiseId}/incentives`)
                  }
                >
                  View Full Ledger
                </Button>
              </Stack>

              {ratesError ? (
                <Alert severity="error">
                  {ratesError instanceof Error
                    ? ratesError.message
                    : "Failed to load incentive rates"}
                </Alert>
              ) : ratesLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : currentRates.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active incentive rates configured for this franchise yet.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                    gap: 2,
                  }}
                >
                  {currentRates.map((rate) => (
                    <Paper
                      key={rate.id}
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 2 }}
                    >
                      <Typography variant="subtitle2" color="text.secondary">
                        {TYPE_LABELS[rate.incentiveType]}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {describeRate(rate)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Effective from{" "}
                        {new Date(rate.effectiveFrom).toLocaleDateString()}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              )}
            </Paper>

            <EditFranchiseeModal
              open={editModalOpen}
              onClose={() => setEditModalOpen(false)}
              onSuccess={handleEditSuccess}
              franchise={franchise}
            />
          </>
        )}

        <Snackbar
          open={Boolean(notification)}
          autoHideDuration={5000}
          onClose={() => setNotification("")}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setNotification("")}
            severity="success"
            sx={{ width: "100%" }}
          >
            {notification}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}
