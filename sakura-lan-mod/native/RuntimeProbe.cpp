#include <android/log.h>
#include <dlfcn.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

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
using ClassGetFields = void* (*)(void*, void**);
using FieldGetName = const char* (*)(void*);
using FieldGetType = const void* (*)(void*);
using TypeGetName = char* (*)(const void*);
using FreeFn = void (*)(void*);
using ClassGetMethods = const void* (*)(void*, void**);
using MethodGetName = const char* (*)(const void*);
using MethodGetParamCount = uint32_t (*)(const void*);
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
    ClassGetFields class_get_fields = nullptr;
    FieldGetName field_get_name = nullptr;
    FieldGetType field_get_type = nullptr;
    TypeGetName type_get_name = nullptr;
    FreeFn free_fn = nullptr;
    ClassGetMethods class_get_methods = nullptr;
    MethodGetName method_get_name = nullptr;
    MethodGetParamCount method_get_param_count = nullptr;
    ClassGetMethodFromName class_get_method_from_name = nullptr;
    RuntimeInvoke runtime_invoke = nullptr;
    StringNew string_new = nullptr;
    ObjectGetClass object_get_class = nullptr;
    ClassGetType class_get_type = nullptr;
    TypeGetObject type_get_object = nullptr;
    ArrayLength array_length = nullptr;
};

template <class T>
bool sym(void* lib, const char* name, T& out) {
    out = reinterpret_cast<T>(dlsym(lib, name));
    if (!out) LOGE("missing export %s", name);
    return out != nullptr;
}

bool load_api(Api& a) {
    for (int i = 0; i < 300; ++i) {
        a.lib = dlopen("libil2cpp.so", RTLD_NOW | RTLD_NOLOAD);
        if (a.lib) break;
        usleep(100000);
    }
    if (!a.lib) {
        LOGE("libil2cpp.so never appeared");
        return false;
    }

    bool ok = true;
    ok &= sym(a.lib, "il2cpp_domain_get", a.domain_get);
    ok &= sym(a.lib, "il2cpp_thread_attach", a.thread_attach);
    ok &= sym(a.lib, "il2cpp_domain_get_assemblies", a.domain_get_assemblies);
    ok &= sym(a.lib, "il2cpp_assembly_get_image", a.assembly_get_image);
    ok &= sym(a.lib, "il2cpp_image_get_name", a.image_get_name);
    ok &= sym(a.lib, "il2cpp_class_from_name", a.class_from_name);
    ok &= sym(a.lib, "il2cpp_class_get_name", a.class_get_name);
    ok &= sym(a.lib, "il2cpp_class_get_namespace", a.class_get_namespace);
    ok &= sym(a.lib, "il2cpp_class_get_fields", a.class_get_fields);
    ok &= sym(a.lib, "il2cpp_field_get_name", a.field_get_name);
    ok &= sym(a.lib, "il2cpp_field_get_type", a.field_get_type);
    ok &= sym(a.lib, "il2cpp_type_get_name", a.type_get_name);
    sym(a.lib, "il2cpp_free", a.free_fn);
    ok &= sym(a.lib, "il2cpp_class_get_methods", a.class_get_methods);
    ok &= sym(a.lib, "il2cpp_method_get_name", a.method_get_name);
    ok &= sym(a.lib, "il2cpp_method_get_param_count", a.method_get_param_count);
    ok &= sym(a.lib, "il2cpp_class_get_method_from_name", a.class_get_method_from_name);
    ok &= sym(a.lib, "il2cpp_runtime_invoke", a.runtime_invoke);
    ok &= sym(a.lib, "il2cpp_string_new", a.string_new);
    ok &= sym(a.lib, "il2cpp_object_get_class", a.object_get_class);
    ok &= sym(a.lib, "il2cpp_class_get_type", a.class_get_type);
    ok &= sym(a.lib, "il2cpp_type_get_object", a.type_get_object);
    sym(a.lib, "il2cpp_array_length", a.array_length);
    return ok;
}

