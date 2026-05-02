import { createFileRoute } from '@tanstack/react-router';
import LaunchpadView from '@/components/dex/LaunchpadView';

export const Route = createFileRoute('/launchpad')({
  head: () => ({
    meta: [
      { title: 'Launchpad — WOLFDEX' },
      { name: 'description', content: 'Deploy your own ERC20 token in 1 click on LitVM LiteForge. Auto-listed across WolfDex.' },
      { property: 'og:title', content: 'ERC20 Launchpad — WOLFDEX' },
      { property: 'og:description', content: 'Create and launch your token instantly with WolfDex Launchpad.' },
    ],
  }),
  component: LaunchpadView,
});
