// Included inside SafeRuntimeBridge's namespace: every Unity call stays on the
// game thread. UDP callbacks only coalesce plain, bounded snapshot structures.
using VisualState = sakura_lan::VisualStatePayload;
using VisualKind = sakura_lan::VisualKind;

struct VisualNode {
    std::string path;
    void* transform = nullptr;
    void* go = nullptr;
    void* animator = nullptr;
    void* renderer = nullptr;
};
struct RestoreFlag { void* object; std::string setter; bool value; };
struct VisualEntity {
    void* go = nullptr;
    void* transform = nullptr;
    std::string path;
    bool npc = false;
    bool replica = false;
    bool hasPose = false;
    VisualState pose{};
    size_t cursor = 0;
    std::vector<VisualNode> nodes;
    std::vector<uint32_t> handles;
    std::vector<RestoreFlag> restore;
};
VisualEntity gVisualLocal, gVisualRemote;
std::map<std::string, VisualEntity> gVisualNpcs;
std::chrono::steady_clock::time_point gLastVisualSend{}, gLastNpcScan{};

void retain_visual(VisualEntity& entity, void* object) {
    if (object) entity.handles.push_back(gApi.gchandle_new(object, false));
}
void clear_visual(VisualEntity& entity) {
    for (const auto& flag : entity.restore) {
        if (unity_alive(flag.object)) {
            bool value = flag.value;
            invoke1(gApi, gApi.object_get_class(flag.object), flag.object,
                    flag.setter.c_str(), &value);
        }
    }
    for (uint32_t handle : entity.handles) gApi.gchandle_free(handle);
    entity = {};
}
void reset_visual_sync() {
    clear_visual(gVisualLocal);
    clear_visual(gVisualRemote);
    for (auto& entry : gVisualNpcs) clear_visual(entry.second);
    gVisualNpcs.clear();
    gLastVisualSend = gLastNpcScan = {};
}

std::string visual_path(void* transform, void* root = nullptr) {
    std::string path;
    for (int depth = 0; transform && transform != root && depth < 32; ++depth) {
        void* klass = gApi.object_get_class(transform);
        const std::string name = string_utf8(invoke0(gApi, gObjectClass, transform, "get_name"));
        int32_t sibling = 0;
        void* parent = invoke0(gApi, klass, transform, "get_parent");
        // GetSiblingIndex is stripped in 1.043.04. Enumerate the parent's
        // children instead, preserving duplicate-name identity on both peers.
        if (parent) {
            int32_t count = 0;
            unbox_value(invoke0(gApi, klass, parent, "get_childCount"), count);
            for (int32_t i = 0; i < std::min(count, 4096); ++i)
                if (invoke1(gApi, klass, parent, "GetChild", &i) == transform) { sibling = i; break; }
        }
        // Length prefix avoids collisions from '/' and ':' in object names.
        path = std::to_string(name.size()) + ":" + name + ":" +
               std::to_string(sibling) + "/" + path;
        transform = parent;
    }
    return path;
}

bool build_visual(VisualEntity& entity, void* go, bool npc, const std::string& path) {
    if (!unity_alive(go)) return false;
    clear_visual(entity);
    entity.go = go;
    entity.npc = npc;
    entity.path = path;
    entity.transform = invoke0(gApi, gGameObjectClass, go, "get_transform");
    if (!entity.transform) return false;
    retain_visual(entity, go);
    retain_visual(entity, entity.transform);
    void* transformClass = gApi.object_get_class(entity.transform);
    void* rendererClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Renderer");
    for (void* transform : child_components(go, transformClass)) {
        VisualNode node;
        node.path = visual_path(transform, entity.transform);
        if (node.path.size() >= sizeof(VisualState::node)) continue;
        node.transform = transform;
        node.go = invoke0(gApi, gComponentClass, transform, "get_gameObject");
        auto component = [&](void* klass) -> void* {
            if (!klass || !node.go) return nullptr;
            return invoke1(gApi, gGameObjectClass, node.go, "GetComponent",
                           gApi.type_get_object(gApi.class_get_type(klass)));
        };
        node.animator = component(gAnimatorClass);
        node.renderer = component(rendererClass);
        for (void* object : {node.transform, node.go, node.animator, node.renderer})
            retain_visual(entity, object);
        entity.nodes.push_back(node);
        if (entity.nodes.size() >= 256) break;
    }
    return !entity.nodes.empty();
}

