/**
 * Customer Sorting Utility
 *
 * Provides fully typed sorting functionality for customer data.
 * Supports sorting by all customer fields with ascending/descending direction.
 */

/**
 * Supported sort field keys for customers
 */
export type CustomerSortField =
  | "name"
  | "email"
  | "role"
  | "luxorSubaccount"
  | "miners"
  | "status"
  | "joinDate";

/**
 * Sort direction type
 */
export type SortDirection = "asc" | "desc";

/**
 * Sort configuration interface
 */
export interface SortConfig {
  field: CustomerSortField;
  direction: SortDirection;
}

/**
 * Customer object from API
 */
interface Customer {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string;
  country: string;
  phoneNumber: string;
  companyName: string;
  luxorSubaccountName: string;
  streetAddress: string;
  twoFactorEnabled: boolean;
  joinDate: string;
  miners: number;
  status: "active" | "inactive";
}

/**
 * Extract sortable value from a customer by field name
 */
function getSortValue(
  customer: Customer,
  field: CustomerSortField,
): string | number {
  switch (field) {
    case "name":
      return customer.name.toLowerCase();

    case "email":
      return customer.email.toLowerCase();

    case "role":
      return customer.role.toLowerCase();

    case "luxorSubaccount":
      return (customer.luxorSubaccountName || "").toLowerCase();

    case "miners":
      return Number(customer.miners || 0);

    case "status":
      return customer.status.toLowerCase();

    case "joinDate":
      return new Date(customer.joinDate).getTime();

    default:
      return "";
  }
}

/**
 * Compare two values for sorting
 */
function compareValues(a: string | number, b: string | number): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Sort an array of customers by the specified field and direction
 *
 * @param customers - Array of customers to sort
 * @param config - Sort configuration (field and direction)
 * @returns Sorted array of customers
 *
 * @example
 * const sortedCustomers = sortCustomers(customers, { field: "name", direction: "asc" });
 */
export function sortCustomers(
  customers: Customer[],
  config: SortConfig,
): Customer[] {
  const sorted = [...customers];

  sorted.sort((a, b) => {
    const aValue = getSortValue(a, config.field);
    const bValue = getSortValue(b, config.field);
    const comparison = compareValues(aValue, bValue);

    return config.direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Toggle sort direction
 *
 * @param current - Current sort direction
 * @returns Opposite sort direction
 *
 * @example
 * const newDirection = toggleSortDirection("asc"); // Returns "desc"
 */
export function toggleSortDirection(current: SortDirection): SortDirection {
  return current === "asc" ? "desc" : "asc";
}

/**
 * Get display label for a sort field
 *
 * @param field - Sort field
 * @returns User-friendly display label
 *
 * @example
 * const label = getSortFieldLabel("luxorSubaccount"); // Returns "Luxor Subaccount"
 */
export function getSortFieldLabel(field: CustomerSortField): string {
  const labels: Record<CustomerSortField, string> = {
    name: "Customer",
    email: "Email",
    role: "Role",
    luxorSubaccount: "Luxor Subaccount",
    miners: "Miners",
    status: "Status",
    joinDate: "Join Date",
  };

  return labels[field];
}

/**
 * Get all available sort fields
 *
 * @returns Array of all sortable fields
 */
export function getAllSortFields(): CustomerSortField[] {
  return [
    "name",
    "email",
    "role",
    "luxorSubaccount",
    "miners",
    "status",
    "joinDate",
  ];
}
