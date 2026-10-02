declare module 'cloudflare:workers' {
  import { CloudflareWorkersModule } from '@cloudflare/workers-types';

  export import DurableObject = CloudflareWorkersModule.DurableObject;
}
