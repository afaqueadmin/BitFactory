"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useCreateTicket } from "@/lib/hooks/useTickets";
import { useUser } from "@/lib/hooks/useUser";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from "@/lib/constants/tickets";

interface MinerOption {
  id: string;
  name: string;
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  totalAmount: number | string;
  status: string;
}

interface CustomerOption {
  id: string;
  name: string;
  email: string;
}

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  detailBasePath: string; // e.g. "/support" or "/franchise/support" or "/tickets"
}

export default function CreateTicketModal({
  open,
  onClose,
  detailBasePath,
}: CreateTicketModalProps) {
  const router = useRouter();
  const createTicket = useCreateTicket();
  const { user } = useUser();

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [message, setMessage] = useState("");
  const [minerId, setMinerId] = useState("");
  const [miners, setMiners] = useState<MinerOption[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [onBehalfOfUserId, setOnBehalfOfUserId] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isFranchisee = user?.role === "FRANCHISEE";
  const needsMiner =
    category === "HARDWARE_MINER" || category === "POOL_HASHRATE";
  const needsInvoice = category === "BILLING_INVOICE";
  // Whose miners/invoices to offer: the selected client, or the caller
  // themselves (a FRANCHISEE raising for their own personal mining account,
  // same as a CLIENT).
  const effectiveCustomerId = onBehalfOfUserId || user?.id || "";

  useEffect(() => {
    if (!open || !isFranchisee) return;
    fetch("/api/franchise/customers", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setCustomers(data.users || []))
      .catch(() => setCustomers([]));
  }, [open, isFranchisee]);

  useEffect(() => {
    if (!open || !effectiveCustomerId) return;
    const url = isFranchisee
      ? `/api/miners/user?customerId=${effectiveCustomerId}`
      : "/api/miners/user";
    fetch(url, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setMiners(data.miners || []))
      .catch(() => setMiners([]));
  }, [open, isFranchisee, effectiveCustomerId]);

  useEffect(() => {
    if (!open || !effectiveCustomerId) return;
    fetch(
      `/api/accounting/invoices?customerId=${effectiveCustomerId}&limit=100`,
      {
        credentials: "include",
      },
    )
      .then((res) => res.json())
      .then((data) => setInvoices(data.invoices || []))
      .catch(() => setInvoices([]));
  }, [open, effectiveCustomerId]);

  const resetAndClose = () => {
    setSubject("");
    setCategory("");
    setPriority("NORMAL");
    setMessage("");
    setMinerId("");
    setInvoiceId("");
    setOnBehalfOfUserId("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!subject.trim() || !category || !message.trim()) {
      setError("Subject, category and message are required");
      return;
    }
    try {
      const result = await createTicket.mutateAsync({
        subject: subject.trim(),
        category,
        priority,
        message: message.trim(),
        minerId: minerId || undefined,
        invoiceId: invoiceId || undefined,
        onBehalfOfUserId: onBehalfOfUserId || undefined,
      });
      resetAndClose();
      if (result?.data?.id) {
        router.push(`${detailBasePath}/${result.data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  };

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Raise a Support Ticket</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {isFranchisee && (
            <TextField
              select
              label="Raising this ticket for"
              value={onBehalfOfUserId}
              onChange={(e) => {
                setOnBehalfOfUserId(e.target.value);
                setMinerId("");
                setInvoiceId("");
              }}
              fullWidth
            >
              <MenuItem value="">Myself</MenuItem>
              {customers.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name || c.email}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            fullWidth
            required
            inputProps={{ maxLength: 200 }}
          />

          <TextField
            select
            label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              if (
                e.target.value !== "HARDWARE_MINER" &&
                e.target.value !== "POOL_HASHRATE"
              ) {
                setMinerId("");
              }
              if (e.target.value !== "BILLING_INVOICE") {
                setInvoiceId("");
              }
            }}
            fullWidth
            required
          >
            {TICKET_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </MenuItem>
            ))}
          </TextField>

          {needsMiner && (
            <TextField
              select
              label="Related Miner (optional)"
              value={minerId}
              onChange={(e) => setMinerId(e.target.value)}
              fullWidth
              helperText="Pin this ticket to a specific machine so support has instant context"
            >
              <MenuItem value="">None</MenuItem>
              {miners.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {needsInvoice && (
            <TextField
              select
              label="Related Invoice (optional)"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              fullWidth
              helperText="Pin this ticket to the specific invoice you're asking about"
            >
              <MenuItem value="">None</MenuItem>
              {invoices.map((inv) => (
                <MenuItem key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — ${Number(inv.totalAmount).toFixed(2)} (
                  {inv.status})
                </MenuItem>
              ))}
            </TextField>
          )}

          {isFranchisee && (
            <TextField
              select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              fullWidth
            >
              {TICKET_PRIORITIES.map((p) => (
                <MenuItem key={p} value={p}>
                  {TICKET_PRIORITY_LABELS[p]}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            label="Describe the issue"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            fullWidth
            required
            multiline
            minRows={4}
            inputProps={{ maxLength: 5000 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={resetAndClose} disabled={createTicket.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createTicket.isPending}
          startIcon={
            createTicket.isPending ? <CircularProgress size={16} /> : undefined
          }
        >
          Submit Ticket
        </Button>
      </DialogActions>
    </Dialog>
  );
}
