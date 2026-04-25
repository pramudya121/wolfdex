import { createFileRoute } from '@tanstack/react-router';
import DocsPage from '@/components/dex/DocsPage';

export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'Documentation — WOLFDEX' },
      { name: 'description', content: 'Complete documentation for WOLFDEX decentralized exchange on LitVM LiteForge Testnet.' },
    ],
  }),
  component: DocsPage,
});
