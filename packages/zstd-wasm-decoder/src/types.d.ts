export interface WasmExports {
  memory: WebAssembly.Memory;
  _ZSTD_createDCtx(): number;
  _ZSTD_freeDCtx(dctx: number): number;
  _ZSTD_createDDict(dictPtr: number, dictSize: number): number;
  _ZSTD_freeDDict(ddict: number): number;
  _ZSTD_decompress_usingDDict(
    dctx: number,
    dstPtr: number,
    dstCapacity: number,
    srcPtr: number,
    srcSize: number,
    ddict: number
  ): number;
  _ZSTD_decompressStream(
    dctx: number,
    outputPtr: number,
    inputPtr: number
  ): number;
  _ZSTD_DCtx_reset(dctx: number, resetType: number): number;
  _ZSTD_DCtx_refDDict(dctx: number, ddict: number): number;
  _ZSTD_isError(code: number): number;
  wasm_malloc(size: number): number;
}

export interface DecoderOptions {
  dictionary?: Uint8Array | Buffer;
  maxSrcSize?: number;
  maxDstSize?: number;
}

export interface StreamResult {
  buf: Uint8Array;
  code: number;
  input_offset: number;
}

export interface ZstdDecoderInterface {
  init(wasmModule: WebAssembly.Module): Promise<ZstdDecoder>;
  decompressSync(compressedData: Uint8Array | Buffer, expectedSize?: number): Uint8Array;
  decompressStream(input: Uint8Array | Buffer, reset?: boolean): StreamResult;
  freeDCtx(dctx: number): number;
  freeDDict(ddict: number): number;
}

export declare class ZstdDecoder implements ZstdDecoderInterface {
  constructor(options?: DecoderOptions);
  init(wasmModule: WebAssembly.Module): Promise<ZstdDecoder>;
  decompressSync(compressedData: Uint8Array | Buffer, expectedSize?: number): Uint8Array;
  decompressStream(input: Uint8Array | Buffer, reset?: boolean): StreamResult;
  freeDCtx(dctx: number): number;
  freeDDict(ddict: number): number;
}
