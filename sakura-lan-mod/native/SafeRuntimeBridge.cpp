#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <dlfcn.h>
#include <link.h>
#include <pthread.h>
#include <jni.h>
#include <string>
#include <thread>
#include <unistd.h>
#include <sys/mman.h>
#include <cmath>
#include <algorithm>
#include <map>
#include <vector>
#include <tuple>
#include "../src/LanProtocol.hpp"
#include "NearCodePage.hpp"

extern "C" {
int sakuralan_net_connected();
int sakuralan_net_local_player_id();
int sakuralan_net_ci_pose();
void sakuralan_net_send_state(float px, float py, float pz,
                              float qx, float qy, float qz, float qw,
                              float vx, float vy, float vz,
                              uint16_t animationId, uint8_t flags);
int sakuralan_net_take_remote(float* out13);
void sakuralan_net_send_visual(const sakura_lan::VisualStatePayload*);
int sakuralan_net_take_visual(sakura_lan::VisualStatePayload*);
void sakuralan_net_send_session(const sakura_lan::SessionStatePayload*);
int sakuralan_net_host_snapshot(sakura_lan::SessionStatePayload*);
}

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "SakuraLAN", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "SakuraLAN", __VA_ARGS__)

namespace {

using DomainGet = void* (*)();
using ThreadAttach = void* (*)(void*);
using ThreadDetach = void (*)(void*);
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
using ClassGetMethods = const void* (*)(void*, void**);
using MethodGetName = const char* (*)(const void*);
using MethodGetParamCount = uint32_t (*)(const void*);
using MethodGetParam = const void* (*)(const void*, uint32_t);
using MethodIsGeneric = bool (*)(const void*);
using TypeGetName = char* (*)(const void*);
using Free = void (*)(void*);
using ObjectUnbox = void* (*)(void*);
using ObjectNew = void* (*)(void*);
using ClassGetParent = void* (*)(void*);
using GcHandleNew = uint32_t (*)(void*, bool);
using GcHandleFree = void (*)(uint32_t);
using ClassGetField = void* (*)(void*, const char*);
using FieldGetValue = void (*)(void*, void*, void*);
using FieldSetValue = void (*)(void*, void*, void*);
using FieldStaticGetValue = void (*)(void*, void*);
using FieldGetType = const void* (*)(void*);

struct Api {
    void* lib = nullptr;
    DomainGet domain_get = nullptr;
    ThreadAttach thread_attach = nullptr;
    ThreadDetach thread_detach = nullptr;
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
    ClassGetMethods class_get_methods = nullptr;
    MethodGetName method_get_name = nullptr;
    MethodGetParamCount method_get_param_count = nullptr;
    MethodGetParam method_get_param = nullptr;
    MethodIsGeneric method_is_generic = nullptr;
    TypeGetName type_get_name = nullptr;
    Free free_fn = nullptr;
    ObjectUnbox object_unbox = nullptr;
    ObjectNew object_new = nullptr;
    ClassGetParent class_get_parent = nullptr;
    GcHandleNew gchandle_new = nullptr;
    GcHandleFree gchandle_free = nullptr;
    ClassGetField class_get_field = nullptr;
    FieldGetValue field_get_value = nullptr;
    FieldSetValue field_set_value = nullptr;
    FieldStaticGetValue field_static_get_value = nullptr;
    FieldGetType field_get_type = nullptr;
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
    ok &= load_symbol(a.lib, "il2cpp_thread_detach", a.thread_detach);
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
    ok &= load_symbol(a.lib, "il2cpp_class_get_methods", a.class_get_methods);
    ok &= load_symbol(a.lib, "il2cpp_method_get_name", a.method_get_name);
    ok &= load_symbol(a.lib, "il2cpp_method_get_param_count", a.method_get_param_count);
    ok &= load_symbol(a.lib, "il2cpp_method_get_param", a.method_get_param);
    ok &= load_symbol(a.lib, "il2cpp_method_is_generic", a.method_is_generic);
    ok &= load_symbol(a.lib, "il2cpp_type_get_name", a.type_get_name);
    ok &= load_symbol(a.lib, "il2cpp_free", a.free_fn);
    ok &= load_symbol(a.lib, "il2cpp_object_unbox", a.object_unbox);
    ok &= load_symbol(a.lib, "il2cpp_object_new", a.object_new);
    ok &= load_symbol(a.lib, "il2cpp_class_get_parent", a.class_get_parent);
    ok &= load_symbol(a.lib, "il2cpp_gchandle_new", a.gchandle_new);
    ok &= load_symbol(a.lib, "il2cpp_gchandle_free", a.gchandle_free);
    ok &= load_symbol(a.lib, "il2cpp_class_get_field_from_name", a.class_get_field);
    ok &= load_symbol(a.lib, "il2cpp_field_get_value", a.field_get_value);
    ok &= load_symbol(a.lib, "il2cpp_field_set_value", a.field_set_value);
    ok &= load_symbol(a.lib, "il2cpp_field_static_get_value", a.field_static_get_value);
    ok &= load_symbol(a.lib, "il2cpp_field_get_type", a.field_get_type);
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

// Select by concrete parameter types, never by arity alone (e.g. Play has
// both string and int overloads; GetComponents also has List overloads).
const void* find_method(Api& a, void* klass, const char* name, int argc,
                        const char* const* types = nullptr) {
    std::string signature;
    for (int i = 0; types && i < argc; ++i) signature += std::string(types[i]) + ";";
    using Key = std::tuple<void*, std::string, int, std::string>;
    static std::map<Key, const void*> cache;
    const Key key{klass, name, argc, signature};
    auto cached = cache.find(key);
    if (cached != cache.end()) return cached->second;
    for (void* current = klass; current; current = a.class_get_parent(current)) {
        void* iter = nullptr;
        while (const void* m = a.class_get_methods(current, &iter)) {
            if (a.method_is_generic(m) || a.method_get_param_count(m) != static_cast<uint32_t>(argc) ||
                std::strcmp(a.method_get_name(m), name) != 0) continue;
            bool match = true;
            for (int i = 0; types && i < argc; ++i) {
                char* type = a.type_get_name(a.method_get_param(m, i));
                match &= type && std::strcmp(type, types[i]) == 0;
                if (type) a.free_fn(type);
            }
            if (match) return cache[key] = m;
        }
    }
    LOGE("ARMHOOK missing method %s.%s/%d", klass ? a.class_get_name(klass) : "null", name, argc);
    return cache[key] = nullptr;
}

void* invoke(Api& a, void* klass, void* instance, const char* name, int argc,
             void** args = nullptr, const char* const* types = nullptr) {
    const void* method = find_method(a, klass, name, argc, types);
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
    const char* type = nullptr;
    if (std::strcmp(name, "GetComponents") == 0 ||
        std::strcmp(name, "GetComponent") == 0 ||
        std::strcmp(name, "FindObjectsOfType") == 0 ||
        std::strcmp(name, "FindObjectsOfTypeAll") == 0) type = "System.Type";
    if (std::strcmp(name, "Instantiate") == 0 ||
        std::strcmp(name, "DestroyImmediate") == 0) type = "UnityEngine.Object";
    return invoke(a, klass, instance, name, 1, args, type ? &type : nullptr);
}

std::string string_utf8(void* str) {
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
        uint32_t ch = chars[i];
        if (ch >= 0xd800 && ch <= 0xdbff && i + 1 < length &&
            chars[i + 1] >= 0xdc00 && chars[i + 1] <= 0xdfff) {
            ch = 0x10000 + ((ch - 0xd800) << 10) + (chars[++i] - 0xdc00);
        }
        if (ch < 0x80) out.push_back(static_cast<char>(ch));
        else if (ch < 0x800) {
            out.push_back(static_cast<char>(0xc0 | (ch >> 6)));
            out.push_back(static_cast<char>(0x80 | (ch & 63)));
        } else if (ch < 0x10000) {
            out.push_back(static_cast<char>(0xe0 | (ch >> 12)));
            out.push_back(static_cast<char>(0x80 | ((ch >> 6) & 63)));
            out.push_back(static_cast<char>(0x80 | (ch & 63)));
        } else {
            out.push_back(static_cast<char>(0xf0 | (ch >> 18)));
            out.push_back(static_cast<char>(0x80 | ((ch >> 12) & 63)));
            out.push_back(static_cast<char>(0x80 | ((ch >> 6) & 63)));
            out.push_back(static_cast<char>(0x80 | (ch & 63)));
        }
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
void* gSystemClass = nullptr;

std::atomic<void*> gLocalMove{nullptr};
void* gLocalGameObject = nullptr;
void* gLocalTransform = nullptr;
void* gRemoteGameObject = nullptr;
void* gRemoteTransform = nullptr;
bool gRemotePoseReceived = false;
std::atomic<bool> gClientOffsetDone{false};
std::atomic<bool> gCiFacingDone{false};
std::chrono::steady_clock::time_point gLastSend{};
std::vector<uint32_t> gPlayerHandles;
void retain_player_object(void* object) {
    if (object) gPlayerHandles.push_back(gApi.gchandle_new(object, false));
}

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
    if (!gAnimatorClass) {
        const void* animationImage = find_image(gApi, "UnityEngine.AnimationModule");
        if (animationImage) gAnimatorClass = gApi.class_from_name(animationImage, "UnityEngine", "Animator");
    }
    if (!gCharaMoveClass)
        gCharaMoveClass = gApi.class_from_name(gAssembly, "", "CharacterAI");

    return gObjectClass && gComponentClass && gGameObjectClass &&
           gBehaviourClass && gCharaMoveClass;
}

// Resolve fields by name and verify their managed types; never use build offsets.
void* typed_field(void* klass, const char* name, const char* expected) {
    if (!klass) return nullptr;
    void* f = gApi.class_get_field(klass, name);
    if (!f) return nullptr;
    char* type = gApi.type_get_name(gApi.field_get_type(f));
    const bool match = type && std::strcmp(type, expected) == 0;
    if (type) gApi.free_fn(type);
    return match ? f : nullptr;
}
template <typename T>
bool read_field(void* klass, void* object, const char* name, const char* type, T& out) {
    void* f = typed_field(klass, name, type);
    if (!f) return false;
    if (object) gApi.field_get_value(object, f, &out);
    else gApi.field_static_get_value(f, &out);
    return true;
}
template <typename T>
bool write_field(void* klass, void* object, const char* name, const char* type, T value) {
    void* f = typed_field(klass, name, type);
    if (!f || !object) return false;
    gApi.field_set_value(object, f, &value);
    return true;
}

bool cache_local_player(void* manager) {
    if (!resolve_runtime_classes() || !manager) return false;
    void* go = nullptr;
    void* transform = nullptr;
    if (!read_field(gSystemClass, manager, "m_Character", "UnityEngine.GameObject", go) || !go ||
        !read_field(gSystemClass, manager, "m_Charactertransform", "UnityEngine.Transform", transform) || !transform)
        return false;
    const std::string name = string_utf8(invoke0(gApi, gObjectClass, go, "get_name"));
    gLocalMove = manager;
    retain_player_object(manager);
    retain_player_object(go);
    retain_player_object(transform);
    gLocalGameObject = go;
    gLocalTransform = transform;
    LOGI("ARMHOOK LOCAL source=SystemManager.m_Character name=%s go=%p transform=%p",
         name.c_str(), go, transform);
    return true;
}

template <typename T>
bool unbox_value(void* boxed, T& out) {
    if (!boxed) return false;
    void* value = gApi.object_unbox(boxed);
    if (!value) return false;
    std::memcpy(&out, value, sizeof(T));
    return true;
}

std::vector<void*> array_objects(void* array) {
    if (!array) return {};
    const uintptr_t n = gApi.array_length(array);
    if (n > 8192) return {};
    auto** items = reinterpret_cast<void**>(
        static_cast<uint8_t*>(array) + sizeof(void*) * 4);
    return std::vector<void*>(items, items + n);
}

std::vector<void*> child_components(void* go, void* klass) {
    if (!klass || !go) return {};
    void* type = gApi.type_get_object(gApi.class_get_type(klass));
    bool includeInactive = true;
    void* args[]{type, &includeInactive};
    const char* types[]{"System.Type", "System.Boolean"};
    return array_objects(invoke(gApi, gGameObjectClass, go,
                                "GetComponentsInChildren", 2, args, types));
}

bool derives_from(void* klass, const char* name) {
    for (; klass; klass = gApi.class_get_parent(klass)) {
        if (std::strcmp(gApi.class_get_name(klass), name) == 0) return true;
    }
    return false;
}

bool unity_alive(void* object) {
    bool alive = false;
    return object && unbox_value(invoke1(gApi, gObjectClass, nullptr,
                                         "op_Implicit", object), alive) && alive;
}

void make_visual_replica(void* clone, bool stripScripts) {
    for (void* component : child_components(clone, gComponentClass)) {
        if (!component) continue;
        void* klass = gApi.object_get_class(component);
        const char* name = gApi.class_get_name(klass);
        bool off = false;
        if (std::strcmp(name, "Animator") == 0) {
            invoke1(gApi, klass, component, "set_applyRootMotion", &off);
            int32_t alwaysAnimate = 0;
            invoke1(gApi, klass, component, "set_cullingMode", &alwaysAnimate);
        } else if (std::strcmp(name, "SkinnedMeshRenderer") == 0) {
            bool on = true;
            invoke1(gApi, klass, component, "set_updateWhenOffscreen", &on);
        } else if (derives_from(klass, "MonoBehaviour")) {
            if (stripScripts) invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", component);
            else invoke1(gApi, gBehaviourClass, component, "set_enabled", &off);
        } else if (std::strcmp(name, "Camera") == 0 ||
                   std::strcmp(name, "NavMeshAgent") == 0 ||
                   std::strcmp(name, "AudioListener") == 0 ||
                   std::strcmp(name, "AudioSource") == 0) {
            invoke1(gApi, gBehaviourClass, component, "set_enabled", &off);
        } else if (stripScripts && derives_from(klass, "Collider")) {
            invoke1(gApi, klass, component, "set_enabled", &off);
        } else if (std::strcmp(name, "Rigidbody") == 0) {
            bool on = true;
            invoke1(gApi, klass, component, "set_isKinematic", &on);
            if (stripScripts) invoke1(gApi, klass, component, "set_detectCollisions", &off);
        }
    }
}

bool create_remote_avatar() {
    if (gRemoteGameObject && gRemoteTransform) {
        if (unity_alive(gRemoteGameObject)) return true;
        gRemoteGameObject = gRemoteTransform = nullptr;
    }
    if (!gLocalGameObject || !resolve_runtime_classes()) return false;

    // Instantiate beneath an inactive staging parent. This prevents copied
    // gameplay Awake/OnEnable methods from running before scripts are removed.
    void* stage = gApi.object_new(gGameObjectClass);
    if (!stage) return false;
    invoke1(gApi, gGameObjectClass, stage, ".ctor", gApi.string_new("SAKURA_LAN_STAGING"));
    if (!unity_alive(stage)) return false;
    bool off = false;
    invoke1(gApi, gGameObjectClass, stage, "SetActive", &off);
    void* parent = invoke0(gApi, gGameObjectClass, stage, "get_transform");
    bool active = true;
    if (!parent || !unbox_value(invoke0(gApi, gGameObjectClass, stage, "get_activeSelf"), active) || active) {
        invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", stage);
        return false;
    }
    void* args[]{gLocalGameObject, parent, &off};
    const char* types[]{"UnityEngine.Object", "UnityEngine.Transform", "System.Boolean"};
    void* clone = invoke(gApi, gObjectClass, nullptr, "Instantiate", 3, args, types);
    if (!clone) {
        invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", stage);
        LOGE("ARMHOOK remote Instantiate failed");
        return false;
    }
    invoke1(gApi, gObjectClass, clone, "set_name", gApi.string_new("SAKURA_LAN_REMOTE"));
    make_visual_replica(clone, true);
    void* transform = invoke0(gApi, gGameObjectClass, clone, "get_transform");
    if (!transform) {
        invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", stage);
        return false;
    }
    void* transformClass = gApi.object_get_class(transform);
    Vec3 local{};
    if (boxed_vec3(invoke0(gApi, transformClass, gLocalTransform, "get_position"), local)) {
        local.x += 2.25f;
        invoke1(gApi, transformClass, transform, "set_position", &local);
    }
    bool worldPositionStays = true;
    void* parentArgs[]{nullptr, &worldPositionStays};
    const char* parentTypes[]{"UnityEngine.Transform", "System.Boolean"};
    invoke(gApi, transformClass, transform, "SetParent", 2, parentArgs, parentTypes);
    if (invoke0(gApi, transformClass, transform, "get_parent")) {
        invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", stage);
        return false;
    }
    invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", stage);
    // Do not display an invented position while waiting for the peer's state.
    invoke1(gApi, gGameObjectClass, clone, "SetActive", &off);
    gRemotePoseReceived = false;
    gRemoteGameObject = clone;
    gRemoteTransform = transform;
    retain_player_object(clone);
    retain_player_object(transform);
    LOGI("ARMHOOK REMOTE CREATED go=%p transform=%p", clone, transform);
    void* rendererClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Renderer");
    LOGI("ARMHOOK REMOTE RENDERERS count=%zu", child_components(clone, rendererClass).size());
    return true;
}

#include "VisualRuntimeSync.inc"

void multiplayer_tick(void* self) {
    if (gLocalGameObject && !unity_alive(gLocalGameObject)) {
        reset_visual_sync();
        if (unity_alive(gRemoteGameObject))
            invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", gRemoteGameObject);
        for (uint32_t handle : gPlayerHandles) gApi.gchandle_free(handle);
        gPlayerHandles.clear();
        gLocalMove = nullptr;
        gLocalGameObject = gLocalTransform = nullptr;
        gRemoteGameObject = gRemoteTransform = nullptr;
        gClientOffsetDone = false;
        gCiFacingDone = false;
        gLastSend = {};
    }

    void* selected = gLocalMove.load();
    if (!selected) {
        if (!cache_local_player(self)) return;
        selected = self;
    }
    if (selected != self || !gLocalTransform) return;
    if (!sakuralan_net_connected()) return;

    void* transformClass = gApi.object_get_class(gLocalTransform);
    if (!transformClass) return;

    if (sakuralan_net_local_player_id() == 1 &&
        !gClientOffsetDone.load()) {
        Vec3 p{};
        if (boxed_vec3(
                invoke0(gApi, transformClass, gLocalTransform, "get_position"), p)) {
            p.x += 2.25f;
            invoke1(gApi, transformClass, gLocalTransform, "set_position", &p);
            gClientOffsetDone = true;
            LOGI("ARMHOOK CLIENT OFFSET %.2f %.2f %.2f", p.x, p.y, p.z);
        }
    }

    if (sakuralan_net_ci_pose() && !gCiFacingDone.exchange(true)) {
        constexpr float kHalfSqrt2 = 0.70710678f;
        const bool client = sakuralan_net_local_player_id() == 1;
        Quat facing{0.0f, client ? -kHalfSqrt2 : kHalfSqrt2,
                    0.0f, kHalfSqrt2};
        invoke1(gApi, transformClass, gLocalTransform, "set_rotation", &facing);
        LOGI("ARMHOOK CI FACE role=%s", client ? "client" : "host");
    }

    if (!create_remote_avatar()) return;
    visual_sync_tick();

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

    for (int i = 0; i < 7; ++i) if (!std::isfinite(remote[i])) return;
    const float norm = remote[3]*remote[3] + remote[4]*remote[4] +
                       remote[5]*remote[5] + remote[6]*remote[6];
    if (norm < 0.5f || norm > 1.5f) return;
    Vec3 p{remote[0], remote[1], remote[2]};
    Quat q{remote[3], remote[4], remote[5], remote[6]};
    invoke1(gApi, remoteTransformClass, gRemoteTransform, "set_position", &p);
    invoke1(gApi, remoteTransformClass, gRemoteTransform, "set_rotation", &q);
    if (!gRemotePoseReceived) {
        bool on = true;
        invoke1(gApi, gGameObjectClass, gRemoteGameObject, "SetActive", &on);
        gRemotePoseReceived = true;
        LOGI("ARMHOOK REMOTE VISIBLE after first peer pose");
    }

    static uint32_t applied = 0;
    ++applied;
    if (applied <= 20 || applied % 200 == 0) {
        LOGI("ARMHOOK REMOTE APPLY id=%.0f pos=%.2f %.2f %.2f",
             remote[12], p.x, p.y, p.z);
        Vec3 actual{};
        boxed_vec3(invoke0(gApi, remoteTransformClass, gRemoteTransform, "get_position"), actual);
        bool active = false;
        unbox_value(invoke0(gApi, gGameObjectClass, gRemoteGameObject, "get_activeInHierarchy"), active);
        LOGI("ARMHOOK REMOTE CHECK active=%d actual=%.2f %.2f %.2f", active, actual.x, actual.y, actual.z);
    }
}

#include "SessionRuntime.inc"

using CharaUpdate = void (*)(void*, const void*);
std::atomic<CharaUpdate> gOriginalUpdate{nullptr};
std::atomic<uint64_t> gHookCalls{0};

void hooked_update(void* self, const void* methodInfo) {
    const uint64_t n = ++gHookCalls;
    if (n <= 3) LOGI("ARMHOOK ENTER call=%llu self=%p",
                     static_cast<unsigned long long>(n), self);
    CharaUpdate original = gOriginalUpdate.load(std::memory_order_acquire);
    if (original) original(self, methodInfo);
    session_tick(self);

    if (n <= 10 || n % 5000 == 0) {
        LOGI("ARMHOOK UPDATE call=%llu self=%p",
             static_cast<unsigned long long>(n), self);
    }
}

#if defined(__arm__)
uint8_t* reserved_arm_relay(uintptr_t target, size_t pageSize) {
    struct Search { uintptr_t target; size_t pageSize; uint8_t* result; } search{target, pageSize, nullptr};
    dl_iterate_phdr([](dl_phdr_info* info, size_t, void* opaque) {
        auto& s = *static_cast<Search*>(opaque);
        bool containsTarget = false;
        for (ElfW(Half) i = 0; i < info->dlpi_phnum; ++i) {
            const auto& p = info->dlpi_phdr[i];
            const uintptr_t start = info->dlpi_addr + p.p_vaddr;
            if (p.p_type == PT_LOAD && s.target >= start && s.target - start < p.p_memsz)
                containsTarget = true;
        }
        if (!containsTarget) return 0;
        constexpr char marker[] = "SAKURA_LAN_RELAY_V1";
        for (ElfW(Half) i = 0; i < info->dlpi_phnum; ++i) {
            const auto& p = info->dlpi_phdr[i];
            if (p.p_type != PT_LOAD || !(p.p_flags & PF_R) || p.p_filesz < 0x8000) continue;
            auto* relay = reinterpret_cast<uint8_t*>(info->dlpi_addr + p.p_vaddr + 0x4000);
            const uintptr_t address = reinterpret_cast<uintptr_t>(relay);
            if (s.pageSize > 0x4000 || address % s.pageSize ||
                std::memcmp(relay, marker, sizeof(marker)) != 0) continue;
            const int64_t delta = int64_t(address) + 16 - int64_t(s.target + 8);
            if (delta < -0x2000000 || delta > 0x1fffffc) continue;
            if (mprotect(relay, s.pageSize, PROT_READ | PROT_WRITE) == 0) s.result = relay;
            break;
        }
        return 1;
    }, &search);
    return search.result;
}

bool install_arm32_hook(void* target, void* hook, void** trampolineOut) {
    if (!target || !hook || !trampolineOut) return false;

    const uintptr_t targetAddr = reinterpret_cast<uintptr_t>(target);
    if (targetAddr & 3u) {
        LOGE("ARMHOOK target is Thumb; unsupported target=%p", target);
        return false;
    }

    uint32_t first[4]{};
    std::memcpy(first, target, sizeof(first));
    LOGI("ARMHOOK prologue %08x %08x %08x %08x",
         first[0], first[1], first[2], first[3]);

    // Verified 1.043.04 ARM32 prologue: PUSH + VPUSH, neither reads PC.
    // Fail closed on another build rather than pretending to relocate ARM.
    if (first[0] != 0xe92d4bf0u || first[1] != 0xed2d8b04u) {
        LOGE("ARMHOOK unsupported FadeManager.OnGUI prologue");
        return false;
    }

    const size_t pageSize = static_cast<size_t>(sysconf(_SC_PAGESIZE));
    // A single aligned ARM branch is the publication point. An 8-byte
    // LDR/literal patch can be observed half-written by the Unity thread.
    auto* trampoline = reserved_arm_relay(targetAddr, pageSize);
    const bool reserved = trampoline != nullptr;
    if (reserved) LOGI("ARMHOOK reserved relay=%p", trampoline);
    else trampoline = static_cast<uint8_t*>(allocate_near_code_page(
        targetAddr + 8, 16, -0x2000000, 0x1fffffc, pageSize));
    if (!trampoline) {
        LOGE("ARMHOOK no nearby relay page; target=%p unchanged", target);
        return false;
    }

    std::memcpy(trampoline, target, 8);

    // ARM: LDR pc, [pc, #-4] ; literal(target+8)
    const uint32_t jumpInsn = 0xE51FF004u;
    std::memcpy(trampoline + 8, &jumpInsn, 4);
    const uint32_t resume =
        static_cast<uint32_t>(targetAddr + 8u);
    std::memcpy(trampoline + 12, &resume, 4);
    // Relay uses LDR pc to interwork with a Thumb-compiled replacement.
    std::memcpy(trampoline + 16, &jumpInsn, 4);
    const uint32_t hookAddr =
        static_cast<uint32_t>(reinterpret_cast<uintptr_t>(hook));
    std::memcpy(trampoline + 20, &hookAddr, 4);
    __builtin___clear_cache(reinterpret_cast<char*>(trampoline),
                            reinterpret_cast<char*>(trampoline + 24));
    if (mprotect(trampoline, pageSize, PROT_READ | PROT_EXEC) != 0) {
        if (!reserved) munmap(trampoline, pageSize);
        return false;
    }

    const uintptr_t page =
        targetAddr & ~(static_cast<uintptr_t>(pageSize) - 1u);
    if (mprotect(reinterpret_cast<void*>(page), pageSize,
                 PROT_READ | PROT_WRITE | PROT_EXEC) != 0) {
        LOGE("ARMHOOK mprotect target failed");
        if (!reserved) munmap(trampoline, pageSize);
        return false;
    }

    // Publish the original before any game thread can enter the replacement.
    *trampolineOut = trampoline;
    gOriginalUpdate.store(reinterpret_cast<CharaUpdate>(trampoline),
                          std::memory_order_release);
    const int64_t distance = static_cast<int64_t>(reinterpret_cast<uintptr_t>(trampoline + 16)) -
                             static_cast<int64_t>(targetAddr + 8);
    const uint32_t branch = 0xea000000u |
        (static_cast<uint32_t>(distance / 4) & 0x00ffffffu);
    __atomic_store_n(reinterpret_cast<uint32_t*>(targetAddr), branch,
                     __ATOMIC_RELEASE);
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

#if defined(__aarch64__)
bool a64_pc_relative(uint32_t insn) {
    if ((insn & 0x7c000000u) == 0x14000000u) return true; // B / BL
    if ((insn & 0x1f000000u) == 0x10000000u) return true; // ADR / ADRP
    if ((insn & 0x3b000000u) == 0x18000000u) return true; // literal load
    if ((insn & 0x7e000000u) == 0x34000000u) return true; // CBZ / CBNZ
    if ((insn & 0x7e000000u) == 0x36000000u) return true; // TBZ / TBNZ
    if ((insn & 0xff000010u) == 0x54000000u) return true; // B.cond
    return false;
}

void a64_write_abs_jump(uint8_t* dst, uintptr_t address) {
    // ldr x17, #8 ; br x17 ; .quad address
    const uint32_t ldr = 0x58000051u;
    const uint32_t br = 0xd61f0220u;
    std::memcpy(dst + 0, &ldr, 4);
    std::memcpy(dst + 4, &br, 4);
    const uint64_t value = static_cast<uint64_t>(address);
    std::memcpy(dst + 8, &value, 8);
}

bool install_arm64_hook(void* target, void* hook, void** trampolineOut) {
    if (!target || !hook || !trampolineOut) return false;

    const uintptr_t targetAddr = reinterpret_cast<uintptr_t>(target);
    if (targetAddr & 3u) {
        LOGE("ARMHOOK64 unaligned target=%p", target);
        return false;
    }

    uint32_t first = 0;
    std::memcpy(&first, target, sizeof(first));
    LOGI("ARMHOOK64 first=%08x target=%p", first, target);
    if (a64_pc_relative(first)) {
        LOGE("ARMHOOK64 first instruction requires relocation");
        return false;
    }

    const size_t pageSize = static_cast<size_t>(sysconf(_SC_PAGESIZE));
    // One atomic B instruction publishes the hook. Keep the relay within the
    // architectural +/-128 MiB branch range and use absolute jumps after that.
    auto* trampoline = static_cast<uint8_t*>(allocate_near_code_page(
        targetAddr, 64, -0x08000000ll, 0x07fffffcll, pageSize));

    if (!trampoline) {
        LOGE("ARMHOOK64 no nearby relay page");
        return false;
    }

    // Original trampoline: replay exactly one PC-independent instruction,
    // then return to target+4 with an absolute jump.
    std::memcpy(trampoline, target, 4);
    a64_write_abs_jump(trampoline + 4, targetAddr + 4u);

    // Relay reached by the single patched B instruction.
    a64_write_abs_jump(trampoline + 64,
                       reinterpret_cast<uintptr_t>(hook));

    __builtin___clear_cache(reinterpret_cast<char*>(trampoline),
                            reinterpret_cast<char*>(trampoline + 80));
    if (mprotect(trampoline, pageSize, PROT_READ | PROT_EXEC) != 0) {
        LOGE("ARMHOOK64 relay mprotect failed");
        munmap(trampoline, pageSize);
        return false;
    }

    const uintptr_t page =
        targetAddr & ~(static_cast<uintptr_t>(pageSize) - 1u);
    if (mprotect(reinterpret_cast<void*>(page), pageSize,
                 PROT_READ | PROT_WRITE | PROT_EXEC) != 0) {
        LOGE("ARMHOOK64 target mprotect failed");
        munmap(trampoline, pageSize);
        return false;
    }

    *trampolineOut = trampoline;
    gOriginalUpdate.store(reinterpret_cast<CharaUpdate>(trampoline),
                          std::memory_order_release);

    const uintptr_t relayAddr = reinterpret_cast<uintptr_t>(trampoline + 64);
    const int64_t distance =
        static_cast<int64_t>(relayAddr) - static_cast<int64_t>(targetAddr);
    const int64_t imm26 = distance / 4;
    if (imm26 < -(1ll << 25) || imm26 >= (1ll << 25)) {
        LOGE("ARMHOOK64 relay escaped branch range");
        mprotect(reinterpret_cast<void*>(page), pageSize, PROT_READ | PROT_EXEC);
        munmap(trampoline, pageSize);
        return false;
    }

    const uint32_t branch =
        0x14000000u | (static_cast<uint32_t>(imm26) & 0x03ffffffu);
    __atomic_store_n(reinterpret_cast<uint32_t*>(targetAddr), branch,
                     __ATOMIC_RELEASE);
    __builtin___clear_cache(reinterpret_cast<char*>(targetAddr),
                            reinterpret_cast<char*>(targetAddr + 4u));
    mprotect(reinterpret_cast<void*>(page), pageSize, PROT_READ | PROT_EXEC);

    LOGI("ARMHOOK64 inline installed target=%p hook=%p trampoline=%p relay=%p",
         target, hook, trampoline, trampoline + 64);
    return true;
}
#endif

bool install_session_hook() {
    if (!gAssembly) return false;

    void* fadeClass = gApi.class_from_name(gAssembly, "", "FadeManager");
    if (!fadeClass) return false;
    const void* method = gApi.class_get_method_from_name(fadeClass, "OnGUI", 0);
    if (!method) {
        LOGE("ARMHOOK FadeManager.OnGUI missing");
        return false;
    }

    void* target = *reinterpret_cast<void* const*>(method);
    if (!target) {
        LOGE("ARMHOOK FadeManager.OnGUI target null");
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
#elif defined(__aarch64__)
    void* trampoline = nullptr;
    if (!install_arm64_hook(
            target,
            reinterpret_cast<void*>(hooked_update),
            &trampoline)) {
        return false;
    }
#else
    LOGE("ARMHOOK unsupported ABI");
    return false;
#endif

    LOGI("ARMHOOK READY target=%p original=%p hook=%p",
         target, trampoline, reinterpret_cast<void*>(hooked_update));
    return true;
}

void* worker(void*) {
    LOGI("ARMHOOK worker delayed after game resume");
    sleep(12);

    if (!load_api(gApi)) return nullptr;
    LOGI("ARMHOOK API loaded");

    void* domain = nullptr;
    for (int i = 0; i < 600 && !domain; ++i) {
        domain = gApi.domain_get();
        if (!domain) usleep(100000);
    }
    if (!domain) {
        LOGE("ARMHOOK domain unavailable");
        return nullptr;
    }
    LOGI("ARMHOOK domain available; attaching worker");
    void* attached = gApi.thread_attach(domain);
    if (!attached) return nullptr;
    LOGI("ARMHOOK worker attached");
    // IL2CPP/GC must stop tracking this pthread before its stack is unmapped.
    // The old worker returned immediately after READY while still attached.
    struct DetachOnExit {
        void* thread;
        ~DetachOnExit() {
            gApi.thread_detach(thread);
            LOGI("ARMHOOK worker detached");
        }
    } detach{attached};

    for (int i = 0; i < 300; ++i) {
        gAssembly = find_image(gApi, "Assembly-CSharp");
        gUnityCore = find_image(gApi, "UnityEngine.CoreModule");
        if (gAssembly && gUnityCore) break;
        usleep(100000);
    }

    LOGI("ARMHOOK IMAGES csharp=%p unity=%p", gAssembly, gUnityCore);
    if (!gAssembly || !gUnityCore) return nullptr;

    // Install while the menu is loading, independently of the peer handshake.
    // A host may wait indefinitely for a client or for the rewarded ad to end.
    install_session_hook();
    return nullptr;
}

} // namespace

// Loading the LAN menu must not start touching IL2CPP. A user can remain there
// indefinitely; the old constructor timer could expire during Unity startup.
// Start the existing grace period only after the game Activity has resumed.
extern "C" __attribute__((visibility("default")))
JNIEXPORT void JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeGameResumed(JNIEnv*, jclass) {
    static std::atomic<bool> started{false};
    if (started.exchange(true)) return;
    LOGI("ARMHOOK game resumed; starting bridge");
    pthread_t t{};
    if (pthread_create(&t, nullptr, worker, nullptr) == 0) {
        pthread_detach(t);
    } else {
        started.store(false);
        LOGE("ARMHOOK pthread_create failed");
    }
}