const void* image_by_name(Api& a, const char* wanted) {
    void* domain = a.domain_get();
    size_t count = 0;
    const void** assemblies = a.domain_get_assemblies(domain, &count);
    for (size_t i = 0; i < count; ++i) {
        const void* img = a.assembly_get_image(assemblies[i]);
        const char* name = img ? a.image_get_name(img) : nullptr;
        if (name && std::strncmp(name, wanted, std::strlen(wanted)) == 0) return img;
    }
    return nullptr;
}

void dump_class(Api& a, const void* image, const char* ns, const char* name) {
    void* klass = a.class_from_name(image, ns, name);
    if (!klass) {
        LOGE("class not found %s.%s", ns, name);
        return;
    }
    LOGI("CLASS %s.%s @%p", ns, name, klass);

    void* iter = nullptr;
    for (int n = 0; n < 500; ++n) {
        void* field = a.class_get_fields(klass, &iter);
        if (!field) break;
        const char* fn = a.field_get_name(field);
        const void* ft = a.field_get_type(field);
        char* tn = ft ? a.type_get_name(ft) : nullptr;
        LOGI(" FIELD %s : %s", fn ? fn : "?", tn ? tn : "?");
        if (tn && a.free_fn) a.free_fn(tn);
    }

    iter = nullptr;
    for (int n = 0; n < 800; ++n) {
        const void* method = a.class_get_methods(klass, &iter);
        if (!method) break;
        const char* mn = a.method_get_name(method);
        uint32_t pc = a.method_get_param_count(method);
        LOGI(" METHOD %s/%u", mn ? mn : "?", pc);
    }
}

std::string il2cpp_string_to_ascii(void* strObj) {
    if (!strObj) return {};
    auto* base = reinterpret_cast<uint8_t*>(strObj);
    int32_t slen = *reinterpret_cast<int32_t*>(base + 16);
    if (slen <= 0 || slen > 300) return {};
    auto* chars = reinterpret_cast<uint16_t*>(base + 20);
    std::string out;
    out.reserve(static_cast<size_t>(slen));
    for (int32_t i = 0; i < slen; ++i) {
        const uint16_t ch = chars[i];
        out.push_back(ch < 128 ? static_cast<char>(ch) : '?');
    }
    return out;
}

void* invoke0(Api& a, void* klass, void* instance, const char* methodName) {
    const void* m = a.class_get_method_from_name(klass, methodName, 0);
    if (!m) return nullptr;
    void* exc = nullptr;
    void* result = a.runtime_invoke(m, instance, nullptr, &exc);
    if (exc) LOGE("exception invoking %s", methodName);
    return exc ? nullptr : result;
}

void* invoke1(Api& a, void* klass, void* instance, const char* methodName, void* arg0) {
    const void* m = a.class_get_method_from_name(klass, methodName, 1);
    if (!m) return nullptr;
    void* args[1] = {arg0};
    void* exc = nullptr;
    void* result = a.runtime_invoke(m, instance, args, &exc);
    if (exc) LOGE("exception invoking %s", methodName);
    return exc ? nullptr : result;
}

bool playerish(const std::string& n) {
    return n.find("Player") != std::string::npos ||
           n.find("Chara") != std::string::npos ||
           n.find("Character") != std::string::npos ||
           n.find("Girl") != std::string::npos ||
           n.find("Boku") != std::string::npos ||
           n.find("Aida") != std::string::npos;
}

void log_components(Api& a, const void* unityCore, void* go, const std::string& goName) {
    void* goClass = a.class_from_name(unityCore, "UnityEngine", "GameObject");
    void* componentClass = a.class_from_name(unityCore, "UnityEngine", "Component");
    if (!goClass || !componentClass) return;

    const void* componentType = a.class_get_type(componentClass);
    void* systemType = a.type_get_object(componentType);
    void* comps = invoke1(a, goClass, go, "GetComponents", systemType);
    if (!comps || !a.array_length) return;

    uintptr_t count = a.array_length(comps);
    if (!count || count > 256) return;
    auto** vec = reinterpret_cast<void**>(reinterpret_cast<uint8_t*>(comps) + 32);

    LOGI(" PLAYER_OBJECT %s components=%zu @%p", goName.c_str(), static_cast<size_t>(count), go);
    for (uintptr_t i = 0; i < count; ++i) {
        void* comp = vec[i];
        if (!comp) continue;
        void* klass = a.object_get_class(comp);
        const char* cn = klass ? a.class_get_name(klass) : nullptr;
        const char* ns = klass ? a.class_get_namespace(klass) : nullptr;
        LOGI("  COMPONENT %s.%s @%p", ns ? ns : "", cn ? cn : "?", comp);
    }

    void* transform = invoke0(a, goClass, go, "get_transform");
    if (!transform) return;
    void* transformClass = a.object_get_class(transform);
    if (!transformClass) return;
    void* boxedPos = invoke0(a, transformClass, transform, "get_position");
    if (!boxedPos) return;
    auto* payload = reinterpret_cast<float*>(reinterpret_cast<uint8_t*>(boxedPos) + 16);
    LOGI("  POSITION %.3f %.3f %.3f", payload[0], payload[1], payload[2]);
}

