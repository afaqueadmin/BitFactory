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
import { buildTrezorSignRequest } from "./trezorRequest";

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

/** The master fingerprint of the wallet open on the device. */
async function masterFingerprint(TrezorConnect: Connect): Promise<string> {
  // No coin: with one, Connect refuses a path shorter than three levels.
  const purpose = unwrap(await TrezorConnect.getPublicKey({ path: "m/84'" }));
  return (purpose.fingerprint >>> 0).toString(16).padStart(8, "0");
}

/** Refuses any device (or passphrase wallet) other than the payout Trezor. */
async function requireFingerprint(TrezorConnect: Connect, expected: string) {
  const fp = await masterFingerprint(TrezorConnect);
  if (fp !== expected) {
    throw new TrezorClientError(
      `This Trezor (${fp}) isn't the payout Trezor (${expected}) - is a passphrase wallet open?`,
    );
  }
  return fp;
}

/**
 * Set up Trezor wallet: reads the guild account's public key, then has the
 * Trezor show the account's receiving address (0/0) on its own screen for
 * the admin to confirm.
 */
export async function readGuildAccount(params: {
  network: "mainnet" | "testnet";
  coinType: number;
  account: number;
  fingerprint: string;
}): Promise<{
  fingerprint: string;
  label: string;
  xpub: string;
  shownAddress: string;
}> {
  const label = await checkDevice();
  const TrezorConnect = await trezor();
  const fingerprint = await requireFingerprint(
    TrezorConnect,
    params.fingerprint,
  );
  const coin = coinFor(params.network);
  const path = `m/84'/${params.coinType}'/${params.account}'`;
  const key = unwrap(await TrezorConnect.getPublicKey({ path, coin }));
  const shown = unwrap(
    await TrezorConnect.getAddress({
      path: `${path}/0/0`,
      coin,
      showOnTrezor: true,
    }),
  );
  return { fingerprint, label, xpub: key.xpub, shownAddress: shown.address };
}

/** Shows a guild's receiving address on the Trezor screen again. */
export async function showGuildAddress(params: {
  network: "mainnet" | "testnet";
  coinType: number;
  account: number;
  fingerprint: string;
}): Promise<string> {
  await checkDevice();
  const TrezorConnect = await trezor();
  await requireFingerprint(TrezorConnect, params.fingerprint);
  const shown = unwrap(
    await TrezorConnect.getAddress({
      path: `m/84'/${params.coinType}'/${params.account}'/0/0`,
      coin: coinFor(params.network),
      showOnTrezor: true,
    }),
  );
  return shown.address;
}

/**
 * Wallet seals: the Trezor shows each message (guild, member, address) and
 * signs it with the seal key once the admin confirms. One confirmation per
 * wallet. Refused if the signing key isn't the payout Trezor's seal key.
 */
export async function signSeals(params: {
  network: "mainnet" | "testnet";
  sealPath: string;
  sealAddress: string;
  fingerprint: string;
  messages: string[];
  onProgress?: (done: number) => void;
}): Promise<string[]> {
  await checkDevice();
  const TrezorConnect = await trezor();
  await requireFingerprint(TrezorConnect, params.fingerprint);
  const signatures: string[] = [];
  for (const message of params.messages) {
    const signed = unwrap(
      await TrezorConnect.signMessage({
        path: params.sealPath,
        coin: coinFor(params.network),
        message,
      }),
    );
    if (signed.address !== params.sealAddress) {
      throw new TrezorClientError(
        `The Trezor signed with ${signed.address}, not the seal key ${params.sealAddress}`,
      );
    }
    signatures.push(signed.signature);
    params.onProgress?.(signatures.length);
  }
  return signatures;
}

/**
 * Signs a prepared payout on the Trezor. The device shows every payment and
 * the fee; the change isn't shown because it comes back to the same
 * account. Returns one signature per input - the server checks them and
 * broadcasts.
 */
export async function signPayoutOnTrezor(params: {
  psbtBase64: string;
  network: "mainnet" | "testnet";
  fingerprint: string;
  prevTxs: Record<string, string>;
}): Promise<{ signatures: string[]; fingerprint: string; device: string }> {
  const device = await checkDevice();
  const TrezorConnect = await trezor();
  const fingerprint = await requireFingerprint(
    TrezorConnect,
    params.fingerprint,
  );
  const request = buildTrezorSignRequest(params);
  const signed = unwrap(
    // Connect's types narrow each script type a little differently from
    // the request we build; the request matches its documented shape.
    await TrezorConnect.signTransaction(
      request as unknown as Parameters<Connect["signTransaction"]>[0],
    ),
  );
  return { signatures: signed.signatures, fingerprint, device };
}
