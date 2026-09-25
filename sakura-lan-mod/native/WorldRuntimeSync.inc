// Host-authoritative shared-world state. Personal data (Money, Likability,
// dialogue history and local appearance choices) deliberately never enters
// this channel. Client changes are proposals; LanSession assigns canonical
// revisions before the host applies/broadcasts them.
using WorldState = sakura_lan::WorldStatePayload;
using WorldKind = sakura_lan::WorldKind;

std::chrono::steady_clock::time_point gLastWorldMissionScan{}, gLastWorldVehicleScan{},
    gLastWorldMissionKeyframe{}, gWorldRuntimeStarted{};
std::map<std::string, uint64_t> gWorldObserved;
std::map<std::string, void*> gWorldVehicleObjects;
std::map<std::string, uint8_t> gWorldVehicleOwner;
std::map<std::string, bool> gClientVehicleOwned;

void* gTrophyManagerClass = nullptr;
void* gTrophyClass = nullptr;
void* gCanvasTrophyClass = nullptr;
void* gScrubManagerClass = nullptr;
void* gGoutouManagerClass = nullptr;
void* gUfoMissionClass = nullptr;
void* gBlackSheckersClass = nullptr;
void* gPickupActiveClass = nullptr;
void* gCarManagerClass = nullptr;
void* gVehicleControllerClass = nullptr;
void* gAiCarDriverClass = nullptr;

bool read_named_object(void* klass, void* object, const char* name, void*& out) {
    out = nullptr;
    if (!klass) return false;
    void* field = gApi.class_get_field(klass, name);
    if (!field) return false;
    if (object) gApi.field_get_value(object, field, &out);
    else gApi.field_static_get_value(field, &out);
    return out != nullptr;
}

std::vector<void*> managed_list_objects(void* list) {
    std::vector<void*> out;
    if (!list) return out;
    void* klass = gApi.object_get_class(list);
    int32_t count = 0;
    if (!unbox_value(invoke0(gApi, klass, list, "get_Count"), count) || count < 0 || count > 4096)
        return out;
    out.reserve(static_cast<size_t>(count));
    const char* type[]{"System.Int32"};
    for (int32_t i = 0; i < count; ++i) {
        void* arg[]{&i};
        void* item = invoke(gApi, klass, list, "get_Item", 1, arg, type);
        out.push_back(item);
    }
    return out;
}

void* component_in_children(void* go, void* klass) {
    if (!go || !klass) return nullptr;
    for (void* c : child_components(go, klass)) if (c) return c;
    return nullptr;
}

bool resolve_world_runtime_classes() {
    if (!gAssembly) return false;
    if (!gTrophyManagerClass) gTrophyManagerClass = gApi.class_from_name(gAssembly, "", "TrophyManager");
    if (!gTrophyClass) gTrophyClass = gApi.class_from_name(gAssembly, "", "Trophy");
    if (!gCanvasTrophyClass) gCanvasTrophyClass = gApi.class_from_name(gAssembly, "", "CanvasTrophyManager");
    if (!gScrubManagerClass) gScrubManagerClass = gApi.class_from_name(gAssembly, "", "ScrubManager");
    if (!gGoutouManagerClass) gGoutouManagerClass = gApi.class_from_name(gAssembly, "", "GoutouManager");
    if (!gUfoMissionClass) gUfoMissionClass = gApi.class_from_name(gAssembly, "", "UFOMissionManager");
    if (!gBlackSheckersClass) gBlackSheckersClass = gApi.class_from_name(gAssembly, "", "BlackSheckersManager");
    if (!gPickupActiveClass) gPickupActiveClass = gApi.class_from_name(gAssembly, "", "PickupItemActiveManager");
    if (!gCarManagerClass) gCarManagerClass = gApi.class_from_name(gAssembly, "", "CarManager");
    if (!gVehicleControllerClass) gVehicleControllerClass = gApi.class_from_name(gAssembly, "EVP", "VehicleController");
    if (!gAiCarDriverClass) gAiCarDriverClass = gApi.class_from_name(gAssembly, "", "AICarDriver");
    return gTrophyManagerClass != nullptr;
}