void runtime_find_probe(Api& a, const void* unityCore) {
    void* goClass = a.class_from_name(unityCore, "UnityEngine", "GameObject");
    void* objClass = a.class_from_name(unityCore, "UnityEngine", "Object");
    if (!goClass || !objClass) return;

    const char* names[] = {
        "CharacterBaseManager",
        "CharaMakeTPCManager",
        "Character Joystick",
        "GirlChild1_FBX(Player",
        "GirlChild1_FBX(Player(Clone)",
        "Boku_Uniform1(Player",
        "Boku_Uniform1(Player(Clone)",
        "AidaChild1_FBX(Player",
        "AidaChild1_FBX(Player(Clone)",
    };
    for (const char* name : names) {
        void* obj = invoke1(a, goClass, nullptr, "Find", a.string_new(name));
        if (obj) LOGI("FIND '%s' => %p", name, obj);
    }

    const void* goType = a.class_get_type(goClass);
    void* systemType = a.type_get_object(goType);
    void* array = invoke1(a, objClass, nullptr, "FindObjectsOfType", systemType);
    if (!array || !a.array_length) return;

    uintptr_t length = a.array_length(array);
    LOGI("ACTIVE GAMEOBJECTS length=%zu", static_cast<size_t>(length));
    if (!length || length > 30000) return;

    auto** vec = reinterpret_cast<void**>(reinterpret_cast<uint8_t*>(array) + 32);
    int logged = 0;
    for (uintptr_t i = 0; i < length && logged < 80; ++i) {
        void* item = vec[i];
        if (!item) continue;
        void* strObj = invoke0(a, objClass, item, "get_name");
        std::string name = il2cpp_string_to_ascii(strObj);
        if (!playerish(name)) continue;
        log_components(a, unityCore, item, name);
        ++logged;
    }
}

void* worker(void*) {
    Api a;
    if (!load_api(a)) return nullptr;

    void* domain = a.domain_get();
    if (!domain) {
        LOGE("domain unavailable");
        return nullptr;
    }
    a.thread_attach(domain);
    LOGI("runtime IL2CPP probe attached");

    const void* asmCSharp = nullptr;
    const void* unityCore = nullptr;
    for (int i = 0; i < 300 && (!asmCSharp || !unityCore); ++i) {
        asmCSharp = image_by_name(a, "Assembly-CSharp");
        unityCore = image_by_name(a, "UnityEngine.CoreModule");
        if (asmCSharp && unityCore) break;
        usleep(100000);
    }

    LOGI("images Assembly-CSharp=%p UnityEngine.CoreModule=%p", asmCSharp, unityCore);
    if (asmCSharp) {
        dump_class(a, asmCSharp, "", "CharaMove");
        dump_class(a, asmCSharp, "", "CharacterBaseManager");
        dump_class(a, asmCSharp, "", "CharaMakeTPCManager");
        dump_class(a, asmCSharp, "", "CanvasJoystickManager");
    }

    if (unityCore) {
        for (int i = 0; i < 150; ++i) {
            runtime_find_probe(a, unityCore);
            sleep(1);
        }
    }
    return nullptr;
}

} // namespace

__attribute__((constructor))
static void sakura_lan_init() {
    LOGI("libsakuralan loaded");
    pthread_t t{};
    if (pthread_create(&t, nullptr, worker, nullptr) == 0) pthread_detach(t);
    else LOGE("pthread_create failed");
}
