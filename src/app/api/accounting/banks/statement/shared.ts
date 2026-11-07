import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getBanksStatement,
  getUnbankedPayments,
} from "@/lib/accounting/bankStatement";
import { parseStatementRange } from "../statementRange";

/**
 * Consolidated statement, shared by the JSON and export routes.
 * ?entity=<id> limits it to one entity's banks; ?bank=<id>,<id> to those
 * banks (within the entity, when both are given). Neither = every bank,
 * inactive ones included (their past payments still count).
 */
export async function loadConsolidatedStatement(searchParams: URLSearchParams) {
  const parsed = parseStatementRange(searchParams);
  if ("error" in parsed) return parsed;
  const { tz, from, to, range } = parsed;

  const entityId = searchParams.get("entity")?.trim() || null;
  const bankParam = (searchParams.get("bank") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const entity = entityId
    ? await prisma.accountingEntity.findUnique({
        where: { id: entityId },
        select: { id: true, name: true },
      })
    : null;
  if (entityId && !entity) {
    return {
      error: NextResponse.json({ error: "Entity not found" }, { status: 404 }),
    };
  }

  const all = await prisma.accountingBank.findMany({
    where: entityId ? { entityId } : undefined,
    select: {
      id: true,
      name: true,
      isActive: true,
      entity: { select: { id: true, name: true } },
    },
    orderBy: [{ entity: { name: "asc" } }, { name: "asc" }],
  });
  const unknown = bankParam.filter((id) => !all.some((b) => b.id === id));
  if (unknown.length) {
    return {
      error: NextResponse.json(
        {
          error: entityId
            ? "A selected bank isn't a bank of this entity"
            : "Bank not found",
        },
        { status: 400 },
      ),
    };
  }
  const banks = bankParam.length
    ? all.filter((b) => bankParam.includes(b.id))
    : all;

  const [statement, unbanked] = await Promise.all([
    getBanksStatement(
      banks.map((b) => b.id),
      range,
    ),
    getUnbankedPayments(range),
  ]);
  return {
    entity,
    banks,
    allBanks: bankParam.length === 0,
    statement,
    unbanked,
    tz,
    from,
    to,
  };
}
