import { describe, expect, it } from "vitest";
import {
  EXPENSE_DEFAULT_SORT,
  ExpenseListRow,
  expenseListQuery,
  expenseListRows,
  headListQuery,
  headListRows,
  HeadListRow,
  parseExpenseListQuery,
  parseHeadListQuery,
} from "../expenseLists";

const exp = (
  id: string,
  date: string,
  head: string,
  due: string,
  paid: string,
  status: ExpenseListRow["status"],
): ExpenseListRow & { id: string } => ({
  id,
  // e1 was recorded first, e3 last.
  entryNumber: Number(id.slice(1)),
  date,
  head: { id: `h-${head}`, name: head },
  narration: null,
  amountDueUsd: due,
  paidUsd: paid,
  balanceUsd: (Number(due) - Number(paid)).toFixed(2),
  status,
});

// As the API returns them: newest first.
const rows = [
  exp("e3", "2026-11-12", "Fuel", "50.00", "0.00", "PENDING"),
  exp("e2", "2026-11-05", "Salary", "2000.00", "2000.00", "PAID"),
  exp("e1", "2026-10-20", "Fuel", "300.00", "100.00", "PARTIAL"),
];
const all = { headId: "", status: "" as const, from: "", to: "" };
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("expenseListRows", () => {
  it("default keeps newest first", () => {
    expect(ids(expenseListRows(rows, all, EXPENSE_DEFAULT_SORT))).toEqual([
      "e3",
      "e2",
      "e1",
    ]);
  });

  it("filters by head, status and an inclusive date range", () => {
    const sort = EXPENSE_DEFAULT_SORT;
    expect(
      ids(expenseListRows(rows, { ...all, headId: "h-Fuel" }, sort)),
    ).toEqual(["e3", "e1"]);
    expect(
      ids(expenseListRows(rows, { ...all, status: "PAID" }, sort)),
    ).toEqual(["e2"]);
    expect(
      ids(
        expenseListRows(
          rows,
          { ...all, from: "2026-11-05", to: "2026-11-12" },
          sort,
        ),
      ),
    ).toEqual(["e3", "e2"]);
  });

  it("sorts by entry number", () => {
    expect(
      ids(expenseListRows(rows, all, { key: "entry", dir: "asc" })),
    ).toEqual(["e1", "e2", "e3"]);
  });

  it("sorts amounts as numbers", () => {
    expect(
      ids(expenseListRows(rows, all, { key: "due", dir: "desc" })),
    ).toEqual(["e2", "e1", "e3"]);
  });
});

describe("export query round-trip", () => {
  it("the export reads back exactly the page's filter and sort", () => {
    const filter = {
      headId: "h-Fuel",
      status: "PARTIAL" as const,
      from: "2026-10-01",
      to: "2026-11-30",
    };
    const sort = { key: "balance" as const, dir: "asc" as const };
    expect(parseExpenseListQuery(expenseListQuery(filter, sort))).toEqual({
      filter,
      sort,
    });
  });

  it("bad or missing values fall back to no filter / the default sort", () => {
    const q = new URLSearchParams(
      "status=NOPE&from=yesterday&sort=drop&dir=up",
    );
    expect(parseExpenseListQuery(q)).toEqual({
      filter: all,
      sort: EXPENSE_DEFAULT_SORT,
    });
  });
});

describe("headListRows", () => {
  const head = (
    id: string,
    name: string,
    isActive: boolean,
    due: string,
  ): HeadListRow & { id: string } => ({
    id,
    name,
    isActive,
    _count: { expenses: 1 },
    amountDueUsd: due,
    amountPaidUsd: "0.00",
  });
  const heads = [
    head("a", "Fuel", true, "350.00"),
    head("b", "Old", false, "10.00"),
    head("c", "Salary", true, "2000.00"),
  ];

  it("filters by status and sorts", () => {
    const sort = { key: "due" as const, dir: "desc" as const };
    expect(ids(headListRows(heads, "active", sort))).toEqual(["c", "a"]);
    expect(ids(headListRows(heads, "inactive", sort))).toEqual(["b"]);
    expect(ids(headListRows(heads, "", sort))).toEqual(["c", "a", "b"]);
  });

  it("round-trips through the export query", () => {
    const sort = { key: "paid" as const, dir: "desc" as const };
    expect(parseHeadListQuery(headListQuery("inactive", sort))).toEqual({
      status: "inactive",
      sort,
    });
  });
});
