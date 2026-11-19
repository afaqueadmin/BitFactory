import { describe, expect, it } from "vitest";
import {
  parseTransferListQuery,
  TRANSFER_DEFAULT_SORT,
  transferListQuery,
  transferListRows,
  TransferListRow,
} from "../transferLists";

const side = (entityId: string, bankId: string, amount: string) => ({
  entityId,
  bankId,
  bankName: bankId.toUpperCase(),
  amount,
});

const tr = (
  id: string,
  date: string,
  from: ReturnType<typeof side>,
  to: ReturnType<typeof side>,
  usd: string,
): TransferListRow & { id: string } => ({
  id,
  date,
  from,
  to,
  amountUsd: usd,
});

// As the API returns them: newest first.
const rows = [
  tr(
    "t3",
    "2026-11-12",
    side("e1", "b1", "100.00"),
    side("e2", "b3", "100.00"),
    "100.00",
  ),
  tr(
    "t2",
    "2026-11-05",
    side("e2", "b3", "50.00"),
    side("e2", "b4", "13900.00"),
    "50.00",
  ),
  tr(
    "t1",
    "2026-10-20",
    side("e1", "b2", "2000.00"),
    side("e1", "b1", "2000.00"),
    "2000.00",
  ),
];
const all = { entityId: "", bankId: "", from: "", to: "" };
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("transferListRows", () => {
  it("default keeps newest first", () => {
    expect(ids(transferListRows(rows, all, TRANSFER_DEFAULT_SORT))).toEqual([
      "t3",
      "t2",
      "t1",
    ]);
  });

  it("entity and bank match either side", () => {
    const sort = TRANSFER_DEFAULT_SORT;
    expect(
      ids(transferListRows(rows, { ...all, entityId: "e2" }, sort)),
    ).toEqual(["t3", "t2"]);
    expect(ids(transferListRows(rows, { ...all, bankId: "b1" }, sort))).toEqual(
      ["t3", "t1"],
    );
  });

  it("filters by an inclusive date range", () => {
    expect(
      ids(
        transferListRows(
          rows,
          { ...all, from: "2026-11-05", to: "2026-11-12" },
          TRANSFER_DEFAULT_SORT,
        ),
      ),
    ).toEqual(["t3", "t2"]);
  });

  it("sorts sent by amount and value by USD", () => {
    expect(
      ids(transferListRows(rows, all, { key: "received", dir: "desc" })),
    ).toEqual(["t2", "t1", "t3"]);
    expect(
      ids(transferListRows(rows, all, { key: "value", dir: "asc" })),
    ).toEqual(["t2", "t3", "t1"]);
  });
});

describe("transferListQuery / parseTransferListQuery", () => {
  it("round-trips the filter and sort", () => {
    const filter = {
      entityId: "e1",
      bankId: "b2",
      from: "2026-10-01",
      to: "2026-10-31",
    };
    const sort = { key: "value" as const, dir: "asc" as const };
    expect(parseTransferListQuery(transferListQuery(filter, sort))).toEqual({
      filter,
      sort,
    });
  });

  it("drops bad dates and unknown sort keys", () => {
    const parsed = parseTransferListQuery(
      new URLSearchParams("from=11/05/2026&sort=nope"),
    );
    expect(parsed.filter.from).toBe("");
    expect(parsed.sort).toEqual(TRANSFER_DEFAULT_SORT);
  });
});
