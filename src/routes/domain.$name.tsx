import { createFileRoute } from '@tanstack/react-router';
import DomainDetailView from '@/components/dex/domains/DomainDetailView';

export const Route = createFileRoute('/domain/$name')({
  head: ({ params }) => {
    const label = (params.name || '').toLowerCase();
    const full = `${label}.wolf`;
    const url = `https://wolfdex.lovable.app/domain/${label}`;
    const title = `${full} — WolfDex Name Service`;
    const description = `View ${full}: on-chain owner, expiry, resolver records and associated WolfDex tokens. Claim or request this .wolf name on LitVM LiteForge.`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: url },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      links: [{ rel: 'canonical', href: url }],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: full,
            description,
            url,
            category: 'Web3 domain name',
            brand: { '@type': 'Brand', name: 'WolfDex Name Service' },
          }),
        },
      ],
    };
  },
  component: DomainPage,
});

function DomainPage() {
  const { name } = Route.useParams();
  return <DomainDetailView name={name} />;
}
