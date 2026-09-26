/**
 * Which customers can be billed for hosting (ELECTRICITY_CHARGES).
 *
 * Potential customers are prospects, not hosted customers, so they must not
 * appear in hosting pickers or receive hosting invoices. A customer with no
 * segment is treated the same way until someone assigns one. Hardware sales
 * are unaffected - prospects can still buy hardware.
 */

import { Segment } from "@prisma/client";

export const HOSTING_ELIGIBLE_SEGMENTS: Segment[] = Object.values(
  Segment,
).filter((segment) => segment !== Segment.POTENTIAL_CUSTOMER);

/** Spread into a `prisma.user.findMany({ where: {...} })` clause. */
export function hostingEligibleUserFilter() {
  // `in` excludes NULL segments as well as POTENTIAL_CUSTOMER.
  return { segment: { in: HOSTING_ELIGIBLE_SEGMENTS } };
}

export function isHostingEligibleSegment(
  segment: Segment | null | undefined,
): boolean {
  return !!segment && HOSTING_ELIGIBLE_SEGMENTS.includes(segment);
}

export const HOSTING_INELIGIBLE_ERROR =
  "Hosting invoices cannot be created for potential customers or customers without a segment";
