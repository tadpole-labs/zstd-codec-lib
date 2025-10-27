#include <stddef.h>
#include <stdlib.h>
#include "zstd.h"

#define WASM_EXPORT __attribute__((visibility("default")))

WASM_EXPORT
void* bmalloc(size_t size) {
    return malloc(size);
}

WASM_EXPORT
unsigned isError(size_t code) {
    return ZSTD_isError(code);
}

WASM_EXPORT
void* createDCtx(void) {
    return ZSTD_createDCtx();
}

WASM_EXPORT
void* createDict(const void* dict, size_t dictSize) {
    return ZSTD_createDDict(dict, dictSize);
}

WASM_EXPORT
size_t _decompressSync(void* dctx, void* dst, size_t dstCapacity, 
                                   const void* src, size_t srcSize, const void* ddict) {
    return ZSTD_decompress_usingDDict((ZSTD_DCtx*)dctx, dst, dstCapacity, src, srcSize, (const ZSTD_DDict*)ddict);
}

WASM_EXPORT
size_t decStream(void* dstream, void* outputPtr, void* inputPtr) {
    return ZSTD_decompressStream((ZSTD_DStream*)dstream, (ZSTD_outBuffer*)outputPtr, (ZSTD_inBuffer*)inputPtr);
}

WASM_EXPORT
size_t reset(void* dstream) {
    return ZSTD_DCtx_reset((ZSTD_DStream*)dstream, 1);
}

WASM_EXPORT
size_t refDict(void* dctx, const void* ddict) {
    return ZSTD_DCtx_refDDict((ZSTD_DCtx*)dctx, (const ZSTD_DDict*)ddict);
}

