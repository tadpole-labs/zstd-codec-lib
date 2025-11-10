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
        $(error LLVM_DIR not set and clang not found)
    endif
endif

CLANG = $(LLVM_DIR)/bin/clang

EXPORTS = malloc _initialize pb cd ds re dS
BIN_DIR = bin
AMALGAMATED_SOURCE = $(BIN_DIR)/zstd_wasm_amalgamated.c
OUTPUT_DIR = build
OUTPUT = $(OUTPUT_DIR)/zstd.wasm
OUTPUT_PERF = $(OUTPUT_DIR)/zstd-perf.wasm

CFLAGS = --target=wasm32

# 8kb stack sufficient for a lightweight decoder only zstd build
CFLAGS += -z stack-size=8192
CFLAGS += -nostdlib
CFLAGS += -I$(BIN_DIR)/include -I$(BIN_DIR) -I../../vendor/zstd/lib
CFLAGS += -ffreestanding
CFLAGS += -msimd128
CFLAGS += -msign-ext

# CFLAGS += -mtail-call - good feature to reduce stack needs
# might need the one or another manual hint to the compiler
# currently its only placed at two places (automatically)
# barely yielding perf. benefits. Also supported since chrome 121
# which is probably too early for a published lib as of now
CFLAGS += -mno-atomics
CFLAGS += -mbulk-memory
CFLAGS += -mexec-model=reactor
CFLAGS += -mcpu=generic
CFLAGS += -flto -DNDEBUG -g0
CFLAGS += -fno-stack-protector -fomit-frame-pointer -fno-ident -fno-trapping-math -ffunction-sections -fdata-sections -fno-sanitize=pointer-overflow -fno-sanitize=signed-integer-overflow -fno-math-errno -fmerge-all-constants -fno-strict-aliasing

# Best bang for the byte
CFLAGS += -DHUF_FORCE_DECOMPRESS_X2
CFLAGS += -DZSTD_FORCE_DECOMPRESS_SEQUENCES_SHORT

# Needed for SIMD
# CFLAGS += -DZSTD_NO_INTRINSICS
CFLAGS += -DNO_PREFETCH
CFLAGS += -DXXH_NO_PREFETCH
CFLAGS += -Wall -Wextra -Wcast-qual -Wcast-align
CFLAGS += -Wstrict-aliasing=1 -Wstrict-prototypes
CFLAGS += -Wpointer-arith -Wformat=2 -Wwrite-strings
CFLAGS += -Wredundant-decls -Wno-unused-parameter

CFLAGS += -fwrapv-pointer

CFLAGS += -mllvm -polly
CFLAGS += -mllvm -polly-position=before-vectorizer
CFLAGS += -mllvm -polly-vectorizer=stripmine
CFLAGS += -fvectorize
CFLAGS += -fslp-vectorize

CFLAGS_SIZE += -DZSTD_NO_INLINE

CFLAGS_SIZE += $(CFLAGS) -Oz
CFLAGS_PERF = $(CFLAGS) -Os

# _initialize is the entry (the"ultra minimal" ZSTD_createDCtx)
# LDFLAGS = -Wl,--no-entry
LDFLAGS += -Wl,--allow-undefined
LDFLAGS += -Wl,--strip-all
LDFLAGS += -Wl,--threads=1
LDFLAGS += -Wl,--initial-heap=16580608
LDFLAGS += -Wl,--initial-memory=16777216
LDFLAGS += -Wl,--no-growable-memory
LDFLAGS += $(foreach fn,$(EXPORTS),-Wl,--export=$(fn))
LDFLAGS += -Wl,--lto-O3
LDFLAGS += -Wl,--lto-CGO3
LDFLAGS += -Wl,--gc-sections
LDFLAGS += -Wl,--compress-relocations
LDFLAGS += -Wl,--extra-features=mutable-globals

