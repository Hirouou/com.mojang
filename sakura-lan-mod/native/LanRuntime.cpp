#include "../src/LanSession.hpp"
#include <jni.h>
#include <android/log.h>
#include <atomic>
#include <chrono>
#include <mutex>
#include <map>
#include <tuple>
#include <string>
#include <thread>
#include <vector>

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "SakuraLAN", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "SakuraLAN", __VA_ARGS__)

namespace {

std::mutex gSessionMutex;
std::mutex gRemoteMutex;
sakura_lan::LanSession gSession;
sakura_lan::PlayerStatePayload gRemote{};
std::atomic<bool> gHasRemote{false};
using VisualKey = std::tuple<uint8_t, std::string, std::string, uint8_t, int32_t>;
std::map<VisualKey, sakura_lan::VisualStatePayload> gVisualPending;
std::map<VisualKey, uint32_t> gVisualSequence;
std::map<std::string, sakura_lan::WorldStatePayload> gWorldLatest;
std::map<std::string, sakura_lan::WorldStatePayload> gWorldPending;
std::atomic<bool> gCallbacksConfigured{false};
std::atomic<bool> gPumpRunning{false};
std::atomic<bool> gCiPose{false};
sakura_lan::SessionStatePayload gHostSnapshot{};
std::chrono::steady_clock::time_point gHostSnapshotTime{};

void ensure_callbacks() {
    if (gCallbacksConfigured.exchange(true)) return;

    gSession.onLog = [](const std::string& s) {
        LOGI("NET %s", s.c_str());
    };
    gSession.onSessionState = [](const sakura_lan::SessionStatePayload& state) {
        std::lock_guard<std::mutex> lock(gRemoteMutex);
        if (gHostSnapshotTime.time_since_epoch().count() == 0 ||
            gHostSnapshot.revision != state.revision || gHostSnapshot.ready != state.ready)
            LOGI("SESSION received ready=%u revision=%u scene=%s", state.ready, state.revision, state.scene);
        gHostSnapshot = state;
        gHostSnapshotTime = std::chrono::steady_clock::now();
    };

    gSession.onVisualState = [](const sakura_lan::VisualStatePayload& state) {
        std::lock_guard<std::mutex> lock(gRemoteMutex);
        VisualKey key{state.npc, state.entity, state.node,
                      static_cast<uint8_t>(state.kind), state.layer};
        auto previous = gVisualSequence.find(key);
        if (previous != gVisualSequence.end() &&
            static_cast<int32_t>(state.sequence - previous->second) <= 0) return;
        if (previous == gVisualSequence.end() && gVisualSequence.size() >= 4096) return;
        gVisualSequence[key] = state.sequence;
        gVisualPending[key] = state; // Coalesce; never call Unity from UDP thread.
    };

    gSession.onWorldState = [](const sakura_lan::WorldStatePayload& state) {
        std::lock_guard<std::mutex> lock(gRemoteMutex);
        const std::string key = std::to_string(static_cast<int>(state.kind)) + ":" + state.entity;
        auto it = gWorldLatest.find(key);
        if (it != gWorldLatest.end() && state.revision < it->second.revision) return;
        gWorldLatest[key] = state;
        gWorldPending[key] = state;
    };

    gSession.onRemoteState = [](const sakura_lan::PlayerStatePayload& state) {
        {
            std::lock_guard<std::mutex> lock(gRemoteMutex);
            gRemote = state;
            gHasRemote = true;
        }

        LOGI("NET REMOTE id=%u pos=%.2f %.2f %.2f anim=%u",
             static_cast<unsigned>(state.playerId),
             state.position.x,
             state.position.y,
             state.position.z,
             static_cast<unsigned>(state.animationId));
    };
}

void ensure_pump_thread() {
    if (gPumpRunning.exchange(true)) return;

    std::thread([] {
        LOGI("NET pump thread started");

        while (gPumpRunning.load()) {
            {
                std::lock_guard<std::mutex> lock(gSessionMutex);
                if (gSession.mode() != sakura_lan::LanSession::Mode::Offline) {
                    // Drain snapshots in bursts; one receive per sleep capped
                    // throughput below the NPC/animation update rate.
                    for (int i = 0; i < 32; ++i) gSession.pump(0);
                }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(4));
        }

        LOGI("NET pump thread stopped");
    }).detach();
}

void reset_remote_state() {
    std::lock_guard<std::mutex> lock(gRemoteMutex);
    gHasRemote = false;
    gRemote = {};
    gVisualPending.clear();
    gVisualSequence.clear();
    gWorldLatest.clear();
    gWorldPending.clear();
    gHostSnapshot = {};
    gHostSnapshotTime = {};
}

bool ensure_client_locked() {
    ensure_callbacks();
    if (gSession.mode() == sakura_lan::LanSession::Mode::Client) return true;
    reset_remote_state();
    if (!gSession.startClient()) return false;
    ensure_pump_thread();
    return true;
}

} // namespace

