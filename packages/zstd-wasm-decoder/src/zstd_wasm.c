#include <stddef.h>
#include <stdlib.h>
#include "zstd.h"

#define WASM_EXPORT __attribute__((visibility("default")))

WASM_EXPORT
void* wasm_malloc(size_t size) {
    return malloc(size);
}

WASM_EXPORT
void wasm_free(void* ptr) {
    free(ptr);
}

WASM_EXPORT
unsigned _ZSTD_isError(size_t code) {
    return ZSTD_isError(code);
}

WASM_EXPORT
void* _ZSTD_createDCtx(void) {
    return ZSTD_createDCtx();
}

WASM_EXPORT
size_t _ZSTD_freeDCtx(void* dctx) {
    return ZSTD_freeDCtx((ZSTD_DCtx*)dctx);
}

WASM_EXPORT
void* _ZSTD_createDDict(const void* dict, size_t dictSize) {
    return ZSTD_createDDict(dict, dictSize);
}

WASM_EXPORT
size_t _ZSTD_freeDDict(void* ddict) {
    return ZSTD_freeDDict((ZSTD_DDict*)ddict);
}

WASM_EXPORT
size_t _ZSTD_decompress_usingDDict(void* dctx, void* dst, size_t dstCapacity, 
                                   const void* src, size_t srcSize, const void* ddict) {
    return ZSTD_decompress_usingDDict((ZSTD_DCtx*)dctx, dst, dstCapacity, src, srcSize, (const ZSTD_DDict*)ddict);
}

WASM_EXPORT
size_t _ZSTD_decompressStream(void* dstream, void* outputPtr, void* inputPtr) {
    return ZSTD_decompressStream((ZSTD_DStream*)dstream, (ZSTD_outBuffer*)outputPtr, (ZSTD_inBuffer*)inputPtr);
}

WASM_EXPORT
size_t _ZSTD_DCtx_reset(void* dstream, int reset_directive) {
    return ZSTD_DCtx_reset((ZSTD_DStream*)dstream, reset_directive);
}

WASM_EXPORT
size_t _ZSTD_DCtx_refDDict(void* dctx, const void* ddict) {
    return ZSTD_DCtx_refDDict((ZSTD_DCtx*)dctx, (const ZSTD_DDict*)ddict);
}
