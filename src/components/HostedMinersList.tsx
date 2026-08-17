"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme,
  alpha,
  CircularProgress,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useQuery } from "@tanstack/react-query";
import {
  normalizeLuxorWorker,
  formatHashrate,
} from "@/lib/workerNormalization";
import RepairNotesModal from "./admin/RepairNotesModal";
import MinerPoolHistoryModal from "./admin/MinerPoolHistoryModal";
import HashrateHistoryChart from "./HashrateHistoryChart";

// Types
interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  quantity: number;
  hashRate: number | string;
}

interface MinerData {
  id: string;
  name: string;
  model: string;
  workerName: string;
  location: string;
  connectedPool: string;
  status:
    | "Active"
    | "Inactive"
    | "Deployment in Progress"
    | "Under Maintenance"
    | "AUTO"
    | "DEPLOYMENT_IN_PROGRESS"
    | "UNDER_MAINTENANCE";
  hashRate: string;
  firmware: string;
  serialNumber?: string;
  macAddress?: string;
  hardware?: Hardware;
}

// Filter values
const FILTER_VALUES = [
  "ALL MINERS",
  "ACTIVE",
  "INACTIVE",
  "DEPLOYMENT IN PROGRESS",
  "UNDER MAINTENANCE",
] as const;
// Filter type
export type FilterType = (typeof FILTER_VALUES)[number];

interface HostedMinersListProps {
  customerId?: string;
  poolFilter?: "all" | "luxor" | "braiins";
  repairButtonLabel?: string;
}

