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
  -UZSTD_LEGACY_SUPPORT \
  -DZSTD_STATIC_LINKING_ONLY \
  -DMEM_FORCE_MEMORY_ACCESS=2 \
  -DZSTD_DEPS_NEED_MALLOC

if [ $? -ne 0 ]; then
  echo "ERROR: freestanding.py failed"
  rm -rf "$TEMP_LIB"
  exit 1
fi

echo "Amalgamating with WASM wrapper..."
python3 "$COMBINE_SCRIPT" \
  -r "$TEMP_LIB" \
  -r "$SCRIPT_DIR/include" \
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