# Safer layout
# https://bugs.llvm.org/show_bug.cgi?id=37181
# https://github.com/rustwasm/team/issues/81#issue-303617986
LDFLAGS += -Wl,--stack-first
LDFLAGS += -Wl,--global-base=8192
LDFLAGS += -Wl,--merge-data-segments
LDFLAGS += -Wl,--print-map

# --enable-tail-call minimal benefit for relative compat issues
# wasm-opt flags
WASM_OPT_FLAGS_PRE = --monomorphize --generate-global-effects --untee --converge -Os

WASM_OPT_FLAGS_COMMON = \
	--enable-simd \
	--inlining \
	--inlining-optimizing \
	--enable-sign-ext \
	--enable-bulk-memory \
	--merge-locals  \
	--tuple-optimization \
	--rse \
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
	--low-memory-unused \
	--ignore-implicit-traps \
	--closed-world

WASM_OPT_FLAGS_EXTRA = \
	--optimize-instructions \
	--optimize-added-constants \
	--optimize-added-constants-propagate \
	--optimize-casts \
	--dae-optimizing \
	--gsi \
	--gto \
	--gufa \
	--type-refining-gufa \
	--gufa-cast-all \
	--gufa-optimizing

WASM_OPT_FLAGS_SIZE = $(WASM_OPT_FLAGS_PRE) -Oz $(WASM_OPT_FLAGS_COMMON) $(WASM_OPT_FLAGS_EXTRA)
WASM_OPT_FLAGS_PERF = $(WASM_OPT_FLAGS_PRE) $(WASM_OPT_FLAGS_COMMON) $(WASM_OPT_FLAGS_EXTRA) -Os

.PHONY: all clean check-tools test tests regenerate-amalgamated help size perf

all: check-tools size perf
	@if command -v bun >/dev/null 2>&1; then \
		bun build.ts; \
	else \
		echo "Error: bun not found"; \
		exit 1; \
	fi

size: check-tools regenerate-amalgamated $(OUTPUT_DIR)
	@echo "Building size-optimized WASM..."
	@$(CLANG) $(CFLAGS_SIZE) $(LDFLAGS) $(AMALGAMATED_SOURCE) -o $(OUTPUT)
	@if command -v wasm-opt >/dev/null 2>&1; then \
		wasm-opt $(WASM_OPT_FLAGS_SIZE) $(OUTPUT) -o $(OUTPUT); \
	fi
	@echo "Build complete: $(OUTPUT)"
	@ls -lh $(OUTPUT)

perf: check-tools regenerate-amalgamated $(OUTPUT_DIR)
	@echo "Building performance-optimized WASM..."
	@$(CLANG) $(CFLAGS_PERF) $(LDFLAGS) $(AMALGAMATED_SOURCE) -o $(OUTPUT_PERF)
	@if command -v wasm-opt >/dev/null 2>&1; then \
		wasm-opt $(WASM_OPT_FLAGS_PERF) $(OUTPUT_PERF) -o $(OUTPUT_PERF); \
	fi
	@echo "Build complete: $(OUTPUT_PERF)"
	@ls -lh $(OUTPUT_PERF)

clean:
	rm -rf $(OUTPUT_DIR)

test tests: all
	@cd ../.. && pnpm run test

regenerate-amalgamated:
	@cd $(BIN_DIR) && ./create_amalgamated_wasm.sh

help:
	@echo "Zstd WASM Decoder Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  all (default)  - Build size and perf optimized WASM + TypeScript build"
	@echo "  size           - Build size-optimized WASM (zstd.wasm, -Oz)"
	@echo "  perf           - Build performance-optimized WASM (zstd-perf.wasm, -Os)"
	@echo "  clean          - Remove build artifacts"
	@echo "  test/tests     - Run test suite"
	@echo "  help           - Show this help"

check-tools:
	@if [ ! -f "$(CLANG)" ]; then \
		echo "Error: clang not found at $(CLANG)"; \
		exit 1; \
	fi

$(OUTPUT_DIR):
	mkdir -p $(OUTPUT_DIR)