void scan_visual_npcs() {
    for (auto it = gVisualNpcs.begin(); it != gVisualNpcs.end();) {
        if (!unity_alive(it->second.go)) {
            clear_visual(it->second);
            it = gVisualNpcs.erase(it);
        } else ++it;
    }
    void* type = gApi.type_get_object(gApi.class_get_type(gCharaMoveClass));
    for (void* move : array_objects(invoke1(gApi, gObjectClass, nullptr, "FindObjectsOfType", type))) {
        if (move == gLocalMove.load()) continue;
        void* go = invoke0(gApi, gComponentClass, move, "get_gameObject");
        if (!go || go == gRemoteGameObject || go == gLocalGameObject) continue;
        std::string name = string_utf8(invoke0(gApi, gObjectClass, go, "get_name"));
        if (name.find("Player") != std::string::npos || name.find("SAKURA_LAN_") != std::string::npos) continue;
        void* transform = invoke0(gApi, gGameObjectClass, go, "get_transform");
        std::string path = visual_path(transform);
        if (path.empty() || path.size() >= sizeof(VisualState::entity) || gVisualNpcs.count(path)) continue;
        if (gVisualNpcs.size() >= 64) break;
        VisualEntity entity;
        if (build_visual(entity, go, true, path)) {
            LOGI("VISUAL NPC REGISTER path=%s", path.c_str());
            gVisualNpcs.emplace(path, std::move(entity));
        } else clear_visual(entity);
    }
}

VisualState visual_packet(const VisualEntity& entity, const VisualNode* node, VisualKind kind) {
    VisualState state;
    state.kind = kind;
    state.npc = entity.npc ? 1 : 0;
    std::strncpy(state.entity, entity.path.c_str(), sizeof(state.entity) - 1);
    if (node) std::strncpy(state.node, node->path.c_str(), sizeof(state.node) - 1);
    return state;
}

