/**
 * Browser-only: talking to the payout Trezor through Trezor Connect (its own
 * screens run in a popup on connect.trezor.io). Connect is loaded on first
 * use, so it's never part of a page that doesn't need it.
 *
 * The firmware is checked before every call: 2.12.2 or later, which has the
 * Bitcoin signing fixes our payouts rely on (external inputs, new outputs in
 * replacement transactions).
 */

import type { ReadTrezor } from "./device";

export const MIN_FIRMWARE = [2, 12, 2] as const;

export class TrezorClientError extends Error {}

type Connect = (typeof import("@trezor/connect-web"))["default"];
let connect: Promise<Connect> | null = null;

function trezor(): Promise<Connect> {
  connect ??= (async () => {
    const TrezorConnect = (await import("@trezor/connect-web")).default;
    await TrezorConnect.init({
      lazyLoad: true,
      manifest: {
        appName: "BitFactory guild payouts",
        appUrl: window.location.origin,
        email:
          process.env.NEXT_PUBLIC_TREZOR_MANIFEST_EMAIL ||
          `admin@${window.location.hostname}`,
      },
    });
    return TrezorConnect;
  })().catch((error) => {
    connect = null;
    throw error;
  });
  return connect;
}

function unwrap<R extends { success: boolean; payload: unknown }>(
  res: R,
): Extract<R, { success: true }>["payload"] {
  if (!res.success) {
    throw new TrezorClientError(
      (res.payload as { error?: string }).error ?? "The Trezor refused",
    );
  }
  return res.payload as Extract<R, { success: true }>["payload"];
}

const coinFor = (network: "mainnet" | "testnet") =>
  network === "mainnet" ? "btc" : "test";

/** "Trezor Safe 5, firmware 2.12.3" - refused if the firmware is too old. */
export async function checkDevice(): Promise<string> {
  const TrezorConnect = await trezor();
  const f = unwrap(await TrezorConnect.getFeatures());
  const version = [f.major_version, f.minor_version, f.patch_version];
  const tooOld =
    version[0] < MIN_FIRMWARE[0] ||
    (version[0] === MIN_FIRMWARE[0] &&
      (version[1] < MIN_FIRMWARE[1] ||
        (version[1] === MIN_FIRMWARE[1] && version[2] < MIN_FIRMWARE[2])));
  const label = `Trezor ${f.model === "T3T1" ? "Safe 5" : f.model}, firmware ${version.join(".")}`;
  if (tooOld) {
    throw new TrezorClientError(
      `${label} is too old: update to ${MIN_FIRMWARE.join(".")} or later in Trezor Suite first`,
    );
  }
  return label;
}

/**
 * Reads, in one Trezor session, what Connect payout Trezor needs: the
 * master fingerprint, the Native SegWit account keys 0 … count-1 and the
 * seal account's (100') key. Public keys only - nothing is signed.
 */
export async function readPayoutTrezor(params: {
  network: "mainnet" | "testnet";
  coinType: number;
  count: number;
}): Promise<ReadTrezor> {
  const label = await checkDevice();
  const TrezorConnect = await trezor();
  const coin = coinFor(params.network);
  const base = `m/84'/${params.coinType}'`;
  const keys = unwrap(
    await TrezorConnect.getPublicKey({
      bundle: [
        // Its parent is the master key, so its fingerprint is the master
        // fingerprint. No coin: with one, Connect refuses any path shorter
        // than three levels.
        { path: "m/84'" },
        { path: `${base}/100'`, coin },
        ...Array.from({ length: params.count }, (_, i) => ({
          path: `${base}/${i}'`,
          coin,
        })),
      ],
    }),
  );
  const [purpose, seal, ...accounts] = keys;
  return {
    fingerprint: (purpose.fingerprint >>> 0).toString(16).padStart(8, "0"),
    label,
    network: params.network,
    sealXpub: seal.xpub,
    accounts: accounts.map((a, i) => ({ account: i, xpub: a.xpub })),
  };
}
