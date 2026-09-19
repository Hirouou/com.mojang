#include "../src/LanSession.hpp"
#include <jni.h>
#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstring>
#include <mutex>
#include <thread>
#include <string>
#include <vector>

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "SakuraLAN", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "SakuraLAN", __VA_ARGS__)

namespace {
std::mutex gMutex;
sakura_lan::LanSession gSession;
sakura_lan::PlayerStatePayload gRemote{};
std::atomic<bool> gHasRemote{false};
std::atomic<bool> gConfigured{false};
std::atomic<bool> gPumpRunning{false};

void ensure_callbacks() {
    if (gConfigured.exchange(true)) return;
    gSession.onLog = [](const std::string& s) { LOGI("NET %s", s.c_str()); };
    gSession.onRemoteState = [](const sakura_lan::PlayerStatePayload& state) {
        gRemote = state;
        gHasRemote = true;
        LOGI("NET REMOTE id=%u pos=%.2f %.2f %.2f anim=%u",
             static_cast<unsigned>(state.playerId),
             state.position.x, state.position.y, state.position.z,
             static_cast<unsigned>(state.animationId));
    };
}

void ensure_pump_thread() {
    if (gPumpRunning.exchange(true)) return;
    std::thread([] {
        LOGI("NET pump thread started");
        while (gPumpRunning.load()) {
            {
                std::lock_guard<std::mutex> lock(gMutex);
                if (gSession.mode() != sakura_lan::LanSession::Mode::Offline) {
                    gSession.pump(10);
                }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
        LOGI("NET pump thread stopped");
    }).detach();
}
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_host(const char* roomName, uint32_t sessionId) {
    std::lock_guard<std::mutex> lock(gMutex);
    ensure_callbacks();
    const std::string room = (roomName && *roomName) ? roomName : "Sakura LAN";
    const bool ok = gSession.startHost(room, sessionId ? sessionId : 0x53414B55u);
    if (ok) ensure_pump_thread();
    LOGI("NET HOST %s room=%s", ok ? "OK" : "FAIL", room.c_str());
    return ok ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_client() {
    std::lock_guard<std::mutex> lock(gMutex);
    ensure_callbacks();
    const bool ok = gSession.startClient();
    if (ok) ensure_pump_thread();
    LOGI("NET CLIENT %s", ok ? "OK" : "FAIL");
    return ok ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_discover_and_join(const char* playerName, int waitMs) {
    std::lock_guard<std::mutex> lock(gMutex);
    ensure_callbacks();
    if (gSession.mode() != sakura_lan::LanSession::Mode::Client && !gSession.startClient()) return 0;

    std::vector<sakura_lan::RoomInfo> rooms;
    if (!gSession.discover(0x534B0001u, rooms, waitMs > 0 ? waitMs : 700) || rooms.empty()) {
        LOGI("NET DISCOVER no rooms");
        return 0;
    }

    const std::string name = (playerName && *playerName) ? playerName : "Player 2";
    const bool ok = gSession.join(rooms.front(), name, 0x534B0002u, 1500);
    LOGI("NET JOIN %s room=%s host=%s:%u",
         ok ? "OK" : "FAIL",
         rooms.front().name.c_str(),
         rooms.front().endpoint.ip.c_str(),
         static_cast<unsigned>(rooms.front().endpoint.port));
    return ok ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
void sakuralan_net_pump(int timeoutMs) {
    std::lock_guard<std::mutex> lock(gMutex);
    ensure_callbacks();
    gSession.pump(timeoutMs);
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_connected() {
    std::lock_guard<std::mutex> lock(gMutex);
    return gSession.connected() ? 1 : 0;
}

extern "C" __attribute__((visibility("default")))
void sakuralan_net_send_state(float px, float py, float pz,
                              float qx, float qy, float qz, float qw,
                              float vx, float vy, float vz,
                              uint16_t animationId, uint8_t flags) {
    std::lock_guard<std::mutex> lock(gMutex);
    if (!gSession.connected()) return;
    sakura_lan::PlayerStatePayload s{};
    s.position = {px, py, pz};
    s.rotation = {qx, qy, qz, qw};
    s.velocity = {vx, vy, vz};
    s.animationId = animationId;
    s.flags = flags;
    gSession.sendLocalState(s);
}

extern "C" __attribute__((visibility("default")))
int sakuralan_net_take_remote(float* out13) {
    if (!out13 || !gHasRemote.exchange(false)) return 0;
    std::lock_guard<std::mutex> lock(gMutex);
    const auto s = gRemote;
    out13[0] = s.position.x; out13[1] = s.position.y; out13[2] = s.position.z;
    out13[3] = s.rotation.x; out13[4] = s.rotation.y; out13[5] = s.rotation.z; out13[6] = s.rotation.w;
    out13[7] = s.velocity.x; out13[8] = s.velocity.y; out13[9] = s.velocity.z;
    out13[10] = static_cast<float>(s.animationId);
    out13[11] = static_cast<float>(s.flags);
    out13[12] = static_cast<float>(s.playerId);
    return 1;
}


extern "C" __attribute__((visibility("default")))
JNIEXPORT jint JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeHost(JNIEnv*, jclass) {
    return sakuralan_net_host("Sakura LAN", 0x53414B55u);
}

extern "C" __attribute__((visibility("default")))
JNIEXPORT jint JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeJoin(JNIEnv*, jclass) {
    if (!sakuralan_net_client()) return 0;
    return sakuralan_net_discover_and_join("Player 2", 900);
}

extern "C" __attribute__((visibility("default")))
JNIEXPORT jint JNICALL
Java_jp_garud_ssimulator_SakuraLanActivity_nativeConnected(JNIEnv*, jclass) {
    return sakuralan_net_connected();
}
