"use client";

import React, { useState, useEffect } from "react";
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

// Types
interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  hashRate: number | string;
}

interface MinerData {
  id: string;
  name: string;
  model: string;
  workerName: string;
  location: string;
  connectedPool: string;
  status: "Active" | "Inactive" | "ACTIVE" | "INACTIVE";
  hashRate: string;
  hardware?: Hardware;
}

// Filter type
type FilterType = "ALL MINERS" | "ACTIVE" | "INACTIVE";

// Dummy data for miners
const dummyMiners: MinerData[] = [
  {
    id: "1",
    name: "Miner-001",
    model: "Bitmain S21 Pro",
    workerName: "test567897",
    location: "UAE 2",
    connectedPool: "Default",
    status: "Active",
    hashRate: "195 TH/s",
    hardware: {
      id: "hw1",
      model: "Bitmain S21 Pro",
      powerUsage: 3.25,
      hashRate: 195,
    },
  },
  {
    id: "2",
    name: "Miner-002",
    model: "Bitmain S21 Pro",
    workerName: "test567894",
    location: "In Transport",
    connectedPool: "Default",
    status: "Inactive",
    hashRate: "0 TH/s",
    hardware: {
      id: "hw1",
      model: "Bitmain S21 Pro",
      powerUsage: 3.25,
      hashRate: 0,
    },
  },
  {
    id: "3",
    name: "Miner-003",
    model: "Bitmain S21 Pro",
    workerName: "test567898",
    location: "USA 1",
    connectedPool: "Default",
    status: "Active",
    hashRate: "195 TH/s",
    hardware: {
      id: "hw1",
      model: "Bitmain S21 Pro",
      powerUsage: 3.25,
      hashRate: 200,
    },
  },
  {
    id: "4",
    name: "Miner-004",
    model: "Bitmain S21 Pro",
    workerName: "test567895",
    location: "Repair / Warehouse",
    connectedPool: "Default",
    status: "Inactive",
    hashRate: "0 TH/s",
    hardware: {
      id: "hw1",
      model: "Bitmain S21 Pro",
      powerUsage: 3.25,
      hashRate: 0,
    },
  },
  {
    id: "5",
    name: "Miner-005",
    model: "Bitmain S21 Pro",
    workerName: "test567896",
    location: "UAE 1",
    connectedPool: "Default",
    status: "Active",
    hashRate: "234 TH/s",
    hardware: {
      id: "hw1",
      model: "Bitmain S21 Pro",
      powerUsage: 3.25,
      hashRate: 234,
    },
  },
];

export default function HostedMinersList() {
  const theme = useTheme();
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL MINERS");
  const [miners, setMiners] = useState<MinerData[]>(dummyMiners);
  const [loading, setLoading] = useState(true);

  // Fetch miners from API and enrich with Luxor worker status
  useEffect(() => {
    const fetchMiners = async () => {
      try {
        setLoading(true);

        // Step 1: Fetch miners from database
        const minerResponse = await fetch("/api/miners/user", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!minerResponse.ok) {
          console.error("Failed to fetch miners from API");
          setMiners(dummyMiners);
          return;
        }

        const minerData = await minerResponse.json();

        if (
          !minerData.miners ||
          !Array.isArray(minerData.miners) ||
          minerData.miners.length === 0
        ) {
          setMiners(dummyMiners);
          return;
        }

        // Step 2: Fetch worker status from Luxor API
        const luxorWorkers: Map<string, { status: string; hashrate: number }> =
          new Map();
        try {
          const luxorResponse = await fetch(
            "/api/luxor?endpoint=workers&currency=BTC&page_size=1000",
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            },
          );

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
                }) => {
                  luxorWorkers.set(worker.name, {
                    status: worker.status,
                    hashrate: worker.hashrate || 0,
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
            // Get Luxor worker data if available
            const luxorWorker = luxorWorkers.get(miner.name);
            // const luxorStatus = luxorWorker?.status || miner.status;
            const luxorStatus = luxorWorker?.status;

            return {
              id: miner.id,
              model: miner.hardware?.model || miner.model || "Unknown",
              workerName: miner.name,
              location: miner.space?.location || "Unknown",
              connectedPool: miner.space?.name || "Unknown",
              // Priority: Luxor API status > Database status
              status:
                luxorStatus === "ACTIVE" ? "Active" : "Deployment in Progress",
              hashRate: `${luxorWorker?.hashrate || miner.hardware?.hashRate || miner.hashRate || 0} TH/s`,
            };
          },
        );

        // Remove duplicates based on ID
        const uniqueMiners = Array.from(
          new Map(transformedMiners.map((m) => [m.id, m])).values(),
        );
        setMiners(uniqueMiners);
      } catch (err) {
        console.error("Error fetching miners:", err);
        setMiners(dummyMiners);
      } finally {
        setLoading(false);
      }
    };

    fetchMiners();
  }, []);

  // Filter miners based on active filter
  const filteredMiners = miners.filter((miner) => {
    if (activeFilter === "ALL MINERS") return true;
    if (activeFilter === "ACTIVE") return miner.status === "Active";
    if (activeFilter === "INACTIVE") return miner.status === "Inactive";
    return true;
  });

  // Get counts for each category
  const allCount = miners.length;
  const activeCount = miners.filter((m) => m.status === "Active").length;
  const inactiveCount = miners.filter((m) => m.status === "Inactive").length;

  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(filter);
  };

  const getStatusChip = (status: MinerData["status"]) => {
    return (
      <Chip
        label={status}
        size="small"
        sx={{
          backgroundColor:
            status === "Active"
              ? alpha(theme.palette.success.main, 0.1)
              : alpha(theme.palette.error.main, 0.1),
          color:
            status === "Active"
              ? theme.palette.success.main
              : theme.palette.error.main,
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
          <Button
            variant={activeFilter === "ALL MINERS" ? "contained" : "outlined"}
            onClick={() => handleFilterChange("ALL MINERS")}
            size="small"
            sx={{
              minWidth: "100px",
              textTransform: "none",
              fontWeight: 500,
              ...(activeFilter === "ALL MINERS" && {
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.primary.main,
                borderColor: theme.palette.primary.main,
              }),
            }}
          >
            ALL MINERS ({allCount})
          </Button>
          <Button
            variant={activeFilter === "ACTIVE" ? "contained" : "contained"}
            onClick={() => handleFilterChange("ACTIVE")}
            size="small"
            sx={{
              minWidth: "80px",
              textTransform: "none",
              fontWeight: 500,
              backgroundColor:
                activeFilter === "ACTIVE"
                  ? theme.palette.primary.main
                  : theme.palette.primary.main,
              color: "white",
              "&:hover": {
                backgroundColor: theme.palette.primary.dark,
              },
            }}
          >
            ACTIVE ({activeCount})
          </Button>
          <Button
            variant={activeFilter === "INACTIVE" ? "contained" : "contained"}
            onClick={() => handleFilterChange("INACTIVE")}
            size="small"
            sx={{
              minWidth: "80px",
              textTransform: "none",
              fontWeight: 500,
              backgroundColor:
                activeFilter === "INACTIVE"
                  ? theme.palette.primary.main
                  : theme.palette.primary.main,
              color: "white",
              "&:hover": {
                backgroundColor: theme.palette.primary.dark,
              },
            }}
          >
            INACTIVE ({inactiveCount})
          </Button>
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

                  <Stack direction="row" spacing={4} flexWrap="wrap">
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
