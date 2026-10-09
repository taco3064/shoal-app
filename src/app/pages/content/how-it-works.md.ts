import type { APIRoute } from 'astro';
import lifecycle from '~app/guide/lifecycle.md?raw';

export const GET: APIRoute = () => new Response(lifecycle, {
  headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
