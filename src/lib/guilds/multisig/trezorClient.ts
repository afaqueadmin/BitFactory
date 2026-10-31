/**
 * Browser-only: talking to the approver's Trezor through Trezor Connect
 * (its own signing screens run in a popup on connect.trezor.io). Connect is
 * loaded on first use, so it's never part of a page that doesn't need it.
 *
 * The firmware is checked before every call: a Safe 5 (or any model) must
 * be on 2.12.2 or later, which has the multisig verification and fee-bump
 * fixes our setup depends on.
 */

import {
  applyTrezorSignatures,
  buildTrezorSignRequest,
  pathToAddressN,
  type WalletKeyInfo,
} from "./trezor";

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

/** Key B for the wallet: the Trezor's multisig account key and its origin. */
export async function readTrezorKey(params: {
  network: "mainnet" | "testnet";
  originPath: string;
}): Promise<WalletKeyInfo & { device: string }> {
  const device = await checkDevice();
  const TrezorConnect = await trezor();
  const coin = coinFor(params.network);
  const [account, purpose] = unwrap(
    await TrezorConnect.getPublicKey({
      bundle: [
        { path: params.originPath, coin },
        // Its parent is the master key, so its fingerprint is the master
        // fingerprint the descriptor needs.
        { path: params.originPath.split("/").slice(0, 2).join("/"), coin },
      ],
    }),
  );
  return {
    fingerprint: (purpose.fingerprint >>> 0).toString(16).padStart(8, "0"),
    originPath: params.originPath,
    xpub: account.xpub,
    device,
  };
}

/**
 * Shows a guild address on the Trezor screen, derived by the device from
 * the three keys - to check it against what the app shows.
 */
export async function showAddressOnTrezor(params: {
  network: "mainnet" | "testnet";
  keys: WalletKeyInfo[];
  /** The Trezor's own key. */
  approverFingerprint: string;
  /** Pubkeys in script (sorted) order, with their paths. */
  sortedKeys: { xpub: string; branch: number; index: number }[];
  branch: number;
  index: number;
}): Promise<string> {
  await checkDevice();
  const TrezorConnect = await trezor();
  const mine = params.keys.find(
    (k) => k.fingerprint === params.approverFingerprint,
  );
  if (!mine)
    throw new TrezorClientError("The Trezor's key isn't in the wallet");
  const res = unwrap(
    await TrezorConnect.getAddress({
      path: pathToAddressN(
        `${mine.originPath}/${params.branch}/${params.index}`,
      ),
      coin: coinFor(params.network),
      scriptType: "SPENDWITNESS",
      showOnTrezor: true,
      multisig: {
        pubkeys: params.sortedKeys.map((k) => ({
          node: k.xpub,
          address_n: [k.branch, k.index],
        })),
        signatures: ["", "", ""],
        m: 2,
      },
    }),
  );
  return res.address;
}

/**
 * Signs a prepared payout on the Trezor. The device shows every payment
 * and the fee; the change isn't shown because it comes back to this
 * wallet. Returns the PSBT with the Trezor's signatures added.
 */
export async function signPayoutOnTrezor(params: {
  psbtBase64: string;
  network: "mainnet" | "testnet";
  keys: WalletKeyInfo[];
  approverFingerprint: string;
  prevTxs: Record<string, string>;
}): Promise<{ signedPsbt: string; device: string }> {
  const device = await checkDevice();
  const TrezorConnect = await trezor();
  const request = buildTrezorSignRequest(params);
  const signed = unwrap(
    // Connect's types narrow each script type a little differently from
    // the request we build; the request matches its documented shape.
    await TrezorConnect.signTransaction(
      request as unknown as Parameters<Connect["signTransaction"]>[0],
    ),
  );
  return {
    signedPsbt: applyTrezorSignatures({
      psbtBase64: params.psbtBase64,
      approverFingerprint: params.approverFingerprint,
      signatures: signed.signatures,
    }),
    device,
  };
}
