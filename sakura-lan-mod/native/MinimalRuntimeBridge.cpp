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
    if (!out) LOGE("MINBRIDGE missing %s", name);
    return out != nullptr;
}

bool load_api(Api& a) {
    for (int i = 0; i < 600; ++i) {
        a.lib = dlopen("libil2cpp.so", RTLD_NOW | RTLD_NOLOAD);
        if (a.lib) break;
        usleep(100000);
    }
    if (!a.lib) {
        LOGE("MINBRIDGE libil2cpp unavailable");
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

void* invoke(Api& a, void* klass, void* instance,
             const char* name, int argc, void** args = nullptr) {
    const void* method = a.class_get_method_from_name(klass, name, argc);
    if (!method) return nullptr;
    void* exc = nullptr;
    void* result = a.runtime_invoke(method, instance, args, &exc);
    if (exc) {
        LOGE("MINBRIDGE exception %s/%d", name, argc);
        return nullptr;
    }
    return result;
}

void* invoke0(Api& a, void* klass, void* instance, const char* name) {
    return invoke(a, klass, instance, name, 0, nullptr);
}

void* invoke1(Api& a, void* klass, void* instance,
              const char* name, void* arg0) {
    void* args[1] = {arg0};
    return invoke(a, klass, instance, name, 1, args);
}

std::string string_ascii(void* str) {
    if (!str) return {};
    const auto* base = reinterpret_cast<const uint8_t*>(str);
    const size_t off = sizeof(void*) * 2;
    const int32_t len = *reinterpret_cast<const int32_t*>(base + off);
    if (len <= 0 || len > 512) return {};
    const auto* chars =
        reinterpret_cast<const uint16_t*>(base + off + sizeof(int32_t));
    std::string s;
    s.reserve(static_cast<size_t>(len));
    for (int32_t i = 0; i < len; ++i)
        s.push_back(chars[i] < 128 ? static_cast<char>(chars[i]) : '?');
    return s;
}

struct Vec3 { float x, y, z; };
struct Quat { float x, y, z, w; };

bool read_vec3(void* boxed, Vec3& out) {
    if (!boxed) return false;
    const auto* f = reinterpret_cast<const float*>(
        reinterpret_cast<const uint8_t*>(boxed) + sizeof(void*) * 2);
    out = {f[0], f[1], f[2]};
    return true;
}

bool read_quat(void* boxed, Quat& out) {
    if (!boxed) return false;
    const auto* f = reinterpret_cast<const float*>(
        reinterpret_cast<const uint8_t*>(boxed) + sizeof(void*) * 2);
    out = {f[0], f[1], f[2], f[3]};
    return true;
}

Api gApi{};
const void* gAssembly = nullptr;
const void* gUnityCore = nullptr;

void* gObjectClass = nullptr;
void* gComponentClass = nullptr;
void* gGameObjectClass = nullptr;
void* gBehaviourClass = nullptr;
void* gCharaMoveClass = nullptr;

std::atomic<void*> gLocalMove{nullptr};
void* gLocalGameObject = nullptr;
void* gLocalTransform = nullptr;
void* gRemoteGameObject = nullptr;
void* gRemoteTransform = nullptr;
std::atomic<bool> gClientOffsetDone{false};
std::chrono::steady_clock::time_point gLastSend{};

bool resolve_classes() {
    if (!gUnityCore || !gAssembly) return false;
    if (!gObjectClass)
        gObjectClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Object");
    if (!gComponentClass)
        gComponentClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Component");
    if (!gGameObjectClass)
        gGameObjectClass = gApi.class_from_name(gUnityCore, "UnityEngine", "GameObject");
    if (!gBehaviourClass)
        gBehaviourClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Behaviour");
    if (!gCharaMoveClass)
        gCharaMoveClass = gApi.class_from_name(gAssembly, "", "CharaMove");
    return gObjectClass && gComponentClass && gGameObjectClass &&
           gBehaviourClass && gCharaMoveClass;
}

bool cache_local(void* self) {
    if (!resolve_classes() || !self) return false;

    void* go = invoke0(gApi, gComponentClass, self, "get_gameObject");
    if (!go) return false;

    const std::string name =
        string_ascii(invoke0(gApi, gObjectClass, go, "get_name"));
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
    LOGI("MINBRIDGE LOCAL %s self=%p go=%p transform=%p",
         name.c_str(), self, go, transform);
    return true;
}

void disable_remote_root_behaviours(void* clone) {
    if (!clone || !gBehaviourClass) return;

    const void* type = gApi.class_get_type(gBehaviourClass);
    void* systemType = type ? gApi.type_get_object(type) : nullptr;
    if (!systemType) return;

    void* arr =
        invoke1(gApi, gGameObjectClass, clone, "GetComponents", systemType);
    if (!arr) return;

    const uintptr_t count = gApi.array_length(arr);
    if (!count || count > 128) return;

    auto** items = reinterpret_cast<void**>(
        reinterpret_cast<uint8_t*>(arr) + sizeof(void*) * 4);

    for (uintptr_t i = 0; i < count; ++i) {
        void* comp = items[i];
        if (!comp) continue;
        void* klass = gApi.object_get_class(comp);
        const char* name = klass ? gApi.class_get_name(klass) : nullptr;
        if (name && std::strcmp(name, "Animator") == 0) continue;
        uint8_t disabled = 0;
        invoke1(gApi, gBehaviourClass, comp, "set_enabled", &disabled);
    }
}

bool create_remote() {
    if (gRemoteGameObject && gRemoteTransform) return true;
    if (!gLocalGameObject || !resolve_classes()) return false;

    void* clone =
        invoke1(gApi, gObjectClass, nullptr, "Instantiate", gLocalGameObject);
    if (!clone) {
        LOGE("MINBRIDGE Instantiate failed");
        return false;
    }

    void* name = gApi.string_new("SAKURA_LAN_REMOTE");
    invoke1(gApi, gObjectClass, clone, "set_name", name);
    disable_remote_root_behaviours(clone);

    void* transform =
        invoke0(gApi, gGameObjectClass, clone, "get_transform");
    if (!transform) return false;

    gRemoteGameObject = clone;
    gRemoteTransform = transform;

    void* transformClass = gApi.object_get_class(transform);
    Vec3 p{};
    if (transformClass &&
        read_vec3(invoke0(gApi, transformClass, gLocalTransform, "get_position"), p)) {
        p.x += 2.0f;
        invoke1(gApi, transformClass, transform, "set_position", &p);
    }

    LOGI("MINBRIDGE REMOTE CREATED go=%p transform=%p",
         clone, transform);
    return true;
}

void multiplayer_tick(void* self) {
    if (!sakuralan_net_connected()) return;

    void* local = gLocalMove.load();
    if (!local) {
        if (!cache_local(self)) return;
        local = self;
    }
    if (local != self || !gLocalTransform) return;

    void* transformClass = gApi.object_get_class(gLocalTransform);
    if (!transformClass) return;

    if (sakuralan_net_local_player_id() == 1 &&
        !gClientOffsetDone.exchange(true)) {
        Vec3 p{};
        if (read_vec3(
                invoke0(gApi, transformClass, gLocalTransform, "get_position"), p)) {
            p.x += 2.25f;
            invoke1(gApi, transformClass, gLocalTransform, "set_position", &p);
            LOGI("MINBRIDGE CLIENT OFFSET %.2f %.2f %.2f",
                 p.x, p.y, p.z);
        }
    }

    if (!create_remote()) return;

    const auto now = std::chrono::steady_clock::now();
    if (gLastSend.time_since_epoch().count() == 0 ||
        now - gLastSend >= std::chrono::milliseconds(50)) {
        Vec3 p{};
        Quat q{};
        if (read_vec3(
                invoke0(gApi, transformClass, gLocalTransform, "get_position"), p) &&
            read_quat(
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

    void* remoteClass = gApi.object_get_class(gRemoteTransform);
    if (!remoteClass) return;

    Vec3 p{remote[0], remote[1], remote[2]};
    Quat q{remote[3], remote[4], remote[5], remote[6]};
    invoke1(gApi, remoteClass, gRemoteTransform, "set_position", &p);
    invoke1(gApi, remoteClass, gRemoteTransform, "set_rotation", &q);

    static uint32_t applyCount = 0;
    ++applyCount;
    if (applyCount <= 20 || applyCount % 200 == 0) {
        LOGI("MINBRIDGE REMOTE APPLY id=%.0f pos=%.2f %.2f %.2f",
             remote[12], p.x, p.y, p.z);
    }
}

using UpdateFn = void (*)(void*, const void*);
std::atomic<UpdateFn> gOriginalUpdate{nullptr};
std::atomic<uint64_t> gCalls{0};

void hooked_update(void* self, const void* methodInfo) {
    UpdateFn original = gOriginalUpdate.load();
    if (original) original(self, methodInfo);

    multiplayer_tick(self);

    const uint64_t n = ++gCalls;
    if (n <= 20 || n % 5000 == 0) {
        LOGI("MINBRIDGE UPDATE %llu self=%p",
             static_cast<unsigned long long>(n), self);
    }
}

bool install_method_pointer_hook() {
    gCharaMoveClass = gApi.class_from_name(gAssembly, "", "CharaMove");
    if (!gCharaMoveClass) {
        LOGE("MINBRIDGE no CharaMove");
        return false;
    }

    const void* method =
        gApi.class_get_method_from_name(gCharaMoveClass, "Update", 0);
    if (!method) {
        LOGE("MINBRIDGE no CharaMove.Update");
        return false;
    }

    void** slot = reinterpret_cast<void**>(const_cast<void*>(method));
    void* original = slot[0];
    if (!original) {
        LOGE("MINBRIDGE null Update pointer");
        return false;
    }

    const long pageSize = sysconf(_SC_PAGESIZE);
    const uintptr_t address = reinterpret_cast<uintptr_t>(slot);
    const uintptr_t page =
        address & ~(static_cast<uintptr_t>(pageSize) - 1u);

    if (mprotect(reinterpret_cast<void*>(page),
                 static_cast<size_t>(pageSize),
                 PROT_READ | PROT_WRITE) != 0) {
        LOGE("MINBRIDGE mprotect failed");
        return false;
    }

    gOriginalUpdate.store(reinterpret_cast<UpdateFn>(original));
    __atomic_store_n(slot,
                     reinterpret_cast<void*>(hooked_update),
                     __ATOMIC_RELEASE);

    LOGI("MINBRIDGE HOOK INSTALLED method=%p original=%p hook=%p ptr=%zu",
         method, original, reinterpret_cast<void*>(hooked_update),
         sizeof(void*));
    return true;
}

void* worker(void*) {
    LOGI("MINBRIDGE worker waiting for Unity startup");
    sleep(15);
    LOGI("MINBRIDGE worker probing libil2cpp");

    if (!load_api(gApi)) return nullptr;
    LOGI("MINBRIDGE exports loaded");

    void* domain = gApi.domain_get();
    if (!domain) return nullptr;
    gApi.thread_attach(domain);
    LOGI("MINBRIDGE IL2CPP thread attached domain=%p", domain);

    for (int i = 0; i < 300; ++i) {
        gAssembly = find_image(gApi, "Assembly-CSharp");
        gUnityCore = find_image(gApi, "UnityEngine.CoreModule");
        if (gAssembly && gUnityCore) break;
        usleep(100000);
    }

    LOGI("MINBRIDGE IMAGES csharp=%p unity=%p",
         gAssembly, gUnityCore);

    if (!gAssembly || !gUnityCore) return nullptr;
    if (!install_method_pointer_hook()) return nullptr;

    // Do not call UnityEngine APIs here. All GameObject/Transform work happens
    // only from CharaMove.Update on Unity's main thread.
    LOGI("MINBRIDGE READY");
    return nullptr;
}

} // namespace

__attribute__((constructor))
static void minbridge_init() {
    LOGI("MINBRIDGE library init");
    pthread_t thread{};
    if (pthread_create(&thread, nullptr, worker, nullptr) == 0)
        pthread_detach(thread);
    else
        LOGE("MINBRIDGE thread create failed");
}
