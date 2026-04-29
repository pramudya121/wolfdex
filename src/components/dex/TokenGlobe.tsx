import { useEffect, useRef } from 'react';
import { TOKENS, NATIVE_TOKEN } from '@/config/contracts';

/**
 * Premium 3D Token Globe — pure CSS 3D transforms.
 * Each token rides a uniquely tilted ring (vertical, horizontal, diagonal),
 * giving a real "universal" / atomic feel rather than flat orbits.
 */
export default function TokenGlobe() {
  const ref = useRef<HTMLDivElement>(null);

  // All tokens (skip native zkLTC since we render its core shine separately)
  const orbitTokens = TOKENS.filter(t => t.address !== NATIVE_TOKEN.address);

  /**
   * Each ring is tilted on TWO axes (rotateX + rotateZ) so orbits cross
   * at different angles — vertical, horizontal, slanted, polar.
   * Speeds & directions vary; some go reverse for motion contrast.
   */
  const rings = [
    { rx:   0, rz:   0, radius: 175, speed: 18, dir: 1,  color: 'oklch(0.65 0.25 330 / 50%)' },  // equatorial
    { rx:  90, rz:   0, radius: 165, speed: 22, dir: -1, color: 'oklch(0.78 0.16 85 / 45%)' },   // polar (vertical)
    { rx:  90, rz:  60, radius: 155, speed: 16, dir: 1,  color: 'oklch(0.6 0.2 300 / 45%)' },    // tilted vertical
    { rx:  45, rz:   0, radius: 180, speed: 26, dir: -1, color: 'oklch(0.75 0.15 200 / 40%)' },  // diagonal /
    { rx: -45, rz:   0, radius: 180, speed: 24, dir: 1,  color: 'oklch(0.7 0.2 145 / 40%)' },    // diagonal \
    { rx:  60, rz:  30, radius: 145, speed: 14, dir: 1,  color: 'oklch(0.65 0.25 330 / 40%)' },  // slanted
    { rx: -60, rz: -30, radius: 145, speed: 20, dir: -1, color: 'oklch(0.78 0.16 85 / 40%)' },   // slanted opposite
    { rx:  30, rz:  90, radius: 195, speed: 28, dir: 1,  color: 'oklch(0.6 0.2 300 / 35%)' },    // wide outer
  ];

  // Mouse parallax tilt
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
      const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
      el.style.setProperty('--tilt-x', `${y * -10}deg`);
      el.style.setProperty('--tilt-y', `${x * 14}deg`);
    };
    const onLeave = () => {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    };
    window.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="token-globe-wrap">
      {/* Outer atmospheric glow */}
      <div className="globe-glow" />
      <div className="globe-glow-2" />

      {/* The sphere */}
      <div className="token-globe">
        {/* Core sphere */}
        <div className="globe-core">
          <div className="globe-shine" />
          <div className="globe-inner-glow" />
        </div>

        {/* Meridians (vertical wireframe lines) */}
        {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5].map(angle => (
          <div key={`m-${angle}`} className="meridian" style={{ transform: `rotateY(${angle}deg)` }} />
        ))}

        {/* Parallels (latitude rings as static guides) */}
        {[-60, -30, 0, 30, 60].map(lat => {
          const r = Math.cos((lat * Math.PI) / 180) * 175;
          const y = Math.sin((lat * Math.PI) / 180) * 175;
          return (
            <div
              key={`p-${lat}`}
              className="parallel"
              style={{
                width: `${r * 2}px`,
                height: `${r * 2}px`,
                transform: `translate(-50%, -50%) translateY(${y}px) rotateX(90deg)`,
              }}
            />
          );
        })}

        {/* Orbiting tokens — each on a uniquely tilted ring */}
        {orbitTokens.map((tok, i) => {
          const ring = rings[i % rings.length];
          const animName = ring.dir > 0 ? 'orbit-spin' : 'orbit-spin-rev';
          return (
            <div
              key={tok.address}
              className="orbit"
              style={{
                transform: `rotateX(${ring.rx}deg) rotateZ(${ring.rz}deg) rotateY(${i * 23}deg)`,
              }}
            >
              {/* Visual orbit path */}
              <div
                className="orbit-path"
                style={{
                  width: `${ring.radius * 2}px`,
                  height: `${ring.radius * 2}px`,
                  borderColor: ring.color,
                }}
              />
              {/* Orbiting wrapper — this is what spins around the center */}
              <div
                className="orbit-spinner"
                style={{
                  animation: `${animName} ${ring.speed}s linear infinite`,
                  animationDelay: `${i * -1.7}s`,
                }}
              >
                {/* Token chip riding the orbit */}
                <div
                  className="orbit-token"
                  style={{ transform: `translate(-50%, -50%) translateX(${ring.radius}px)` }}
                >
                  <div
                    className="orbit-token-inner"
                    style={{
                      animation: `counter-spin ${ring.speed}s linear infinite ${ring.dir > 0 ? 'reverse' : ''}`,
                    }}
                  >
                    <img
                      src={tok.logo}
                      alt={tok.symbol}
                      onError={e => { (e.target as HTMLImageElement).src = '/images/token-anon.svg'; }}
                    />
                    <span className="orbit-token-label">{tok.symbol}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
