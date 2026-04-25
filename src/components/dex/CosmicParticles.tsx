import { useEffect, useRef } from 'react';

/**
 * Cosmic particles + shooting stars background for the TokenGlobe.
 * Pure canvas, no deps. Auto-resizes, twinkles, and emits shooting stars.
 */
export default function CosmicParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    type Star = { x: number; y: number; r: number; a: number; aSpeed: number; hue: number };
    type Shooter = { x: number; y: number; vx: number; vy: number; len: number; life: number; maxLife: number; hue: number };

    const STAR_COUNT = 110;
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.4 + 0.2,
      a: Math.random(),
      aSpeed: (Math.random() * 0.012 + 0.003) * (Math.random() < 0.5 ? -1 : 1),
      hue: Math.random() < 0.5 ? 330 : Math.random() < 0.5 ? 85 : 290, // pink/gold/violet
    }));

    const shooters: Shooter[] = [];
    const spawnShooter = () => {
      const fromLeft = Math.random() < 0.5;
      const y = Math.random() * h * 0.6;
      const speed = 6 + Math.random() * 5;
      const angle = (fromLeft ? 1 : -1) * (Math.PI / 6 + Math.random() * Math.PI / 6);
      shooters.push({
        x: fromLeft ? -50 : w + 50,
        y,
        vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
        vy: Math.sin(angle) * speed,
        len: 90 + Math.random() * 80,
        life: 0,
        maxLife: 60 + Math.random() * 30,
        hue: Math.random() < 0.5 ? 330 : 85,
      });
    };

    let shootTimer = 0;

    const tick = () => {
      ctx.clearRect(0, 0, w, h);

      // twinkle stars
      for (const s of stars) {
        s.a += s.aSpeed;
        if (s.a > 1) { s.a = 1; s.aSpeed *= -1; }
        if (s.a < 0.05) { s.a = 0.05; s.aSpeed *= -1; }
        ctx.beginPath();
        ctx.fillStyle = `oklch(0.85 0.18 ${s.hue} / ${s.a})`;
        ctx.shadowColor = `oklch(0.75 0.22 ${s.hue} / ${s.a * 0.8})`;
        ctx.shadowBlur = s.r * 4;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // shooting stars
      shootTimer--;
      if (shootTimer <= 0) {
        spawnShooter();
        shootTimer = 80 + Math.random() * 140;
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const sh = shooters[i];
        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.life++;
        const lifeRatio = 1 - sh.life / sh.maxLife;
        const tailX = sh.x - sh.vx * (sh.len / 8);
        const tailY = sh.y - sh.vy * (sh.len / 8);
        const grad = ctx.createLinearGradient(sh.x, sh.y, tailX, tailY);
        grad.addColorStop(0, `oklch(0.95 0.2 ${sh.hue} / ${0.9 * lifeRatio})`);
        grad.addColorStop(1, `oklch(0.7 0.2 ${sh.hue} / 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        // head glow
        ctx.beginPath();
        ctx.fillStyle = `oklch(1 0.05 ${sh.hue} / ${lifeRatio})`;
        ctx.shadowColor = `oklch(0.85 0.2 ${sh.hue} / ${lifeRatio})`;
        ctx.shadowBlur = 12;
        ctx.arc(sh.x, sh.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (sh.life > sh.maxLife || sh.x < -100 || sh.x > w + 100 || sh.y > h + 100) {
          shooters.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
