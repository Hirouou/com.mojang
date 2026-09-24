#pragma once

#include <algorithm>
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <sys/mman.h>
#include <vector>

// Reserve a genuinely free page, including sub-MiB gaps between ELF mappings.
// Never use MAP_FIXED: another thread can map a gap after /proc/self/maps is read.
inline void* allocate_near_code_page(uintptr_t pc, size_t relayOffset,
                                     int64_t minDistance, int64_t maxDistance,
                                     size_t pageSize) {
    const int64_t low = std::max<int64_t>(0x10000, int64_t(pc) + minDistance - int64_t(relayOffset));
    const int64_t high = std::min<int64_t>(
        std::min<uint64_t>(UINTPTR_MAX - pageSize, INT64_MAX),
        int64_t(pc) + maxDistance - int64_t(relayOffset));
    if (high < low) return nullptr;
    const auto align = [pageSize](uint64_t n) {
        return (n + pageSize - 1) & ~(uint64_t(pageSize) - 1);
    };
    std::vector<uintptr_t> candidates;
    auto gap = [&](uint64_t begin, uint64_t end) {
        begin = align(std::max<uint64_t>(begin, low));
        end = std::min<uint64_t>(end, uint64_t(high) + pageSize);
        for (uint64_t p = begin; p + pageSize <= end; p += pageSize)
            candidates.push_back(static_cast<uintptr_t>(p));
    };
    FILE* maps = std::fopen("/proc/self/maps", "r");
    if (!maps) return nullptr;
    char line[1024];
    uint64_t previous = low;
    while (std::fgets(line, sizeof(line), maps)) {
        unsigned long long begin, end;
        if (std::sscanf(line, "%llx-%llx", &begin, &end) != 2) continue;
        if (end <= previous) continue;
        if (begin > previous) gap(previous, begin);
        previous = end;
        if (previous > uint64_t(high)) break;
    }
    if (previous <= uint64_t(high)) gap(previous, uint64_t(high) + pageSize);
    std::fclose(maps);
    auto distance = [pc](uintptr_t p) { return p > pc ? p - pc : pc - p; };
    std::sort(candidates.begin(), candidates.end(), [&](uintptr_t a, uintptr_t b) {
        return distance(a) < distance(b);
    });
    for (uintptr_t address : candidates) {
        // Linux 4.17+, also safe on older kernels that treat it as a hint.
        constexpr int noReplace = 0x100000;
        void* memory = mmap(reinterpret_cast<void*>(address), pageSize,
                            PROT_READ | PROT_WRITE,
                            MAP_PRIVATE | MAP_ANONYMOUS | noReplace, -1, 0);
        if (memory == MAP_FAILED && errno == EINVAL)
            memory = mmap(reinterpret_cast<void*>(address), pageSize,
                          PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (memory == MAP_FAILED) continue;
        const int64_t delta = int64_t(reinterpret_cast<uintptr_t>(memory)) +
                              int64_t(relayOffset) - int64_t(pc);
        if (delta >= minDistance && delta <= maxDistance) return memory;
        munmap(memory, pageSize);
    }
    return nullptr;
}
