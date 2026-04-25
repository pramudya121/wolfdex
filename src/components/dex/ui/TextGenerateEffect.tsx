import { memo, useMemo } from 'react';

interface TextGenerateProps {
  text: string;
  className?: string;
  delay?: number;
}

/**
 * Aceternity-style word-by-word text reveal with blur.
 *
 * Each word is rendered as an inline-block animated span. Word spacing is
 * controlled by `.text-gen-word` margin-right in src/styles.css — that's
 * the only reliable way to keep visible word gaps when the parent uses
 * `background-clip: text` with `text-fill-color: transparent` (literal space
 * characters have no fill in that mode and visually disappear).
 *
 * Performance: memoized so it does NOT re-render when its parent re-renders
 * with the same `text`/`className`/`delay`. Word splitting + animationDelay
 * computation are also memoized to avoid per-render array allocations during
 * the active CSS animation (which would cause layout thrashing on Swap and
 * Liquidity where the parent updates frequently, e.g. amount inputs).
 */
function TextGenerateEffectImpl({
  text,
  className = '',
  delay = 0,
}: TextGenerateProps) {
  const words = useMemo(
    () =>
      text
        .split(/\s+/)
        .filter(Boolean)
        .map((word, i) => ({
          word,
          key: `${word}-${i}`,
          // Pre-compute the per-word delay once — re-creating these style
          // objects on every parent render would re-trigger the animation
          // pipeline in some browsers.
          style: { animationDelay: `${delay + i * 0.08}s` },
        })),
    [text, delay],
  );

  return (
    <span className={className} style={{ whiteSpace: 'normal' }}>
      {words.map(({ word, key, style }) => (
        <span key={key} className="text-gen-word" style={style}>
          {word}
        </span>
      ))}
    </span>
  );
}

const TextGenerateEffect = memo(TextGenerateEffectImpl);
TextGenerateEffect.displayName = 'TextGenerateEffect';

export default TextGenerateEffect;
