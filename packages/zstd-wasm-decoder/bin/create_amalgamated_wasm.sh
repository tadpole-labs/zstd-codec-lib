#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ZSTD_SRC_ROOT="$SCRIPT_DIR/../../../vendor/zstd/lib"
FREESTANDING_SCRIPT="$SCRIPT_DIR/../../../vendor/zstd/contrib/freestanding_lib/freestanding.py"
COMBINE_SCRIPT="$SCRIPT_DIR/../../../vendor/zstd/build/single_file_libs/combine.py"
TEMP_LIB="$SCRIPT_DIR/temp_optimized_lib"

cd "$SCRIPT_DIR"
echo "Preprocessing zstd library with freestanding.py..."
python3 "$FREESTANDING_SCRIPT" \
  --source-lib "$ZSTD_SRC_ROOT" \
  --output-lib "$TEMP_LIB" \
  --zstd-deps "$ZSTD_SRC_ROOT/common/zstd_deps.h" \
  --mem "$ZSTD_SRC_ROOT/common/mem.h" \
  -DZSTD_LEGACY_MULTITHREADED_API=0 \
  -DZSTD_STATIC_LINKING_ONLY \
  -DHUF_STATIC_LINKING_ONLY \
  -DXXH_STATIC_LINKING_ONLY \
  -DZSTD_ENABLE_ASM_X86_64_BMI2=0 \
  -DZSTD_NO_UNUSED_FUNCTIONS \
  -DZSTD_LEGACY_SUPPORT=0 \
  -DFSE_STATIC_LINKING_ONLY \
  -DZSTD_TRACE=0 \
  -DZSTD_NO_TRACE \
  -DDEBUGLEVEL=0 \
  -DBACKTRACE_ENABLE=0 \
  -DZSTD_DISABLE_ASM=1 \
  -DZSTD_LIB_EXCLUDE_COMPRESSORS_GREEDY_AND_UP \
  -DZSTD_LIB_EXCLUDE_COMPRESSORS_DFAST_AND_UP \
  -DZSTD_LIB_DEPRECATED=0 \
  -DZSTD_LIB_COMPRESSION=0 \
  -DZSTD_LIB_DICTBUILDER=0 \
  -DZSTD_LIB_DECOMPRESSION \
  -DZSTDLIB_HIDDEN \
  -DZSTD_ADDRESS_SANITIZER=0 \
  -DZSTD_MEMORY_SANITIZER=0 \
  -DZSTD_DATAFLOW_SANITIZER=0 \
  -DZSTD_HAVE_WEAK_SYMBOLS=0 \
  -DHAVE_ZLIB=0 \
  -DHAVE_LZMA=0 \
  -DHAVE_LZ4=0 \
  -UZSTD_MULTITHREAD \
  -UZSTDERRORLIB_VISIBLE \
  -UZSTDERRORLIB_API \
  -DXXH_SIZE_OPT=0 \
  -D__wasm__ \
  -D__wasm_simd128__ \
  -D__LITTLE_ENDIAN__ \
  -DXXH_ACC_ALIGN=4 \
  -DXXH_NEON=4 \
  -DXXH_NO_PREFETCH \
  -D__BYTE_ORDER__=__ORDER_LITTLE_ENDIAN__ \
  -DMEM_FORCE_MEMORY_ACCESS=2 \
  -DH_FORCE_MEMORY_ACCESS=2 \
  -UZSTD_DLL_EXPORT \
  -DHUF_NEED_BMI2_FUNCTION=0 \
	-UZSTD_DLL_IMPORT \
  -DZSTD_DEPS_NEED_MALLOC \
  -DXXH_VECTOR \
  -U__cplusplus \
  -UFUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION

if [ $? -ne 0 ]; then
  echo "ERROR: freestanding.py failed"
  rm -rf "$TEMP_LIB"
  exit 1
fi

echo "Amalgamating with WASM wrapper..."
python3 "$COMBINE_SCRIPT" \
  -r "$TEMP_LIB" \
  -r "$SCRIPT_DIR/include" \
  -x legacy/zstd_legacy.h \
  -o zstd_wasm_amalgamated.c \
  zstd_wasm_full.c

if [ $? -ne 0 ]; then
  echo "ERROR: Amalgamation failed"
  rm -rf "$TEMP_LIB"
  exit 1
fi

rm -rf "$TEMP_LIB"

echo "✓ Successfully created zstd_wasm_amalgamated.c"
ls -lh zstd_wasm_amalgamated.c
