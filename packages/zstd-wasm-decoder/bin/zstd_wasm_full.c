


/**
 * \file zstd_wasm_full.c
 * Fully amalgamated Zstandard WASM decoder with wrapper functions.
 *
 * This file combines:
 * - All necessary compiler defines from Makefile
 * - Minimal libc implementation
 * - Zstandard decoder library (zstddeclib)
 * - WASM wrapper functions
 *
 * Generate using:
 * \code
 *   cd ../../vendor/zstd/build/single_file_libs
 *   python3 combine.py -r ../../lib -x legacy/zstd_legacy.h \
 *     -o ../../../../packages/zstd-wasm-decoder/bin/zstd_wasm_full.c \
 *     ../../../../packages/zstd-wasm-decoder/bin/zstd_wasm_full-in.c
 * \endcode
 */

/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under both the BSD-style license (found in the
 * LICENSE file in the root directory of this source tree) and the GPLv2 (found
 * in the COPYING file in the root directory of this source tree).
 * You may select, at your option, one of the above-listed licenses.
 */

/*
 * ============================================================================
 * PART 1: Compiler Defines (from Makefile CFLAGS)
 * ============================================================================
 */

/* Debug and trace settings */
#define DEBUGLEVEL 0
#define ZSTD_NO_TRACE
#define ZSTD_TRACE 0
#define BACKTRACE_ENABLE 0

/* Memory module settings */
#define MEM_MODULE

/* xxHash configuration */
#undef  XXH_NAMESPACE
#define XXH_NAMESPACE ZSTD_
#undef  XXH_PRIVATE_API
#define XXH_PRIVATE_API
#undef  XXH_INLINE_ALL
#define XXH_INLINE_ALL

/* Feature exclusions - decoder only build */
#define ZSTD_LIB_DECOMPRESSION
#define ZSTD_LIB_COMPRESSION 0
#define ZSTD_LIB_DICTBUILDER 0
#define ZSTD_LIB_DEPRECATED 0
#define ZSTD_LIB_EXCLUDE_COMPRESSORS_GREEDY_AND_UP
#define ZSTD_LIB_EXCLUDE_COMPRESSORS_DFAST_AND_UP

/* Legacy support */
#define ZSTD_LEGACY_SUPPORT 0
#define ZSTD_LEGACY_MULTITHREADED_API 0

/* External dependencies */
#define HAVE_ZLIB 0
#define HAVE_LZMA 0
#define HAVE_LZ4 0

/* Assembly and CPU features */
#define ZSTD_DISABLE_ASM 1
#define ZSTD_ENABLE_ASM_X86_64_BMI2 0
#define DYNAMIC_BMI2 0
#define STATIC_BMI2 0

/* Multithreading */
#undef ZSTD_MULTITHREAD

/* Optimization settings */
#define HUF_FORCE_DECOMPRESS_X2
#define ZSTD_FORCE_DECOMPRESS_SEQUENCES_SHORT
#define ZSTD_NO_UNUSED_FUNCTIONS
#define ZSTD_STRIP_ERROR_STRINGS

#include "stddef.h"
#include "stdint.h"

#define _size_t_bytes sizeof(size_t)

size_t memory_size(void);

#define WASM_EXPORT __attribute__((visibility("default")))


#define STATBUF_BASE 8196
#define STATBUF_IN  ((ZSTD_inBuffer*)STATBUF_BASE)
#define STATBUF_OUT ((ZSTD_outBuffer*)(STATBUF_BASE+12))
#define DCTX_ADDR 8220

//ZSTD_DCtx* const dctx = (ZSTD_DCtx*) workspace;

// Hard-code the pointer to the location in memory where heap cursor will be stored
#define HEAP_TAIL_PTR ((size_t*)8192) 

size_t memory_size(void) {
    return __builtin_wasm_memory_size(0);
}

