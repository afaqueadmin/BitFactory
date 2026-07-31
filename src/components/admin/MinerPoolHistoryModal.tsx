import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Divider,
} from "@mui/material";

interface PoolHistoryPeriod {
  id: string;
  poolId: string;
  poolName: string;
  from: string;
  to: string | null;
  isCurrent: boolean;
  createdBy: string | null;
}

interface MinerPoolHistoryModalProps {
  open: boolean;
  onClose: () => void;
  minerId: string | null;
  minerName: string;
}

export default function MinerPoolHistoryModal({
  open,
  onClose,
  minerId,
  minerName,
}: MinerPoolHistoryModalProps) {
  const [periods, setPeriods] = useState<PoolHistoryPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && minerId) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, minerId]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/miners/${minerId}/pool-history`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch pool history");
      }
      setPeriods(data.data?.periods || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pool History — {minerName}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : periods.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No pool assignment history recorded for this miner yet. History
            starts being tracked from the first pool assignment made after this
            feature shipped.
          </Typography>
        ) : (
          <Box>
            {[...periods].reverse().map((period, index) => (
              <Box key={period.id}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    py: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="body1" fontWeight={600}>
                      {period.poolName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(period.from)} →{" "}
                      {period.to ? formatDate(period.to) : "present"}
                    </Typography>
                  </Box>
                  {period.isCurrent && (
                    <Chip label="Current" color="success" size="small" />
                  )}
                </Box>
                {index < periods.length - 1 && <Divider />}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