export default function HostedMinersList({
  customerId,
  poolFilter = "all",
  repairButtonLabel = "🛠️ Previous Repair Notes",
}: HostedMinersListProps) {
  const theme = useTheme();
  // Pool history is an admin-only view; this component is also rendered on
  // the client's own /miners page without a customerId, so gate on that.
  const isAdminView = !!customerId;
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL MINERS");
  const [repairNotesOpen, setRepairNotesOpen] = useState(false);
  const [poolHistoryOpen, setPoolHistoryOpen] = useState(false);
  const [selectedMinerId, setSelectedMinerId] = useState<string | null>(null);
  const [selectedMinerName, setSelectedMinerName] = useState("");
  // Which accordions are open, so the per-miner hashrate chart only fetches
  // for a miner actually expanded on screen — not all of them at once.
  const [expandedMinerIds, setExpandedMinerIds] = useState<Set<string>>(
    new Set(),
  );
  const toggleExpanded = (minerId: string, isExpanded: boolean) => {
    setExpandedMinerIds((prev) => {
      const next = new Set(prev);
      if (isExpanded) next.add(minerId);
      else next.delete(minerId);
      return next;
    });
  };

  const handleOpenNotes = (id: string, name: string) => {
    setSelectedMinerId(id);
    setSelectedMinerName(name);
    setRepairNotesOpen(true);
  };

  const handleOpenPoolHistory = (id: string, name: string) => {
    setSelectedMinerId(id);
    setSelectedMinerName(name);
    setPoolHistoryOpen(true);
  };

  // TanStack Query hook to fetch and transform miners
  const { data: miners = [], isLoading: loading } = useQuery({
    queryKey: ["miners", customerId],
    queryFn: async () => {
      try {
        // Step 1: Fetch miners from database with pool and space relations
        const minerUrl = customerId
          ? `/api/miners/user?customerId=${customerId}`
          : "/api/miners/user";

        const minerResponse = await fetch(minerUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!minerResponse.ok) {
          console.error("Failed to fetch miners from API");
          return [];
        }

        const minerData = await minerResponse.json();

        if (
          !minerData.miners ||
          !Array.isArray(minerData.miners) ||
          minerData.miners.length === 0
        ) {
          return [];
        }

        console.log(
          "[HostedMinersList] Raw API Response - First miner details:",
          minerData.miners[0]
            ? {
                id: minerData.miners[0].id,
                name: minerData.miners[0].name,
                serialNumber: minerData.miners[0].serialNumber,
                macAddress: minerData.miners[0].macAddress,
                status: minerData.miners[0].status,
                pool: minerData.miners[0].pool,
              }
            : "No miners",
        );

        console.log("[HostedMinersList] Fetched miners from DB:", {
          count: minerData.miners.length,
          poolNames: minerData.miners.map(
            (m: { pool?: { name?: string } }) => m.pool?.name || "no-pool",
          ),
          minerDetails: minerData.miners.map(
            (m: {
              name: string;
              poolId?: string;
              pool?: { name?: string };
              serialNumber?: string;
              macAddress?: string;
            }) => ({
              name: m.name,
              poolId: m.poolId,
              poolName: m.pool?.name,
              hasPool: !!m.pool,
              serialNumber: m.serialNumber,
              macAddress: m.macAddress,
            }),
          ),
        });

        // Step 2: Fetch worker status from Luxor API
        const luxorWorkers: Map<
          string,
          { status: string; hashrate: number; firmware: string }
        > = new Map();
        try {
          const luxorUrl =
            "/api/luxor?endpoint=workers&currency=BTC&page_size=1000";

          const luxorResponse = await fetch(luxorUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (luxorResponse.ok) {
            const luxorData = await luxorResponse.json();
            console.log(
              "[HostedMinersList] Luxor raw API response:",
              luxorData,
            );
            console.log("[HostedMinersList] Luxor data structure:", {
              has_data: !!luxorData.data,
              has_workers: !!luxorData.data?.workers,
              is_workers_array: Array.isArray(luxorData.data?.workers),
              workers_length: luxorData.data?.workers?.length,
              data_keys: Object.keys(luxorData.data || {}),
            });
            // Build a map of worker names to their status from Luxor
            if (
              luxorData.success &&
              luxorData.data?.workers &&
              Array.isArray(luxorData.data.workers)
            ) {
              luxorData.data.workers.forEach(
                (worker: {
                  name: string;
                  status: string;
                  hashrate: number;
                  firmware: string;
                }) => {
                  // Normalize Luxor worker data to standard format
                  const normalized = normalizeLuxorWorker(worker);
                  luxorWorkers.set(normalized.name, normalized);
                  console.log(
                    `[HostedMinersList] Luxor worker normalized: ${normalized.name} → status=${normalized.status}, hashrate=${normalized.hashrate}`,
                  );
                },
              );
              console.log(
                "[HostedMinersList] Luxor workers loaded:",
                luxorWorkers.size,
                "Entries:",
                Array.from(luxorWorkers.entries()).map(([name, data]) => ({
                  name,
                  status: data.status,
                  hashrate: data.hashrate,
                })),
              );
            } else {
              console.warn(
                "[HostedMinersList] Luxor API response does not have expected structure",
                {
                  success: luxorData.success,
                  has_data: !!luxorData.data,
                  has_workers: !!luxorData.data?.workers,
                  is_array: Array.isArray(luxorData.data?.workers),
                },
              );
            }
          } else {
            console.warn("Failed to fetch worker status from Luxor API");
          }
        } catch (luxorErr) {
          console.warn("Error fetching Luxor workers:", luxorErr);
        }

        // Step 3: Fetch worker status from Braiins API
        const braiinsWorkers: Map<
          string,
          { status: string; hashrate: number; firmware: string }
        > = new Map();
        try {
          const braiinsUrl = "/api/braiins?endpoint=workers";

          const braiinsResponse = await fetch(braiinsUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (braiinsResponse.ok) {
            const braiinsData = await braiinsResponse.json();
            console.log(
              "[HostedMinersList] Braiins raw API response:",
              braiinsData,
            );
            // Build a map of worker names to their status from Braiins
            if (
              braiinsData.success &&
              braiinsData.data?.workers &&
              Array.isArray(braiinsData.data.workers)
            ) {
              // For Braiins, multiple workers can belong to one miner
              // Aggregate workers by minerName to get miner-level status
              const workersByMiner: Record<
                string,
                Array<{
                  name: string;
                  state: "ok" | "dis" | "low" | "off";
                  hash_rate_5m: number;
                  hash_rate_60m: number;
                  hash_rate_24h: number;
                  minerName?: string;
                }>
              > = {};

              // Group workers by minerName
              braiinsData.data.workers.forEach(
                (worker: {
                  name: string;
                  state: "ok" | "dis" | "low" | "off";
                  hash_rate_5m: number;
                  hash_rate_60m: number;
                  hash_rate_24h: number;
                  minerName?: string;
                }) => {
                  const minerName = worker.minerName || "unknown";
                  if (!workersByMiner[minerName]) {
                    workersByMiner[minerName] = [];
                  }
                  workersByMiner[minerName].push(worker);
                },
              );

              console.log(
                "[HostedMinersList] Braiins workers grouped by miner:",
                Object.entries(workersByMiner).map(([minerName, workers]) => ({
                  minerName,
                  workerCount: workers.length,
                  states: workers.map((w) => w.state),
                })),
              );

              // For each miner, aggregate worker data
              Object.entries(workersByMiner).forEach(([minerName, workers]) => {
                // Use best status: if any worker is "ok", miner is ACTIVE, otherwise INACTIVE
                const hasOkWorker = workers.some((w) => w.state === "ok");
                const status = hasOkWorker ? "ACTIVE" : "INACTIVE";

                // Aggregate hashrate: sum of all workers
                // IMPORTANT: Braiins workers return hash_rate_5m in Gh/s, convert to H/s
                const totalHashrate = workers.reduce(
                  (sum, w) => sum + (w.hash_rate_5m || 0) * 1000000000, // Gh/s * 10^9 = H/s
                  0,
                );

                braiinsWorkers.set(minerName, {
                  status,
                  hashrate: totalHashrate,
                  firmware: "N/A",
                });

                console.log(
                  `[HostedMinersList] Braiins miner aggregated: ${minerName} → status=${status}, totalHashrate=${totalHashrate} H/s`,
                );
              });

              console.log(
                "[HostedMinersList] Braiins miners processed:",
                braiinsWorkers.size,
                "Entries:",
                Array.from(braiinsWorkers.entries()).map(
                  ([minerName, data]) => ({
                    minerName,
                    status: data.status,
                    hashrate: data.hashrate,
                  }),
                ),
              );
            }
          } else {
            console.warn("Failed to fetch worker status from Braiins API");
          }
        } catch (braiinsErr) {
          console.warn("Error fetching Braiins workers:", braiinsErr);
        }

        // Step 4: Transform and merge data
        const transformedMiners: MinerData[] = minerData.miners.map(
          (miner: {
            id: string;
            name: string;
            model?: string;
            status: string;
            serialNumber?: string | null;
            macAddress?: string | null;
            hashRate?: number;
            hardware?: { model: string; hashRate: number | string };
            space?: { location: string; name: string };
            pool?: { name: string };
          }) => {
            // Determine which API pool this miner belongs to
            const poolName = miner.pool?.name || "Unknown";
            const isBraiins = poolName === "Braiins";

            // Select appropriate worker map based on pool
            const workerMap = isBraiins ? braiinsWorkers : luxorWorkers;
            const workerData = workerMap.get(miner.name);

            // Log for debugging
            console.log(`[HostedMinersList] Processing miner: ${miner.name}`, {
              poolName,
              isBraiins,
              workerFound: !!workerData,
              workerStatus: workerData?.status,
              workerHashrate: workerData?.hashrate,
              serialNumber: miner.serialNumber,
              macAddress: miner.macAddress,
            });

            // Check if miner is in deployment
            if (miner.status === "DEPLOYMENT_IN_PROGRESS") {
              console.log(
                `[HostedMinersList] Miner ${miner.name} is in deployment`,
              );
              return {
                id: miner.id,
                model: miner.hardware?.model || miner.model || "Unknown",
                workerName: miner.name,
                location: miner.space?.location || "Unknown",
                connectedPool: poolName, // Use pool.name instead of space.name
                status: "Deployment in Progress",
                hashRate: formatHashrate(0), // 0 H/s formatted
                firmware: "N/A",
                serialNumber: miner.serialNumber || "—",
                macAddress: miner.macAddress || "—",
              };
            }

            if (miner.status === "UNDER_MAINTENANCE") {
              return {
                id: miner.id,
                model: miner.hardware?.model || miner.model || "Unknown",
                workerName: miner.name,
                location: miner.space?.location || "Unknown",
                connectedPool: poolName,
                status: "Under Maintenance",
                hashRate: formatHashrate(0),
                firmware: "N/A",
                serialNumber: miner.serialNumber || "—",
                macAddress: miner.macAddress || "—",
              };
            }

            // Use API data if available, otherwise fallback to database
            const apiStatus = workerData?.status;
            const apiHashrate = workerData?.hashrate || 0;
            const apiFirmware = workerData?.firmware || "N/A";

            console.log(`[HostedMinersList] Final miner data: ${miner.name}`, {
              poolName,
              isBraiins,
              workerFound: !!workerData,
              apiStatus,
              apiHashrate,
              apiFirmware,
              formattedHashrate: formatHashrate(apiHashrate),
            });

            return {
              id: miner.id,
              model: miner.hardware?.model || miner.model || "Unknown",
              workerName: miner.name,
              location: miner.space?.location || "Unknown",
              connectedPool: poolName, // Use pool.name instead of space.name
              // Priority: API status > fallback to Inactive
              status:
                apiStatus === "ACTIVE"
                  ? "Active"
                  : apiStatus === "INACTIVE"
                    ? "Inactive"
                    : "Inactive",
              // Use normalized hashrate (in H/s) for display with proper unit conversion
              hashRate: formatHashrate(apiHashrate),
              firmware: apiFirmware,
              serialNumber: miner.serialNumber || "—",
              macAddress: miner.macAddress || "—",
            };
          },
        );

        console.log("[HostedMinersList] Transformed miners:", {
          total: transformedMiners.length,
          luxor: transformedMiners.filter((m) => m.connectedPool === "Luxor")
            .length,
          braiins: transformedMiners.filter(
            (m) => m.connectedPool === "Braiins",
          ).length,
          poolBreakdown: transformedMiners.map((m) => ({
            name: m.workerName,
            connectedPool: m.connectedPool,
            status: m.status,
            hashRate: m.hashRate,
            serialNumber: m.serialNumber,
            macAddress: m.macAddress,
          })),
        });

        // Remove duplicates based on ID and return
        return Array.from(
          new Map(transformedMiners.map((m) => [m.id, m])).values(),
        );
      } catch (err) {
        console.error("Error fetching miners:", err);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Filter miners based on active filter AND pool filter
  const filteredMiners = miners.filter((miner) => {
    // First apply pool filter
    if (poolFilter === "luxor" && miner.connectedPool !== "Luxor") return false;
    if (poolFilter === "braiins" && miner.connectedPool !== "Braiins")
      return false;

    // Then apply status filter
    if (activeFilter === "ALL MINERS") return true;
    if (activeFilter === "ACTIVE") return miner.status === "Active";
    if (activeFilter === "INACTIVE") return miner.status === "Inactive";
    if (activeFilter === "DEPLOYMENT IN PROGRESS")
      return miner.status === "Deployment in Progress";
    if (activeFilter === "UNDER MAINTENANCE")
      return miner.status === "Under Maintenance";
    return true;
  });

  // Get counts for each category
  const allCount = miners.length;
  const activeCount = miners.filter((m) => m.status === "Active").length;
  const inactiveCount = miners.filter((m) => m.status === "Inactive").length;
  const deploymentCount = miners.filter(
    (m) => m.status === "Deployment in Progress",
  ).length;
  const maintenanceCount = miners.filter(
    (m) => m.status === "Under Maintenance",
  ).length;

  const filterCounts = [
    allCount,
    activeCount,
    inactiveCount,
    deploymentCount,
    maintenanceCount,
  ];
  const filterValuesWithCounts = FILTER_VALUES.map((value, index) => ({
    value,
    count: filterCounts[index],
  }));

  const getStatusChip = (status: MinerData["status"]) => {
    let bgColor = alpha(theme.palette.error.main, 0.1);
    let textColor = theme.palette.error.main;

    if (status === "Active") {
      bgColor = alpha(theme.palette.success.main, 0.1);
      textColor = theme.palette.success.main;
    } else if (status === "Deployment in Progress") {
      bgColor = alpha(theme.palette.warning.main, 0.1);
      textColor = theme.palette.warning.main;
    } else if (status === "Under Maintenance") {
      bgColor = alpha(theme.palette.secondary.main, 0.1);
      textColor = theme.palette.secondary.main;
    }

    return (
      <Chip
        label={status}
        size="small"
        sx={{
          backgroundColor: bgColor,
          color: textColor,
          fontWeight: 500,
          minWidth: "70px",
        }}
      />
    );
  };

  return (
    <Box sx={{ width: "100%" }}>
      {/* Header — Filter Buttons */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          mb: 3,
        }}
      >
        {filterValuesWithCounts.map(({ value, count }) => (
          <Button
            key={value}
            variant="contained"
            onClick={() => setActiveFilter(value)}
            size="small"
            sx={{
              textTransform: "none",
              fontWeight: 500,
              fontSize: { xs: "0.7rem", sm: "0.8rem" },
              px: { xs: 1, sm: 1.5 },
              py: { xs: 0.5, sm: 0.75 },
              minWidth: 0,
              ...(activeFilter === value && {
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.primary.main,
                borderColor: theme.palette.primary.main,
              }),
            }}
          >
            {value} ({count})
          </Button>
        ))}
      </Box>

      {/* Miners List */}
      <Box sx={{ mt: { xs: 2, md: 4 } }}>
        {loading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              p: 6,
            }}
          >
            <CircularProgress />
          </Box>
        ) : filteredMiners.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="h6" color="text.secondary">
              No miners found for the selected filter.
            </Typography>
          </Box>
        ) : (
          filteredMiners.map((miner) => (
            <Accordion
              key={miner.id}
              expanded={expandedMinerIds.has(miner.id)}
              onChange={(_, isExpanded) => toggleExpanded(miner.id, isExpanded)}
              sx={{
                mb: 2,
                border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
                borderRadius: 2,
                "&:before": {
                  display: "none",
                },
                "&.Mui-expanded": {
                  margin: "0 0 16px 0",
                },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: { xs: 2, sm: 3 },
                  py: { xs: 1.5, sm: 2 },
                  "& .MuiAccordionSummary-content": {
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 1,
                  },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 0.75,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography
                      variant="h6"
                      fontWeight="600"
                      sx={{
                        fontSize: { xs: "0.95rem", sm: "1.1rem" },
                        lineHeight: 1.3,
                      }}
                    >
                      {miner.model}
                    </Typography>
                    <Box sx={{ display: { xs: "block", sm: "none" } }}>
                      {getStatusChip(miner.status)}
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      gap: { xs: 0.25, sm: 0 },
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mr: { sm: 2 } }}
                    >
                      <strong>Worker:</strong> {miner.workerName}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mr: { sm: 2 } }}
                    >
                      <strong>Location:</strong> {miner.location}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Pool:</strong> {miner.connectedPool}
                    </Typography>
                  </Box>
                </Box>

                <Box
                  sx={{
                    ml: 1,
                    flexShrink: 0,
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  {getStatusChip(miner.status)}
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ px: { xs: 1.5, sm: 3 }, py: 2, pt: 0 }}>
                <Box
                  sx={{
                    backgroundColor: alpha(theme.palette.background.paper, 0.5),
                    borderRadius: 2,
                    p: { xs: 2, sm: 3 },
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                  }}
                >
                  <Typography
                    variant="h6"
                    fontWeight="600"
                    sx={{ mb: 2, fontSize: { xs: "0.9rem", sm: "1.1rem" } }}
                  >
                    Miner Details
                  </Typography>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr 1fr",
                        sm: "repeat(3, 1fr)",
                        md: "repeat(6, auto)",
                      },
                      gap: { xs: 2, sm: 3 },
                    }}
                  >
                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Firmware
                      </Typography>
                      <Typography variant="body2" fontWeight="500">
                        {miner.firmware || "N/A"}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Serial No.
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight="500"
                        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                      >
                        {miner.serialNumber || "—"}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        MAC Address
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight="500"
                        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                      >
                        {miner.macAddress || "—"}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Hash Rate
                      </Typography>
                      <Typography variant="body2" fontWeight="500">
                        {miner.hashRate || "N/A"}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Status
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight="500"
                        sx={{
                          color:
                            miner.status === "Active"
                              ? theme.palette.success.main
                              : theme.palette.error.main,
                        }}
                      >
                        {miner.status}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Action
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() =>
                            handleOpenNotes(miner.id, miner.workerName)
                          }
                          sx={{
                            textTransform: "none",
                            borderRadius: 2,
                            fontSize: { xs: "0.7rem", sm: "0.8rem" },
                          }}
                        >
                          {repairButtonLabel}
                        </Button>
                        {isAdminView && (
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() =>
                              handleOpenPoolHistory(miner.id, miner.workerName)
                            }
                            sx={{
                              textTransform: "none",
                              borderRadius: 2,
                              fontSize: { xs: "0.7rem", sm: "0.8rem" },
                            }}
                          >
                            Pool History
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Box>

                {/* Client-only for now, matching the phased rollout of the
                    subaccount-level chart on the main /miners page. Only
                    fetches once this miner's accordion is actually open. */}
                {!isAdminView && expandedMinerIds.has(miner.id) && (
                  <HashrateHistoryChart minerId={miner.id} height={320} />
                )}
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>

      <RepairNotesModal
        open={repairNotesOpen}
        onClose={() => setRepairNotesOpen(false)}
        minerId={selectedMinerId}
        minerName={selectedMinerName}
        readonly={true}
      />

      <MinerPoolHistoryModal
        open={poolHistoryOpen}
        onClose={() => setPoolHistoryOpen(false)}
        minerId={selectedMinerId}
        minerName={selectedMinerName}
      />
    </Box>
  );
}
