// Executed from FadeManager.OnGUI on Unity's main thread, including the title.
// Verified against 1.043.04 metadata and original ButtonStart's scene-loading path.
std::chrono::steady_clock::time_point gLastSessionTick{}, gLastSessionSend{};
uint32_t gWorldRevision = 0, gClientSpawnRevision = 0;
bool gWasHostReady = false, gClientLoading = false;

std::string active_scene() {
    void* klass = gApi.class_from_name(gUnityCore, "UnityEngine.SceneManagement", "SceneManager");
    if (!klass) return {};
    void* boxed = invoke0(gApi, klass, nullptr, "GetActiveScene");
    if (!boxed) return {};
    return string_utf8(invoke0(gApi, gApi.object_get_class(boxed),
                              gApi.object_unbox(boxed), "get_name"));
}

void clear_player_tracking() {
    reset_visual_sync();
    if (unity_alive(gRemoteRootObject))
        invoke1(gApi, gObjectClass, nullptr, "DestroyImmediate", gRemoteRootObject);
    for (uint32_t handle : gPlayerHandles) gApi.gchandle_free(handle);
    gPlayerHandles.clear();
    gLocalMove = nullptr;
    gLocalGameObject = gLocalTransform = nullptr;
    gRemoteGameObject = gRemoteTransform = nullptr;
    gRemoteRootObject = nullptr;
    gRemotePoseReceived = false;
    gClientOffsetDone = false;
    gCiFacingDone = false;
    gLastSend = {};
}

void client_title(const sakura_lan::SessionStatePayload* snapshot) {
    void* titleClass = gApi.class_from_name(gAssembly, "", "TitleManager");
    void* title = nullptr;
    if (!read_field(titleClass, nullptr, "Instance", "TitleManager", title) || !unity_alive(title)) return;
    bool loaded = false;
    if (!read_field(titleClass, title, "TitleLoaded", "System.Boolean", loaded) || !loaded) return;
    // Client entry is governed by the host snapshot, never by a local New/Load choice.
    for (const char* field : {"NewButton", "LoadButton", "CostumeButton"}) {
        void* button = nullptr;
        if (read_field(titleClass, title, field, "UnityEngine.GameObject", button) && unity_alive(button)) {
            bool off = false;
            invoke1(gApi, gGameObjectClass, button, "SetActive", &off);
        }
    }
    void* text = nullptr;
    if (read_field(titleClass, title, "VerText", "UnityEngine.UI.Text", text) && unity_alive(text)) {
        const char* label = snapshot && snapshot->ready ? "SAKURA LAN: carregando sessao do Host..." :
                                                        "SAKURA LAN: aguardando o Host entrar no mapa...";
        invoke1(gApi, gApi.object_get_class(text), text, "set_text", gApi.string_new(label));
    }
    if (!snapshot || !snapshot->ready || gClientLoading || std::strcmp(snapshot->scene, "wsimulator") != 0) return;
    void* button = nullptr;
    if (!read_field(titleClass, title, "NewButton", "UnityEngine.GameObject", button) || !unity_alive(button)) return;
    void* buttonClass = gApi.class_from_name(gAssembly, "", "ButtonSetting");
    if (!buttonClass) return;
    void* controller = invoke1(gApi, gGameObjectClass, button, "GetComponent",
                               gApi.type_get_object(gApi.class_get_type(buttonClass)));
    const void* start = find_method(gApi, buttonClass, "ButtonNewGamePlayAds", 0);
    if (!controller || !start) return;
    void* error = nullptr;
    gClientLoading = true;
    gApi.runtime_invoke(start, controller, nullptr, &error);
    if (error) {
        LOGE("SESSION client entry failed; original game method raised exception");
        return;
    }
    LOGI("SESSION CLIENT LOAD hostScene=%s revision=%u", snapshot->scene, snapshot->revision);
}

void session_tick(void*) {
    const auto now = std::chrono::steady_clock::now();
    if (gLastSessionTick.time_since_epoch().count() && now - gLastSessionTick < std::chrono::milliseconds(50)) return;
    gLastSessionTick = now;
    if (!resolve_runtime_classes()) return;
    if (!gSystemClass) gSystemClass = gApi.class_from_name(gAssembly, "", "SystemManager");
    const int role = sakuralan_net_local_player_id();
    if (role < 0) return;
    const std::string scene = active_scene();
    sakura_lan::SessionStatePayload snapshot{};
    const bool hasHost = role == 1 && sakuralan_net_host_snapshot(&snapshot);
    if (role == 1 && scene == "Title") {
        client_title(hasHost ? &snapshot : nullptr);
        return;
    }
    void* manager = nullptr;
    void* character = nullptr;
    const bool playable = scene == "wsimulator" &&
        read_field(gSystemClass, nullptr, "Instance", "SystemManager", manager) && unity_alive(manager) &&
        read_field(gSystemClass, manager, "m_Character", "UnityEngine.GameObject", character) && unity_alive(character);
    if (gLocalGameObject && (!playable || character != gLocalGameObject)) clear_player_tracking();
    if (playable && !gLocalGameObject && !cache_local_player(manager)) return;
    if (role == 0) {
        if (playable && !gWasHostReady) ++gWorldRevision;
        gWasHostReady = playable;
        if (!gLastSessionSend.time_since_epoch().count() || now - gLastSessionSend >= std::chrono::milliseconds(250)) {
            sakura_lan::SessionStatePayload host{};
            host.ready = playable;
            host.revision = gWorldRevision;
            std::strncpy(host.scene, scene.c_str(), sizeof(host.scene)-1);
            if (playable) {
                read_field(gSystemClass, manager, "GameTime", "System.Single", host.gameTime);
                read_field(gSystemClass, manager, "day", "System.Int32", host.day);
                read_field(gSystemClass, manager, "week", "System.Int32", host.week);
                void* tc = gApi.object_get_class(gLocalTransform);
                unbox_value(invoke0(gApi, tc, gLocalTransform, "get_position"), host.spawn);
                unbox_value(invoke0(gApi, tc, gLocalTransform, "get_rotation"), host.facing);
            }
            sakuralan_net_send_session(&host);
            gLastSessionSend = now;
        }
    } else {
        if (!playable || !hasHost || !snapshot.ready || scene != snapshot.scene) return;
        // Keep the host's clock/day authoritative; joining does not restart them.
        write_field(gSystemClass, manager, "GameTime", "System.Single", snapshot.gameTime);
        write_field(gSystemClass, manager, "day", "System.Int32", snapshot.day);
        write_field(gSystemClass, manager, "week", "System.Int32", snapshot.week);
        if (gClientSpawnRevision != snapshot.revision) {
            auto pos = snapshot.spawn;
            pos.x += 2.25f;
            void* tc = gApi.object_get_class(gLocalTransform);
            invoke1(gApi, tc, gLocalTransform, "set_position", &pos);
            invoke1(gApi, tc, gLocalTransform, "set_rotation", &snapshot.facing);
            gClientSpawnRevision = snapshot.revision;
            gClientOffsetDone = true;
            gClientLoading = false;
            LOGI("SESSION CLIENT APPLIED revision=%u scene=%s day=%d time=%.2f spawn=%.2f %.2f %.2f",
                 snapshot.revision, snapshot.scene, snapshot.day, snapshot.gameTime, pos.x, pos.y, pos.z);
        }
    }
    if (playable) multiplayer_tick(manager);
}
