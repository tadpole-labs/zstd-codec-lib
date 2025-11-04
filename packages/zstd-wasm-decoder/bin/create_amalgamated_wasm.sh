#!/bin/sh

# Script to create fully amalgamated WASM decoder
# This combines zstd decoder library + WASM wrapper functions into one file

set -e

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Where to find the zstd sources (relative to script dir)
ZSTD_SRC_ROOT="$SCRIPT_DIR/../../../vendor/zstd/lib"
COMBINE_SCRIPT_DIR="$SCRIPT_DIR/../../../vendor/zstd/build/single_file_libs"

cd "$SCRIPT_DIR"

echo "Creating fully amalgamated WASM decoder..."

# Check if Python 3.8+ is available
if python3 -c 'import sys; assert sys.version_info >= (3,8)' 2>/dev/null; then
  echo "Using Python combine script..."
  python3 "$COMBINE_SCRIPT_DIR/combine.py" \
    -r "$ZSTD_SRC_ROOT" \
    -r "$SCRIPT_DIR/include" \
    -x legacy/zstd_legacy.h \
    -o zstd_wasm_amalgamated.c \
    zstd_wasm_full.c
else
  echo "Using shell combine script..."
  "$COMBINE_SCRIPT_DIR/combine.sh" \
    -r "$ZSTD_SRC_ROOT" \
    -r "$SCRIPT_DIR/include" \
    -x legacy/zstd_legacy.h \
    -o zstd_wasm_amalgamated.c \
    zstd_wasm_full.c
fi

# Check if combining worked
if [ $? -ne 0 ]; then
  echo "ERROR: Amalgamation failed"
  exit 1
fi

echo "✓ Successfully created zstd_wasm_amalgamated.c"
ls -lh zstd_wasm_amalgamated.c

