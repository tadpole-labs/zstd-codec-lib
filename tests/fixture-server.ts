#!/usr/bin/env bun

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.FIXTURE_PORT || '42069');
const TEST_DIR = __dirname;


const server = Bun.serve({
  port: PORT,
  
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === '/health') return new Response('OK');

    if (pathname.startsWith('/bundles/')) {
      try {
        const file = Bun.file(join(TEST_DIR, pathname.slice(1)));
        let contentType = 'application/octet-stream';
        if (pathname.endsWith('.js')) contentType = 'application/javascript';
        else if (pathname.endsWith('.html')) contentType = 'text/html';
        else if (pathname.endsWith('.wasm')) contentType = 'application/wasm';
        
        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
          }
        });
      } catch (error) {
        return new Response('Not Found', { status: 404 });
      }
    }
    
    if (pathname.startsWith('/data/') || 
        pathname.startsWith('/dictionaries/') || 
        pathname.startsWith('/edge-cases/') ||
        pathname.startsWith('/packages/')) {
      try {
        const filePath = pathname.startsWith('/packages/') 
          ? join(TEST_DIR, '..', pathname.slice(1))
          : join(TEST_DIR, pathname.slice(1));
        return new Response(Bun.file(filePath));
      } catch (error) {
        return new Response('Not Found', { status: 404 });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
});

console.log(`📁 Test fixture server running on http://localhost:${PORT}`);
console.log(`   Serving files from: ${TEST_DIR}`);

export { server, PORT };
