/**
 * Shared DB-row → JSON mapping for the three "SecurityRow"-shaped tables
 * (most_active_securities, most_active_sme, most_active_etf) — all three
 * read routes need the exact same column-to-camelCase conversion.
 */
function toNumOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export function mapSecurityDbRow(row: Record<string, unknown>) {
  return {
    symbol: row.symbol,
    identifier: row.identifier,
    open: toNumOrNull(row.open),
    dayHigh: toNumOrNull(row.day_high),
    dayLow: toNumOrNull(row.day_low),
    previousClose: toNumOrNull(row.previous_close),
    lastPrice: toNumOrNull(row.last_price),
    pChange: toNumOrNull(row.p_change),
    totalTradedVolume: toNumOrNull(row.total_traded_volume),
    totalTradedValue: toNumOrNull(row.total_traded_value),
    quantityTraded: toNumOrNull(row.quantity_traded),
    exDate: row.ex_date,
    purpose: row.purpose,
    yearHigh: toNumOrNull(row.year_high),
    yearLow: toNumOrNull(row.year_low),
    change: toNumOrNull(row.change),
    closePrice: toNumOrNull(row.close_price),
    lastUpdateTime: row.last_update_time,
    nav: toNumOrNull(row.nav),
  };
}
