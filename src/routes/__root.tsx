import { Outlet, Link, createRootRoute, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import Header from "@/components/dex/Header";
import WaveBackground from "@/components/dex/WaveBackground";
import CometShower from "@/components/dex/CometShower";
import AIAgentPanel from "@/components/dex/AIAgentPanel";
import GlobalTxNotifier from "@/components/dex/GlobalTxNotifier";
import GlobalLimitWatcher from "@/components/dex/GlobalLimitWatcher";
import PageTransition from "@/components/dex/PageTransition";
import RegistryHydrator from "@/components/dex/RegistryHydrator";
import { DexProvider, useDexContext } from "@/context/DexContext";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold wolf-gradient-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="wolf-btn-primary inline-flex items-center px-6 py-2.5 rounded-xl text-sm font-medium">Go home</Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WOLFDEX — Decentralized Exchange on LitVM LiteForge" },
      { name: "description", content: "Premium decentralized exchange on LitVM LiteForge Testnet. Swap, provide liquidity, and earn with WOLFDEX." },
      { property: "og:title", content: "WOLFDEX — Decentralized Exchange on LitVM LiteForge" },
      { name: "twitter:title", content: "WOLFDEX — Decentralized Exchange on LitVM LiteForge" },
      { property: "og:description", content: "Premium decentralized exchange on LitVM LiteForge Testnet. Swap, provide liquidity, and earn with WOLFDEX." },
      { name: "twitter:description", content: "Premium decentralized exchange on LitVM LiteForge Testnet. Swap, provide liquidity, and earn with WOLFDEX." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/xE1Z15HujxVUyhuL9bIkrIFCS893/social-images/social-1776587143169-ChatGPT_Image_16_Apr_2026,_23.06.40.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/xE1Z15HujxVUyhuL9bIkrIFCS893/social-images/social-1776587143169-ChatGPT_Image_16_Apr_2026,_23.06.40.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://wolfdex.lovable.app/#organization",
              name: "WolfDex",
              url: "https://wolfdex.lovable.app",
              logo: "https://wolfdex.lovable.app/images/wdex-logo.png",
            },
            {
              "@type": "WebSite",
              "@id": "https://wolfdex.lovable.app/#website",
              url: "https://wolfdex.lovable.app",
              name: "WolfDex",
              description: "Premium multichain decentralized exchange on LitVM LiteForge Testnet.",
              publisher: { "@id": "https://wolfdex.lovable.app/#organization" },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function AppLayout() {
  const { wallet, dex, showWalletModal, setShowWalletModal } = useDexContext();
  const location = useLocation();
  // CometShower is mounted ONCE here (not per-route) so its <canvas> isn't
  // torn down + recreated on every navigation — that was a major perceived-
  // perf hit. The home page renders its own nebula/particles on top, so we
  // hide comets there via CSS opacity instead of unmounting.
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen">
      <WaveBackground />
      <div style={{ opacity: isHome ? 0 : 1, transition: 'opacity 200ms', position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <CometShower />
      </div>
      <Header
        address={wallet.address}
        balance={wallet.balance}
        isConnected={wallet.isConnected}
        isConnecting={wallet.isConnecting}
        onConnect={(type) => wallet.connect(type)}
        onDisconnect={wallet.disconnect}
      />
      <main className="pt-20 pb-12 px-4 relative" style={{ zIndex: 1 }}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <AIAgentPanel />
      <GlobalTxNotifier />
      <GlobalLimitWatcher />
      <RegistryHydrator />
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        closeButton
        expand
        visibleToasts={5}
        toastOptions={{
          classNames: {
            toast: 'wolf-toast',
          },
        }}
      />
      <footer className="relative border-t border-wolf-border/30 py-8 mt-12 text-center text-xs text-muted-foreground overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40 wolf-footer-shine" />
        <p className="relative">WOLFDEX © 2026 — Built on LitVM LiteForge Testnet (Chain ID: 4441)</p>
        <div className="relative flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3">
          <a href={`https://liteforge.explorer.caldera.xyz`} target="_blank" rel="noopener noreferrer" className="story-link hover:text-wolf-gold transition-colors">Block Explorer</a>
          <span className="opacity-50">•</span>
          <span className="font-mono opacity-80">Factory: 0x5687…cA873</span>
          <span className="opacity-50">•</span>
          <span className="font-mono opacity-80">Router: 0xd289…86B4</span>
        </div>
      </footer>
    </div>
  );
}

function RootComponent() {
  return (
    <DexProvider>
      <AppLayout />
    </DexProvider>
  );
}
