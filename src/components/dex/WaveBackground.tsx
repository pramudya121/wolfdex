export default function WaveBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Dark blue base */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, oklch(0.08 0.03 270), oklch(0.05 0.02 260), oklch(0.03 0.015 250))' }} />

      {/* Wave 1 */}
      <svg className="absolute bottom-0 left-0 w-[200%] h-[60%] opacity-15" style={{ animation: 'wave 20s ease-in-out infinite' }} viewBox="0 0 1440 400" preserveAspectRatio="none">
        <path fill="url(#wg1)" d="M0,200 C320,100 640,350 960,200 C1280,50 1440,250 1440,250 L1440,400 L0,400 Z" />
        <defs><linearGradient id="wg1" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#1e3a8a" /><stop offset="50%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#e040a0" /></linearGradient></defs>
      </svg>

      {/* Wave 2 */}
      <svg className="absolute bottom-0 left-0 w-[200%] h-[50%] opacity-10" style={{ animation: 'wave2 15s ease-in-out infinite' }} viewBox="0 0 1440 400" preserveAspectRatio="none">
        <path fill="url(#wg2)" d="M0,280 C240,180 480,350 720,250 C960,150 1200,320 1440,220 L1440,400 L0,400 Z" />
        <defs><linearGradient id="wg2" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#06b6d4" /></linearGradient></defs>
      </svg>

      {/* Wave 3 */}
      <svg className="absolute bottom-0 left-0 w-[200%] h-[40%] opacity-8" style={{ animation: 'wave 25s ease-in-out infinite reverse' }} viewBox="0 0 1440 400" preserveAspectRatio="none">
        <path fill="url(#wg3)" d="M0,320 C360,240 720,380 1080,280 C1260,230 1440,340 1440,340 L1440,400 L0,400 Z" />
        <defs><linearGradient id="wg3" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#1e40af" /><stop offset="100%" stopColor="#4f46e5" /></linearGradient></defs>
      </svg>

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-8" style={{ background: 'radial-gradient(circle, oklch(0.5 0.2 270 / 15%), transparent 70%)', animation: 'pulse-glow 8s ease-in-out infinite' }} />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, oklch(0.6 0.25 330 / 12%), transparent 70%)', animation: 'pulse-glow 10s ease-in-out infinite 3s' }} />
    </div>
  );
}
