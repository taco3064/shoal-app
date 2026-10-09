import type { APIRoute } from 'astro';
import { publicPagesMarkdown } from '~app/guide/services/agent_reading';

export const GET: APIRoute = ({ site }) => new Response(
  publicPagesMarkdown(new URL(import.meta.env.BASE_URL, site).href),
  { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
);
