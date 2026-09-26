"use client";

import { Autocomplete, TextField } from "@mui/material";

interface LocationsMultiSelectProps {
  value: string[];
  onChange: (locations: string[]) => void;
  options: string[];
  disabled?: boolean;
  label?: string;
  helperText?: string;
}

// Multi-select for "Machine Hosting Location": auto-added locations can be
// deselected, more can be picked from the sitewide Space location list, or
// typed in freehand (freeSolo) for a one-off location not in that list.
export function LocationsMultiSelect({
  value,
  onChange,
  options,
  disabled = false,
  label = "Machine Hosting Location(s)",
  helperText = "Shown on the invoice PDF as the Machine Hosting Location. Auto-added from the customer's miners; deselect, add more, or type a custom one.",
}: LocationsMultiSelectProps) {
  return (
    <Autocomplete
      multiple
      freeSolo
      options={options}
      value={value}
      onChange={(_e, newValue) => onChange(newValue)}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} label={label} helperText={helperText} />
      )}
    />
  );
}
