/**
 * O3: what of a pool credential (PoolAuth.authKey) may reach the browser.
 *
 * For Luxor the authKey is only a subaccount name (reading Luxor needs our
 * server-side workspace key), so it is shown as is. For every other pool
 * (Braiins today) it is the client's API token: a password for their pool
 * account. It never leaves the server; screens get the last 4 characters as
 * a hint so staff can tell which token is saved.
 */
export function maskAuthKey(
  poolName: string,
  authKey: string,
): { authKey: string | null; authKeyHint: string | null } {
  if (poolName === "Luxor") return { authKey, authKeyHint: null };
  return {
    authKey: null,
    authKeyHint: authKey.length > 4 ? authKey.slice(-4) : null,
  };
}

/** How a credential is named in lists: the Luxor name, or "Braiins …ab12". */
export function credentialLabel(poolName: string, authKey: string): string {
  const { authKey: shown, authKeyHint } = maskAuthKey(poolName, authKey);
  return shown ?? (authKeyHint ? `${poolName} …${authKeyHint}` : poolName);
}

/**
 * The name copied onto a group membership row (and into its audit text).
 * Only a Luxor name may be copied; a token never is.
 */
export function groupSubaccountName(
  poolName: string,
  authKey: string,
): string | null {
  return poolName === "Luxor" ? authKey : null;
}
