/**
 * The bits of mempool.space's REST API the payout wallet uses: coins at an
 * address, a transaction's confirmations, fee estimates and broadcasting.
 * https://mempool.space/docs/api/rest
 */

import type { MultisigNetwork } from "./network";

export class MempoolError extends Error {}

const TIMEOUT_MS = 15_000;

async function call(
  network: MultisigNetwork,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${network.apiBase}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new MempoolError(
      `mempool.space didn't answer (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new MempoolError(
      `mempool.space ${res.status}: ${text || res.statusText}`,
    );
  }
  return res;
}

interface TxStatus {
  confirmed: boolean;
  block_height?: number;
  block_time?: number;
}

export interface AddressCoin {
  txid: string;
  vout: number;
  sats: number;
  confirmed: boolean;
  blockHeight: number | null;
  blockTime: Date | null;
}

/** Unspent outputs at an address, confirmed or not. */
export async function addressCoins(
  network: MultisigNetwork,
  address: string,
): Promise<AddressCoin[]> {
  const rows = (await (
    await call(network, `/address/${address}/utxo`)
  ).json()) as {
    txid: string;
    vout: number;
    value: number;
    status: TxStatus;
  }[];
  return rows.map((r) => ({
    txid: r.txid,
    vout: r.vout,
    sats: r.value,
    confirmed: r.status.confirmed,
    blockHeight: r.status.block_height ?? null,
    blockTime: r.status.block_time
      ? new Date(r.status.block_time * 1000)
      : null,
  }));
}

export async function tipHeight(network: MultisigNetwork): Promise<number> {
  const text = await (await call(network, "/blocks/tip/height")).text();
  const height = Number(text);
  if (!Number.isInteger(height)) throw new MempoolError("Bad tip height");
  return height;
}

/** 0 while unconfirmed, null if mempool.space doesn't know the transaction. */
export async function txConfirmations(
  network: MultisigNetwork,
  txid: string,
): Promise<number | null> {
  let status: TxStatus;
  try {
    status = (await (
      await call(network, `/tx/${txid}/status`)
    ).json()) as TxStatus;
  } catch (error) {
    if (error instanceof MempoolError && / 404:/.test(error.message))
      return null;
    throw error;
  }
  if (!status.confirmed || !status.block_height) return 0;
  return (await tipHeight(network)) - status.block_height + 1;
}

/** mempool.space's "half hour" fee estimate, sat/vB. */
export async function halfHourFeeRate(
  network: MultisigNetwork,
): Promise<number> {
  const fees = (await (await call(network, "/v1/fees/recommended")).json()) as {
    halfHourFee?: number;
  };
  if (!fees.halfHourFee || !(fees.halfHourFee > 0)) {
    throw new MempoolError("No fee estimate");
  }
  return fees.halfHourFee;
}

/** Broadcasts a raw transaction; returns its txid. */
export async function broadcast(
  network: MultisigNetwork,
  hex: string,
): Promise<string> {
  const res = await call(network, "/tx", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: hex,
  });
  return (await res.text()).trim();
}

/** A transaction's raw hex (the Trezor needs each input's previous one). */
export async function rawTransaction(
  network: MultisigNetwork,
  txid: string,
): Promise<string> {
  return (await (await call(network, `/tx/${txid}/hex`)).text()).trim();
}
