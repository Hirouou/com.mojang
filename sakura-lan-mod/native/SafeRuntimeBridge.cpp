#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <dlfcn.h>
#include <pthread.h>
#include <string>
#include <thread>
#include <unistd.h>
#include <sys/mman.h>

extern "C" {
int sakuralan_net_connected();
int sakuralan_net_local_player_id();
void sakuralan_net_send_state(float px, float py, float pz,
                              float qx, float qy, float qz, float qw,
                              float vx, float vy, float vz,
                              uint16_t animationId, uint8_t flags);
int sakuralan_net_take_remote(float* out13);
}

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "SakuraLAN", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "SakuraLAN", __VA_ARGS__)

namespace {

using DomainGet = void* (*)();
using ThreadAttach = void* (*)(void*);
using DomainGetAssemblies = const void** (*)(const void*, size_t*);
using AssemblyGetImage = const void* (*)(const void*);
using ImageGetName = const char* (*)(const void*);
using ClassFromName = void* (*)(const void*, const char*, const char*);
using ClassGetName = const char* (*)(void*);
using ClassGetNamespace = const char* (*)(void*);
using ClassGetMethodFromName = const void* (*)(void*, const char*, int);
using RuntimeInvoke = void* (*)(const void*, void*, void**, void**);
using StringNew = void* (*)(const char*);
using ObjectGetClass = void* (*)(void*);
using ClassGetType = const void* (*)(void*);
using TypeGetObject = void* (*)(const void*);
using ArrayLength = uintptr_t (*)(void*);

struct Api {
    void* lib = nullptr;
    DomainGet domain_get = nullptr;
    ThreadAttach thread_attach = nullptr;
    DomainGetAssemblies domain_get_assemblies = nullptr;
    AssemblyGetImage assembly_get_image = nullptr;
    ImageGetName image_get_name = nullptr;
    ClassFromName class_from_name = nullptr;
    ClassGetName class_get_name = nullptr;
    ClassGetNamespace class_get_namespace = nullptr;
    ClassGetMethodFromName class_get_method_from_name = nullptr;
    RuntimeInvoke runtime_invoke = nullptr;
    StringNew string_new = nullptr;
    ObjectGetClass object_get_class = nullptr;
    ClassGetType class_get_type = nullptr;
    TypeGetObject type_get_object = nullptr;
    ArrayLength array_length = nullptr;
};

template <typename T>
bool load_symbol(void* lib, const char* name, T& out) {
    out = reinterpret_cast<T>(dlsym(lib, name));
    if (!out) LOGE("ARMHOOK missing export %s", name);
    return out != nullptr;
}

bool load_api(Api& a) {
    for (int i = 0; i < 600; ++i) {
        a.lib = dlopen("libil2cpp.so", RTLD_NOW | RTLD_NOLOAD);
        if (a.lib) break;
        usleep(100000);
    }
    if (!a.lib) {
        LOGE("ARMHOOK libil2cpp unavailable");
        return false;
    }

    bool ok = true;
    ok &= load_symbol(a.lib, "il2cpp_domain_get", a.domain_get);
    ok &= load_symbol(a.lib, "il2cpp_thread_attach", a.thread_attach);
    ok &= load_symbol(a.lib, "il2cpp_domain_get_assemblies", a.domain_get_assemblies);
    ok &= load_symbol(a.lib, "il2cpp_assembly_get_image", a.assembly_get_image);
    ok &= load_symbol(a.lib, "il2cpp_image_get_name", a.image_get_name);
    ok &= load_symbol(a.lib, "il2cpp_class_from_name", a.class_from_name);
    ok &= load_symbol(a.lib, "il2cpp_class_get_name", a.class_get_name);
    ok &= load_symbol(a.lib, "il2cpp_class_get_namespace", a.class_get_namespace);
    ok &= load_symbol(a.lib, "il2cpp_class_get_method_from_name", a.class_get_method_from_name);
    ok &= load_symbol(a.lib, "il2cpp_runtime_invoke", a.runtime_invoke);
    ok &= load_symbol(a.lib, "il2cpp_string_new", a.string_new);
    ok &= load_symbol(a.lib, "il2cpp_object_get_class", a.object_get_class);
    ok &= load_symbol(a.lib, "il2cpp_class_get_type", a.class_get_type);
    ok &= load_symbol(a.lib, "il2cpp_type_get_object", a.type_get_object);
    ok &= load_symbol(a.lib, "il2cpp_array_length", a.array_length);
    return ok;
}

const void* find_image(Api& a, const char* prefix) {
    void* domain = a.domain_get();
    if (!domain) return nullptr;

    size_t count = 0;
    const void** assemblies = a.domain_get_assemblies(domain, &count);
    if (!assemblies) return nullptr;

    const size_t n = std::strlen(prefix);
    for (size_t i = 0; i < count; ++i) {
        const void* image = a.assembly_get_image(assemblies[i]);
        const char* name = image ? a.image_get_name(image) : nullptr;
        if (name && std::strncmp(name, prefix, n) == 0) return image;
    }
    return nullptr;
}

void* invoke(Api& a,
             void* klass,
             void* instance,
             const char* name,
             int argc,
             void** args = nullptr) {
    const void* method = a.class_get_method_from_name(klass, name, argc);
    if (!method) return nullptr;

    void* exception = nullptr;
    void* result = a.runtime_invoke(method, instance, args, &exception);
    if (exception) {
        LOGE("ARMHOOK exception invoking %s/%d", name, argc);
        return nullptr;
    }
    return result;
}

void* invoke0(Api& a, void* klass, void* instance, const char* name) {
    return invoke(a, klass, instance, name, 0, nullptr);
}

void* invoke1(Api& a, void* klass, void* instance, const char* name, void* arg0) {
    void* args[1] = {arg0};
    return invoke(a, klass, instance, name, 1, args);
}

std::string string_utf8_ascii(void* str) {
    if (!str) return {};
    const auto* base = reinterpret_cast<const uint8_t*>(str);
    const size_t lengthOffset = sizeof(void*) * 2;
    const int32_t length = *reinterpret_cast<const int32_t*>(base + lengthOffset);
    if (length <= 0 || length > 512) return {};

    const auto* chars =
        reinterpret_cast<const uint16_t*>(base + lengthOffset + sizeof(int32_t));
    std::string out;
    out.reserve(static_cast<size_t>(length));
    for (int32_t i = 0; i < length; ++i) {
        const uint16_t ch = chars[i];
        out.push_back(ch < 0x80 ? static_cast<char>(ch) : '?');
    }
    return out;
}

struct Vec3 { float x, y, z; };
struct Quat { float x, y, z, w; };

bool boxed_vec3(void* boxed, Vec3& out) {
    if (!boxed) return false;
    const auto* p = reinterpret_cast<const float*>(
        reinterpret_cast<const uint8_t*>(boxed) + sizeof(void*) * 2);
    out = {p[0], p[1], p[2]};
    return true;
}

bool boxed_quat(void* boxed, Quat& out) {
    if (!boxed) return false;
    const auto* p = reinterpret_cast<const float*>(
        reinterpret_cast<const uint8_t*>(boxed) + sizeof(void*) * 2);
    out = {p[0], p[1], p[2], p[3]};
    return true;
}

Api gApi{};
const void* gAssembly = nullptr;
const void* gUnityCore = nullptr;

void* gObjectClass = nullptr;
void* gComponentClass = nullptr;
void* gGameObjectClass = nullptr;
void* gBehaviourClass = nullptr;
void* gAnimatorClass = nullptr;
void* gCharaMoveClass = nullptr;

std::atomic<void*> gLocalMove{nullptr};
void* gLocalGameObject = nullptr;
void* gLocalTransform = nullptr;
void* gRemoteGameObject = nullptr;
void* gRemoteTransform = nullptr;
std::atomic<bool> gClientOffsetDone{false};
std::chrono::steady_clock::time_point gLastSend{};

bool resolve_runtime_classes() {
    if (!gUnityCore || !gAssembly) return false;
    if (!gObjectClass)
        gObjectClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Object");
    if (!gComponentClass)
        gComponentClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Component");
    if (!gGameObjectClass)
        gGameObjectClass = gApi.class_from_name(gUnityCore, "UnityEngine", "GameObject");
    if (!gBehaviourClass)
        gBehaviourClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Behaviour");
    if (!gAnimatorClass)
        gAnimatorClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Animator");
    if (!gCharaMoveClass)
        gCharaMoveClass = gApi.class_from_name(gAssembly, "", "CharaMove");

    return gObjectClass && gComponentClass && gGameObjectClass &&
           gBehaviourClass && gCharaMoveClass;
}

bool cache_local_player(void* self) {
    if (!resolve_runtime_classes() || !self) return false;

    void* go = invoke0(gApi, gComponentClass, self, "get_gameObject");
    if (!go) return false;

    const std::string name =
        string_utf8_ascii(invoke0(gApi, gObjectClass, go, "get_name"));

    if (name.find("Player") == std::string::npos ||
        name.find("SAKURA_LAN_REMOTE") != std::string::npos) {
        return false;
    }

    void* transform = invoke0(gApi, gGameObjectClass, go, "get_transform");
    if (!transform) return false;

    void* expected = nullptr;
    if (!gLocalMove.compare_exchange_strong(expected, self) &&
        gLocalMove.load() != self) {
        return false;
    }

    gLocalGameObject = go;
    gLocalTransform = transform;
    LOGI("ARMHOOK LOCAL name=%s move=%p go=%p transform=%p",
         name.c_str(), self, go, transform);
    return true;
}

void disable_remote_behaviours(void* clone) {
    if (!clone || !gBehaviourClass) return;

    const void* behaviourType = gApi.class_get_type(gBehaviourClass);
    void* systemType = behaviourType ? gApi.type_get_object(behaviourType) : nullptr;
    if (!systemType) return;

    void* components =
        invoke1(gApi, gGameObjectClass, clone, "GetComponents", systemType);
    if (!components) return;

    const uintptr_t count = gApi.array_length(components);
    if (!count || count > 128) return;

    auto** items = reinterpret_cast<void**>(
        reinterpret_cast<uint8_t*>(components) + sizeof(void*) * 4);

    for (uintptr_t i = 0; i < count; ++i) {
        void* component = items[i];
        if (!component) continue;

        void* klass = gApi.object_get_class(component);
        const char* className = klass ? gApi.class_get_name(klass) : nullptr;
        if (className && std::strcmp(className, "Animator") == 0) continue;

        uint8_t disabled = 0;
        invoke1(gApi, gBehaviourClass, component, "set_enabled", &disabled);
    }
}

bool create_remote_avatar() {
    if (gRemoteGameObject && gRemoteTransform) return true;
    if (!gLocalGameObject || !resolve_runtime_classes()) return false;

    void* clone = invoke1(
        gApi, gObjectClass, nullptr, "Instantiate", gLocalGameObject);
    if (!clone) {
        LOGE("ARMHOOK remote Instantiate failed");
        return false;
    }

    void* remoteName = gApi.string_new("SAKURA_LAN_REMOTE");
    invoke1(gApi, gObjectClass, clone, "set_name", remoteName);
    disable_remote_behaviours(clone);

    void* transform = invoke0(gApi, gGameObjectClass, clone, "get_transform");
    if (!transform) {
        LOGE("ARMHOOK remote transform missing");
        return false;
    }

    gRemoteGameObject = clone;
    gRemoteTransform = transform;

    void* transformClass = gApi.object_get_class(transform);
    Vec3 local{};
    if (transformClass &&
        boxed_vec3(invoke0(gApi, transformClass, gLocalTransform, "get_position"),
                   local)) {
        Vec3 initial{local.x + 2.0f, local.y, local.z};
        invoke1(gApi, transformClass, transform, "set_position", &initial);
    }

    LOGI("ARMHOOK REMOTE CREATED go=%p transform=%p",
         gRemoteGameObject, gRemoteTransform);
    return true;
}

void multiplayer_tick(void* self) {
    if (!sakuralan_net_connected()) return;

    void* selected = gLocalMove.load();
    if (!selected) {
        if (!cache_local_player(self)) return;
        selected = self;
    }
    if (selected != self || !gLocalTransform) return;

    void* transformClass = gApi.object_get_class(gLocalTransform);
    if (!transformClass) return;

    if (sakuralan_net_local_player_id() == 1 &&
        !gClientOffsetDone.exchange(true)) {
        Vec3 p{};
        if (boxed_vec3(
                invoke0(gApi, transformClass, gLocalTransform, "get_position"), p)) {
            p.x += 2.25f;
            invoke1(gApi, transformClass, gLocalTransform, "set_position", &p);
            LOGI("ARMHOOK CLIENT OFFSET %.2f %.2f %.2f", p.x, p.y, p.z);
        }
    }

    if (!create_remote_avatar()) return;

    const auto now = std::chrono::steady_clock::now();
    if (gLastSend.time_since_epoch().count() == 0 ||
        now - gLastSend >= std::chrono::milliseconds(50)) {
        Vec3 p{};
        Quat q{};
        if (boxed_vec3(
                invoke0(gApi, transformClass, gLocalTransform, "get_position"), p) &&
            boxed_quat(
                invoke0(gApi, transformClass, gLocalTransform, "get_rotation"), q)) {
            sakuralan_net_send_state(
                p.x, p.y, p.z,
                q.x, q.y, q.z, q.w,
                0.0f, 0.0f, 0.0f,
                0, 0);
            gLastSend = now;
        }
    }

    float remote[13]{};
    if (!sakuralan_net_take_remote(remote)) return;

    void* remoteTransformClass = gApi.object_get_class(gRemoteTransform);
    if (!remoteTransformClass) return;

    Vec3 p{remote[0], remote[1], remote[2]};
    Quat q{remote[3], remote[4], remote[5], remote[6]};
    invoke1(gApi, remoteTransformClass, gRemoteTransform, "set_position", &p);
    invoke1(gApi, remoteTransformClass, gRemoteTransform, "set_rotation", &q);

    static uint32_t applied = 0;
    ++applied;
    if (applied <= 20 || applied % 200 == 0) {
        LOGI("ARMHOOK REMOTE APPLY id=%.0f pos=%.2f %.2f %.2f",
             remote[12], p.x, p.y, p.z);
    }
}

using CharaUpdate = void (*)(void*, const void*);
CharaUpdate gOriginalUpdate = nullptr;
std::atomic<uint64_t> gHookCalls{0};

void hooked_update(void* self, const void* methodInfo) {
    if (gOriginalUpdate) gOriginalUpdate(self, methodInfo);
    multiplayer_tick(self);

    const uint64_t n = ++gHookCalls;
    if (n <= 10 || n % 5000 == 0) {
        LOGI("ARMHOOK UPDATE call=%llu self=%p",
             static_cast<unsigned long long>(n), self);
    }
}

#if defined(__arm__)
bool install_arm32_hook(void* target, void* hook, void** trampolineOut) {
    if (!target || !hook || !trampolineOut) return false;

    const uintptr_t targetAddr = reinterpret_cast<uintptr_t>(target);
    if (targetAddr & 1u) {
        LOGE("ARMHOOK target is Thumb; unsupported target=%p", target);
        return false;
    }

    uint32_t first[4]{};
    std::memcpy(first, target, sizeof(first));
    LOGI("ARMHOOK prologue %08x %08x %08x %08x",
         first[0], first[1], first[2], first[3]);

    // We overwrite exactly 8 bytes. IL2CPP ARM32 functions normally begin
    // with PUSH/SUB register prologue instructions which are safe to replay.
    // Reject obvious ARM branches or PC-relative literal loads in those 2 words.
    for (int i = 0; i < 2; ++i) {
        const uint32_t insn = first[i];
        const bool branch = (insn & 0x0E000000u) == 0x0A000000u;
        const bool pcLiteralLoad =
            (insn & 0x0F7F0000u) == 0x051F0000u;
        if (branch || pcLiteralLoad) {
            LOGE("ARMHOOK unsafe prologue word[%d]=%08x", i, insn);
            return false;
        }
    }

    const size_t pageSize = static_cast<size_t>(sysconf(_SC_PAGESIZE));
    uint8_t* trampoline = reinterpret_cast<uint8_t*>(
        mmap(nullptr, pageSize,
             PROT_READ | PROT_WRITE | PROT_EXEC,
             MAP_PRIVATE | MAP_ANONYMOUS,
             -1, 0));
    if (trampoline == MAP_FAILED) {
        LOGE("ARMHOOK mmap trampoline failed");
        return false;
    }

    std::memcpy(trampoline, target, 8);

    // ARM: LDR pc, [pc, #-4] ; literal(target+8)
    const uint32_t jumpInsn = 0xE51FF004u;
    std::memcpy(trampoline + 8, &jumpInsn, 4);
    const uint32_t resume =
        static_cast<uint32_t>(targetAddr + 8u);
    std::memcpy(trampoline + 12, &resume, 4);
    __builtin___clear_cache(
        reinterpret_cast<char*>(trampoline),
        reinterpret_cast<char*>(trampoline + 16));

    const uintptr_t page =
        targetAddr & ~(static_cast<uintptr_t>(pageSize) - 1u);
    if (mprotect(reinterpret_cast<void*>(page), pageSize,
                 PROT_READ | PROT_WRITE | PROT_EXEC) != 0) {
        LOGE("ARMHOOK mprotect target failed");
        munmap(trampoline, pageSize);
        return false;
    }

    std::memcpy(reinterpret_cast<void*>(targetAddr), &jumpInsn, 4);
    const uint32_t hookAddr =
        static_cast<uint32_t>(reinterpret_cast<uintptr_t>(hook));
    std::memcpy(reinterpret_cast<void*>(targetAddr + 4u), &hookAddr, 4);
    __builtin___clear_cache(
        reinterpret_cast<char*>(targetAddr),
        reinterpret_cast<char*>(targetAddr + 8u));

    mprotect(reinterpret_cast<void*>(page), pageSize, PROT_READ | PROT_EXEC);

    *trampolineOut = trampoline;
    LOGI("ARMHOOK inline installed target=%p hook=%p trampoline=%p",
         target, hook, trampoline);
    return true;
}
#endif

bool install_chara_update_hook() {
    if (!gAssembly) return false;

    gCharaMoveClass = gApi.class_from_name(gAssembly, "", "CharaMove");
    if (!gCharaMoveClass) {
        LOGE("ARMHOOK CharaMove class missing");
        return false;
    }

    const void* method =
        gApi.class_get_method_from_name(gCharaMoveClass, "Update", 0);
    if (!method) {
        LOGE("ARMHOOK CharaMove.Update missing");
        return false;
    }

    void* target = *reinterpret_cast<void* const*>(method);
    if (!target) {
        LOGE("ARMHOOK CharaMove.Update target null");
        return false;
    }

#if defined(__arm__)
    void* trampoline = nullptr;
    if (!install_arm32_hook(
            target,
            reinterpret_cast<void*>(hooked_update),
            &trampoline)) {
        return false;
    }
    gOriginalUpdate = reinterpret_cast<CharaUpdate>(trampoline);
    LOGI("ARMHOOK READY target=%p original=%p hook=%p",
         target, trampoline, reinterpret_cast<void*>(hooked_update));
    return true;
#else
    LOGE("ARMHOOK unsupported ABI for legacy hook");
    return false;
#endif
}

void* worker(void*) {
    LOGI("ARMHOOK worker delayed");
    sleep(12);

    if (!load_api(gApi)) return nullptr;

    void* domain = gApi.domain_get();
    if (!domain) {
        LOGE("ARMHOOK domain unavailable");
        return nullptr;
    }
    gApi.thread_attach(domain);

    for (int i = 0; i < 300; ++i) {
        gAssembly = find_image(gApi, "Assembly-CSharp");
        gUnityCore = find_image(gApi, "UnityEngine.CoreModule");
        if (gAssembly && gUnityCore) break;
        usleep(100000);
    }

    LOGI("ARMHOOK IMAGES csharp=%p unity=%p", gAssembly, gUnityCore);
    if (!gAssembly || !gUnityCore) return nullptr;

    for (int i = 0; i < 600 && !sakuralan_net_connected(); ++i) {
        usleep(100000);
    }
    LOGI("ARMHOOK network connected=%d", sakuralan_net_connected());
    if (!sakuralan_net_connected()) return nullptr;

    sleep(4);
    if (!install_chara_update_hook()) return nullptr;
    return nullptr;
}

} // namespace

__attribute__((constructor))
static void sakura_lan_safe_bridge_init() {
    LOGI("ARMHOOK library bridge init");
    pthread_t t{};
    if (pthread_create(&t, nullptr, worker, nullptr) == 0) {
        pthread_detach(t);
    } else {
        LOGE("ARMHOOK pthread_create failed");
    }
}
