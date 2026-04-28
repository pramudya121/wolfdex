import type { TooltipProps } from 'recharts';

interface Row { key: string; label: string; value: string | number; color?: string; }

/**
 * Premium glass tooltip for Recharts. Pass `formatters` to customize each
 * dataKey's display. Anything not in formatters falls back to `valueFormatter`.
 */
export default function ChartTooltip({
  active, payload, label,
  labelFormatter,
  valueFormatter = (v) => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(v),
  rows,
}: TooltipProps<number, string> & {
  labelFormatter?: (l: string | number) => string;
  valueFormatter?: (v: number | string, key: string) => string;
  /** If provided, override payload-driven rows. */
  rows?: (p: NonNullable<TooltipProps<number, string>['payload']>) => Row[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const computed: Row[] = rows
    ? rows(payload)
    : payload.map(p => ({
        key: String(p.dataKey),
        label: String(p.name || p.dataKey),
        value: valueFormatter(p.value as number, String(p.dataKey)),
        color: p.color || (p.payload as { fill?: string } | undefined)?.fill,
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