// Bump only. Reset in JS via prune_buf
WASM_EXPORT
void* malloc(size_t size) {
    size_t ptr = *HEAP_TAIL_PTR;
    *HEAP_TAIL_PTR = (*HEAP_TAIL_PTR + size);
    return (void*)ptr;
}

void free(void* ptr) {
    (void)ptr; // no-op
}

WASM_EXPORT
void prune_buf(size_t new_size) {
    *HEAP_TAIL_PTR = new_size;
}

void* calloc(size_t nmemb, size_t size) {
    size_t total = nmemb * size;
    void* ptr = malloc(total);
    if (ptr) {
        __builtin_memset(ptr, 0, total);
    }
    return ptr;
}

void* memcpy(void* dest, const void* src, size_t n) {
    return __builtin_memcpy(dest, src, n);
}

void* memset(void* s, int c, size_t n) {
    return __builtin_memset(s, c, n);
}

void* memmove(void* dest, const void* src, size_t n) {
    return __builtin_memmove(dest, src, n);
}

// 97312 bytes of padding to push rodata to higher offset
__attribute__((section(".rodata.A")))
static char __pad[97312];

#define ZSTD_DEPS_NEED_MALLOC
#include "common/zstd_deps.h"

#include "common/entropy_common.c"
#include "common/fse_decompress.c"
#include "common/zstd_common.c"

#include "decompress/huf_decompress.c"
#include "decompress/zstd_ddict.c"


WASM_EXPORT
void* A(void) {
    return __pad;
}

#include "decompress/zstd_decompress.c"
#include "decompress/zstd_decompress_block.c"

static struct ZSTD_DCtx_s* const dctx = (struct ZSTD_DCtx_s*)DCTX_ADDR;

/*
    Inlined

    ZSTD_DCtx_resetParameters
*/
static void zstd_reset(ZSTD_DCtx* dctx)
{
    dctx->streamStage = zdss_init;
    dctx->noForwardProgress = 0;
    dctx->isFrameDecompression = 1;
    dctx->format = ZSTD_f_zstd1;
    dctx->maxWindowSize = ZSTD_MAXWINDOWSIZE_DEFAULT;
    dctx->outBufferMode = ZSTD_bm_buffered;
    dctx->forceIgnoreChecksum = ZSTD_d_validateChecksum;
    dctx->refMultipleDDicts = ZSTD_rmd_refSingleDDict;
    dctx->disableHufAsm = 0;
    dctx->maxBlockSizeParam = 0;
}

/* 
    In wasm, there is two possible memory layouts that we get out-of-the box
    Data   <<<      Stack   ---     Heap    >>>
           growing down
           potentially into data
    or
    Stack           Data    ---     Heap    >>>

    Attempting to achieve
         Static Mem
    Stack           Heap    ---     Heap    >>>

    Does not seem to be trivial.

    But why do so?

    0.) Ring buf is the most efficient & memory friendly way of decompressing data.
    1.) We have to put the stack down. And the growing & periodically resetted ring buf higher up.
        Having the in & out buf pointer structs + heap cursor + dctx ptr in one place & at low offsets
        is desired as the only remaining pointers to manage / reason about, are src & dst buf.
    2.) This also means that we can go less back and forth between the WASM & JS world. (overhead)
        We don't ask for malloc and pointers, we just write data to predictable areas of memory,
        let zstd do its job, and flush to js.
        And neither, do we have to give up full control to the wasm module.
    3.) Cache locality: fitting stack + in/out buf structs + heap ptr + dctx ptr into one cache line.
    4.) Smaller pointers / constants that get inlined throughout the code, reducing codesize
        (in both JS & wasm)
    
    Now the issue: The linker script / order of the data section seems to be ignored.
    
    .rodata containing 2208 bytes of constants for the decompression context is being put right
    after the stack.

    To get to the following layout.
                            
                             4b srcPtr         4b srcPtr
                                4b size            4b size     
                                   4b pos              4b pos                          Dctx
    Stack        Heap        ZSTD_inBuffer*    ZSTD_outBuffer*          ptr            95804b       Heap
    0 <--- 8192         --->               --->                --->   ZSTD_DCtx*       --->         Data
                Cursor
                        8196               8208                8220               8224        104028 
    
    We have to put.

    __attribute__((section(".rodata.A")))
    static char __pad[97312];

    before

    * include common/zstd_deps.h

    and

    WASM_EXPORT
    void* A(void) {
        return __pad;
    }

    before

    *include decompress/zstd_decompress
    *include decompress/zstd_decompress_block
    
    which is just stub that does absolutely nothing, but we have to export though so its
    not compiled away

    So far, this seems the be only possible way to control the order.

    this puts the actual constants at 8192 + 97312 = 105504
    with 1476b space between dctx & .rodata

    The statically allocated dctx consumes about 96k bytes. The final number is rounded up,
    such that the constants for the access to those static data throughout the bytecode are
    better aligned & compressible.
*/


