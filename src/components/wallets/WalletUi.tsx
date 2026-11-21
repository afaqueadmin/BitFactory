"use client";

import React, { useState } from "react";
import { Box, IconButton, Stack, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { useDaylight } from "@/lib/daylight";
import type { DaylightTone } from "@/components/daylight/AdminPage";

/**
 * Small pieces shared by the admin Wallets module. This module is staff-only
 * (full addresses), so the address cell keeps a copy button - unlike the
 * client wallet page, where addresses are masked and can't be copied.
 */

export function AddressBox({
  address,
  empty = "(none)",
  tone,
}: {
  address: string | null | undefined;
  empty?: string;
  tone?: "danger" | "success";
}) {
  const { d } = useDaylight();
  const [copied, setCopied] = useState(false);
  if (!address) {
    return (
      <Box component="span" sx={{ fontSize: 12, color: d.muted }}>
        {empty}
      </Box>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused - the address is selectable text anyway */
    }
  };
  const border =
    tone === "danger"
      ? d.borderDanger
      : tone === "success"
        ? d.borderMint
        : d.border;
  return (
    <Stack
      direction="row"
      alignItems="flex-start"
      spacing={0.5}
      sx={{
        bgcolor: d.canvas,
        border: `1px solid ${border}`,
        borderRadius: "8px",
        px: 1,
        py: 0.5,
        maxWidth: 340,
      }}
    >
      <Box
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.5,
          wordBreak: "break-all",
          color: d.text,
        }}
      >
        {address}
      </Box>
      <Tooltip title={copied ? "Copied" : "Copy address"}>
        <IconButton
          size="small"
          onClick={copy}
          aria-label="Copy address"
          sx={{ p: 0.25, color: copied ? d.success : d.muted }}
        >
          {copied ? (
            <CheckIcon sx={{ fontSize: 14 }} />
          ) : (
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export interface FilterOption<V extends string> {
  value: V;
  label: string;
  count: number;
  tone?: DaylightTone;
}

/** Pill-shaped filter toggles with counts ("All 26", "Mismatch 1", …). */
export function FilterChips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: FilterOption<V>[];
  value: V;
  onChange: (v: V) => void;
}) {
  const { d, fonts } = useDaylight();
  const toneColor = (t?: DaylightTone) =>
    t === "danger"
      ? d.danger
      : t === "warning"
        ? d.warning
        : t === "success"
          ? d.success
          : d.action;
  return (
    <Stack direction="row" flexWrap="wrap" gap={1} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        const c = toneColor(o.tone);
        return (
          <Box
            key={o.value}
            component="button"
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              borderRadius: "999px",
              border: `1px solid ${active ? c : d.border}`,
              bgcolor: active ? d.surface : "transparent",
              color: active ? c : d.text,
              fontFamily: fonts.body,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: active ? d.shadow : "none",
              "&:hover": { borderColor: c },
              "&:focus-visible": {
                outline: `2px solid ${c}`,
                outlineOffset: 2,
              },
            }}
          >
            {o.label}
            <Box
              component="span"
              sx={{
                minWidth: 20,
                px: 0.75,
                borderRadius: "999px",
                bgcolor: active ? c : d.hover,
                color: active ? d.surface : d.muted,
                fontSize: 11,
                lineHeight: "18px",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {o.count}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

/** Where a Current Wallets row stands, for its pill and the filter. */
export type WalletState =
  "match" | "mismatch" | "empty" | "error" | "norecord" | "unchecked";

export const WALLET_STATE: Record<
  WalletState,
  { label: string; tone: DaylightTone; order: number }
> = {
  mismatch: { label: "Mismatch", tone: "danger", order: 0 },
  norecord: { label: "No record", tone: "danger", order: 1 },
  error: { label: "Couldn't check", tone: "warning", order: 2 },
  empty: { label: "No address on Luxor", tone: "warning", order: 3 },
  unchecked: { label: "Not checked yet", tone: "neutral", order: 4 },
  match: { label: "Matches Luxor", tone: "success", order: 5 },
};
