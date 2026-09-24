#include "../native/NearCodePage.hpp"
// Keep the regression checks (and mmap cleanup) active in Release CI builds.
#undef NDEBUG
#include <cassert>
#include <cstring>
#include <unistd.h>

int main() {
    const size_t page = sysconf(_SC_PAGESIZE);
    auto* arena = static_cast<unsigned char*>(mmap(nullptr, 3 * page,
        PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0));
    assert(arena != MAP_FAILED);
    std::memset(arena, 0x5a, 3 * page);
    assert(munmap(arena + page, page) == 0);
    const uintptr_t pc = reinterpret_cast<uintptr_t>(arena + page);
    void* relay = allocate_near_code_page(pc, 16, 0, page - 4, page);
    assert(relay == arena + page); // A single-page gap missed by MiB stepping.
    assert(arena[page - 1] == 0x5a && arena[2 * page] == 0x5a);
    assert(allocate_near_code_page(pc, 16, 0, page - 4, page) == nullptr);
    assert(arena[page - 1] == 0x5a && arena[2 * page] == 0x5a);
    assert(munmap(arena, 3 * page) == 0);
}
