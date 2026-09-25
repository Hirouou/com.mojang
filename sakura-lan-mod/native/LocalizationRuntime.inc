// Runtime PT-BR integration layered onto Sakura's existing Localize pipeline.
// PT-BR behaves like a fifth language in the existing selector without
// extending the serialized LanguageType enum (which only has four values).
#include "PtBrCatalog.inc"

void* gLocalizeClass = nullptr;
bool gPtBrInitialized = false;
bool gPtBrActive = false;
bool gPtBrPatched = false;
void* gPtBrPatchedInstance = nullptr;
int32_t gPtBrPreviousLanguage = -1;
std::chrono::steady_clock::time_point gLastLocalizationTick{};
std::map<std::string, std::string> gPtBrOriginalEnglish;

void* read_ref_field_raw(void* klass, void* object, const char* fieldName) {
    if (!klass || !object) return nullptr;
    void* field = gApi.class_get_field(klass, fieldName);
    if (!field) return nullptr;
    void* value = nullptr;
    gApi.field_get_value(object, field, &value);
    return value;
}

bool write_ref_field_raw(void* klass, void* object, const char* fieldName, void* value) {
    if (!klass || !object) return false;
    void* field = gApi.class_get_field(klass, fieldName);
    if (!field) return false;
    gApi.field_set_value(object, field, &value);
    return true;
}

int ptbr_pref_get() {
    if (!gUnityCore) return 0;
    void* klass = gApi.class_from_name(gUnityCore, "UnityEngine", "PlayerPrefs");
    if (!klass) return 0;
    void* key = gApi.string_new("SAKURA_LAN_PTBR");
    int32_t def = 0, value = 0;
    void* args[]{key, &def};
    const char* types[]{"System.String", "System.Int32"};
    unbox_value(invoke(gApi, klass, nullptr, "GetInt", 2, args, types), value);
    return value;
}

void ptbr_pref_set(bool enabled) {
    if (!gUnityCore) return;
    void* klass = gApi.class_from_name(gUnityCore, "UnityEngine", "PlayerPrefs");
    if (!klass) return;
    void* key = gApi.string_new("SAKURA_LAN_PTBR");
    int32_t value = enabled ? 1 : 0;
    void* args[]{key, &value};
    const char* types[]{"System.String", "System.Int32"};
    invoke(gApi, klass, nullptr, "SetInt", 2, args, types);
    invoke0(gApi, klass, nullptr, "Save");
}

void localize_refresh_all(void* instance) {
    if (!gLocalizeClass || !instance) return;
    invoke0(gApi, gLocalizeClass, instance, "RefreshLocalizeUIs");
    invoke0(gApi, gLocalizeClass, instance, "RefreshLocalizeDics");
    invoke0(gApi, gLocalizeClass, instance, "RefreshLocalizeStrs");
}

void localize_change_language(void* instance, const char* name) {
    if (!gLocalizeClass || !instance || !name) return;
    void* str = gApi.string_new(name);
    void* args[]{str};
    const char* types[]{"System.String"};
    invoke(gApi, gLocalizeClass, instance, "ChangeLanguage", 1, args, types);
}

std::string ptbr_original_key(const char* group, void* word, const std::string& key) {
    return std::string(group ? group : "") + "\x1f" + key + "\x1f" +
           std::to_string(reinterpret_cast<uintptr_t>(word));
}

void patch_localize_group(void* instance, const char* getter, const char* group, bool enable) {
    void* array = invoke0(gApi, gLocalizeClass, instance, getter);
    for (void* word : array_objects(array)) {
        if (!word) continue;
        void* klass = gApi.object_get_class(word);
        const std::string key = string_utf8(read_ref_field_raw(klass, word, "Key"));
        const std::string english = string_utf8(read_ref_field_raw(klass, word, "English"));
        const std::string cacheKey = ptbr_original_key(group, word, key);
        if (enable) {
            if (!gPtBrOriginalEnglish.count(cacheKey)) gPtBrOriginalEnglish[cacheKey] = english;
            const char* translated = ptbr_lookup(group, key, english);
            if (translated) write_ref_field_raw(klass, word, "English", gApi.string_new(translated));
        } else {
            auto it = gPtBrOriginalEnglish.find(cacheKey);
            if (it != gPtBrOriginalEnglish.end())
                write_ref_field_raw(klass, word, "English", gApi.string_new(it->second.c_str()));
        }
    }
}

