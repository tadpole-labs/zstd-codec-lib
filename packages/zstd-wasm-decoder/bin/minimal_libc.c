#include <stddef.h>

#define WASM_EXPORT __attribute__((visibility("default")))
extern unsigned char __heap_base __attribute__((aligned(8)));

#define HEAP_SIZE (16 * 1024 * 1024)  // 16MB heap
static unsigned char __heap[HEAP_SIZE] __attribute__((aligned(16)));

// Store heap pointer at __heap_base (the "actual heap" region)
// This is kinda ugly but compiles down fewer instructions in hot paths / inlined malloc
#define __heap_ptr (*((size_t*)&__heap_base))

void* malloc(size_t size) {
    size = (size + 15) & ~15; // Align to 16 bytes
    
    if (__heap_ptr + size > HEAP_SIZE) {
        return (void*)0; // Out of memory
    }
    
    void* ptr = &__heap[__heap_ptr];
    __heap_ptr += size;
    return ptr;
}

void free(void* ptr) {
    (void)ptr; // no-op
}

WASM_EXPORT
void prune_buf(size_t new_size) {
    __heap_ptr = new_size;
}

void* calloc(size_t nmemb, size_t size) {
    size_t total = nmemb * size;
    void* ptr = malloc(total);
    if (ptr) {
        __builtin_memset(ptr, 0, total);
    }
    return ptr;
}

void memcpy(void* dest, const void* src, size_t n) {
    __builtin_memcpy(dest, src, n);
}

void memset(void* s, int c, size_t n) {
    __builtin_memset(s, c, n);
}

void memmove(void* dest, const void* src, size_t n) {
    __builtin_memmove(dest, src, n);
}