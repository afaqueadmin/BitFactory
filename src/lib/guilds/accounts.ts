/**
 * Guild accounts are created only by admins, from the Guilds pages - never
 * through the generic Create User form. Each one is made the same way
 * /api/user/create makes a client: a temporary password that only ever goes
 * out by email (H-5), sent before the account exists.
 */

import { hash } from "bcrypt";
import { Segment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";
import {
  canonicalEmail,
  isEmailTaken,
  isEmailUniqueViolation,
} from "@/lib/auth/emailIdentity";
import { generateTempPassword } from "@/lib/helpers/generateTempPassword";
import { getOrCreatePaybackConfig } from "@/lib/paybackConfigHelpers";
import { WALLET_NETWORKS, defaultWalletNetwork } from "./walletNetworks";

export interface NewGuildPerson {
  name: string;
  email: string;
  phoneNumber?: string | null;
  percent: number;
  walletAddress?: string | null;
}

export class GuildInputError extends Error {}

/**
 * A valid address on `network` (a checksum-valid mainnet Bitcoin address
 * for BTC), trimmed; null when empty.
 */
export function parseWalletAddress(
  value: unknown,
  network: string = defaultWalletNetwork(),
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new GuildInputError("Wallet address must be text");
  }
  const address = value.trim();
  if (!address) return null;
  const chain = WALLET_NETWORKS[network];
  if (!chain) throw new GuildInputError(`Unsupported network ${network}`);
  const parsed = chain.parse(address);
  if (!parsed) {
    throw new GuildInputError(
      `"${address}" doesn't look like a valid ${chain.label} address`,
    );
  }
  return parsed;
}

/** Validates and normalises one person from a request body. */
export function parseNewGuildPerson(value: unknown, label: string) {
  const raw = (value ?? {}) as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? canonicalEmail(raw.email) : "";
  const percent = Number(raw.percent);
  if (!name) throw new GuildInputError(`${label}: name is required`);
  if (!email || !email.includes("@")) {
    throw new GuildInputError(`${label}: a valid email is required`);
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new GuildInputError(`${label}: percent must be between 0 and 100`);
  }
  return {
    name,
    email,
    phoneNumber:
      typeof raw.phoneNumber === "string" && raw.phoneNumber.trim()
        ? raw.phoneNumber.trim()
        : null,
    percent,
    walletAddress: parseWalletAddress(raw.walletAddress),
  } satisfies NewGuildPerson;
}

/** Rejects emails already in use, or repeated within the same request. */
export async function assertEmailsAvailable(emails: string[]) {
  const seen = new Set<string>();
  for (const email of emails) {
    if (seen.has(email)) {
      throw new GuildInputError(`${email} is listed more than once`);
    }
    seen.add(email);
    if (await isEmailTaken(email)) {
      throw new GuildInputError(`${email} is already in use`);
    }
  }
}

/**
 * Rejects emails that a Guildmaster's add-member request still in review
 * would create. Admins adding people directly must reject that request
 * first, or its approval would fail on a taken email. Not for approving
 * the request itself - it would find its own row.
 */
export async function assertNoOpenAddRequests(emails: string[]) {
  const open = await prisma.guildMemberChangeRequest.findFirst({
    where: {
      action: "ADD",
      newEmail: { in: emails },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { newEmail: true, guild: { select: { name: true } } },
  });
  if (open) {
    throw new GuildInputError(
      `${open.newEmail} is in a request to join ${open.guild.name} that's still in review - reject that request in Guild Requests first`,
    );
  }
}

/**
 * Creates one guild account. The welcome email goes out first; if it
 * fails, nothing is created. A Guildmaster gets the GUILDMASTER segment
 * (billing and payback analysis read it); a Guildmember has none.
 */
export async function createGuildAccount(params: {
  person: NewGuildPerson;
  role: "GUILDMASTER" | "GUILDMEMBER";
  segment: Segment | null;
}) {
  const { person, role, segment } = params;
  const tempPassword = generateTempPassword();
  const hashedPassword = await hash(tempPassword, 12);

  const emailResult = await sendWelcomeEmail(person.email, tempPassword);
  if (!emailResult.success) {
    throw new GuildInputError(
      `Couldn't send the welcome email to ${person.email}, so that account wasn't created. Check the address and try again.`,
    );
  }

  const { defaultInvoicedAmount } = await getOrCreatePaybackConfig("CLIENT");
  try {
    return await prisma.user.create({
      data: {
        name: person.name,
        email: person.email,
        phoneNumber: person.phoneNumber ?? null,
        password: hashedPassword,
        role,
        invoicedAmount: defaultInvoicedAmount,
        segment,
        logins: {
          create: {
            email: person.email,
            password: hashedPassword,
            isPrimary: true,
          },
        },
      },
      select: { id: true, name: true, email: true },
    });
  } catch (error) {
    if (isEmailUniqueViolation(error)) {
      throw new GuildInputError(`${person.email} is already in use`);
    }
    throw error;
  }
}

/**
 * Removes accounts created moments ago by a guild request that then failed
 * part-way. They hold nothing but their sign-in yet.
 */
export async function deleteFreshAccounts(userIds: string[]) {
  if (userIds.length === 0) return;
  await prisma.userLogin.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