void send_visual(VisualEntity& entity) {
    if (!unity_alive(entity.go)) return;
    if (entity.npc) {
        VisualState pose = visual_packet(entity, nullptr, VisualKind::Pose);
        void* klass = gApi.object_get_class(entity.transform);
        if (unbox_value(invoke0(gApi, klass, entity.transform, "get_position"), pose.position) &&
            unbox_value(invoke0(gApi, klass, entity.transform, "get_rotation"), pose.rotation))
            sakuralan_net_send_visual(&pose);
    }
    for (const auto& node : entity.nodes) {
        if (!node.animator || !unity_alive(node.animator)) continue;
        void* klass = gApi.object_get_class(node.animator);
        int32_t layers = 0;
        if (!unbox_value(invoke0(gApi, klass, node.animator, "get_layerCount"), layers)) continue;
        for (int32_t layer = 0; layer < std::min(layers, 4); ++layer) {
            void* info = invoke1(gApi, klass, node.animator, "GetCurrentAnimatorStateInfo", &layer);
            if (!info) continue;
            // Use IL2CPP's unbox API and reflected struct accessors; no guessed
            // AnimatorStateInfo offsets or truncated 16-bit animation hashes.
            void* infoClass = gApi.object_get_class(info);
            void* value = gApi.object_unbox(info);
            VisualState state = visual_packet(entity, &node, VisualKind::Animator);
            state.layer = layer;
            if (!unbox_value(invoke0(gApi, infoClass, value, "get_fullPathHash"), state.stateHash) ||
                !unbox_value(invoke0(gApi, infoClass, value, "get_normalizedTime"), state.normalizedTime)) continue;
            unbox_value(invoke0(gApi, klass, node.animator, "get_speed"), state.speed);
            unbox_value(invoke1(gApi, klass, node.animator, "GetLayerWeight", &layer), state.weight);
            sakuralan_net_send_visual(&state);
        }

        // State hashes reproduce discrete clips (jump, gestures), but Sakura's
        // locomotion uses Animator parameters/blend trees. Mirror the current
        // float/int/bool parameters as well so walking/running no longer slide.
        void* parameters = invoke0(gApi, klass, node.animator, "get_parameters");
        for (void* parameter : array_objects(parameters)) {
            if (!parameter) continue;
            void* parameterClass = gApi.object_get_class(parameter);
            int32_t hash = 0, type = 0;
            if (!unbox_value(invoke0(gApi, parameterClass, parameter, "get_nameHash"), hash) ||
                !unbox_value(invoke0(gApi, parameterClass, parameter, "get_type"), type) || !hash) continue;
            VisualState parameterState =
                visual_packet(entity, &node, VisualKind::AnimatorParameter);
            parameterState.parameterHash = hash;
            parameterState.parameterType = static_cast<uint8_t>(type);
            const char* hashType[]{"System.Int32"};
            void* hashArg[]{&hash};
            if (type == 1) { // AnimatorControllerParameterType.Float
                if (!unbox_value(invoke(gApi, klass, node.animator, "GetFloat", 1, hashArg, hashType),
                                 parameterState.parameterFloat)) continue;
            } else if (type == 3) { // Int
                if (!unbox_value(invoke(gApi, klass, node.animator, "GetInteger", 1, hashArg, hashType),
                                 parameterState.parameterInt)) continue;
            } else if (type == 4) { // Bool
                bool value = false;
                if (!unbox_value(invoke(gApi, klass, node.animator, "GetBool", 1, hashArg, hashType), value)) continue;
                parameterState.parameterInt = value ? 1 : 0;
            } else {
                // Triggers are intentionally not replayed as parameters: the
                // authoritative state/layer snapshot already carries their result.
                continue;
            }
            sakuralan_net_send_visual(&parameterState);
        }
    }
    if (entity.npc) return;
    // Repeat appearance round-robin so lost UDP packets eventually recover,
    // including clients joining after a costume/accessory change.
    const size_t budget = 8;
    for (size_t i = 0; i < budget && !entity.nodes.empty(); ++i) {
        auto& node = entity.nodes[entity.cursor++ % entity.nodes.size()];
        if (!unity_alive(node.go)) continue;
        VisualState state = visual_packet(entity, &node, VisualKind::Node);
        bool active = true;
        unbox_value(invoke0(gApi, gGameObjectClass, node.go, "get_activeSelf"), active);
        state.active = active;
        unbox_value(invoke0(gApi, gApi.object_get_class(node.transform), node.transform,
                           "get_localScale"), state.scale);
        sakuralan_net_send_visual(&state);
        if (!node.renderer || !unity_alive(node.renderer)) continue;
        void* material = invoke0(gApi, gApi.object_get_class(node.renderer), node.renderer, "get_sharedMaterial");
        if (!material) continue;
        state.kind = VisualKind::Material;
        std::string name = string_utf8(invoke0(gApi, gObjectClass, material, "get_name"));
        if (name.size() >= sizeof(state.asset)) continue;
        std::strncpy(state.asset, name.c_str(), sizeof(state.asset) - 1);
        // Color accessor works with Unity's main-color property designation.
        if (!unbox_value(invoke0(gApi, gApi.object_get_class(material), material, "get_color"), state.color)) continue;
        sakuralan_net_send_visual(&state);
    }
}

void acquire_npc_replica(VisualEntity& entity) {
    if (entity.replica) return;
    entity.replica = true;
    for (void* component : child_components(entity.go, gComponentClass)) {
        if (!component) continue;
        void* klass = gApi.object_get_class(component);
        const char* name = gApi.class_get_name(klass);
        const char* getter = nullptr;
        const char* setter = nullptr;
        bool value = false;
        if (derives_from(klass, "MonoBehaviour")) {
            // Social state is intentionally per-player. Keep the NPC's local
            // CharacterStatus/Likability and chat presentation alive while
            // suspending movement/AI scripts that would fight the host pose.
            if (std::strcmp(name, "CharacterStatus") == 0 ||
                std::strcmp(name, "ChatEvent") == 0 ||
                std::strcmp(name, "ChatChange") == 0) {
                continue;
            }
            getter = "get_enabled"; setter = "set_enabled";
        } else if (std::strcmp(name, "Animator") == 0) {
            getter = "get_applyRootMotion"; setter = "set_applyRootMotion";
        } else if (std::strcmp(name, "Rigidbody") == 0) {
            getter = "get_isKinematic"; setter = "set_isKinematic"; value = true;
        }
        bool original = false;
        if (getter && unbox_value(invoke0(gApi, klass, component, getter), original)) {
            retain_visual(entity, component);
            entity.restore.push_back({component, setter, original});
            invoke1(gApi, klass, component, setter, &value);
        }
    }
}

