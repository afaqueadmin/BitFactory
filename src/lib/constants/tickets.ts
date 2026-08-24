import { ChipProps } from "@mui/material";

export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_ON_CUSTOMER: "Waiting on Customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const TICKET_STATUS_COLORS: Record<string, ChipProps["color"]> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  WAITING_ON_CUSTOMER: "secondary",
  RESOLVED: "success",
  CLOSED: "default",
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TICKET_PRIORITY_COLORS: Record<string, ChipProps["color"]> = {
  LOW: "default",
  NORMAL: "info",
  HIGH: "warning",
  URGENT: "error",
};

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  HARDWARE_MINER: "Hardware / Miner",
  BILLING_INVOICE: "Billing / Invoice",
  POOL_HASHRATE: "Pool / Hashrate",
  ACCOUNT: "Account",
  OTHER: "Other",
};

export const TICKET_CATEGORIES = Object.keys(TICKET_CATEGORY_LABELS);
export const TICKET_PRIORITIES = Object.keys(TICKET_PRIORITY_LABELS);
export const TICKET_STATUSES = Object.keys(TICKET_STATUS_LABELS);
