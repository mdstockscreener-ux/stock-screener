import { formatPrice, formatCurrency } from '@/utils/formatters';
import type { StockRecord } from '@/types';

type ColumnType = 'price' | 'currency' | 'integer' | 'percent' | 'default';

interface ColumnDef {
  key: keyof StockRecord;
  label: string;
  type?: ColumnType;
  align?: 'left' | 'right';
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'date', label: 'Date', align: 'left', type: 'default' },
  { key: 'prevClose', label: 'Prev Close', type: 'price' },
  { key: 'open', label: 'Open Price', type: 'price' },
  { key: 'high', label: 'High Price', type: 'price', className: 'high' },
  { key: 'low', label: 'Low Price', type: 'price', className: 'low' },
  { key: 'last', label: 'Last Price', type: 'price' },
  { key: 'close', label: 'Close Price', type: 'price', className: 'close' },
  { key: 'vwap', label: 'VWAP', type: 'price' },
  { key: 'volume', label: 'Total Traded Quantity', type: 'integer' },
  { key: 'value', label: 'Turnover ₹', type: 'currency' },
  { key: 'trades', label: 'No. of Trades', type: 'integer' },
  { key: 'deliveryQty', label: 'Deliverable Qty', type: 'integer' },
  { key: 'deliveryPct', label: '% Dly Qt to Traded Qty', type: 'percent' },
];

function formatInteger(value: number): string {
  return value.toLocaleString('en-IN');
}

function cellValue(row: StockRecord, col: ColumnDef): string | number {
  const val = row[col.key];
  if (typeof val !== 'number' && typeof val !== 'string') {
    return String(val);
  }

  switch (col.type) {
    case 'price':
      return formatPrice(val as number);
    case 'currency':
      return formatCurrency(row.value);
    case 'integer':
      return formatInteger(val as number);
    case 'percent':
      return `${(val as number).toFixed(2)}%`;
    default:
      return val;
  }
}

interface DataTableProps {
  data: StockRecord[];
}

export default function DataTable({ data }: DataTableProps): JSX.Element {
  const reversed = [...data].reverse();
  const symbol = data[0]?.symbol;

  return (
    <div className="table-section">
      <div className="section-header">
        <h2>
          Historical Data
          {symbol && <span className="table-symbol"> — {symbol}</span>}
        </h2>
        <div className="section-header-right">
          <span className="section-meta">{data.length} records</span>
        </div>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table className="historical-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key as string}
                    className={col.align === 'left' ? 'align-left' : 'align-right'}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reversed.map((row) => (
                <tr key={`${row.symbol}-${row.date}`}>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key as string}
                      className={[
                        col.className,
                        col.align === 'left' ? 'align-left date-cell' : 'align-right num-cell',
                      ].filter(Boolean).join(' ')}
                    >
                      {cellValue(row, col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
