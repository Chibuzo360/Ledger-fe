import React, { createContext, useContext, useState } from "react";

// NEW: a page's date-filter state (filterMode/singleDate/dateRange) lives
// here instead of in the page's own useState, because React unmounts a
// page component entirely when you navigate away and remounts it fresh
// when you come back -- local useState has no memory across that. This
// context sits above the routes (in AppLayout) so it survives navigation,
// while still living only in memory: it resets on a real page refresh,
// which is fine -- the requirement was "don't reset on navigation," not
// "persist forever."
//
// Keyed per page (e.g. "transactions", "expenses") so each page's filter
// is fully independent -- picking a date on Transactions never touches
// what Expenses is showing, per the explicit "each page remembers its own
// separately" decision.
const FilterContext = createContext(null);

export const FilterProvider = ({ children }) => {
  const [filtersByPage, setFiltersByPage] = useState({});

  const getFilter = (pageKey, defaults) => filtersByPage[pageKey] ?? defaults;

  const setFilter = (pageKey, updates) => {
    setFiltersByPage((prev) => ({
      ...prev,
      [pageKey]: { ...(prev[pageKey] ?? {}), ...updates },
    }));
  };

  return (
    <FilterContext.Provider value={{ getFilter, setFilter }}>
      {children}
    </FilterContext.Provider>
  );
};

// Usage: const [dateFilter, setDateFilter] = useFilterState("transactions", { filterMode: "single", singleDate: dayjs(), dateRange: null });
// Read fields off dateFilter (dateFilter.filterMode, etc.); call
// setDateFilter({ filterMode: "range" }) to update just one field -- it
// merges into whatever's already stored for that page, same shape as
// setState's partial-update convention.
export const useFilterState = (pageKey, defaults) => {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilterState must be used within a FilterProvider");
  }
  const value = ctx.getFilter(pageKey, defaults);
  const setValue = (updates) => ctx.setFilter(pageKey, updates);
  return [value, setValue];
};