void* world_instance(void* klass, const char* typeName) {
    void* instance = nullptr;
    if (klass) read_field(klass, nullptr, "Instance", typeName, instance);
    return instance;
}

uint64_t world_mix(uint64_t h, uint64_t value) {
    h ^= value + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
    return h;
}

uint64_t world_fingerprint(const WorldState& s) {
    uint64_t h = static_cast<uint64_t>(s.kind);
    h = world_mix(h, static_cast<uint32_t>(s.value));
    h = world_mix(h, static_cast<uint32_t>(s.step));
    h = world_mix(h, static_cast<uint32_t>(s.progress));
    h = world_mix(h, static_cast<uint32_t>(s.target));
    h = world_mix(h, s.flags);
    h = world_mix(h, s.active);
    h = world_mix(h, s.occupiedBy);
    return h;
}

std::string world_state_key(const WorldState& s) {
    return std::to_string(static_cast<int>(s.kind)) + ":" + s.entity;
}

void remember_world_state(const WorldState& s) {
    gWorldObserved[world_state_key(s)] = world_fingerprint(s);
}

void publish_world_discrete(const WorldState& s, bool force) {
    const std::string key = world_state_key(s);
    const uint64_t fp = world_fingerprint(s);
    auto it = gWorldObserved.find(key);
    if (!force && it != gWorldObserved.end() && it->second == fp) return;
    gWorldObserved[key] = fp;
    sakuralan_net_send_world(&s);
}

bool personal_trophy_id(int32_t id) {
    return (id >= 28 && id <= 34) || id == 38;
}

uint32_t trophy_flags(void* trophy) {
    if (!trophy) return 0;
    void* klass = gApi.object_get_class(trophy);
    bool clear=false, skip=false, secret=false, start=false, checked=false;
    read_field(klass, trophy, "Clear", "System.Boolean", clear);
    read_field(klass, trophy, "Skip", "System.Boolean", skip);
    read_field(klass, trophy, "Secret", "System.Boolean", secret);
    read_field(klass, trophy, "StartButton", "System.Boolean", start);
    read_field(klass, trophy, "StartBCheck", "System.Boolean", checked);
    return (clear ? 1u : 0u) | (skip ? 2u : 0u) | (secret ? 4u : 0u) |
           (start ? 8u : 0u) | (checked ? 16u : 0u);
}

void* trophy_by_id(void* manager, int32_t wanted) {
    void* array = nullptr;
    if (!manager || !read_field(gTrophyManagerClass, manager, "trophys", "Trophy[]", array)) return nullptr;
    for (void* trophy : array_objects(array)) {
        if (!trophy) continue;
        int32_t id = 0;
        void* klass = gApi.object_get_class(trophy);
        if (read_field(klass, trophy, "tID", "Trophy.ID", id) && id == wanted) return trophy;
    }
    return nullptr;
}

void refresh_trophy_ui_if_open() {
    void* canvas = world_instance(gCanvasTrophyClass, "CanvasTrophyManager");
    if (!canvas || !unity_alive(canvas)) return;
    void* go = invoke0(gApi, gComponentClass, canvas, "get_gameObject");
    bool active = false;
    if (!go || !unbox_value(invoke0(gApi, gGameObjectClass, go, "get_activeInHierarchy"), active) || !active)
        return;
    invoke0(gApi, gCanvasTrophyClass, canvas, "Show");
}

