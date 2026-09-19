#pragma once
#include "GameBridge.hpp"
#include "LanSession.hpp"
#include <chrono>
#include <optional>

namespace sakura_lan {

class ModController {
public:
    explicit ModController(GameBridge& bridge);
    bool host(const std::string& roomName, uint32_t sessionId);
    bool client();
    std::vector<RoomInfo> scan();
    bool join(const RoomInfo& room, const std::string& playerName);
    void update();

private:
    GameBridge& bridge_;
    LanSession net_;
    std::optional<PlayerStatePayload> latestRemote_;
    uint32_t nonce_ = 0x53414B55;
    std::chrono::steady_clock::time_point lastSend_{};
};

} // namespace sakura_lan
