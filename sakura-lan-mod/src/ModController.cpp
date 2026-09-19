#include "ModController.hpp"

namespace sakura_lan {

ModController::ModController(GameBridge& bridge) : bridge_(bridge) {
    net_.onRemoteState = [this](const PlayerStatePayload& s) { latestRemote_ = s; };
    net_.onLog = [this](const std::string& s) { bridge_.showStatus(s); };
}

bool ModController::host(const std::string& roomName, uint32_t sessionId) {
    return net_.startHost(roomName, sessionId);
}

bool ModController::client() { return net_.startClient(); }

std::vector<RoomInfo> ModController::scan() {
    std::vector<RoomInfo> rooms;
    net_.discover(++nonce_, rooms, 500);
    return rooms;
}

bool ModController::join(const RoomInfo& room, const std::string& playerName) {
    return net_.join(room, playerName, ++nonce_, 1200);
}

void ModController::update() {
    net_.pump(0);
    if (latestRemote_) {
        bridge_.ensureRemotePlayer(latestRemote_->playerId);
        bridge_.applyRemotePlayer(*latestRemote_, 0.35f);
        latestRemote_.reset();
    }

    const auto now = std::chrono::steady_clock::now();
    if (net_.connected() &&
        (lastSend_.time_since_epoch().count() == 0 || now - lastSend_ >= std::chrono::milliseconds(50))) {
        PlayerStatePayload s{};
        if (bridge_.readLocalPlayer(s)) net_.sendLocalState(s);
        lastSend_ = now;
    }
}

} // namespace sakura_lan
