## zstd-wasm-decoder

Tiny & performant decoder-only implementation of Zstandard.

|          |                                                                                                                                                                                                                         |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Lightweight**      | 13.2kb / 17.18kb (zipped) for size or perf. optimized build                                                                                                                                |
| **Dictionary Support** | Multiple and up to 2MB each                                                                                                                                    |
| **Performant**       | ~1.6x throughput vs Node.js zlib (V8), ~0.96x vs Bun (JSC)                                                                                                                          |
| **Compatibility**    | • [DecompressionStream API ponyfill](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream)<br>• [>94% worldwide browsers](https://browsersl.ist/#q=%3E0.3%25%2C+chrome+%3E%3D+80%2C+edge+%3E%3D+80%2C+firefox+%3E%3D+113%2C+safari+%3E%3D+16.4%2C+ios_saf+%3E%3D+16.4%2C+not+dead%2C+fully+supports+wasm-simd%2C+fully+supports+wasm-bulk-memory%2C+fully+supports+wasm-signext)<br>• Node 20-24, Cloudflare Workers, Vite, Bun<br>• Can be loaded as [pre-compressed](https://github.com/tadpole-labs/zstd-codec-lib/blob/main/packages/zstd-wasm-decoder/build.ts#L182) inline base64<br> or as separate .wasm for [CSP compliance](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_webassembly_execution)  |
| **Tested**           | Validated against reference vectors and browser wasm caveats                                                                                                                         |
| **Zero deps**        | No runtime dependencies (excluding build); compiled from source using latest clang & binaryen                                                                                        |

#### Implementation notes:
- Given the [limitations of wasm memory management](https://github.com/WebAssembly/design/issues/1397) and to achieve appropriate code size & performance, memory is allocated to a fixed-size [ring buffer](https://github.com/tadpole-labs/zstd-codec-lib/blob/main/packages/zstd-wasm-decoder/bin/zstd_wasm_full.c#L41), avoiding heap growth entirely. The buffer is [sufficiently sized](https://github.com/tadpole-labs/zstd-codec-lib/blob/main/packages/zstd-wasm-decoder/src/zstd-wasm.ts#L4) to handle the maximum memory required by level 19 compressed data.
- For use in browsers, the module is asynchronously compiled & cached at page load.

## Usage - (Client Side)
```typescript
import { decompress, ZstdDecompressionStream, decompressStream, createDecoder } 
from 'zstd-wasm-decoder'; // Default (Node/browser - automatically inferred)

import { ... } // For strict CSP policies (no unsafe-eval for WASM)
from 'zstd-wasm-decoder/external'; // .wasm fetched from same-origin

import { ... } // If you need the extra perf. (+30%) for +4kb in the browser
from 'zstd-wasm-decoder/perf' // or perf/external
                              // non-browser env uses perf. by default

import { ... }                
from 'zstd-wasm-decoder/cloudflare'; // for cloudflare workers
```
```typescript
// 1. Simple decompression (with optional dictionary)
const data: Uint8Array = await decompress(compressedData, { 
  dictionary: await (await fetch('/dict.bin')).arrayBuffer()
});
```
**Note:** In development mode, the inlined version is served for `/external` to avoid bundler issues (e.g., in Vite).
```typescript
// 2. Streaming API - fetch response
const stream: ReadableStream<string> = (await fetch('/file.zst')).body!
  .pipeThrough(new ZstdDecompressionStream())
  .pipeThrough(new TextDecoderStream());

// 3. Streaming API - with dictionary
const ds = new ZstdDecompressionStream({ 
  dictionary: await (await fetch('/dict.bin')).arrayBuffer()
});

// Alternatively
import { setupZstdDecoder } from 'zstd-wasm-decoder';
await setupZstdDecoder({ 
  dictionaries: ['/dict.bin'] // Accepts URLs
});
const ds = new ZstdDecompressionStream(); // Auto-detects dict from frame header

const ds: ReadableStream<Uint8Array> = blob.stream().pipeThrough(ds);
```
```typescript
// 4. Manual streaming (for chunked data)
const { buf, in_offset }: { buf: Uint8Array, in_offset: number } = await decompressStream(chunk, reset);

// 5. Reusable decoder instance
const decoder = await createDecoder();
const result1: Uint8Array = decoder.decompressSync(data1);
const result2: Uint8Array = decoder.decompressSync(data2);
```

### Important Considerations
- The default export is pre-minified & mangled, and notably, also tested against the full suite to make sure no broken invariants occur due to the transformations.
- Legacy ZSTD format is not supported, and the presence of magic bytes is expected; some libraries have this disabled by default.
- Consult [the reference](https://github.com/facebook/zstd/blob/448cd340879adc0ffe36ed1e26823ee2dcb3217b/lib/zstd_errors.h#L60) to interpret error codes, should any occur.
- **Do not** use the wasm module standalone (without js).
- **Do not** send any sensitive or cryptographic payloads over a continous, potentially long-running stream. Timing, uniformity and 'compressibility' of data streams are all factors that can compromise encryption.
<br><sub>
[Side-channel attacks](https://blog.cloudflare.com/ai-side-channel-attack-mitigated/) &nbsp;|&nbsp;
[CRIME](https://en.wikipedia.org/wiki/CRIME) &nbsp;|&nbsp;
[BREACH](https://breachattack.com/) &nbsp;|&nbsp;
[Lucky Thirteen](https://en.wikipedia.org/wiki/Lucky_Thirteen_attack)
</sub>

## Contributing
### Prerequisites

**macOS:**
```bash
brew install llvm binaryen pnpm zopfli
```

**Linux:**
```bash
sudo apt-get install clang lld binaryen zopfli
```

**Note:** macOS's default `/usr/bin/clang` is a symlink to Apple Clang 17, which lacks the linker 
required for WebAssembly builds. You must install the full LLVM toolchain from Homebrew, build from 
source, or download the binaries (as done by the [CI runner](https://github.com/tadpole-labs/zstd-codec-lib/blob/main/.github/workflows/build-setup.yml))

### Setup

1. **Clone and install dependencies:**
```bash
git clone --recursive https://github.com/tadpole-labs/zstd-codec-lib.git
cd zstd-codec-lib
pnpm install
```

2. **Configure LLVM path** (if not auto-detected):
```bash
# macOS with Homebrew:
export LLVM_DIR=/opt/homebrew/opt/llvm

# Linux:
export LLVM_DIR=/usr
```

3. **Verify toolchain:**
```bash
cd packages/zstd-wasm-decoder
make check-tools
```

### Development Workflow

```bash
# Full build (WASM + TypeScript)
pnpm run build:all

# Clean build
pnpm run clean:decoder
pnpm run build:all

# Run tests
pnpm test                    # All runtimes (Node + browsers + Bun)
pnpm run test:node           # Node.js only
pnpm run test:browsers       # Browser tests only
pnpm run test:bun            # Bun only

# Run benchmarks
pnpm run bench:full
```

## License

This package is dual-licensed under **Apache-2.0 OR MIT**

The underlying [zstd implementation](https://github.com/facebook/zstd?tab=License-1-ov-file) is licensed under **BSD-3-Clause**.