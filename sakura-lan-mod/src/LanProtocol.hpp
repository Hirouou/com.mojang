#pragma once
#include <cstdint>
#include <cstring>

namespace sakura_lan {

static constexpr uint32_t kMagic = 0x534B4C4Eu; // SKLN
static constexpr uint16_t kProtocolVersion = 1;
static constexpr uint16_t kDiscoveryPort = 38555;
static constexpr uint16_t kGamePort = 38556;

enum class PacketType : uint8_t {
    Discover = 1,
    Advertise = 2,
    JoinRequest = 3,
    JoinAccept = 4,
    PlayerState = 5,
    Ping = 6,
    Pong = 7,
    Leave = 8,
};

#pragma pack(push, 1)
struct PacketHeader {
    uint32_t magic = kMagic;
    uint16_t version = kProtocolVersion;
    PacketType type = PacketType::Ping;
    uint8_t reserved = 0;
    uint32_t sequence = 0;
    uint32_t payloadBytes = 0;
};

struct DiscoverPayload { uint32_t nonce = 0; };

struct AdvertisePayload {
    uint32_t nonce = 0;
    uint32_t sessionId = 0;
    uint16_t port = kGamePort;
    uint8_t maxPlayers = 2;
    uint8_t currentPlayers = 1;
    char roomName[32]{};
};

struct JoinRequestPayload {
    uint32_t clientNonce = 0;
    char playerName[24]{};
};

struct JoinAcceptPayload {
    uint32_t sessionId = 0;
    uint8_t playerId = 1;
    uint8_t reserved[3]{};
};

struct Vec3 { float x=0, y=0, z=0; };
struct Quat { float x=0, y=0, z=0, w=1; };

struct PlayerStatePayload {
    uint32_t sessionId = 0;
    uint8_t playerId = 0;
    uint8_t flags = 0;
    uint16_t animationId = 0;
    uint32_t tickMs = 0;
    Vec3 position{};
    Quat rotation{};
    Vec3 velocity{};
};
#pragma pack(pop)

static_assert(sizeof(PacketHeader) == 16, "Unexpected packet header layout");

template <typename T>
inline bool decodePayload(const uint8_t* bytes, size_t len, T& out) {
    if (len != sizeof(T)) return false;
    std::memcpy(&out, bytes, sizeof(T));
    return true;
}

} // namespace sakura_lan
