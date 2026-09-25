"use client";

/**
 * Multi-select for assigning Luxor subaccounts to a user. Options are the
 * workspace's Luxor subaccounts minus those already assigned to someone else
 * (a subaccount belongs to exactly one user). `ownNames` - the subaccounts
 * this user already holds - stay selectable even though they're "assigned".
 *
 * Shared by the create/edit user, create/edit franchisee and franchise
 * customer-request review forms, which each used to carry their own copy of
 * this fetch-and-filter logic.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Autocomplete, TextField } from "@mui/material";

interface LuxorSubaccountMultiSelectProps {
  value: string[];
  onChange: (names: string[]) => void;
  /** Subaccounts the user being edited already holds. */
  ownNames?: string[];
  /** Re-fetches the option list each time this turns true (e.g. modal open). */
  open?: boolean;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}

export default function LuxorSubaccountMultiSelect({
  value,
  onChange,
  ownNames = [],
  open = true,
  label = "Luxor Subaccounts",
  required = false,
  disabled = false,
  helperText,
}: LuxorSubaccountMultiSelectProps) {
  const [luxorNames, setLuxorNames] = useState<string[]>([]);
  const [assignedNames, setAssignedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [luxorResponse, assignedResponse] = await Promise.all([
          fetch("/api/luxor?endpoint=subaccounts"),
          fetch("/api/user/subaccounts/existing"),
        ]);

        if (!luxorResponse.ok) {
          throw new Error(`Luxor API returned status ${luxorResponse.status}`);
        }
        const luxorData = await luxorResponse.json();
        if (!luxorData.success) {
          throw new Error(luxorData.error || "Failed to fetch subaccounts");
        }
        const subaccounts: unknown = luxorData.data?.subaccounts;
        const names = Array.isArray(subaccounts)
          ? subaccounts
              .map((s: Record<string, unknown>) => String(s.name || ""))
              .filter(Boolean)
          : [];

        let assigned: string[] = [];
        if (assignedResponse.ok) {
          const assignedData = await assignedResponse.json();
          if (assignedData.success && Array.isArray(assignedData.data)) {
            assigned = assignedData.data;
          }
        }

        if (!cancelled) {
          setLuxorNames(names);
          setAssignedNames(assigned);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch subaccounts",
          );
          setLuxorNames([]);
          setAssignedNames([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const ownKey = ownNames.join(",");
  const options = useMemo(() => {
    const own = new Set(ownKey ? ownKey.split(",") : []);
    const available = luxorNames.filter(
      (name) => own.has(name) || !assignedNames.includes(name),
    );
    // Keep already-selected/owned names visible even if Luxor no longer
    // lists them, so they can still be seen and removed.
    return Array.from(new Set([...available, ...own, ...value])).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [luxorNames, assignedNames, ownKey, value]);

  return (
    <>
      <Autocomplete
        multiple
        options={options}
        value={value}
        onChange={(_, names) => onChange(names)}
        disabled={disabled}
        loading={loading}
        filterSelectedOptions
        loadingText="Loading subaccounts..."
        noOptionsText="No unassigned subaccounts"
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            required={required && value.length === 0}
            helperText={helperText}
          />
        )}
      />
      {error && <Alert severity="warning">{error}</Alert>}
    </>
  );
}