/* 
    Inlined

    ZSTD_createDCtx_internal
    ZSTD_initDCtx_internal
*/
WASM_EXPORT
void createDCtx(void) {
    prune_buf(DCTX_ADDR);
    dctx->customMem = ZSTD_defaultCMem;
    dctx->staticSize  = 0;
    dctx->ddict       = NULL;
    dctx->ddictLocal  = NULL;
    dctx->dictEnd     = NULL;
    dctx->ddictIsCold = 0;
    dctx->dictUses = ZSTD_dont_use;
    dctx->inBuff      = NULL;
    dctx->inBuffSize  = 0;
    dctx->outBuffSize = 0;
    dctx->oversizedDuration = 0;
    dctx->ddictSet = NULL;
    zstd_reset(dctx);
    prune_buf(196608);
}


/*

WASM_EXPORT
void createDCtx(void) {
    prune_buf(DCTX_ADDR);
    dctx->customMem = ZSTD_defaultCMem;
    dctx->staticSize  = 0;
    dctx->ddict       = NULL;
    dctx->ddictLocal  = NULL;
    dctx->dictEnd     = NULL;
    dctx->ddictIsCold = 0;
    dctx->dictUses = ZSTD_dont_use;
    dctx->inBuff      = NULL;
    dctx->inBuffSize  = 0;
    dctx->outBuffSize = 0;
    dctx->streamStage = zdss_init;
    dctx->noForwardProgress = 0;
    dctx->oversizedDuration = 0;
    dctx->isFrameDecompression = 1;
    dctx->ddictSet = NULL;
    dctx->format = ZSTD_f_zstd1;
    dctx->maxWindowSize = ZSTD_MAXWINDOWSIZE_DEFAULT;
    dctx->outBufferMode = ZSTD_bm_buffered;
    dctx->forceIgnoreChecksum = ZSTD_d_validateChecksum;
    dctx->refMultipleDDicts = ZSTD_rmd_refSingleDDict;
    dctx->disableHufAsm = 0;
    dctx->maxBlockSizeParam = 0;
    prune_buf(196608);
}

static void ZSTD_DCtx_resetParameters(ZSTD_DCtx* dctx)
{
    assert(dctx->streamStage == zdss_init);
    dctx->format = ZSTD_f_zstd1;
    dctx->maxWindowSize = ZSTD_MAXWINDOWSIZE_DEFAULT;
    dctx->outBufferMode = ZSTD_bm_buffered;
    dctx->forceIgnoreChecksum = ZSTD_d_validateChecksum;
    dctx->refMultipleDDicts = ZSTD_rmd_refSingleDDict;
    dctx->disableHufAsm = 0;
    dctx->maxBlockSizeParam = 0;
}
WASM_EXPORT
void createDCtx(void) {
    prune_buf(DCTX_ADDR);
    dctx->customMem = ZSTD_defaultCMem;
    ZSTD_initDCtx_internal(dctx);
    prune_buf(196608);
}

*/


