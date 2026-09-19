#pragma once
#include "LanProtocol.hpp"
#include <string>

namespace sakura_lan {

class GameBridge {
public:
    virtual ~GameBridge() = default;
    virtual bool initialize() = 0;
    virtual bool readLocalPlayer(PlayerStatePayload& out) = 0;
    virtual bool ensureRemotePlayer(uint8_t playerId) = 0;
    virtual void applyRemotePlayer(const PlayerStatePayload& state, float interpolationAlpha) = 0;
    virtual void showStatus(const std::string& text) = 0;
};

} // namespace sakura_lan
