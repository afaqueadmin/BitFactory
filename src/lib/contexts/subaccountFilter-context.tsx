"use client";

/**
 * Session-wide "which Luxor subaccount(s) am I viewing" filter for client
 * pages. Lives above every page in the (auth) route group so the same
 * selection applies everywhere (dashboard, wallet, miners, workers, ...)
 * instead of each page tracking its own. Defaults to "all".
 */

import React, { createContext, useContext, useMemo, useState } from "react";
import { useUser } from "@/lib/hooks/useUser";

interface LuxorSubaccount {
  id: string | null;
  authKey: string;
}

interface SubaccountFilterContextType {
  available: LuxorSubaccount[];
  selected: string[] | "all";
  setSelected: (selected: string[] | "all") => void;
  /** Value to send as `?subaccounts=` on API calls. */
  queryParam: string;
}

const SubaccountFilterContext = createContext<
  SubaccountFilterContextType | undefined
>(undefined);

export function SubaccountFilterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { subaccounts } = useUser();
  const [selected, setSelected] = useState<string[] | "all">("all");

  const queryParam = useMemo(
    () => (selected === "all" ? "all" : selected.join(",")),
    [selected],
  );

  return (
    <SubaccountFilterContext.Provider
      value={{ available: subaccounts, selected, setSelected, queryParam }}
    >
      {children}
    </SubaccountFilterContext.Provider>
  );
}

export function useSubaccountFilter() {
  const context = useContext(SubaccountFilterContext);
  if (!context) {
    throw new Error(
      "useSubaccountFilter must be used within a SubaccountFilterProvider",
    );
  }
  return context;
}