/*
    Inlined 
    ZSTD_createDDict_advanced
    ZSTD_initDDict_internal
    
    Without malloc calls, and other operations & checks that we already do from js
*/
WASM_EXPORT
void* createDict(const void* dict, size_t dictSize) {
    ZSTD_customMem const customMem = { NULL, NULL, NULL };
    ZSTD_DDict* const ddict = (ZSTD_DDict*) malloc(sizeof(ZSTD_DDict));
    ddict->cMem = customMem;
    ddict->dictSize = dictSize;
    ddict->entropy.hufTable[0] = (HUF_DTable)((ZSTD_HUFFDTABLE_CAPACITY_LOG)*0x1000001);


    ddict->dictBuffer = dict;
    ddict->dictContent = dict;
    //ZSTD_memcpy(internalBuffer, dict, dictSize);

    ddict->dictID = 0;
    ddict->entropyPresent = 0;
    U32 const magic = MEM_readLE32(ddict->dictContent);
    if (magic == ZSTD_MAGIC_DICTIONARY) {
        ddict->dictID = MEM_readLE32((const char*)ddict->dictContent + ZSTD_FRAMEIDSIZE);
        ZSTD_loadDEntropy(
            &ddict->entropy, ddict->dictContent, ddict->dictSize);
        ddict->entropyPresent = 1;
    }
}

