import { randomBytes } from "crypto";

/**
 * One-time password for a newly created account. CSPRNG-based (not
 * Math.random()) since, unlike a self-chosen password, this value is the
 * only thing standing between "just created" and "logged in" until the user
 * changes it - and per H-5, it must never be returned in an API response,
 * only delivered by email.
 */
export function generateTempPassword(): string {
  return randomBytes(6).toString("base64url");
}
