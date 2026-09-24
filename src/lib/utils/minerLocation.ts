/**
 * Given a customer's miners, returns every distinct Space location hosting
 * at least one of them, in first-seen order. Used to pre-fill the
 * "Machine Hosting Location" field on invoice creation forms.
 */
export function getMinerLocations(
  miners: Array<{ space?: { location: string } | null }>,
): string[] {
  const seen = new Set<string>();
  for (const m of miners) {
    if (m.space?.location) seen.add(m.space.location);
  }
  return [...seen];
}
