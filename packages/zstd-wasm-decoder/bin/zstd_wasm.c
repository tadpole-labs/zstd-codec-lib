#include <stddef.h>
#include <stdlib.h>
#include "zstd.h"

#define WASM_EXPORT __attribute__((visibility("default")))

static ZSTD_DCtx* dctx = NULL;

WASM_EXPORT
void* bmalloc(size_t size) {
    return malloc(size);
}

WASM_EXPORT
void createDCtx(void) {
    dctx = ZSTD_createDCtx();
}

WASM_EXPORT
void* createDict(const void* dict, size_t dictSize) {
    return ZSTD_createDDict(dict, dictSize);
}

WASM_EXPORT
size_t decompressSync(void* dst, size_t dstCapacity, 
                      const void* src, size_t srcSize, const void* ddict) {
    return ZSTD_decompress_usingDDict(dctx, dst, dstCapacity, src, srcSize, (const ZSTD_DDict*)ddict);
}

WASM_EXPORT
size_t decStream(void* outputPtr, void* inputPtr) {
    return ZSTD_decompressStream(dctx, (ZSTD_outBuffer*)outputPtr, (ZSTD_inBuffer*)inputPtr);
}

WASM_EXPORT
void reset(void) {
    ZSTD_DCtx_reset(dctx, 1);
}

WASM_EXPORT
void refDict(const void* ddict) {
    ZSTD_DCtx_refDDict(dctx, (const ZSTD_DDict*)ddict);
}

