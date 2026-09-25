#pragma once
#include "LanProtocol.hpp"
#include "UdpTransport.hpp"
#include <functional>
#include <string>
#include <vector>

namespace sakura_lan {

struct RoomInfo {
    std::string name;
    Endpoint endpoint;
    uint32_t sessionId = 0;
    uint8_t currentPlayers = 0;
};

class LanSession {
public:
    enum class Mode { Offline, Host, Client };

    bool startHost(const std::string& roomName, uint32_t sessionId);
    bool startClient();
    void stop();

    bool discover(uint32_t nonce, std::vector<RoomInfo>& rooms, int waitMs = 500);
    bool join(const RoomInfo& room, const std::string& playerName, uint32_t clientNonce, int waitMs = 1200);

    void pump(int timeoutMs = 0);
    void sendLocalState(const PlayerStatePayload& state);
    void sendVisualState(const VisualStatePayload& state);
    void sendSessionState(const SessionStatePayload& state);

    Mode mode() const { return mode_; }
    bool connected() const { return connected_; }
    uint8_t localPlayerId() const { return localPlayerId_; }
    uint32_t sessionId() const { return sessionId_; }

    std::function<void(const PlayerStatePayload&)> onRemoteState;
    std::function<void(const VisualStatePayload&)> onVisualState;
    std::function<void(const SessionStatePayload&)> onSessionState;
    std::function<void(const std::string&)> onLog;

private:
    void sendPacket(UdpTransport& tx, const Endpoint& to, PacketType type, const void* payload, uint32_t payloadBytes);
    bool parse(const Datagram& d, PacketHeader& h, const uint8_t*& payload) const;
    void log(const std::string& s) const;

    Mode mode_ = Mode::Offline;
    bool connected_ = false;
    uint8_t localPlayerId_ = 0;
    uint32_t sessionId_ = 0;
    uint32_t sequence_ = 1;
    uint32_t remoteStateSequence_ = 0;
    bool hasRemoteStateSequence_ = false;
    uint32_t sessionStateSequence_ = 0;
    bool hasSessionStateSequence_ = false;
    std::string roomName_;
    Endpoint peer_{};
    Endpoint sendPeer_{};
    UdpTransport discovery_;
    UdpTransport game_;
};

} // namespace sakura_lan
