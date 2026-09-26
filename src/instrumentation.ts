/**
 * Runs once when the Next.js server process starts (Node runtime only - the
 * `dns` module doesn't exist on Edge, where proxy.ts runs).
 *
 * Some networks route to Neon's Postgres host over IPv6 but the route is
 * broken or slow, and Node's default DNS result order tries IPv6 first and
 * doesn't fall back to IPv4 quickly enough - every `prisma.*` call then fails
 * with "Can't reach database server at ...:5432", even though the database
 * itself is up and reachable over IPv4. Preferring IPv4 first sidesteps that
 * without touching connection strings or retry logic, and is a no-op (safe)
 * on networks where IPv6 works fine.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  }
}
