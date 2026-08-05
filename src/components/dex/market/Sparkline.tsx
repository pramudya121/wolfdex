/**
 * Sparkline — dependency-free SVG micro-chart for token price trends.
 * Renders a smooth gradient-filled line that turns green/red with the trend.
 */
export default function Sparkline({
  data,
  positive,
  width = 96,
  height = 32,
  className = '',
}: {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
  className?: string;
}) {
  const pts = data.filter(n => Number.isFinite(n) && n > 0);
  if (pts.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden="true">
        <line
          x1="0" y1={height / 2} x2={width} y2={height / 2}
          stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || max || 1;
  const stepX = width / (pts.length - 1);
  const coords = pts.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const stroke = positive ? 'hsl(145 70% 52%)' : 'hsl(352 80% 60%)';
  const gid = `spark-${positive ? 'up' : 'down'}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2" fill={stroke} />
    </svg>
  );
}
