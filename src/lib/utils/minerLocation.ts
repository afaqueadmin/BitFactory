/**
 * Given a customer's miners, returns the Space location hosting the most
 * of them (mode), or null if none have a location. Used to pre-fill the
 * "Machine Hosting Location" field on invoice creation forms.
 */
export function getMostCommonMinerLocation(
  miners: Array<{ space?: { location: string } | null }>,
): string | null {
  const counts = new Map<string, number>();
  for (const m of miners) {
    if (!m.space?.location) continue;
    counts.set(m.space.location, (counts.get(m.space.location) || 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
