"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme,
  alpha,
  CircularProgress,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useQuery } from "@tanstack/react-query";

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
    | "AUTO"
    | "DEPLOYMENT_IN_PROGRESS";
  hashRate: string;
  firmware: string;
  hardware?: Hardware;
}

// Filter values
const FILTER_VALUES = [
  "ALL MINERS",
  "ACTIVE",
  "INACTIVE",
  "DEPLOYMENT IN PROGRESS",
] as const;
// Filter type
export type FilterType = (typeof FILTER_VALUES)[number];

interface HostedMinersListProps {
  customerId?: string;
}

export default function HostedMinersList({
  customerId,
}: HostedMinersListProps) {
  const theme = useTheme();
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL MINERS");

  // TanStack Query hook to fetch and transform miners
  const { data: miners = [], isLoading: loading } = useQuery({
    queryKey: ["miners", customerId],
    queryFn: async () => {
      try {
        // Step 1: Fetch miners from database
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
                  luxorWorkers.set(worker.name, {
                    status: worker.status,
                    hashrate: worker.hashrate || 0,
                    firmware: worker.firmware || "N/A",
                  });
                },
              );
            }
          } else {
            console.warn("Failed to fetch worker status from Luxor API");
          }
        } catch (luxorErr) {
          console.warn("Error fetching Luxor workers:", luxorErr);
        }

        // Step 3: Transform and merge data
        const transformedMiners: MinerData[] = minerData.miners.map(
          (miner: {
            id: string;
            name: string;
            model?: string;
            status: string;
            hashRate?: number;
            hardware?: { model: string; hashRate: number | string };
            space?: { location: string; name: string };
          }) => {
            // Check if miner is in deployment
            if (miner.status === "DEPLOYMENT_IN_PROGRESS") {
              return {
                id: miner.id,
                model: miner.hardware?.model || miner.model || "Unknown",
                workerName: miner.name,
                location: miner.space?.location || "Unknown",
                connectedPool: miner.space?.name || "Unknown",
                status: "Deployment in Progress",
                hashRate: `0 TH/s`,
              };
            }

            // For AUTO status, fetch from Luxor API
            const luxorWorker = luxorWorkers.get(miner.name);
            const luxorStatus = luxorWorker?.status;

            return {
              id: miner.id,
              model: miner.hardware?.model || miner.model || "Unknown",
              workerName: miner.name,
              location: miner.space?.location || "Unknown",
              connectedPool: miner.space?.name || "Unknown",
              // Priority: Luxor API status > fallback to Inactive
              status: luxorStatus === "ACTIVE" ? "Active" : "Inactive",
              hashRate: `${(luxorWorker?.hashrate && (luxorWorker.hashrate / 1000000000000).toFixed(2)) || miner.hardware?.hashRate || miner.hashRate || 0} TH/s`,
              firmware: luxorWorker?.firmware || "N/A",
            };
          },
        );

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

  // Filter miners based on active filter
  const filteredMiners = miners.filter((miner) => {
    if (activeFilter === "ALL MINERS") return true;
    if (activeFilter === "ACTIVE") return miner.status === "Active";
    if (activeFilter === "INACTIVE") return miner.status === "Inactive";
    if (activeFilter === "DEPLOYMENT IN PROGRESS")
      return miner.status === "Deployment in Progress";
    return true;
  });

  // Get counts for each category
  const allCount = miners.length;
  const activeCount = miners.filter((m) => m.status === "Active").length;
  const inactiveCount = miners.filter((m) => m.status === "Inactive").length;
  const deploymentCount = miners.filter(
    (m) => m.status === "Deployment in Progress",
  ).length;

  const filterCounts = [allCount, activeCount, inactiveCount, deploymentCount];
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
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography
          variant="h4"
          fontWeight="bold"
          sx={{ color: theme.palette.text.primary }}
        >
          All Hosted Miners
        </Typography>

        {/* Filter Buttons */}
        <Stack direction="row" spacing={1}>
          {filterValuesWithCounts.map(({ value, count }) => (
            <Button
              key={value}
              variant={"contained"}
              onClick={() => setActiveFilter(value)}
              size="small"
              sx={{
                minWidth: "100px",
                textTransform: "none",
                fontWeight: 500,
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
        </Stack>
      </Box>

      {/* Miners List */}
      <Box sx={{ mt: 4 }}>
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
                  px: 3,
                  py: 2,
                  "& .MuiAccordionSummary-content": {
                    alignItems: "center",
                    justifyContent: "space-between",
                  },
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight="600" sx={{ mb: 1 }}>
                    {miner.model}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 0.5 }}
                  >
                    <strong>Worker Name:</strong> {miner.workerName}{" "}
                    &nbsp;&nbsp;
                    <strong>Location:</strong> {miner.location} &nbsp;&nbsp;
                    <strong>Connected Pool:</strong> {miner.connectedPool}
                  </Typography>
                </Box>

                <Box sx={{ ml: 2 }}>{getStatusChip(miner.status)}</Box>
              </AccordionSummary>

              <AccordionDetails sx={{ px: 3, py: 2, pt: 0 }}>
                <Box
                  sx={{
                    backgroundColor: alpha(theme.palette.background.paper, 0.5),
                    borderRadius: 2,
                    p: 3,
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                  }}
                >
                  <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
                    Miner Details
                  </Typography>

                  <Stack direction="row" spacing={6} flexWrap="wrap">
                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Firmware
                      </Typography>
                      <Typography variant="body1" fontWeight="500">
                        {miner.firmware || "N/A"}
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
                      <Typography variant="body1" fontWeight="500">
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
                        variant="body1"
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
                  </Stack>
                </Box>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>
    </Box>
  );
}