std::string material_key(std::string name) {
    const std::string suffix = " (Instance)";
    if (name.size() >= suffix.size() && name.compare(name.size() - suffix.size(), suffix.size(), suffix) == 0)
        name.resize(name.size() - suffix.size());
    return name;
}

void apply_visual(VisualEntity& entity, const VisualState& state) {
    if (!unity_alive(entity.go)) return;
    if (entity.npc) acquire_npc_replica(entity);
    if (state.kind == VisualKind::Pose && entity.npc) {
        const float* p = &state.position.x;
        const float* q = &state.rotation.x;
        for (int i = 0; i < 3; ++i) if (!std::isfinite(p[i])) return;
        float norm = 0;
        for (int i = 0; i < 4; ++i) { if (!std::isfinite(q[i])) return; norm += q[i] * q[i]; }
        if (norm < 0.5f || norm > 1.5f) return;
        entity.pose = state;
        entity.hasPose = true;
        return;
    }
    auto it = std::find_if(entity.nodes.begin(), entity.nodes.end(), [&](const VisualNode& node) {
        return node.path == state.node;
    });
    if (it == entity.nodes.end() || !unity_alive(it->go)) return;
    VisualNode& node = *it;
    if (state.kind == VisualKind::Node) {
        bool active = state.active != 0;
        // The root remains alive so snapshots can continue to update it.
        if (!node.path.empty()) invoke1(gApi, gGameObjectClass, node.go, "SetActive", &active);
        auto scale = state.scale;
        if (std::isfinite(scale.x) && std::isfinite(scale.y) && std::isfinite(scale.z))
            invoke1(gApi, gApi.object_get_class(node.transform), node.transform, "set_localScale", &scale);
    } else if (state.kind == VisualKind::Animator && node.animator && unity_alive(node.animator)) {
        if (!std::isfinite(state.normalizedTime) || !std::isfinite(state.speed) ||
            !std::isfinite(state.weight) || state.layer < 0 || state.layer >= 4 || !state.stateHash) return;
        void* klass = gApi.object_get_class(node.animator);
        int32_t hash = state.stateHash, layer = state.layer;
        float time = state.normalizedTime, speed = state.speed, weight = state.weight;
        void* hasArgs[]{&layer, &hash};
        const char* hasTypes[]{"System.Int32", "System.Int32"};
        bool hasState = false;
        if (!unbox_value(invoke(gApi, klass, node.animator, "HasState", 2, hasArgs, hasTypes), hasState) || !hasState) return;
        // Do not restart the same state on every network snapshot. Repeated
        // Animator.Play calls can pin blend trees and make locomotion look like
        // sliding. Only seek when the remote actually changed state; float/int/
        // bool parameters then drive the active blend tree continuously.
        bool seek = true;
        void* current = invoke1(gApi, klass, node.animator, "GetCurrentAnimatorStateInfo", &layer);
        if (current) {
            void* currentClass = gApi.object_get_class(current);
            void* currentValue = gApi.object_unbox(current);
            int32_t currentHash = 0;
            if (unbox_value(invoke0(gApi, currentClass, currentValue, "get_fullPathHash"), currentHash) &&
                currentHash == hash) seek = false;
        }
        if (seek) {
            void* args[]{&hash, &layer, &time};
            const char* types[]{"System.Int32", "System.Int32", "System.Single"};
            invoke(gApi, klass, node.animator, "Play", 3, args, types);
        }
        invoke1(gApi, klass, node.animator, "set_speed", &speed);
        void* weightArgs[]{&layer, &weight};
        invoke(gApi, klass, node.animator, "SetLayerWeight", 2, weightArgs);
    } else if (state.kind == VisualKind::AnimatorParameter &&
               node.animator && unity_alive(node.animator)) {
        if (!state.parameterHash) return;
        void* klass = gApi.object_get_class(node.animator);
        int32_t hash = state.parameterHash;
        if (state.parameterType == 1) {
            if (!std::isfinite(state.parameterFloat)) return;
            float value = state.parameterFloat;
            void* args[]{&hash, &value};
            const char* types[]{"System.Int32", "System.Single"};
            invoke(gApi, klass, node.animator, "SetFloat", 2, args, types);
        } else if (state.parameterType == 3) {
            int32_t value = state.parameterInt;
            void* args[]{&hash, &value};
            const char* types[]{"System.Int32", "System.Int32"};
            invoke(gApi, klass, node.animator, "SetInteger", 2, args, types);
        } else if (state.parameterType == 4) {
            bool value = state.parameterInt != 0;
            void* args[]{&hash, &value};
            const char* types[]{"System.Int32", "System.Boolean"};
            invoke(gApi, klass, node.animator, "SetBool", 2, args, types);
        }
    } else if (state.kind == VisualKind::Material && node.renderer && unity_alive(node.renderer)) {
        for (float value : state.color) if (!std::isfinite(value)) return;
        void* klass = gApi.object_get_class(node.renderer);
        void* material = invoke0(gApi, klass, node.renderer, "get_sharedMaterial");
        if (!material) return;
        const std::string wanted = material_key(state.asset);
        const std::string current = material_key(string_utf8(invoke0(gApi, gObjectClass, material, "get_name")));
        if (current != wanted) {
            void* resources = gApi.class_from_name(gUnityCore, "UnityEngine", "Resources");
            void* materialClass = gApi.class_from_name(gUnityCore, "UnityEngine", "Material");
            if (resources && materialClass) {
                void* type = gApi.type_get_object(gApi.class_get_type(materialClass));
                for (void* candidate : array_objects(invoke1(gApi, resources, nullptr, "FindObjectsOfTypeAll", type))) {
                    if (material_key(string_utf8(invoke0(gApi, gObjectClass, candidate, "get_name"))) == wanted) {
                        invoke1(gApi, klass, node.renderer, "set_sharedMaterial", candidate);
                        break;
                    }
                }
            }
        }
        // Get an instance before tinting; shared materials also belong to the
        // local player and NPCs and must never be recolored through this path.
        material = invoke0(gApi, klass, node.renderer, "get_material");
        if (material) {
            float color[4]; std::memcpy(color, state.color, sizeof(color));
            invoke1(gApi, gApi.object_get_class(material), material, "set_color", color);
        }
    }
}

