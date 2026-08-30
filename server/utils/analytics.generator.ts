interface MonthData {
  month: string;
  count: number;
}

export async function generateLast12MothsData(
  countFn: (startDate: Date, endDate: Date) => Promise<number>
): Promise<{ last12Months: MonthData[] }> {
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 1);

  // Build every window first, then fire all twelve counts in parallel —
  // sequential awaits made each analytics request pay 12 round-trips of
  // latency instead of 1.
  const windows = [];
  for (let i = 11; i >= 0; i--) {
    const endDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate() - i * 28
    );
    const startDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate() - 28
    );

    const monthYear = endDate.toLocaleString("default", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    windows.push({ startDate, endDate, monthYear });
  }

  const counts = await Promise.all(
    windows.map((w) => countFn(w.startDate, w.endDate))
  );

  return {
    last12Months: windows.map((w, i) => ({
      month: w.monthYear,
      count: counts[i],
    })),
  };
}
