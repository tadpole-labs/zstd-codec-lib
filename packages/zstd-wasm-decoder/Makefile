# Build configuration - adjust these paths as needed
# Set LLVM_DIR as an environment variable for your platform:
#   MacOS (Homebrew):  export LLVM_DIR=/opt/homebrew/opt/llvm
#   Linux:             export LLVM_DIR=/usr (or /usr/local)
#   CI/Custom:         export LLVM_DIR=$HOME/llvm-21

# Try to auto-detect LLVM location if not set
ifeq ($(LLVM_DIR),)
    ifneq ($(wildcard /opt/homebrew/opt/llvm/bin/clang),)
        LLVM_DIR := /opt/homebrew/opt/llvm
    else ifneq ($(wildcard /usr/local/bin/clang),)
        LLVM_DIR := /usr/local
    else ifneq ($(wildcard /usr/bin/clang),)
        LLVM_DIR := /usr
    else
        $(error LLVM_DIR not set and clang not found. Please set LLVM_DIR environment variable)
    endif
endif

CLANG = $(LLVM_DIR)/bin/clang

EXPORTS = bmalloc prune_buf \
          createDCtx \
          createDict decompressSync \
          decStream \
          reset refDict

BIN_DIR = bin
SOURCES = $(BIN_DIR)/minimal_libc.c $(BIN_DIR)/zstd_wasm.c $(BIN_DIR)/zstddeclib.c
OUTPUT_DIR = build
OUTPUT = $(OUTPUT_DIR)/zstd.wasm
OUTPUT_PERF = $(OUTPUT_DIR)/zstd-perf.wasm

CFLAGS = --target=wasm32-unknown-unknown

# 8kb stack sufficient for a lightweight decoder only zstd build
CFLAGS += -z stack-size=8192
CFLAGS += -nostdlib
CFLAGS += -I$(BIN_DIR)/include -I$(BIN_DIR) -I../../vendor/zstd/lib
CFLAGS += -ffreestanding
CFLAGS += -msimd128
CFLAGS += -mrelaxed-simd
CFLAGS += -msign-ext
CFLAGS += -mextended-const
CFLAGS += -mmultivalue
CFLAGS += -mmutable-globals
CFLAGS += -mtail-call
CFLAGS += -mno-atomics

CFLAGS += -mcpu=generic
CFLAGS += -flto -DNDEBUG -g0
CFLAGS += -fno-stack-protector -fomit-frame-pointer -fno-ident -fno-trapping-math
CFLAGS += -ffunction-sections -fdata-sections
CFLAGS += -mbulk-memory
CFLAGS += -mbulk-memory-opt

CFLAGS += -fno-math-errno
CFLAGS += -fmerge-all-constants
CFLAGS += -fno-strict-aliasing

# Decoder only build
CFLAGS += -DZSTD_LIB_EXCLUDE_COMPRESSORS_GREEDY_AND_UP
CFLAGS += -DZSTD_LIB_EXCLUDE_COMPRESSORS_DFAST_AND_UP

# Best bang for the byte
CFLAGS += -DHUF_FORCE_DECOMPRESS_X2
CFLAGS += -DZSTD_FORCE_DECOMPRESS_SEQUENCES_SHORT

# Needed for SIMD
# CFLAGS += -DZSTD_NO_INTRINSICS
CFLAGS += -DZSTD_NO_UNUSED_FUNCTIONS
CFLAGS += -DZSTD_LIB_DEPRECATED=0
CFLAGS += -DBACKTRACE_ENABLE=0
CFLAGS += -DDYNAMIC_BMI2=0
CFLAGS += -DSTATIC_BMI2=0

CFLAGS += -DZSTD_LEGACY_MULTITHREADED_API=0
CFLAGS += -DZSTD_NO_TRACE
CFLAGS += -DZSTD_TRACE=0
CFLAGS += -DHAVE_ZLIB=0
CFLAGS += -DHAVE_LZMA=0
CFLAGS += -DHAVE_LZ4=0
CFLAGS += -DZSTD_LEGACY_SUPPORT=0

CFLAGS += -Wall -Wextra -Wcast-qual -Wcast-align -Wshadow
CFLAGS += -Wstrict-aliasing=1 -Wstrict-prototypes -Wundef
CFLAGS += -Wpointer-arith -Wformat=2 -Wwrite-strings
CFLAGS += -Wredundant-decls -Wno-unused-parameter

