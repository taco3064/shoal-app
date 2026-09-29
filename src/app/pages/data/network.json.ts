import type { APIRoute } from 'astro';
import { publishedProjection } from '~app/guide/services/projection_source';

export const GET: APIRoute = async () => new Response(
  JSON.stringify(await publishedProjection()),
  { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
);
