import { createFileRoute } from '@tanstack/react-router';
import EcosystemView from '@/components/dex/EcosystemView';

export const Route = createFileRoute('/ecosystem')({
  head: () => ({
    meta: [
      { title: 'Ecosystem — dApps Building with WolfDex' },
      { name: 'description', content: 'Explore the curated directory of dApps, tools and protocols building on LitVM alongside WolfDex.' },
      { property: 'og:title', content: 'WolfDex Ecosystem — Curated dApps' },
      { property: 'og:description', content: 'A curated directory of dApps and tools in the WolfDex ecosystem.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: EcosystemView,
});
