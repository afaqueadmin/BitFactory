/**
 * Keeps local runs from emailing real people. Local databases are often a
 * copy of production (a Neon branch), so every address in them is real.
 *
 * Outside production every to/cc/bcc is replaced with EMAIL_REDIRECT_ALL_TO
 * and the original recipients are put in the subject. Without that variable
 * nothing is sent at all. Production and tests (which mock the transport)
 * pass through unchanged.
 */
import type { SendMailOptions, SentMessageInfo } from "nodemailer";

type Recipients = SendMailOptions["to"];

interface MailSender {
  sendMail(options: SendMailOptions): Promise<SentMessageInfo>;
}

function addressList(value: Recipients): string[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) =>
      typeof item === "string" ? item.split(",") : [item.address],
    )
    .map((address) => address.trim())
    .filter(Boolean);
}

/** Pure so it can be tested without touching process.env. */
export function guardMailOptions(
  options: SendMailOptions,
  env: { nodeEnv?: string; redirectTo?: string },
): { send: false } | { send: true; options: SendMailOptions } {
  if (env.nodeEnv === "production" || env.nodeEnv === "test") {
    return { send: true, options };
  }

  const redirectTo = env.redirectTo?.trim();
  if (!redirectTo) return { send: false };

  const parts = [addressList(options.to).join(", ")];
  const cc = addressList(options.cc);
  const bcc = addressList(options.bcc);
  if (cc.length) parts.push(`cc ${cc.join(", ")}`);
  if (bcc.length) parts.push(`bcc ${bcc.join(", ")}`);

  return {
    send: true,
    options: {
      ...options,
      to: redirectTo,
      cc: undefined,
      bcc: undefined,
      subject: `[TEST → ${parts.join("; ")}] ${options.subject ?? ""}`,
    },
  };
}

export function withEmailSafety<T extends MailSender>(transporter: T): T {
  const send = transporter.sendMail.bind(transporter);
  transporter.sendMail = async (options: SendMailOptions) => {
    const guarded = guardMailOptions(options, {
      nodeEnv: process.env.NODE_ENV,
      redirectTo: process.env.EMAIL_REDIRECT_ALL_TO,
    });
    if (!guarded.send) {
      console.warn(
        `[emailSafety] Not sent (EMAIL_REDIRECT_ALL_TO unset outside production): "${options.subject}" to ${addressList(options.to).join(", ")}`,
      );
      return { messageId: "not-sent-local", accepted: [], rejected: [] };
    }
    return send(guarded.options);
  };
  return transporter;
}