/*
    Inlined    

    ZSTD_decompressStream(ZSTD_DStream* zds, ZSTD_outBuffer* output, ZSTD_inBuffer* input)
    
    Removed static dctx check branch
*/
WASM_EXPORT
size_t decStream(void) {
    ZSTD_DStream* zds = dctx;
    ZSTD_inBuffer* input = STATBUF_IN;
    ZSTD_outBuffer* output = STATBUF_OUT;
    const char* const src = (const char*)input->src;
    const char* const istart = input->pos != 0 ? src + input->pos : src;
    const char* const iend = input->size != 0 ? src + input->size : src;
    const char* ip = istart;
    char* const dst = (char*)output->dst;
    char* const ostart = output->pos != 0 ? dst + output->pos : dst;
    char* const oend = output->size != 0 ? dst + output->size : dst;
    char* op = ostart;
    U32 someMoreWork = 1;
    assert(zds != NULL);
    RETURN_ERROR_IF(
        input->pos > input->size,
        srcSize_wrong,
        "forbidden. in: pos: %u   vs size: %u",
        (U32)input->pos, (U32)input->size);
    RETURN_ERROR_IF(
        output->pos > output->size,
        dstSize_tooSmall,
        "forbidden. out: pos: %u   vs size: %u",
        (U32)output->pos, (U32)output->size);
    FORWARD_IF_ERROR(ZSTD_checkOutBuffer(zds, output), "");

    while (someMoreWork) {
        switch(zds->streamStage)
        {
        case zdss_init :
            zds->streamStage = zdss_loadHeader;
            zds->lhSize = zds->inPos = zds->outStart = zds->outEnd = 0;
            zds->hostageByte = 0;
            zds->expectedOutBuffer = *output;
            ZSTD_FALLTHROUGH;

        case zdss_loadHeader :
            {   size_t const hSize = ZSTD_getFrameHeader_advanced(&zds->fParams, zds->headerBuffer, zds->lhSize, zds->format);
                if (zds->refMultipleDDicts && zds->ddictSet) {
                    ZSTD_DCtx_selectFrameDDict(zds);
                }
                if (ZSTD_isError(hSize)) {
                    return hSize;   /* error */
                }
                if (hSize != 0) {   /* need more input */
                    size_t const toLoad = hSize - zds->lhSize;   /* if hSize!=0, hSize > zds->lhSize */
                    size_t const remainingInput = (size_t)(iend-ip);
                    assert(iend >= ip);
                    if (toLoad > remainingInput) {   /* not enough input to load full header */
                        if (remainingInput > 0) {
                            ZSTD_memcpy(zds->headerBuffer + zds->lhSize, ip, remainingInput);
                            zds->lhSize += remainingInput;
                        }
                        input->pos = input->size;
                        /* check first few bytes */
                        FORWARD_IF_ERROR(
                            ZSTD_getFrameHeader_advanced(&zds->fParams, zds->headerBuffer, zds->lhSize, zds->format),
                            "First few bytes detected incorrect" );
                        /* return hint input size */
                        return (MAX((size_t)ZSTD_FRAMEHEADERSIZE_MIN(zds->format), hSize) - zds->lhSize) + ZSTD_blockHeaderSize;   /* remaining header bytes + next block header */
                    }
                    assert(ip != NULL);
                    ZSTD_memcpy(zds->headerBuffer + zds->lhSize, ip, toLoad); zds->lhSize = hSize; ip += toLoad;
                    break;
            }   }

            /* check for single-pass mode opportunity */
            if (zds->fParams.frameContentSize != ZSTD_CONTENTSIZE_UNKNOWN
                && zds->fParams.frameType != ZSTD_skippableFrame
                && (U64)(size_t)(oend-op) >= zds->fParams.frameContentSize) {
                size_t const cSize = ZSTD_findFrameCompressedSize_advanced(istart, (size_t)(iend-istart), zds->format);
                if (cSize <= (size_t)(iend-istart)) {
                    /* shortcut : using single-pass mode */
                    size_t const decompressedSize = ZSTD_decompress_usingDDict(zds, op, (size_t)(oend-op), istart, cSize, ZSTD_getDDict(zds));
                    if (ZSTD_isError(decompressedSize)) return decompressedSize;
                    assert(istart != NULL);
                    ip = istart + cSize;
                    op = op ? op + decompressedSize : op; /* can occur if frameContentSize = 0 (empty frame) */
                    zds->expected = 0;
                    zds->streamStage = zdss_init;
                    someMoreWork = 0;
                    break;
            }   }

            /* Check output buffer is large enough for ZSTD_odm_stable. */
            if (zds->outBufferMode == ZSTD_bm_stable
                && zds->fParams.frameType != ZSTD_skippableFrame
                && zds->fParams.frameContentSize != ZSTD_CONTENTSIZE_UNKNOWN
                && (U64)(size_t)(oend-op) < zds->fParams.frameContentSize) {
                RETURN_ERROR(dstSize_tooSmall, "ZSTD_obm_stable passed but ZSTD_outBuffer is too small");
            }

            /* Consume header (see ZSTDds_decodeFrameHeader) */
            FORWARD_IF_ERROR(ZSTD_decompressBegin_usingDDict(zds, ZSTD_getDDict(zds)), "");

            if (zds->format == ZSTD_f_zstd1
                && (MEM_readLE32(zds->headerBuffer) & ZSTD_MAGIC_SKIPPABLE_MASK) == ZSTD_MAGIC_SKIPPABLE_START) {  /* skippable frame */
                zds->expected = MEM_readLE32(zds->headerBuffer + ZSTD_FRAMEIDSIZE);
                zds->stage = ZSTDds_skipFrame;
            } else {
                FORWARD_IF_ERROR(ZSTD_decodeFrameHeader(zds, zds->headerBuffer, zds->lhSize), "");
                zds->expected = ZSTD_blockHeaderSize;
                zds->stage = ZSTDds_decodeBlockHeader;
            }

            /* control buffer memory usage */
            zds->fParams.windowSize = MAX(zds->fParams.windowSize, 1U << ZSTD_WINDOWLOG_ABSOLUTEMIN);
            RETURN_ERROR_IF(zds->fParams.windowSize > zds->maxWindowSize,
                            frameParameter_windowTooLarge, "");
            if (zds->maxBlockSizeParam != 0)
                zds->fParams.blockSizeMax = MIN(zds->fParams.blockSizeMax, (unsigned)zds->maxBlockSizeParam);

            /* Adapt buffer sizes to frame header instructions */
            {   size_t const neededInBuffSize = MAX(zds->fParams.blockSizeMax, 4 /* frame checksum */);
                size_t const neededOutBuffSize = zds->outBufferMode == ZSTD_bm_buffered
                        ? ZSTD_decodingBufferSize_internal(zds->fParams.windowSize, zds->fParams.frameContentSize, zds->fParams.blockSizeMax)
                        : 0;

                ZSTD_DCtx_updateOversizedDuration(zds, neededInBuffSize, neededOutBuffSize);

                {   int const tooSmall = (zds->inBuffSize < neededInBuffSize) || (zds->outBuffSize < neededOutBuffSize);
                    int const tooLarge = ZSTD_DCtx_isOversizedTooLong(zds);

                    if (tooSmall || tooLarge) {
                        size_t const bufferSize = neededInBuffSize + neededOutBuffSize;
                        DEBUGLOG(4, "inBuff  : from %u to %u",
                                    (U32)zds->inBuffSize, (U32)neededInBuffSize);
                        DEBUGLOG(4, "outBuff : from %u to %u",
                                    (U32)zds->outBuffSize, (U32)neededOutBuffSize);
                        ZSTD_customFree(zds->inBuff, zds->customMem);
                        zds->inBuffSize = 0;
                        zds->outBuffSize = 0;
                        zds->inBuff = (char*)ZSTD_customMalloc(bufferSize, zds->customMem);
                        RETURN_ERROR_IF(zds->inBuff == NULL, memory_allocation, "");
                        zds->inBuffSize = neededInBuffSize;
                        zds->outBuff = zds->inBuff + zds->inBuffSize;
                        zds->outBuffSize = neededOutBuffSize;
            }   }   }
            zds->streamStage = zdss_read;
            ZSTD_FALLTHROUGH;

        case zdss_read:
            {   size_t const neededInSize = ZSTD_nextSrcSizeToDecompressWithInputSize(zds, (size_t)(iend - ip));
                if (neededInSize==0) {  /* end of frame */
                    zds->streamStage = zdss_init;
                    someMoreWork = 0;
                    break;
                }
                if ((size_t)(iend-ip) >= neededInSize) {  /* decode directly from src */
                    FORWARD_IF_ERROR(ZSTD_decompressContinueStream(zds, &op, oend, ip, neededInSize), "");
                    assert(ip != NULL);
                    ip += neededInSize;
                    /* Function modifies the stage so we must break */
                    break;
            }   }
            if (ip==iend) { someMoreWork = 0; break; }   /* no more input */
            zds->streamStage = zdss_load;
            ZSTD_FALLTHROUGH;

        case zdss_load:
            {   size_t const neededInSize = ZSTD_nextSrcSizeToDecompress(zds);
                size_t const toLoad = neededInSize - zds->inPos;
                int const isSkipFrame = ZSTD_isSkipFrame(zds);
                size_t loadedSize;
                /* At this point we shouldn't be decompressing a block that we can stream. */
                assert(neededInSize == ZSTD_nextSrcSizeToDecompressWithInputSize(zds, (size_t)(iend - ip)));
                if (isSkipFrame) {
                    loadedSize = MIN(toLoad, (size_t)(iend-ip));
                } else {
                    RETURN_ERROR_IF(toLoad > zds->inBuffSize - zds->inPos,
                                    corruption_detected,
                                    "should never happen");
                    loadedSize = ZSTD_limitCopy(zds->inBuff + zds->inPos, toLoad, ip, (size_t)(iend-ip));
                }
                if (loadedSize != 0) {
                    /* ip may be NULL */
                    ip += loadedSize;
                    zds->inPos += loadedSize;
                }
                if (loadedSize < toLoad) { someMoreWork = 0; break; }   /* not enough input, wait for more */

                /* decode loaded input */
                zds->inPos = 0;   /* input is consumed */
                FORWARD_IF_ERROR(ZSTD_decompressContinueStream(zds, &op, oend, zds->inBuff, neededInSize), "");
                /* Function modifies the stage so we must break */
                break;
            }
        case zdss_flush:
            {
                size_t const toFlushSize = zds->outEnd - zds->outStart;
                size_t const flushedSize = ZSTD_limitCopy(op, (size_t)(oend-op), zds->outBuff + zds->outStart, toFlushSize);

                op = op ? op + flushedSize : op;

                zds->outStart += flushedSize;
                if (flushedSize == toFlushSize) {  /* flush completed */
                    zds->streamStage = zdss_read;
                    if ( (zds->outBuffSize < zds->fParams.frameContentSize)
                        && (zds->outStart + zds->fParams.blockSizeMax > zds->outBuffSize) ) {
                        DEBUGLOG(5, "restart filling outBuff from beginning (left:%i, needed:%u)",
                                (int)(zds->outBuffSize - zds->outStart),
                                (U32)zds->fParams.blockSizeMax);
                        zds->outStart = zds->outEnd = 0;
                    }
                    break;
            }   }
            /* cannot complete flush */
            someMoreWork = 0;
            break;

        default:
            assert(0);    /* impossible */
            RETURN_ERROR(GENERIC, "impossible to reach");   /* some compilers require default to do something */
    }   }

    /* result */
    input->pos = (size_t)(ip - (const char*)(input->src));
    output->pos = (size_t)(op - (char*)(output->dst));

    /* Update the expected output buffer for ZSTD_obm_stable. */
    zds->expectedOutBuffer = *output;

    if ((ip==istart) && (op==ostart)) {  /* no forward progress */
        zds->noForwardProgress ++;
        if (zds->noForwardProgress >= ZSTD_NO_FORWARD_PROGRESS_MAX) {
            RETURN_ERROR_IF(op==oend, noForwardProgress_destFull, "");
            RETURN_ERROR_IF(ip==iend, noForwardProgress_inputEmpty, "");
            assert(0);
        }
    } else {
        zds->noForwardProgress = 0;
    }
    {   size_t nextSrcSizeHint = ZSTD_nextSrcSizeToDecompress(zds);
        if (!nextSrcSizeHint) {   /* frame fully decoded */
            if (zds->outEnd == zds->outStart) {  /* output fully flushed */
                if (zds->hostageByte) {
                    if (input->pos >= input->size) {
                        /* can't release hostage (not present) */
                        zds->streamStage = zdss_read;
                        return 1;
                    }
                    input->pos++;  /* release hostage */
                }   /* zds->hostageByte */
                return 0;
            }  /* zds->outEnd == zds->outStart */
            if (!zds->hostageByte) { /* output not fully flushed; keep last byte as hostage; will be released when all output is flushed */
                input->pos--;   /* note : pos > 0, otherwise, impossible to finish reading last block */
                zds->hostageByte=1;
            }
            return 1;
        }  /* nextSrcSizeHint==0 */
        nextSrcSizeHint += ZSTD_blockHeaderSize * (ZSTD_nextInputType(zds) == ZSTDnit_block);   /* preload header of next block */
        assert(zds->inPos <= nextSrcSizeHint);
        nextSrcSizeHint -= zds->inPos;   /* part already loaded*/
        return nextSrcSizeHint;
    }
}

WASM_EXPORT
size_t decompressSync(void* dst, size_t dstCapacity, 
                      const void* src, size_t srcSize, const void* ddict) {
    return ZSTD_decompress_usingDDict(dctx, dst, dstCapacity, src, srcSize, (const ZSTD_DDict*)ddict);
}

WASM_EXPORT
void reset(void) {
    zstd_reset(dctx);
}

WASM_EXPORT
void refDict(const void* ddict) {
    dctx->ddictLocal = NULL;
    dctx->ddict = NULL;
    dctx->dictUses = ZSTD_dont_use;
    if (ddict) {
        dctx->ddict = ddict;
        dctx->dictUses = ZSTD_use_indefinitely;
    }
}