extern "C" void sakuralan_net_send_session(const sakura_lan::SessionStatePayload* state) {
    if (!state) return;
    std::lock_guard<std::mutex> lock(gSessionMutex);
    gSession.sendSessionState(*state);
}
extern "C" int sakuralan_net_host_snapshot(sakura_lan::SessionStatePayload* out) {
    std::lock_guard<std::mutex> lock(gRemoteMutex);
    if (!out || !gHostSnapshotTime.time_since_epoch().count() ||
        std::chrono::steady_clock::now() - gHostSnapshotTime > std::chrono::seconds(3)) return 0;
    *out = gHostSnapshot;
    return 1;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_host(const char* roomName, uint32_t sessionId) {
    std::lock_guard<std::mutex> lock(gSessionMutex);
    ensure_callbacks();

    const std::string room =
        (roomName && *roomName) ? roomName : "Sakura LAN";

    reset_remote_state();
    const bool ok =
        gSession.startHost(room, sessionId ? sessionId : 0x53414B55u);

    if (ok) ensure_pump_thread();

    LOGI("NET HOST %s room=%s", ok ? "OK" : "FAIL", room.c_str());
    return ok ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_client() {
    std::lock_guard<std::mutex> lock(gSessionMutex);
    const bool ok = ensure_client_locked();

    LOGI("NET CLIENT %s", ok ? "OK" : "FAIL");
    return ok ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_discover_and_join(const char* playerName, int waitMs) {
    std::lock_guard<std::mutex> lock(gSessionMutex);
    if (!ensure_client_locked()) return 0;

    std::vector<sakura_lan::RoomInfo> rooms;
    if (!gSession.discover(
            0x534B0001u,
            rooms,
            waitMs > 0 ? waitMs : 700) ||
        rooms.empty()) {
        LOGI("NET DISCOVER no rooms");
        return 0;
    }

    const std::string name =
        (playerName && *playerName) ? playerName : "Player 2";

    const bool ok =
        gSession.join(rooms.front(), name, 0x534B0002u, 1500);

    LOGI("NET JOIN %s room=%s host=%s:%u",
         ok ? "OK" : "FAIL",
         rooms.front().name.c_str(),
         rooms.front().endpoint.ip.c_str(),
         static_cast<unsigned>(rooms.front().endpoint.port));

    return ok ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_join_address(
    const char* ip,
    uint16_t port,
    const char* playerName) {

    std::lock_guard<std::mutex> lock(gSessionMutex);
    if (!ensure_client_locked()) return 0;

    if (!ip || !*ip) {
        LOGE("NET DIRECT JOIN missing host IP");
        return 0;
    }

    sakura_lan::RoomInfo room;
    room.name = "Direct LAN";
    room.endpoint.ip = ip;
    room.endpoint.port = port ? port : sakura_lan::kGamePort;
    room.sessionId = 0;
    room.currentPlayers = 1;

    const std::string name =
        (playerName && *playerName) ? playerName : "Player 2";

    const bool ok =
        gSession.join(room, name, 0x534B0003u, 2500);

    LOGI("NET DIRECT JOIN %s host=%s:%u",
         ok ? "OK" : "FAIL",
         room.endpoint.ip.c_str(),
         static_cast<unsigned>(room.endpoint.port));

    return ok ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
void sakuralan_net_pump(int timeoutMs) {
    std::lock_guard<std::mutex> lock(gSessionMutex);
    ensure_callbacks();
    gSession.pump(timeoutMs);
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_connected() {
    std::lock_guard<std::mutex> lock(gSessionMutex);
    return gSession.connected() ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_local_player_id() {
    std::lock_guard<std::mutex> lock(gSessionMutex);
    if (gSession.mode() == sakura_lan::LanSession::Mode::Offline) return -1;
    return static_cast<int>(gSession.localPlayerId());
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_ci_pose() {
    return gCiPose.load() ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
void sakuralan_net_send_world(const sakura_lan::WorldStatePayload* state) {
    if (!state) return;
    std::lock_guard<std::mutex> lock(gSessionMutex);
    gSession.sendWorldState(*state);
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_take_world(sakura_lan::WorldStatePayload* state) {
    if (!state) return 0;
    std::lock_guard<std::mutex> lock(gRemoteMutex);
    if (gWorldPending.empty()) return 0;
    auto it = gWorldPending.begin();
    *state = it->second;
    gWorldPending.erase(it);
    return 1;
}

extern "C" __attribute__((visibility("default")))
void sakuralan_net_send_state(
    float px, float py, float pz,
    float qx, float qy, float qz, float qw,
    float vx, float vy, float vz,
    uint16_t animationId, uint8_t flags) {

    std::lock_guard<std::mutex> lock(gSessionMutex);
    if (!gSession.connected()) return;

    sakura_lan::PlayerStatePayload state{};
    state.position = {px, py, pz};
    state.rotation = {qx, qy, qz, qw};
    state.velocity = {vx, vy, vz};
    state.animationId = animationId;
    state.flags = flags;

    gSession.sendLocalState(state);
}

extern "C" __attribute__((visibility("default")))
void sakuralan_net_send_visual(const sakura_lan::VisualStatePayload* state) {
    if (!state) return;
    std::lock_guard<std::mutex> lock(gSessionMutex);
    gSession.sendVisualState(*state);
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_take_visual(sakura_lan::VisualStatePayload* state) {
    if (!state) return 0;
    std::lock_guard<std::mutex> lock(gRemoteMutex);
    if (gVisualPending.empty()) return 0;
    auto it = gVisualPending.begin();
    *state = it->second;
    gVisualPending.erase(it);
    return 1;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_take_remote(float* out13) {
    if (!out13) return 0;
    std::lock_guard<std::mutex> lock(gRemoteMutex);
    if (!gHasRemote.exchange(false)) return 0;
    const auto state = gRemote;

    out13[0] = state.position.x;
    out13[1] = state.position.y;
    out13[2] = state.position.z;

    out13[3] = state.rotation.x;
    out13[4] = state.rotation.y;
    out13[5] = state.rotation.z;
    out13[6] = state.rotation.w;

    out13[7] = state.velocity.x;
    out13[8] = state.velocity.y;
    out13[9] = state.velocity.z;

    out13[10] = static_cast<float>(state.animationId);
    out13[11] = static_cast<float>(state.flags);
    out13[12] = static_cast<float>(state.playerId);

    return 1;
}

extern "C" __attribute__((visibility("default")))
JNIEXPORT jint JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeHost(
    JNIEnv*, jclass) {
    return sakuralan_net_host("Sakura LAN", 0x53414B55u);
}

extern "C" __attribute__((visibility("default")))
JNIEXPORT jint JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeJoin(
    JNIEnv*, jclass) {
    return sakuralan_net_discover_and_join("Player 2", 900);
}

extern "C" __attribute__((visibility("default")))
JNIEXPORT jint JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeJoinAddress(
    JNIEnv* env, jclass, jstring host, jint port) {

    if (!host) return 0;
    const char* chars = env->GetStringUTFChars(host, nullptr);
    if (!chars) return 0;

    const int result = sakuralan_net_join_address(
        chars,
        static_cast<uint16_t>(
            port > 0 && port <= 65535 ? port : sakura_lan::kGamePort),
        "Player 2");

    env->ReleaseStringUTFChars(host, chars);
    return result;
}

extern "C" __attribute__((visibility("default")))
JNIEXPORT jint JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeConnected(
    JNIEnv*, jclass) {
    return sakuralan_net_connected();
}

extern "C" __attribute__((visibility("default")))
JNIEXPORT void JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeSetCiPose(
    JNIEnv*, jclass, jboolean enabled) {
    gCiPose = enabled == JNI_TRUE;
}
