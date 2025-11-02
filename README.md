## zstd-codec-lib


## Usage - (Client Side)
```typescript

import { decompress, ZstdDecompressionStream, decompressStream, createDecoder } 
from 'zstd-wasm-decoder'; // Default (Node/browser - automatically inferred)

import { ... }            // For strict CSP policies (no unsafe-eval for WASM)
from 'zstd-wasm-decoder/external'; // .wasm fetched from same-origin

import { ... } // If you need the extra perf. (+30%) for +5kb in the browser
from 'zstd-wasm-decoder/perf' // or perf/external
                              // non-browser env uses perf. by default

import { ... }                
from 'zstd-wasm-decoder/cloudflare'; // for cloudflare workers

// 1. Simple decompression
const data: Uint8Array = await decompress(compressedData);

// 2. With dictionary (supports Uint8Array, ArrayBuffer, Request, or URL string)
const data: Uint8Array = await decompress(compressedData, { 
  dictionary: await fetch('/dict.bin') 
});

// 3. Streaming API - fetch response
const stream: ReadableStream<string> = (await fetch('/file.zst')).body!
  .pipeThrough(new ZstdDecompressionStream())
  .pipeThrough(new TextDecoderStream());

// 4. Streaming API - blob
const ds = new ZstdDecompressionStream();
const decompressedStream: ReadableStream<Uint8Array> = blob.stream().pipeThrough(ds);

// 5. Streaming API - with dictionary
const ds = new ZstdDecompressionStream({ 
  dictionary: await fetch('/dict.bin') 
});
const decompressedStream: ReadableStream<Uint8Array> = blob.stream().pipeThrough(ds);

// 6. Manual streaming (for chunked data)
const { buf, code }: { buf: Uint8Array, code: number } = await decompressStream(chunk, reset);

// 7. Reusable decoder instance
const decoder = await createDecoder();
const result1: Uint8Array = decoder.decompressSync(data1);
const result2: Uint8Array = decoder.decompressSync(data2);
decoder.destroy();
```

## License

This package is dual-licensed under **Apache-2.0 OR MIT**

The underlying [zstd implementation](https://github.com/facebook/zstd?tab=License-1-ov-file) is licensed under **BSD-3-Clause**.