export const formatValue = (
  value: number | string,
  type: "currency" | "number" = "number",
  options: Intl.NumberFormatOptions = {},
): string => {
  // If value is a string (like "N/A"), return as-is
  if (typeof value === "string") {
    return value;
  }

  if (type === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(value);
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
};
