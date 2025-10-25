#include <stddef.h>

// Based bump allocator
#define HEAP_SIZE (16 * 1024 * 1024)  // 16MB heap
static unsigned char __heap[HEAP_SIZE] __attribute__((aligned(16)));
static size_t __heap_ptr = 0;

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

void* calloc(size_t nmemb, size_t size) {
    size_t total = nmemb * size;
    void* ptr = malloc(total);
    if (ptr) {
        __builtin_memset(ptr, 0, total);
    }
    return ptr;
}

// Wrappers around compiler builtins
// - __builtin_memcpy  -> memory.copy
// - __builtin_memset  -> memory.fill

void* memcpy(void* dest, const void* src, size_t n) {
    return __builtin_memcpy(dest, src, n);
}

void* memset(void* s, int c, size_t n) {
    return __builtin_memset(s, c, n);
}
