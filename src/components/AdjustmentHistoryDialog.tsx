"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Stack,
  Typography,
  CircularProgress,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useAdjustmentAuditLog } from "@/lib/hooks/admin/useAdjustments";
import { AuditLogWithUser } from "@/lib/hooks/useInvoices";

interface AdjustmentHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  adjustmentId: string | null;
}

function formatAuditAction(action: string): string {
  const actionMap: { [key: string]: string } = {
    PAYMENT_ADDED: "Adjustment Created / Updated",
    PAYMENT_REMOVED: "Adjustment Deleted",
  };

  return actionMap[action] || action;
}

export default function AdjustmentHistoryDialog({
  open,
  onClose,
  adjustmentId,
}: AdjustmentHistoryDialogProps) {
  const { auditLogs, loading } = useAdjustmentAuditLog(
    open ? adjustmentId : null,
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
        Adjustment History
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={30} />
          </Box>
        ) : auditLogs.length === 0 ? (
          <Typography color="textSecondary">
            No activity recorded yet
          </Typography>
        ) : (
          <Stack spacing={2}>
            {auditLogs.map((log: AuditLogWithUser, index: number) => (
              <Box
                key={log.id}
                sx={{
                  pb: 2,
                  borderBottom:
                    index < auditLogs.length - 1 ? "1px solid #eee" : "none",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    mb: 1,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>
                      {formatAuditAction(log.action)}
                    </Typography>
                    <Typography color="textSecondary" variant="body2">
                      {log.user?.name || log.user?.email || "System"}
                    </Typography>
                  </Box>
                  <Typography color="textSecondary" variant="body2">
                    {new Date(log.createdAt).toLocaleString()}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {log.description}
                </Typography>
                {log.changes ? (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      bgcolor: "#f5f5f5",
                      borderRadius: 1,
                      fontSize: "0.875rem",
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      Changes:
                    </Typography>
                    <pre
                      style={{
                        margin: "4px 0 0 0",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "inherit",
                      }}
                    >
                      {typeof log.changes === "string"
                        ? log.changes
                        : JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </Box>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