CFLAGS += -DZSTD_LIB_DECOMPRESSION
CFLAGS += -UZSTD_MULTITHREAD
CFLAGS += -DZSTD_STATIC_LINKING_ONLY
CFLAGS += -DZSTD_LIB_DICTBUILDER=0
CFLAGS += -DZSTD_LIB_COMPRESSION=0
CFLAGS += -DZSTD_LIB_DEPRECATED=0

CFLAGS_PERF += -mllvm -polly
CFLAGS_PERF += -mllvm -polly-position=before-vectorizer
CFLAGS_PERF += -mllvm -polly-vectorizer=stripmine
CFLAGS_PERF += -fvectorize
CFLAGS_PERF += -fslp-vectorize

CFLAGS_BASE += -fno-math-errno
CFLAGS_BASE += -fmerge-all-constants
CFLAGS_BASE += -fno-strict-aliasing

# Size-optimized build flags (zstd.wasm)
# -Oz yields the smallest binary at the cost of a 30%-40% perf hit
CFLAGS_SIZE = $(CFLAGS)
CFLAGS_SIZE += -Oz
CFLAGS_SIZE += -DZSTD_LIB_MINIFY
CFLAGS_SIZE += -DZSTD_NO_INLINE

# Performance-optimized build flags (zstd-perf.wasm)
# -Os yields the highest performance
CFLAGS_PERF = $(CFLAGS)
CFLAGS_PERF += -Os

# createCCtx is the entry
LDFLAGS = -Wl,--no-entry
LDFLAGS += -Wl,--allow-undefined
LDFLAGS += -Wl,--strip-all
# LDFLAGS += -Wl,--initial-heap=65536 // already the default
# LDFLAGS += -Wl,--no-growable-memory // it never grows anyway. Toggling this adds useless opcodes
LDFLAGS += $(foreach fn,$(EXPORTS),-Wl,--export=$(fn))
LDFLAGS += -Wl,--lto-O3 -Wl,--lto-CGO3
LDFLAGS += -Wl,--gc-sections

# Safer layout
# https://bugs.llvm.org/show_bug.cgi?id=37181
# https://github.com/rustwasm/team/issues/81#issue-303617986
LDFLAGS += -Wl,--stack-first

# WASM-opt flags
# --- Flags before optimization level (before -Oz/-Os) ---
WASM_OPT_FLAGS_PRE = \
	--untee \
	--converge

# --- Code size reduction flags (come after -Oz/-Os) ---
WASM_OPT_FLAGS_SIZE_COMMON = \
	--enable-simd \
	--enable-relaxed-simd \
	--enable-extended-const \
	--enable-tail-call \
	--strip-debug \
	--strip-dwarf \
	--strip-eh \
	--strip-producers \
	--strip-target-features \
	--duplicate-function-elimination \
	--merge-similar-functions \
	--code-folding \
	--dce \
	--vacuum \
	--coalesce-locals-learning \
	--low-memory-unused

# --- Performance-related flags ---
WASM_OPT_FLAGS_PERF = \
	--enable-bulk-memory \
	--enable-bulk-memory-opt \
	--ignore-implicit-traps \
	--closed-world 

# --- Reduces code size but hurts perf ---
WASM_OPT_FLAGS_OTHER = \
	--optimize-instructions \
	--optimize-added-constants \
	--optimize-added-constants-propagate \
	--optimize-casts \
	--dae-optimizing \
	--gsi \
	--gto \
	--gufa \
	--gufa-cast-all \
	--gufa-optimizing

# Size-optimized wasm-opt flags (zstd.wasm): -Oz at correct position + size flags only
WASM_OPT_FLAGS_SIZE_BUILD = $(WASM_OPT_FLAGS_PRE) -Oz $(WASM_OPT_FLAGS_SIZE_COMMON) $(WASM_OPT_FLAGS_PERF) $(WASM_OPT_FLAGS_OTHER)

# Performance-optimized wasm-opt flags (zstd-perf.wasm): -Os at correct position + all flags
WASM_OPT_FLAGS_PERF_BUILD = $(WASM_OPT_FLAGS_PRE) -Os $(WASM_OPT_FLAGS_SIZE_COMMON) $(WASM_OPT_FLAGS_PERF) 

.PHONY: all clean check-tools test tests regenerate-decoder help size perf

all: check-tools size perf
	@echo "Running TypeScript build..."
	@if command -v bun >/dev/null 2>&1; then \
		bun build.ts; \
	else \
		echo "Error: bun not found."; \
		exit 1; \
	fi

