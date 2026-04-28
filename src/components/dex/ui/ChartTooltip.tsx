interface PayloadEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

interface Row { key: string; label: string; value: string | number; color?: string; }

interface ChartTooltipProps {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string | number;
  labelFormatter?: (l: string | number) => string;
  valueFormatter?: (v: number | string, key: string) => string;
  rows?: (p: PayloadEntry[]) => Row[];
}

/**
 * Premium glass tooltip for Recharts. Pass `formatters` to customize each
 * dataKey's display. Anything not in formatters falls back to `valueFormatter`.
 */
export default function ChartTooltip({
  active, payload, label, labelFormatter,
  valueFormatter = (v) => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(v),
  rows,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const computed: Row[] = rows
    ? rows(payload)
    : payload.map((p) => ({
        key: String(p.dataKey ?? p.name ?? Math.random()),
        label: String(p.name ?? p.dataKey ?? ''),
        value: valueFormatter(p.value as number, String(p.dataKey ?? '')),
        color: p.color || (p.payload?.fill as string | undefined),
      }));

  return (
    <div className="wolf-tooltip" role="tooltip">
      {label !== undefined && (
        <div className="wolf-tooltip-label">{labelFormatter ? labelFormatter(label) : String(label)}</div>
      )}
      {computed.map(r => (
        <div className="wolf-tooltip-row" key={r.key}>
          <span className="k flex items-center gap-1.5">
            {r.color && <span className="dot" style={{ background: r.color, color: r.color }} />}
            {r.label}
          </span>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
