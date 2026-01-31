export const formatValue = (
  value: number | string,
  type: "currency" | "BTC" | "percentage" | "number" = "number",
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
  if (type === "BTC") {
    return (
      "₿ " +
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
        ...options,
      }).format(value)
    );
  }
  if (type === "percentage") {
    return new Intl.NumberFormat("en-US", {
      style: "percent",
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