void apply_trophy_state(const WorldState& state) {
    const int32_t id = state.value;
    if (id <= 0 || personal_trophy_id(id)) return;
    void* manager = world_instance(gTrophyManagerClass, "TrophyManager");
    void* trophy = trophy_by_id(manager, id);
    if (!manager || !trophy) return;
    void* klass = gApi.object_get_class(trophy);
    bool wasClear = false;
    read_field(klass, trophy, "Clear", "System.Boolean", wasClear);
    const bool clear = (state.flags & 1u) != 0;

    const auto now = std::chrono::steady_clock::now();
    const bool liveTransition = gWorldRuntimeStarted.time_since_epoch().count() &&
        now - gWorldRuntimeStarted > std::chrono::seconds(2);
    if (clear && !wasClear && liveTransition) {
        int32_t tid = id;
        void* args[]{&tid};
        const char* types[]{"Trophy.ID"};
        invoke(gApi, gTrophyManagerClass, manager, "MissionClear", 1, args, types);
    }

    bool value = clear;
    write_field(klass, trophy, "Clear", "System.Boolean", value);
    value = (state.flags & 2u) != 0; write_field(klass, trophy, "Skip", "System.Boolean", value);
    value = (state.flags & 4u) != 0; write_field(klass, trophy, "Secret", "System.Boolean", value);
    value = (state.flags & 8u) != 0; write_field(klass, trophy, "StartButton", "System.Boolean", value);
    value = (state.flags & 16u) != 0; write_field(klass, trophy, "StartBCheck", "System.Boolean", value);
    refresh_trophy_ui_if_open();
}

void publish_trophies(int role, bool force) {
    void* manager = world_instance(gTrophyManagerClass, "TrophyManager");
    if (!manager) return;
    void* array = nullptr;
    if (read_field(gTrophyManagerClass, manager, "trophys", "Trophy[]", array)) {
        for (void* trophy : array_objects(array)) {
            if (!trophy) continue;
            void* klass = gApi.object_get_class(trophy);
            int32_t id = 0;
            if (!read_field(klass, trophy, "tID", "Trophy.ID", id) || id <= 0 || personal_trophy_id(id)) continue;
            WorldState state{};
            state.kind = WorldKind::MissionState;
            state.value = id;
            state.flags = trophy_flags(trophy);
            const std::string entity = "trophy:" + std::to_string(id);
            std::strncpy(state.entity, entity.c_str(), sizeof(state.entity)-1);
            publish_world_discrete(state, force && role == 0);
        }
    }

    bool scrub=false, oni=false, goutou=false, ufo1=false, ufo2=false;
    read_field(gTrophyManagerClass, manager, "ScrubCollectRunning", "System.Boolean", scrub);
    read_field(gTrophyManagerClass, manager, "OnigokoRunning", "System.Boolean", oni);
    read_field(gTrophyManagerClass, manager, "GoutouRunning", "System.Boolean", goutou);
    read_field(gTrophyManagerClass, manager, "UFOmission1Running", "System.Boolean", ufo1);
    read_field(gTrophyManagerClass, manager, "UFOmission2Running", "System.Boolean", ufo2);
    WorldState running{};
    running.kind = WorldKind::MissionState;
    running.value = -1;
    running.flags = (scrub?1u:0u)|(oni?2u:0u)|(goutou?4u:0u)|(ufo1?8u:0u)|(ufo2?16u:0u);
    std::strncpy(running.entity, "mission:running", sizeof(running.entity)-1);
    publish_world_discrete(running, force && role == 0);
}

void publish_progress_manager(void* klass, const char* typeName, const char* entityName,
                              const char* stepField, const char* progressField,
                              const char* targetField, const char* clearField,
                              int role, bool force) {
    void* instance = world_instance(klass, typeName);
    if (!instance) return;
    WorldState state{};
    state.kind = WorldKind::MissionProgress;
    std::strncpy(state.entity, entityName, sizeof(state.entity)-1);
    if (stepField) read_field(klass, instance, stepField, "System.Int32", state.step);
    if (progressField) read_field(klass, instance, progressField, "System.Int32", state.progress);
    if (targetField) read_field(klass, instance, targetField, "System.Int32", state.target);
    if (clearField) {
        bool clear = false;
        if (read_field(klass, instance, clearField, "System.Boolean", clear) && clear) state.flags |= 1u;
    }
    publish_world_discrete(state, force && role == 0);
}

