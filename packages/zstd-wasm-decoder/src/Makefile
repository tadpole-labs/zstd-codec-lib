# Build configuration - adjust these paths as needed
# Set LLVM_DIR as an environment variable for your platform:
#   MacOS (Homebrew):  export LLVM_DIR=/opt/homebrew/opt/llvm
#   Linux:             export LLVM_DIR=/usr (or /usr/local)
#   CI/Custom:         export LLVM_DIR=$HOME/llvm-21

# Try to auto-detect LLVM location if not set
ifeq ($(LLVM_DIR),)
    # Check common locations in order of preference
    ifneq ($(wildcard /opt/homebrew/opt/llvm/bin/clang),)
        LLVM_DIR := /opt/homebrew/opt/llvm
    else ifneq ($(wildcard /usr/local/bin/clang),)
        LLVM_DIR := /usr/local
    else ifneq ($(wildcard /usr/bin/clang),)
        LLVM_DIR := /usr
    else
        $(error LLVM_DIR not set and clang not found in common locations. Please set LLVM_DIR environment variable)
    endif
endif

CLANG = $(LLVM_DIR)/bin/clang

EXPORTS = wasm_malloc wasm_free \
          _ZSTD_isError \
          _ZSTD_createDCtx _ZSTD_freeDCtx \
          _ZSTD_createDDict _ZSTD_freeDDict _ZSTD_decompress_usingDDict \
          _ZSTD_decompressStream \
          _ZSTD_DCtx_reset _ZSTD_DCtx_refDDict

SOURCES = minimal_libc.c zstd_wasm.c zstddeclib.c
OUTPUT_DIR = build
OUTPUT = $(OUTPUT_DIR)/zstd.wasm

CFLAGS = --target=wasm32
CFLAGS += -nostdlib
CFLAGS += -Iinclude -I. -I../../../vendor/zstd/lib
CFLAGS += -ffreestanding

CFLAGS += -DZSTD_LIB_EXCLUDE_COMPRESSORS_GREEDY_AND_UP
CFLAGS += -DZSTD_EXCLUDE_DFAST_BLOCK_COMPRESSOR
CFLAGS += -DZSTD_EXCLUDE_GREEDY_BLOCK_COMPRESSOR
CFLAGS += -DZSTD_EXCLUDE_LAZY2_BLOCK_COMPRESSOR
CFLAGS += -DZSTD_EXCLUDE_BTLAZY2_BLOCK_COMPRESSOR
CFLAGS += -DZSTD_EXCLUDE_BTOPT_BLOCK_COMPRESSOR
CFLAGS += -DZSTD_EXCLUDE_BTULTRA_BLOCK_COMPRESSOR
CFLAGS += -DZSTD_NOBENCH
CFLAGS += -DZSTD_LIB_EXCLUDE_COMPRESSORS_DFAST_AND_UP

CFLAGS += -DZSTD_DISABLE_ASM

CFLAGS += -DHUF_FORCE_DECOMPRESS_X2
CFLAGS += -DZSTD_FORCE_DECOMPRESS_SEQUENCES_SHORT

CLFAGS += -DZSTD_LIB_MINIFY
CFLAGS += -DZSTD_NO_INLINE

CFLAGS += -DZSTD_NO_INTRINSICS

CFLAGS += -DZSTD_STRIP_ERROR_STRINGS
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

CFLAGS += -fno-builtin
CFLAGS += -fno-builtin-malloc 
CFLAGS += -fno-builtin-sin -fno-builtin-cos -fno-builtin-tan
CFLAGS += -fno-builtin-ceil -fno-builtin-floor
CFLAGS += -fno-builtin-pow -fno-builtin-round
CFLAGS += -fno-builtin-abs -fno-builtin-sqrt
CFLAGS += -fno-builtin-rand -fno-builtin-srand
CFLAGS += -Oz -flto -DNDEBUG -g0
CFLAGS += -fno-stack-protector -fomit-frame-pointer -fno-ident
CFLAGS += -ffunction-sections -fdata-sections -fmerge-all-constants
CFLAGS += -mbulk-memory

LDFLAGS = -Wl,--no-entry
LDFLAGS += -Wl,--allow-undefined
LDFLAGS += -Wl,--strip-all
LDFLAGS += $(foreach fn,$(EXPORTS),-Wl,--export=$(fn))
LDFLAGS += -Wl,--lto-O3 -Wl,--lto-CGO3
LDFLAGS += -Wl,--gc-sections

# wasm-opt configuration
WASM_OPT_FLAGS = -Oz --converge --closed-world --enable-bulk-memory \
	--strip-debug --strip-dwarf --strip-producers \
	--duplicate-function-elimination --merge-similar-functions \
	--code-folding --dce --vacuum --coalesce-locals-learning \
	--ignore-implicit-traps --low-memory-unused

.PHONY: all clean check-tools test tests regenerate-decoder help

all: check-tools $(OUTPUT)
	@if command -v wasm-opt >/dev/null 2>&1; then \
		echo "Applying wasm-opt post-processing..."; \
		wasm-opt $(WASM_OPT_FLAGS) $(OUTPUT) -o $(OUTPUT); \
		echo "Optimized build complete:"; \
		ls -lh $(OUTPUT); \
	else \
		echo "Warning: wasm-opt not found. Install binaryen:"; \
		echo "  MacOS:  brew install binaryen"; \
		echo "  Linux:  sudo apt-get install binaryen"; \
		echo "Build complete without wasm-opt:"; \
		ls -lh $(OUTPUT); \
	fi

clean:
	rm -rf $(OUTPUT_DIR)

# Run test suite
test tests: $(OUTPUT)
	@echo "Running test suite..."
	@cd ../../.. && npm run test

# Convenience target to regenerate zstddeclib.c
regenerate-decoder:
	python3 ../../../vendor/zstd/build/single_file_libs/combine.py -r ../../../vendor/zstd/lib -x legacy/zstd_legacy.h -o zstddeclib.c ../../../vendor/zstd/build/single_file_libs/zstddeclib-in.c

help:
	@echo "Zstd Wasm Decoder Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  all (default)           - Build optimized WASM with streaming support"
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
	@echo ""
	@echo "Output: build/zstd.wasm"

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
	@echo "Building WASM module..."
	$(CLANG) $(CFLAGS) $(LDFLAGS) $(SOURCES) -o $@
	@echo "Build complete: $@"
	@ls -lh $@
