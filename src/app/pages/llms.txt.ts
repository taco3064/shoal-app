import type { APIRoute } from 'astro';
import { agentEntryPoint } from '~app/guide/services/agent_reading';

export const GET: APIRoute = ({ site }) => new Response(
  agentEntryPoint(new URL(import.meta.env.BASE_URL, site).href),
  { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
);
