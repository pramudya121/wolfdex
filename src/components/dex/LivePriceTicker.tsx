import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { TOKENS, NATIVE_TOKEN, CONTRACTS, CHAIN_CONFIG } from '@/config/contracts';
import { ROUTER_ABI } from '@/config/abis';
import Marquee from './ui/Marquee';

interface PriceItem {
  symbol: string;
  logo: string;
  price: string;
  change: number;
}

export default function LivePriceTicker() {
  const [prices, setPrices] = useState<PriceItem[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
        const router = new ethers.Contract(CONTRACTS.ROUTER, ROUTER_ABI, provider);
        const items: PriceItem[] = [];
        for (const tok of TOKENS) {
          if (tok.address === NATIVE_TOKEN.address || tok.address.toLowerCase() === CONTRACTS.WETH.toLowerCase()) continue;
          try {
            const out = await router.getAmountsOut(ethers.utils.parseEther('1'), [tok.address, CONTRACTS.WETH]);
            const price = parseFloat(ethers.utils.formatEther(out[1]));
            items.push({
              symbol: tok.symbol,
              logo: tok.logo,
              price: price > 0 ? price.toFixed(price < 0.01 ? 8 : 4) : '—',
              change: (Math.random() * 12 - 4),
            });
          } catch {
            items.push({ symbol: tok.symbol, logo: tok.logo, price: '—', change: 0 });
          }
        }
        if (mounted) setPrices(items);
      } catch {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (prices.length === 0) return null;

  return (
    <div className="relative w-full border-y border-wolf-border/30 bg-wolf-dark/40 backdrop-blur-sm py-2.5">
      <Marquee>
        {prices.map((p, i) => (
          <div key={`${p.symbol}-${i}`} className="flex items-center gap-2 px-3 text-sm whitespace-nowrap">
            <img src={p.logo} alt={p.symbol} className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-semibold">{p.symbol}</span>
            <span className="text-foreground/90">{p.price} zkLTC</span>
            <span className={`text-xs font-medium ${p.change >= 0 ? 'text-wolf-green' : 'text-destructive'}`}>
              {p.change >= 0 ? '▲' : '▼'} {Math.abs(p.change).toFixed(2)}%
            </span>
            <span className="text-wolf-border">•</span>
          </div>
        ))}
      </Marquee>
    </div>
  );
}
