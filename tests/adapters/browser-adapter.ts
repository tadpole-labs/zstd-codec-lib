/**
 * Browser Test Adapter
 * 
 * Uses Playwright to run tests in browsers (Chromium, Firefox, WebKit).
 * This adapter tests the Web bundle (dist/zstd-wasm.js + zstd-decoder.wasm)
 * loaded via test-harness.html
 */

import { chromium, firefox, webkit, type Browser, type Page } from 'playwright';

interface BrowserAdapterOptions {
  browser: 'chromium' | 'firefox' | 'webkit';
}

export class BrowserAdapter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  
  constructor(private options: BrowserAdapterOptions) {}
  
  async init() {
    const browserType = {
      chromium,
      firefox,
      webkit,
    }[this.options.browser];
    
    this.browser = await browserType.launch({ headless: true });
    this.page = await this.browser.newPage();
    
    // Load the test harness HTML which loads the bundle
    await this.page.goto(`http://localhost:42069/bundles/test-harness.html`);
    
    // Wait for WASM to initialize
    await this.page.waitForFunction(() => {
      // @ts-ignore
      return window.ZstdWasm?.ready === true;
    }, { timeout: 10000 });
    
    console.log(`✅ ${this.options.browser} initialized`);
  }
  
  compress(data: Buffer | Uint8Array, opts = {}): Buffer {
    throw new Error('Compression not supported in browser (decoder-only)');
  }
  
  async decompress(data: Buffer | Uint8Array, opts: any = {}): Promise<Buffer> {
    if (!this.page) throw new Error('Browser not initialized');
    const base64 = Buffer.from(data).toString('base64');
    const serializedOpts: any = { ...opts };
    if (opts.dictionary) {
      serializedOpts.dictionaryBase64 = Buffer.from(opts.dictionary).toString('base64');
      delete serializedOpts.dictionary;
    }
    
    const resultBase64 = await this.page.evaluate(async ([dataBase64, options]) => {
      const binaryString = atob(dataBase64 as string);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Deserialize dictionary if present
      const decompressOpts: any = { ...options };
      if ((options as any).dictionaryBase64) {
        const dictBinaryString = atob((options as any).dictionaryBase64);
        const dictBytes = new Uint8Array(dictBinaryString.length);
        for (let i = 0; i < dictBinaryString.length; i++) {
          dictBytes[i] = dictBinaryString.charCodeAt(i);
        }
        decompressOpts.dictionary = dictBytes;
        delete decompressOpts.dictionaryBase64;
      }
      
      // @ts-ignore
      const decompressed = window.ZstdWasm.decompress(bytes, decompressOpts);
      let binaryStr = '';
      const chunkSize = 32768
      for (let i = 0; i < decompressed.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, decompressed.length);
        for (let j = i; j < end; j++) {
          binaryStr += String.fromCharCode(decompressed[j]);
        }
      }
      return btoa(binaryStr);
    }, [base64, serializedOpts]) as string;
    
    return Buffer.from(resultBase64, 'base64');
  }
  
  async decompressStream(data: Buffer | Uint8Array, isFirst = false, opts: any = {}): Promise<{ buf: Buffer; code: number; input_offset: number }> {
    if (!this.page) throw new Error('Browser not initialized');
    const base64 = Buffer.from(data).toString('base64');
    const serializedOpts: any = { ...opts };
    if (opts.dictionary) {
      serializedOpts.dictionaryBase64 = Buffer.from(opts.dictionary).toString('base64');
      delete serializedOpts.dictionary;
    }
    
    const result = await this.page.evaluate(async ([dataBase64, isFirstChunk, options]) => {
      const binaryString = atob(dataBase64 as string);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Deserialize dictionary if present
      const decompressOpts: any = { ...options };
      if ((options as any).dictionaryBase64) {
        const dictBinaryString = atob((options as any).dictionaryBase64);
        const dictBytes = new Uint8Array(dictBinaryString.length);
        for (let i = 0; i < dictBinaryString.length; i++) {
          dictBytes[i] = dictBinaryString.charCodeAt(i);
        }
        decompressOpts.dictionary = dictBytes;
        delete decompressOpts.dictionaryBase64;
      }
      
      // @ts-ignore
      const result = window.ZstdWasm.decompressStream(bytes, isFirstChunk, decompressOpts);
      let binaryStr = '';
      const chunkSize = 32768;
      for (let i = 0; i < result.buf.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, result.buf.length);
        for (let j = i; j < end; j++) {
          binaryStr += String.fromCharCode(result.buf[j]);
        }
      }
      
      return {
        buf: btoa(binaryStr),
        code: result.code,
        input_offset: result.input_offset
      };
    }, [base64, isFirst, serializedOpts]) as { buf: string; code: number; input_offset: number };
    
    return {
      buf: Buffer.from(result.buf, 'base64'),
      code: result.code,
      input_offset: result.input_offset
    };
  }
  
  async close() {
    await this.page?.close();
    await this.browser?.close();
  }
}

export async function createBrowserAdapter(
  browser: 'chromium' | 'firefox' | 'webkit'
): Promise<BrowserAdapter> {
  const adapter = new BrowserAdapter({ browser });
  await adapter.init();
  return adapter;
}

