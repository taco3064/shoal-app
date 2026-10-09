import type { ReviewerEntry } from '~app/network/services/network_projection';

const website = 'https://taco3064.github.io/shoal-app/';

// Only validated projection facts enter the head. Profile / Policy prose stays
// attributed in the body, never promoted to platform claims or agent instructions.
export function reviewerDescription(reviewer: ReviewerEntry): string {
  const station = reviewer.stationStatus === 'ready'
    ? 'station ready at scan time'
    : 'station setup required at scan time';

  const summary = {
    current: 'latest accepted Summary snapshot',
    fallback: 'stale prior accepted Summary snapshot',
    unavailable: 'no accepted Summary metrics',
  }[reviewer.summary.status];

  return `${reviewer.username}: Shoal Reviewer Node ${reviewer.repositoryId}; ${station}; ${summary}. Inspect the Reviewer-owned Policy and provenance. Not live GitHub state.`;
}

export function pageSchema({ title, description, canonical }: {
  title: string;
  description: string;
  canonical: string;
}) {
  const brand = {
    '@type': 'Brand',
    '@id': `${website}#brand`,
    name: 'Shoal',
    url: website,
    logo: {
      '@type': 'ImageObject',
      url: `${website}shoal-logo.webp`,
      width: 1200,
      height: 403,
    },
  };

  const site = {
    '@type': 'WebSite',
    '@id': `${website}#website`,
    name: 'Shoal',
    url: website,
    about: { '@id': brand['@id'] },
  };

  const page = {
    '@type': 'WebPage',
    '@id': `${canonical}#page`,
    url: canonical,
    name: title,
    description,
    isPartOf: { '@id': site['@id'] },
    about: { '@id': brand['@id'] },
  };

  const crumbs = [
    { '@type': 'ListItem', position: 1, name: 'Shoal', item: website },
    ...(canonical.startsWith(`${website}reviewers/`) && canonical !== `${website}reviewers/`
      ? [{ '@type': 'ListItem', position: 2, name: 'Reviewer Directory', item: `${website}reviewers/` }]
      : []),
  ];

  if (canonical !== website) {
    crumbs.push({
      '@type': 'ListItem', position: crumbs.length + 1, name: title, item: canonical,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [brand, site, page, {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs,
    }],
  };
}
