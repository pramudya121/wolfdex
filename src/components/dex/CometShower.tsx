import { useEffect, useRef } from 'react';

/**
 * Full-viewport diagonal comets / shooting-star shower.
 * Pure canvas, fixed positioning, sits behind page content (z-0).
 * Used on Swap / Liquidity / Pools / Analytics / Portfolio / Docs pages.
 *
 * Tuneable via props but defaults are a balanced "elegant universe" feel.
 */
interface CometShowerProps {
  density?: number;        // ms between spawns (lower = more comets)
  starCount?: number;      // ambient twinkling stars
  className?: string;
}

export default function CometShower({
  density = 900,
  starCount = 70,
  className = '',
}: CometShowerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let paused = false;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    type Star = { x: number; y: number; r: number; a: number; aSpeed: number; hue: number };
    type Comet = {
      x: number; y: number; vx: number; vy: number;
      len: number; life: number; maxLife: number; hue: number; thick: number;
    };

    const stars: Star[] = Array.from({ length: starCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.3 + 0.2,
      a: Math.random(),
      aSpeed: (Math.random() * 0.01 + 0.002) * (Math.random() < 0.5 ? -1 : 1),
      hue: Math.random() < 0.5 ? 330 : Math.random() < 0.5 ? 85 : 290,
    }));

    const comets: Comet[] = [];
    const spawnComet = () => {
      // Diagonal sweep: enter from top or sides, fall down-right or down-left
      const side = Math.random();
      let x, y, angle;
      if (side < 0.5) {
        // top-left → bottom-right
        x = Math.random() * w * 0.6 - 100;
        y = -50;
        angle = Math.PI / 5 + Math.random() * Math.PI / 8; // ~36-58deg
      } else {
        // top-right → bottom-left
        x = w * 0.4 + Math.random() * w * 0.6 + 100;
        y = -50;
        angle = Math.PI - (Math.PI / 5 + Math.random() * Math.PI / 8);
      }
      const speed = 7 + Math.random() * 6;
      comets.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 120 + Math.random() * 140,
        life: 0,
        maxLife: 90 + Math.random() * 50,
        hue: Math.random() < 0.4 ? 330 : Math.random() < 0.5 ? 85 : 290,
        thick: 1.4 + Math.random() * 1.2,
      });
    };

    let spawnTimer = 0;

    const tick = () => {
      if (paused) { raf = requestAnimationFrame(tick); return; }
      ctx.clearRect(0, 0, w, h);

      // ambient twinkle
      for (const s of stars) {
        s.a += s.aSpeed;
        if (s.a > 1) { s.a = 1; s.aSpeed *= -1; }
        if (s.a < 0.05) { s.a = 0.05; s.aSpeed *= -1; }
        ctx.beginPath();
        ctx.fillStyle = `oklch(0.85 0.16 ${s.hue} / ${s.a * 0.7})`;
        ctx.shadowColor = `oklch(0.75 0.2 ${s.hue} / ${s.a * 0.6})`;
        ctx.shadowBlur = s.r * 3;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // comets
      spawnTimer -= 16;
      if (spawnTimer <= 0) {
        spawnComet();
        spawnTimer = density * (0.6 + Math.random() * 0.8);
      }
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.x += c.vx;
        c.y += c.vy;
        c.life++;
        const lifeRatio = Math.max(0, 1 - c.life / c.maxLife);

        // tail
        const tailX = c.x - c.vx * (c.len / 10);
        const tailY = c.y - c.vy * (c.len / 10);
        const grad = ctx.createLinearGradient(c.x, c.y, tailX, tailY);
        grad.addColorStop(0, `oklch(0.95 0.2 ${c.hue} / ${0.95 * lifeRatio})`);
        grad.addColorStop(0.4, `oklch(0.8 0.22 ${c.hue} / ${0.5 * lifeRatio})`);
        grad.addColorStop(1, `oklch(0.6 0.2 ${c.hue} / 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = c.thick;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // bright head
        ctx.beginPath();
        ctx.fillStyle = `oklch(1 0.05 ${c.hue} / ${lifeRatio})`;
        ctx.shadowColor = `oklch(0.85 0.22 ${c.hue} / ${lifeRatio})`;
        ctx.shadowBlur = 16;
        ctx.arc(c.x, c.y, c.thick + 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (c.life > c.maxLife || c.x < -200 || c.x > w + 200 || c.y > h + 200) {
          comets.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Stop drawing when the tab is hidden — saves battery + frees the
    // main thread when the user is on another tab.
    const onVis = () => { paused = document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [density, starCount]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`fixed inset-0 w-screen h-screen pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
    />
  );
}