size: check-tools $(OUTPUT)
	@if command -v wasm-opt >/dev/null 2>&1; then \
		echo "Applying wasm-opt post-processing (size-optimized)..."; \
		wasm-opt $(WASM_OPT_FLAGS_SIZE_BUILD) $(OUTPUT) -o $(OUTPUT); \
		echo "Size-optimized build complete:"; \
		ls -lh $(OUTPUT); \
	else \
		echo "Warning: wasm-opt not found. Install binaryen:"; \
		echo "  MacOS:  brew install binaryen"; \
		echo "  Linux:  sudo apt-get install binaryen"; \
		echo "Build complete without wasm-opt:"; \
		ls -lh $(OUTPUT); \
	fi

perf: check-tools $(OUTPUT_PERF)
	@if command -v wasm-opt >/dev/null 2>&1; then \
		echo "Applying wasm-opt post-processing (performance-optimized)..."; \
		wasm-opt $(WASM_OPT_FLAGS_PERF_BUILD) $(OUTPUT_PERF) -o $(OUTPUT_PERF); \
		echo "Perf. opt build complete:"; \
		ls -lh $(OUTPUT_PERF); \
	else \
		echo "Warning: wasm-opt not found. Install binaryen:"; \
		echo "  MacOS:  brew install binaryen"; \
		echo "  Linux:  sudo apt-get install binaryen"; \
		echo "Build complete without wasm-opt:"; \
		ls -lh $(OUTPUT_PERF); \
	fi

clean:
	rm -rf $(OUTPUT_DIR)

# Run test suite
test tests: all
	@echo "Running test suite..."
	@cd ../.. && npm run test

# Convenience target to regenerate zstddeclib.c
regenerate-decoder:
	@echo "Regenerating zstddeclib.c .."
	@cd ../../vendor/zstd/build/single_file_libs && ./create_single_file_decoder.sh
	@mv ../../vendor/zstd/build/single_file_libs/zstddeclib.c $(BIN_DIR)/zstddeclib.c
	@echo "Successfully regenerated $(BIN_DIR)/zstddeclib.c"

help:
	@echo "Zstd Wasm Decoder Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  all (default)           - Build both size and perf optimized WASM + run TypeScript build"
	@echo "  size                    - Build size-optimized WASM (zstd.wasm)"
	@echo "  perf                    - Build performance-optimized WASM (zstd-perf.wasm)"
	@echo "  clean                   - Remove build artifacts"
	@echo "  test/tests              - Run test suite (via npm)"
	@echo "  regenerate-decoder      - Regenerate zstddeclib.c from sources"
	@echo "  check-tools             - Check if required tools are available"
	@echo "  help                    - Show this help message"
	@echo ""
	@echo "Configuration:"
	@echo "  LLVM_DIR=$(LLVM_DIR)"
	@echo "  CLANG=$(CLANG)"
	@echo ""
	@echo "Note: Set LLVM_DIR environment variable to override auto-detection"
	@echo "Note: Requires bun to be installed for TypeScript build"
	@echo ""
	@echo "Output:"
	@echo "  build/zstd.wasm       - Size-optimized (-Oz, MINIFY, NO_INLINE)"
	@echo "  build/zstd-perf.wasm  - Performance-optimized (-Os)"

check-tools:
	@echo "Checking for required tools..."
	@if [ ! -f "$(CLANG)" ]; then \
		echo "Error: clang not found at $(CLANG)"; \
		echo "Please install LLVM with WebAssembly target support:"; \
		echo "  MacOS:  brew install llvm"; \
		echo "  Linux:  sudo apt-get install clang lld"; \
		echo "  Arch:   sudo pacman -S clang lld"; \
		echo "Then set LLVM_DIR environment variable if needed"; \
		exit 1; \
	fi
	@if ! $(CLANG) --version 2>&1 | grep -q "Target:.*wasm" && ! $(CLANG) --print-targets 2>&1 | grep -q wasm; then \
		echo "Warning: LLVM installation may not support WebAssembly target"; \
	fi
	@echo "All required tools are available."

$(OUTPUT_DIR):
	mkdir -p $(OUTPUT_DIR)

$(OUTPUT): $(SOURCES) | $(OUTPUT_DIR)
	@echo "Building size-optimized WASM module..."
	$(CLANG) $(CFLAGS_SIZE) $(LDFLAGS) $(SOURCES) -o $@
	@echo "Build complete: $@"
	@ls -lh $@

$(OUTPUT_PERF): $(SOURCES) | $(OUTPUT_DIR)
	@echo "Building perf. opt WASM module..."
	$(CLANG) $(CFLAGS_PERF) $(LDFLAGS) $(SOURCES) -o $@
	@echo "Build complete: $@"
	@ls -lh $@
