import type { APIRoute, GetStaticPaths } from 'astro';
import type { ReviewerEntry } from '~app/network/services/network_projection';
import { publishedProjection } from '~app/guide/services/projection_source';
import { reviewerSnapshot } from '~app/guide/services/public_content';

export const getStaticPaths = (async () => {
  const projection = await publishedProjection();

  return projection.reviewers.map((reviewer) => ({
    params: { username: reviewer.username },
    props: { reviewer, generatedAt: projection.generatedAt },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props, site }) => {
  const { reviewer, generatedAt } = props as {
    reviewer: ReviewerEntry;
    generatedAt: string;
  };

  const canonical = new URL(
    `${import.meta.env.BASE_URL}reviewers/${reviewer.username}/`, site,
  ).href;

  return new Response(reviewerSnapshot(reviewer, generatedAt, canonical), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
