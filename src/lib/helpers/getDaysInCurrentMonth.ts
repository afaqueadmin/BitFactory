export const getDaysInCurrentMonth = (): number => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based (0 = Jan, 11 = Dec)
  // Day 0 of next month gives the last day of current month
  return new Date(year, month + 1, 0).getDate();
};
