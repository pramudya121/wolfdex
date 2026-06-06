/**
 * Tiny dependency-free sparkline. Renders a smooth polyline + soft area fill.
 * Color shifts green / red based on first-vs-last delta.
 */
import { memo } from 'react';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

function SparklineImpl({ values, width = 120, height = 36, className }: Props) {
  if (!values || values.length < 2) {
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-label="No chart data yet"
      >
        <svg width={width} height={height}>
          <line
            x1={0} y1={height / 2} x2={width} y2={height / 2}
            stroke="oklch(0.5 0.01 280 / 50%)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        </svg>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;

  const up = values[values.length - 1] >= values[0];
  const stroke = up ? 'oklch(0.78 0.18 150)' : 'oklch(0.65 0.22 25)';
  const fill   = up ? 'oklch(0.78 0.18 150 / 18%)' : 'oklch(0.65 0.22 25 / 18%)';
  const gradId = `spark-grad-${up ? 'u' : 'd'}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={up ? 'Price up' : 'Price down'}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export const Sparkline = memo(SparklineImpl);