void publish_mission_progress(int role, bool force) {
    publish_progress_manager(gScrubManagerClass, "ScrubManager", "mission:scrub",
                             nullptr, "CollectedScrub", "MaxScrub", nullptr, role, force);
    publish_progress_manager(gGoutouManagerClass, "GoutouManager", "mission:goutou",
                             "Level", "KilledCnt", nullptr, nullptr, role, force);
    publish_progress_manager(gUfoMissionClass, "UFOMissionManager", "mission:ufo",
                             "Level", "KilledCnt", nullptr, "Cleared", role, force);
    publish_progress_manager(gBlackSheckersClass, "BlackSheckersManager", "mission:black-sheckers",
                             "WaveCnt", nullptr, "WaveMax", "Clear", role, force);
}

void apply_running_state(const WorldState& state) {
    void* manager = world_instance(gTrophyManagerClass, "TrophyManager");
    if (!manager) return;
    bool v = (state.flags & 1u) != 0; write_field(gTrophyManagerClass, manager, "ScrubCollectRunning", "System.Boolean", v);
    v = (state.flags & 2u) != 0; write_field(gTrophyManagerClass, manager, "OnigokoRunning", "System.Boolean", v);
    v = (state.flags & 4u) != 0; write_field(gTrophyManagerClass, manager, "GoutouRunning", "System.Boolean", v);
    v = (state.flags & 8u) != 0; write_field(gTrophyManagerClass, manager, "UFOmission1Running", "System.Boolean", v);
    v = (state.flags & 16u) != 0; write_field(gTrophyManagerClass, manager, "UFOmission2Running", "System.Boolean", v);
}

void apply_progress_fields(void* klass, const char* typeName, const WorldState& state,
                           const char* stepField, const char* progressField,
                           const char* targetField, const char* clearField) {
    void* instance = world_instance(klass, typeName);
    if (!instance) return;
    if (stepField) write_field(klass, instance, stepField, "System.Int32", state.step);
    if (progressField) write_field(klass, instance, progressField, "System.Int32", state.progress);
    if (targetField && state.target >= 0) write_field(klass, instance, targetField, "System.Int32", state.target);
    if (clearField) {
        bool clear = (state.flags & 1u) != 0;
        write_field(klass, instance, clearField, "System.Boolean", clear);
    }
}

void apply_mission_progress(const WorldState& state) {
    if (std::strcmp(state.entity, "mission:scrub") == 0)
        apply_progress_fields(gScrubManagerClass, "ScrubManager", state, nullptr, "CollectedScrub", "MaxScrub", nullptr);
    else if (std::strcmp(state.entity, "mission:goutou") == 0)
        apply_progress_fields(gGoutouManagerClass, "GoutouManager", state, "Level", "KilledCnt", nullptr, nullptr);
    else if (std::strcmp(state.entity, "mission:ufo") == 0)
        apply_progress_fields(gUfoMissionClass, "UFOMissionManager", state, "Level", "KilledCnt", nullptr, "Cleared");
    else if (std::strcmp(state.entity, "mission:black-sheckers") == 0)
        apply_progress_fields(gBlackSheckersClass, "BlackSheckersManager", state, "WaveCnt", nullptr, "WaveMax", "Clear");
}

void publish_pickups(int role, bool force) {
    void* manager = world_instance(gPickupActiveClass, "PickupItemActiveManager");
    if (!manager) return;
    void* items = nullptr;
    void* flags = nullptr;
    if (!read_named_object(gPickupActiveClass, manager, "Items", items) ||
        !read_named_object(gPickupActiveClass, manager, "IGetFlag", flags)) return;
    const uintptr_t n = std::min(gApi.array_length(items), gApi.array_length(flags));
    if (n > 4096) return;
    auto* values = reinterpret_cast<uint8_t*>(flags) + sizeof(void*) * 4;
    for (uintptr_t i = 0; i < n; ++i) {
        WorldState state{};
        state.kind = WorldKind::ItemTaken;
        state.value = static_cast<int32_t>(i);
        state.flags = values[i] ? 1u : 0u;
        state.active = values[i] ? 0 : 1;
        const std::string entity = "pickup:" + std::to_string(i);
        std::strncpy(state.entity, entity.c_str(), sizeof(state.entity)-1);
        publish_world_discrete(state, force && role == 0);
    }
}