void visual_sync_tick() {
    if (gVisualLocal.go != gLocalGameObject) build_visual(gVisualLocal, gLocalGameObject, false, "");
    if (gVisualRemote.go != gRemoteGameObject) build_visual(gVisualRemote, gRemoteGameObject, false, "");
    const auto now = std::chrono::steady_clock::now();

    // Equipment can be attached after the avatar is created (jetpack, weapons,
    // costume pieces). Periodically rescan the local hierarchy so those nodes
    // start participating in visual replication instead of being permanently
    // absent from the initial snapshot.
    static auto lastHierarchyRefresh = std::chrono::steady_clock::time_point{};
    if (!lastHierarchyRefresh.time_since_epoch().count() ||
        now - lastHierarchyRefresh >= std::chrono::seconds(1)) {
        if (unity_alive(gLocalGameObject)) {
            const size_t liveNodes = child_components(gLocalGameObject,
                gApi.object_get_class(gLocalTransform)).size();
            if (liveNodes != gVisualLocal.nodes.size())
                build_visual(gVisualLocal, gLocalGameObject, false, "");
        }
        lastHierarchyRefresh = now;
    }
    if (gLastNpcScan.time_since_epoch().count() == 0 || now - gLastNpcScan >= std::chrono::milliseconds(500)) {
        scan_visual_npcs();
        gLastNpcScan = now;
    }
    if (gLastVisualSend.time_since_epoch().count() == 0 || now - gLastVisualSend >= std::chrono::milliseconds(50)) {
        send_visual(gVisualLocal);
        if (sakuralan_net_local_player_id() == 0)
            for (auto& entry : gVisualNpcs) send_visual(entry.second);
        gLastVisualSend = now;
    }
    VisualState state;
    for (int n = 0; n < 512 && sakuralan_net_take_visual(&state); ++n) {
        if (!state.npc) apply_visual(gVisualRemote, state);
        else if (sakuralan_net_local_player_id() == 1) {
            auto it = gVisualNpcs.find(state.entity);
            if (it != gVisualNpcs.end()) apply_visual(it->second, state);
        }
    }
    if (sakuralan_net_local_player_id() == 1) {
        for (auto& entry : gVisualNpcs) {
            auto& entity = entry.second;
            if (!entity.hasPose || !unity_alive(entity.transform)) continue;
            void* klass = gApi.object_get_class(entity.transform);
            invoke1(gApi, klass, entity.transform, "set_position", &entity.pose.position);
            invoke1(gApi, klass, entity.transform, "set_rotation", &entity.pose.rotation);
        }
    }
}
