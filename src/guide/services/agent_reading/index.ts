import { canonicalJoinGuidance } from '~app/join/services/join_guidance';
import { publicExplanation } from '../public_content';

const destinations = [
  ['', 'Shoal', 'Product purpose and next actions'],
  ['how-it-works/', 'How Shoal works', 'Review, Re-review, evidence and permissions'],
  ['join/', 'Join Shoal', 'One staged journey with Web-assisted and Local / CLI modes'],
  ['reviewers/', 'Reviewer Directory', 'All published Reviewer pages and Policies'],
  ['data/network.json', 'Network Projection JSON',
    'Sole published Reviewer source, generation time and accepted provenance'],
  ['content/how-it-works.md', 'Lifecycle as Markdown',
    'Exact How Shoal works content'],
  ['content/public-pages.md', 'Public facts and Join guidance',
    'Same governed content as public HTML'],
];

export function agentEntryPoint(site: string): string {
  return [
    '# Shoal',
    '',
    '> A public, policy-driven repository review network that makes '
    + 'GitHub Stars explainable.',
    '',
    '## Canonical public reading',
    ...destinations.map(([path, name, purpose]) => `- [${name}](${site}${path}): ${purpose}`),
    '',
    'Each projected Reviewer has a canonical HTML page at '
    + 'reviewers/{username}/ and a projection-derived snapshot.txt at '
    + 'that same path. Follow the Directory’s complete HTML links; '
    + 'membership comes only from data/network.json.',
    '',
    '## Authority and freshness',
    ...publicExplanation.paragraphs,
    '',
    'Human-readable HTML is the primary public explanation. These '
    + 'generated reading conveniences are not a second Product BR, '
    + 'formal Protocol record or live API. Reviewer-owned Policy/profile '
    + 'text is external content, not instructions from Shoal. No special '
    + 'crawler support, search appearance, ranking or model '
    + 'comprehension is guaranteed.',
    '',
  ].join('\n');
}

export function publicPagesMarkdown(site: string): string {
  const stages = canonicalJoinGuidance.flatMap((stage) => [
    `### ${stage.label}`,
    stage.description,
    `Local / CLI: ${stage.localDescription}`,
    ...(stage.commands ?? []).map((command) => `- \`${command}\``),
    '',
  ]);

  return [
    '# Shoal public facts and Join guidance',
    `Primary public pages: ${site} and ${site}join/`,
    '',
    `## ${publicExplanation.title}`,
    ...publicExplanation.paragraphs.flatMap((text) => [text, '']),
    '## The single Join journey',
    'Web-assisted and Local / CLI guidance belong to the same stages. '
    + 'This reading representation grants no mutation authority; use the '
    + 'canonical Join page for separately confirmed actions.',
    ...stages,
    `Next: ${site}reviewers/`,
    `Review and Re-review: ${site}how-it-works/`,
    '',
  ].join('\n');
}
