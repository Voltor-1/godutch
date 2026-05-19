import { Hono } from 'hono';
import type { Env } from '../lib/supabase';

declare const DEPLOYED_AT: string;
declare const APP_VERSION: string;

const version = new Hono<{ Bindings: Env }>();

version.get('/', (c) => {
  return c.json({
    version: APP_VERSION,
    deployedAt: DEPLOYED_AT,
    product: 'godutch',
  });
});

export default version;