void patch_localize_ui_strings(bool enable) {
    void* uiClass = gApi.class_from_name(gAssembly, "", "LocalizeUI");
    if (!uiClass) return;
    void* type = gApi.type_get_object(gApi.class_get_type(uiClass));
    for (void* ui : array_objects(invoke1(gApi, gObjectClass, nullptr, "FindObjectsOfType", type))) {
        if (!ui) continue;
        void* klass = gApi.object_get_class(ui);
        const std::string english = string_utf8(read_ref_field_raw(klass, ui, "strEng"));
        if (english.empty()) continue;
        const std::string cacheKey = std::string("UI\x1f") +
            std::to_string(reinterpret_cast<uintptr_t>(ui));
        if (enable) {
            if (!gPtBrOriginalEnglish.count(cacheKey)) gPtBrOriginalEnglish[cacheKey] = english;
            const char* translated = ptbr_lookup("*", "", english);
            if (translated) write_ref_field_raw(klass, ui, "strEng", gApi.string_new(translated));
        } else {
            auto it = gPtBrOriginalEnglish.find(cacheKey);
            if (it != gPtBrOriginalEnglish.end())
                write_ref_field_raw(klass, ui, "strEng", gApi.string_new(it->second.c_str()));
        }
        invoke0(gApi, klass, ui, "Refresh");
    }
}

void ptbr_patch(bool enable, void* instance) {
    if (!instance) return;
    if (enable == gPtBrPatched && (!enable || instance == gPtBrPatchedInstance)) {
        localize_refresh_all(instance);
        return;
    }
    struct Group { const char* getter; const char* name; };
    static const Group groups[] = {
        {"getWord", "Word"}, {"getChat", "Chat"}, {"getName", "Name"},
        {"getDamage", "Damage"}, {"getDie", "Die"}, {"getShop", "Shop"},
        {"getAisatu", "Aisatu"}, {"getEventNotice", "EventNotice"},
        {"getCloth", "Cloth"}, {"getMessage", "Message"},
        {"getButtonName", "ButtonName"}, {"getButtonLabel", "ButtonLabel"},
    };
    for (const auto& group : groups)
        patch_localize_group(instance, group.getter, group.name, enable);
    patch_localize_ui_strings(enable);
    gPtBrPatched = enable;
    gPtBrPatchedInstance = enable ? instance : nullptr;
    localize_refresh_all(instance);
    LOGI("LOCALIZE PTBR %s", enable ? "ON" : "OFF");
}

void localization_runtime_tick() {
    const auto now = std::chrono::steady_clock::now();
    if (gLastLocalizationTick.time_since_epoch().count() &&
        now - gLastLocalizationTick < std::chrono::milliseconds(100)) return;
    gLastLocalizationTick = now;

    if (!gLocalizeClass) gLocalizeClass = gApi.class_from_name(gAssembly, "", "Localize");
    if (!gLocalizeClass) return;
    void* instance = nullptr;
    if (!read_field(gLocalizeClass, nullptr, "Instance", "Localize", instance) || !instance) return;
    bool loaded = false;
    if (!read_field(gLocalizeClass, instance, "LoadColEnd", "System.Boolean", loaded) || !loaded) return;

    int32_t language = 0;
    if (!read_field(gLocalizeClass, instance, "CurrentLanguageKey", "Localize.LanguageType", language))
        return;

    if (!gPtBrInitialized) {
        gPtBrInitialized = true;
        gPtBrPreviousLanguage = language;
        gPtBrActive = ptbr_pref_get() != 0;
        if (gPtBrActive) {
            localize_change_language(instance, "English");
            ptbr_patch(true, instance);
            gPtBrPreviousLanguage = 0;
        }
        return;
    }

    if (gPtBrActive && instance != gPtBrPatchedInstance) {
        // Localize is recreated on some scene transitions. Patch the new
        // arrays before refreshing the newly-created UI.
        gPtBrPatched = false;
        ptbr_patch(true, instance);
    }

    if (!gPtBrActive) {
        // Sakura's native cycle is English -> Japanese -> ChineseS ->
        // ChineseT -> English. Replace that final transition with PT-BR.
        if (gPtBrPreviousLanguage == 3 && language == 0) {
            gPtBrActive = true;
            ptbr_pref_set(true);
            ptbr_patch(true, instance);
            language = 0;
        }
    } else {
        // While PT-BR is active the underlying enum deliberately stays at
        // English. The next native click would move to Japanese; intercept it
        // and expose normal English as the next selector entry instead.
        if (language == 1) {
            ptbr_patch(false, instance);
            gPtBrActive = false;
            ptbr_pref_set(false);
            localize_change_language(instance, "English");
            language = 0;
        } else if (language != 0) {
            ptbr_patch(false, instance);
            gPtBrActive = false;
            ptbr_pref_set(false);
        } else {
            // Newly enabled UI objects can appear after scene changes.
            patch_localize_ui_strings(true);
        }
    }
    gPtBrPreviousLanguage = language;
}

void reset_localization_runtime() {
    gLastLocalizationTick = {};
}