void apply_pickup(const WorldState& state) {
    void* manager = world_instance(gPickupActiveClass, "PickupItemActiveManager");
    if (!manager || state.value < 0) return;
    void* flags = nullptr;
    if (!read_named_object(gPickupActiveClass, manager, "IGetFlag", flags)) return;
    const uintptr_t n = gApi.array_length(flags);
    if (static_cast<uintptr_t>(state.value) >= n) return;
    auto* values = reinterpret_cast<uint8_t*>(flags) + sizeof(void*) * 4;
    values[state.value] = (state.flags & 1u) ? 1 : 0;
    invoke0(gApi, gPickupActiveClass, manager, "CheckItemVisible");
}

void rebuild_vehicle_map() {
    gWorldVehicleObjects.clear();
    void* manager = world_instance(gCarManagerClass, "CarManager");
    if (!manager) return;
    const char* lists[]{"PatrolCars", "MyCars", "MobCars", "MobBike", "MobHeli"};
    for (const char* fieldName : lists) {
        void* list = nullptr;
        if (!read_named_object(gCarManagerClass, manager, fieldName, list)) continue;
        auto objects = managed_list_objects(list);
        for (size_t i = 0; i < objects.size(); ++i) {
            if (!unity_alive(objects[i])) continue;
            const std::string key = std::string("vehicle:") + fieldName + ":" + std::to_string(i);
            gWorldVehicleObjects[key] = objects[i];
        }
    }
}

bool local_drives_vehicle(void* manager, void* vehicle) {
    if (!manager || !vehicle) return false;
    bool driving = false;
    void* current = nullptr;
    if (!read_field(gSystemClass, manager, "DriveModeNow", "System.Boolean", driving) || !driving) return false;
    if (!read_field(gSystemClass, manager, "m_Vehicle", "EVP.VehicleController", current)) return false;
    return current == vehicle;
}

void set_vehicle_simulation(void* go, bool localSimulation) {
    if (!go) return;
    void* vehicle = component_in_children(go, gVehicleControllerClass);
    if (vehicle) {
        bool paused = !localSimulation;
        invoke1(gApi, gApi.object_get_class(vehicle), vehicle, "set_paused", &paused);
    }
    void* ai = component_in_children(go, gAiCarDriverClass);
    if (ai) {
        bool enabled = localSimulation;
        invoke1(gApi, gApi.object_get_class(ai), ai, "set_enabled", &enabled);
    }
}

void send_vehicle_snapshot(const std::string& key, void* go, uint8_t owner) {
    if (!unity_alive(go)) return;
    void* transform = invoke0(gApi, gGameObjectClass, go, "get_transform");
    if (!transform) return;
    WorldState state{};
    state.kind = WorldKind::VehicleState;
    state.occupiedBy = owner;
    std::strncpy(state.entity, key.c_str(), sizeof(state.entity)-1);
    bool active = true;
    unbox_value(invoke0(gApi, gGameObjectClass, go, "get_activeSelf"), active);
    state.active = active ? 1 : 0;
    void* klass = gApi.object_get_class(transform);
    if (!unbox_value(invoke0(gApi, klass, transform, "get_position"), state.position) ||
        !unbox_value(invoke0(gApi, klass, transform, "get_rotation"), state.rotation)) return;
    sakuralan_net_send_world(&state);
}

void publish_vehicles(void* systemManager, int role) {
    rebuild_vehicle_map();
    for (const auto& entry : gWorldVehicleObjects) {
        const std::string& key = entry.first;
        void* go = entry.second;
        void* vehicle = component_in_children(go, gVehicleControllerClass);
        const bool localOwned = local_drives_vehicle(systemManager, vehicle);
        if (role == 0) {
            uint8_t owner = 255;
            auto known = gWorldVehicleOwner.find(key);
            if (localOwned) owner = 0;
            else if (known != gWorldVehicleOwner.end() && known->second == 1) owner = 1;
            gWorldVehicleOwner[key] = owner;
            if (owner != 1) send_vehicle_snapshot(key, go, owner);
        } else {
            const bool wasOwned = gClientVehicleOwned[key];
            if (localOwned) {
                gClientVehicleOwned[key] = true;
                gWorldVehicleOwner[key] = 1;
                send_vehicle_snapshot(key, go, 1);
            } else if (wasOwned) {
                gClientVehicleOwned[key] = false;
                gWorldVehicleOwner[key] = 255;
                send_vehicle_snapshot(key, go, 255);
            }
        }
    }
}

