#include "LanSession.hpp"
#include <algorithm>
#include <chrono>
#include <cstring>
#include <cmath>

namespace sakura_lan {

static uint32_t nowMs() {
    using namespace std::chrono;
    return static_cast<uint32_t>(duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count());
}

void LanSession::log(const std::string& s) const { if (onLog) onLog(s); }

bool LanSession::startHost(const std::string& roomName, uint32_t sessionId) {
    stop();
    if (!discovery_.open(kDiscoveryPort, true)) return false;
    if (!game_.open(kGamePort, true)) return false;
    mode_ = Mode::Host;
    roomName_ = roomName;
    sessionId_ = sessionId;
    localPlayerId_ = 0;
    connected_ = false;
    log("Host started");
    return true;
}

bool LanSession::startClient() {
    stop();
    if (!discovery_.open(0, true)) return false;
    if (!game_.open(0, true)) return false;
    mode_ = Mode::Client;
    localPlayerId_ = 1;
    connected_ = false;
    log("Client started");
    return true;
}

void LanSession::stop() {
    discovery_.close();
    game_.close();
    mode_ = Mode::Offline;
    connected_ = false;
    sessionId_ = 0;
    peer_ = {};
    sendPeer_ = {};
    hasRemoteStateSequence_ = false;
    hasSessionStateSequence_ = false;
}

void LanSession::sendPacket(UdpTransport& tx, const Endpoint& to, PacketType type, const void* payload, uint32_t payloadBytes) {
    std::vector<uint8_t> bytes(sizeof(PacketHeader) + payloadBytes);
    PacketHeader h{};
    h.type = type;
    h.sequence = sequence_++;
    h.payloadBytes = payloadBytes;
    std::memcpy(bytes.data(), &h, sizeof(h));
    if (payloadBytes) std::memcpy(bytes.data() + sizeof(h), payload, payloadBytes);
    tx.sendTo(to, bytes.data(), bytes.size());
}

bool LanSession::parse(const Datagram& d, PacketHeader& h, const uint8_t*& payload) const {
    if (d.bytes.size() < sizeof(PacketHeader)) return false;
    std::memcpy(&h, d.bytes.data(), sizeof(h));
    if (h.magic != kMagic || h.version != kProtocolVersion) return false;
    if (d.bytes.size() != sizeof(PacketHeader) + h.payloadBytes) return false;
    payload = d.bytes.data() + sizeof(PacketHeader);
    return true;
}

bool LanSession::discover(uint32_t nonce, std::vector<RoomInfo>& rooms, int waitMs) {
    if (mode_ != Mode::Client) return false;
    DiscoverPayload p{nonce};
    sendPacket(discovery_, {"255.255.255.255", kDiscoveryPort}, PacketType::Discover, &p, sizeof(p));
    sendPacket(discovery_, {"127.0.0.1", kDiscoveryPort}, PacketType::Discover, &p, sizeof(p));

    const uint32_t end = nowMs() + waitMs;
    while (static_cast<int32_t>(end - nowMs()) > 0) {
        auto d = discovery_.receive(50);
        if (!d) continue;
        PacketHeader h{};
        const uint8_t* payload = nullptr;
        if (!parse(*d, h, payload) || h.type != PacketType::Advertise) continue;
        AdvertisePayload a{};
        if (!decodePayload(payload, h.payloadBytes, a) || a.nonce != nonce) continue;

        RoomInfo r;
        a.roomName[sizeof(a.roomName) - 1] = 0;
        r.name = a.roomName;
        r.endpoint = {d->from.ip, a.port};
        r.sessionId = a.sessionId;
        r.currentPlayers = a.currentPlayers;
        const auto dup = std::find_if(rooms.begin(), rooms.end(), [&](const RoomInfo& x) {
            return x.sessionId == r.sessionId && x.endpoint.ip == r.endpoint.ip;
        });
        if (dup == rooms.end()) rooms.push_back(r);
    }
    return !rooms.empty();
}

bool LanSession::join(const RoomInfo& room, const std::string& playerName, uint32_t clientNonce, int waitMs) {
    if (mode_ != Mode::Client) return false;
    JoinRequestPayload p{};
    p.clientNonce = clientNonce;
    std::strncpy(p.playerName, playerName.c_str(), sizeof(p.playerName) - 1);
    sendPacket(game_, room.endpoint, PacketType::JoinRequest, &p, sizeof(p));

    const uint32_t end = nowMs() + waitMs;
    while (static_cast<int32_t>(end - nowMs()) > 0) {
        auto d = game_.receive(80);
        if (!d) continue;
        PacketHeader h{};
        const uint8_t* payload = nullptr;
        if (!parse(*d, h, payload) || h.type != PacketType::JoinAccept) continue;
        JoinAcceptPayload a{};
        if (!decodePayload(payload, h.payloadBytes, a) || a.playerId != 1 || !a.sessionId ||
            a.clientNonce != clientNonce ||
            (room.sessionId && room.sessionId != a.sessionId)) continue;
        sessionId_ = a.sessionId;
        localPlayerId_ = a.playerId;
        peer_ = {d->from.ip, d->from.port};
        // Emulator redirection may return through a different source port.
        // Receive from that endpoint, but send through the configured ingress.
        sendPeer_ = room.endpoint;
        connected_ = true;
        log("Joined host");
        return true;
    }
    return false;
}

void LanSession::pump(int timeoutMs) {
    if (mode_ == Mode::Offline) return;

    if (mode_ == Mode::Host) {
        if (auto d = discovery_.receive(0)) {
            PacketHeader h{};
            const uint8_t* payload = nullptr;
            if (parse(*d, h, payload) && h.type == PacketType::Discover) {
                DiscoverPayload q{};
                if (decodePayload(payload, h.payloadBytes, q)) {
                    AdvertisePayload a{};
                    a.nonce = q.nonce;
                    a.sessionId = sessionId_;
                    a.port = kGamePort;
                    a.currentPlayers = connected_ ? 2 : 1;
                    std::strncpy(a.roomName, roomName_.c_str(), sizeof(a.roomName) - 1);
                    sendPacket(discovery_, {d->from.ip, d->from.port}, PacketType::Advertise, &a, sizeof(a));
                }
            }
        }
    }

    auto d = game_.receive(timeoutMs);
    if (!d) return;
    PacketHeader h{};
    const uint8_t* payload = nullptr;
    if (!parse(*d, h, payload)) return;

    if (mode_ == Mode::Host && h.type == PacketType::JoinRequest) {
        JoinRequestPayload req{};
        if (!decodePayload(payload, h.payloadBytes, req)) return;
        if (connected_ && (peer_.ip != d->from.ip || peer_.port != d->from.port)) return;
        peer_ = {d->from.ip, d->from.port};
        connected_ = true;
        sendPeer_ = peer_;
        JoinAcceptPayload a{};
        a.sessionId = sessionId_;
        a.clientNonce = req.clientNonce;
        a.playerId = 1;
        sendPacket(game_, peer_, PacketType::JoinAccept, &a, sizeof(a));
        req.playerName[sizeof(req.playerName) - 1] = 0;
        log(std::string("Client joined: ") + req.playerName);
        return;
    }

    if (connected_ && (d->from.ip != peer_.ip || d->from.port != peer_.port)) return;
    if (h.type == PacketType::SessionState && connected_ && mode_ == Mode::Client) {
        SessionStatePayload s{};
        if (!decodePayload(payload, h.payloadBytes, s) || s.sessionId != sessionId_ ||
            s.ready > 1 || !std::memchr(s.scene, 0, sizeof(s.scene)) ||
            !std::isfinite(s.gameTime) || !std::isfinite(s.spawn.x) ||
            !std::isfinite(s.spawn.y) || !std::isfinite(s.spawn.z)) return;
        const float norm = s.facing.x*s.facing.x + s.facing.y*s.facing.y +
                           s.facing.z*s.facing.z + s.facing.w*s.facing.w;
        if (!std::isfinite(norm) || norm < 0.5f || norm > 1.5f) return;
        if (hasSessionStateSequence_ && static_cast<int32_t>(h.sequence - sessionStateSequence_) <= 0) return;
        hasSessionStateSequence_ = true;
        sessionStateSequence_ = h.sequence;
        if (onSessionState) onSessionState(s);
        return;
    }
    if (h.type == PacketType::VisualState && connected_) {
        VisualStatePayload s{};
        if (!decodePayload(payload, h.payloadBytes, s) || s.sessionId != sessionId_ ||
            s.playerId == localPlayerId_ || s.playerId > 1 || s.npc > 1 ||
            (s.npc && (mode_ != Mode::Client || s.playerId != 0))) return;
        if (!std::memchr(s.entity, 0, sizeof(s.entity)) ||
            !std::memchr(s.node, 0, sizeof(s.node)) ||
            !std::memchr(s.asset, 0, sizeof(s.asset))) return;
        if (onVisualState) onVisualState(s);
    }
    if (h.type == PacketType::WorldState && connected_) {
        WorldStatePayload s{};
        if (!decodePayload(payload, h.payloadBytes, s) || s.sessionId != sessionId_ ||
            !std::memchr(s.entity, 0, sizeof(s.entity)) ||
            !std::isfinite(s.position.x) || !std::isfinite(s.position.y) ||
            !std::isfinite(s.position.z)) return;
        const float norm = s.rotation.x*s.rotation.x + s.rotation.y*s.rotation.y +
                           s.rotation.z*s.rotation.z + s.rotation.w*s.rotation.w;
        if (!std::isfinite(norm) || norm < 0.5f || norm > 1.5f) return;
        if (onWorldState) onWorldState(s);
        return;
    }
    if (h.type == PacketType::PlayerState && connected_) {
        PlayerStatePayload s{};
        if (!decodePayload(payload, h.payloadBytes, s) || s.sessionId != sessionId_ ||
            s.playerId == localPlayerId_ || s.playerId > 1) return;
        if (hasRemoteStateSequence_ && static_cast<int32_t>(h.sequence - remoteStateSequence_) <= 0) return;
        hasRemoteStateSequence_ = true;
        remoteStateSequence_ = h.sequence;
        if (onRemoteState) onRemoteState(s);
    }
}

void LanSession::sendLocalState(const PlayerStatePayload& in) {
    if (!connected_ || mode_ == Mode::Offline) return;
    PlayerStatePayload s = in;
    s.sessionId = sessionId_;
    s.playerId = localPlayerId_;
    s.tickMs = nowMs();
    sendPacket(game_, sendPeer_, PacketType::PlayerState, &s, sizeof(s));
}

void LanSession::sendVisualState(const VisualStatePayload& in) {
    if (!connected_ || mode_ == Mode::Offline || (in.npc && mode_ != Mode::Host)) return;
    VisualStatePayload s = in;
    s.sessionId = sessionId_;
    s.playerId = localPlayerId_;
    s.sequence = sequence_;
    sendPacket(game_, sendPeer_, PacketType::VisualState, &s, sizeof(s));
}

void LanSession::sendSessionState(const SessionStatePayload& in) {
    if (!connected_ || mode_ != Mode::Host) return;
    SessionStatePayload s = in;
    s.sessionId = sessionId_;
    sendPacket(game_, sendPeer_, PacketType::SessionState, &s, sizeof(s));
}

void LanSession::sendWorldState(const WorldStatePayload& in) {
    if (!connected_ || mode_ == Mode::Offline) return;
    WorldStatePayload s = in;
    s.sessionId = sessionId_;
    sendPacket(game_, sendPeer_, PacketType::WorldState, &s, sizeof(s));
}

} // namespace sakura_lan
