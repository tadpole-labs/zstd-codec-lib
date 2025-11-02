import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as zlib from 'node:zlib';

export const loadCompressedFiles = (dir: string) =>
  readdirSync(dir).filter(f => f.endsWith('.zst')).map(f => readFileSync(join(dir, f)));

const WS = [
  { url: 'wss://mainnet.flashblocks.base.org/ws', name: 'base' },
  { url: 'wss://mainnet-flashblocks.unichain.org/ws', name: 'unichain' },
  { url: 'wss://sepolia.flashblocks.base.org/ws', name: 'sepolia' },
  { url: 'wss://arb1.arbitrum.io/feed', name: 'arbitrum' },
];

const RPC = [
  { url: 'https://mainnet.optimism.io', name: 'optimism' },
  { url: 'https://mainnet.base.org', name: 'base-rpc' }
];

const log = (msg: string, err?: any) => console.log(err ? `[ERROR] ${msg}: ${err.message || err}` : msg);

const counters = new Map<string, number>();
const updateCounter = (name: string, count: number) => {
  counters.set(name, count);
  process.stdout.write(`\r${Array.from(counters.entries()).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
};

const compress = (data: Buffer) => 
  zlib.zstdCompressSync(data, { 
    params: { [zlib.constants.ZSTD_c_compressionLevel]: Math.floor(Math.random() * 16) + 3 } 
  });

const detectDecompress = (buf: Buffer): Buffer => {
  if (buf[0] === 0x7B || buf[0] === 0x5B) return buf;
  if (buf[0] === 0x28 && buf[1] === 0xB5 && buf[2] === 0x2F && buf[3] === 0xFD) 
    return zlib.zstdDecompressSync(buf);
  if (buf[0] === 0x1f && buf[1] === 0x8b) 
    return zlib.gunzipSync(buf);
  if (buf[0] === 0x78) {
    try { return zlib.inflateSync(buf); } catch {
      try { return zlib.inflateRawSync(buf); } catch { }
    }
  }
  if (buf[0] === 0xCE || buf[0] === 0x21) {
    try { return zlib.brotliDecompressSync(buf); } catch { }
  }
  try { return zlib.brotliDecompressSync(buf); } catch { }
  return buf;
};

const collectWS = (url: string, name: string, stopSignal: () => boolean): Promise<Buffer[]> => 
  new Promise(resolve => {
    const msgs: Buffer[] = [];
    let ws: WebSocket;
    
    const connect = () => {
      if (stopSignal()) {
        resolve(msgs);
        return;
      }
      
      try {
        ws = new WebSocket(url);
        
        ws.addEventListener('open', () => updateCounter(name, msgs.length));
        
        ws.addEventListener('message', (e) => {
          try {
            const data = typeof e.data === 'string' ? Buffer.from(e.data) : Buffer.from(e.data);
            if (data[0] === 0x89) {
              ws.send(Buffer.from([0x8A, ...data.slice(1)]));
              return;
            }
            msgs.push(compress(detectDecompress(data)));
            updateCounter(name, msgs.length);
            if (stopSignal()) {
              ws.close();
              resolve(msgs);
            }
          } catch (err) { log(`Parse ${name}:`, err); }
        });

        ws.addEventListener('error', () => {});
        
        ws.addEventListener('close', () => {
          if (!stopSignal()) setTimeout(connect, 1000);
          else resolve(msgs);
        });
      } catch (err) {
        if (!stopSignal()) setTimeout(connect, 1000);
        else resolve(msgs);
      }
    };
    
    connect();
  });

const collectRPC = async (url: string, name: string, stopSignal: () => boolean): Promise<Buffer[]> => {
  const results: Buffer[] = [];
  const headers = { 
    'Content-Type': 'application/json',
    'Accept-Encoding': 'zstd, br, gzip, deflate'
  };

  try {
    const blockRes = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
    });
    const latest = parseInt((await blockRes.json()).result, 16);

    for (let i = 0; !stopSignal(); i++) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify({
          jsonrpc: '2.0', id: i + 2,
          method: 'eth_getBlockByNumber',
          params: [`0x${(latest - i).toString(16)}`, true]
        })
      });
      results.push(compress(Buffer.from(await res.text())));
      updateCounter(name, results.length);
    }
  } catch { }
  
  return results;
};

export const collectChainData = async (target: number, existing: number): Promise<Buffer[]> => {
  const needed = target - existing;
  if (needed <= 0) return [];
  
  log(`\nCollecting ${needed} files...\n`);
  
  let totalCollected = 0;
  const stopSignal = () => totalCollected >= needed;
  
  const tasks = [
    ...WS.map(({ url, name }) => collectWS(url, name, stopSignal)),
    ...RPC.map(({ url, name }) => collectRPC(url, name, stopSignal))
  ];
  
  const updateTotal = setInterval(() => {
    totalCollected = Array.from(counters.values()).reduce((a, b) => a + b, 0);
    if (totalCollected >= needed) clearInterval(updateTotal);
  }, 100);
  
  const results = await Promise.all(tasks);
  clearInterval(updateTotal);
  const all = results.flat();
  
  console.log(`\n\nCollected ${all.length} files`);
  return all.slice(0, needed);
};