void apply_vehicle(const WorldState& state, int role) {
    auto it = gWorldVehicleObjects.find(state.entity);
    if (it == gWorldVehicleObjects.end() || !unity_alive(it->second)) return;
    void* go = it->second;
    gWorldVehicleOwner[state.entity] = state.occupiedBy;
    const bool localOwner = state.occupiedBy == static_cast<uint8_t>(role);
    const bool simulateHere = localOwner || (role == 0 && state.occupiedBy != 1);
    set_vehicle_simulation(go, simulateHere);
    if (localOwner) return;
    bool active = state.active != 0;
    invoke1(gApi, gGameObjectClass, go, "SetActive", &active);
    if (!active) return;
    void* transform = invoke0(gApi, gGameObjectClass, go, "get_transform");
    if (!transform) return;
    void* klass = gApi.object_get_class(transform);
    auto position = state.position;
    auto rotation = state.rotation;
    invoke1(gApi, klass, transform, "set_position", &position);
    invoke1(gApi, klass, transform, "set_rotation", &rotation);
}

void apply_world_state(const WorldState& state, int role) {
    remember_world_state(state);
    if (state.kind == WorldKind::MissionState) {
        if (std::strcmp(state.entity, "mission:running") == 0) apply_running_state(state);
        else if (std::strncmp(state.entity, "trophy:", 7) == 0) apply_trophy_state(state);
    } else if (state.kind == WorldKind::MissionProgress) {
        apply_mission_progress(state);
    } else if (state.kind == WorldKind::ItemTaken) {
        apply_pickup(state);
    } else if (state.kind == WorldKind::VehicleState) {
        apply_vehicle(state, role);
    }
}

void reset_world_runtime_sync() {
    gLastWorldMissionScan = gLastWorldVehicleScan = gLastWorldMissionKeyframe = {};
    gWorldRuntimeStarted = {};
    gWorldObserved.clear();
    gWorldVehicleObjects.clear();
    gWorldVehicleOwner.clear();
    gClientVehicleOwned.clear();
}

void world_runtime_tick(void* systemManager) {
    if (!resolve_world_runtime_classes() || !sakuralan_net_connected()) return;
    const auto now = std::chrono::steady_clock::now();
    if (!gWorldRuntimeStarted.time_since_epoch().count()) gWorldRuntimeStarted = now;
    const int role = sakuralan_net_local_player_id();
    if (role < 0) return;

    if (!gLastWorldVehicleScan.time_since_epoch().count() ||
        now - gLastWorldVehicleScan >= std::chrono::milliseconds(role == 0 ? 100 : 50)) {
        publish_vehicles(systemManager, role);
        gLastWorldVehicleScan = now;
    }

    WorldState incoming{};
    for (int i = 0; i < 512 && sakuralan_net_take_world(&incoming); ++i)
        apply_world_state(incoming, role);

    const bool clientInitialSync = role == 1 && now - gWorldRuntimeStarted < std::chrono::seconds(3);
    if (!gLastWorldMissionScan.time_since_epoch().count() ||
        now - gLastWorldMissionScan >= std::chrono::milliseconds(200)) {
        const bool hostKeyframe = role == 0 && (!gLastWorldMissionKeyframe.time_since_epoch().count() ||
            now - gLastWorldMissionKeyframe >= std::chrono::seconds(2));
        if (!clientInitialSync || role == 0) {
            publish_trophies(role, hostKeyframe);
            publish_mission_progress(role, hostKeyframe);
            publish_pickups(role, hostKeyframe);
        }
        if (hostKeyframe) gLastWorldMissionKeyframe = now;
        gLastWorldMissionScan = now;
    }
}
