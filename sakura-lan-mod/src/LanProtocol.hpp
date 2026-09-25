#pragma once
#include <cstdint>
#include <cstring>

namespace sakura_lan {

static constexpr uint32_t kMagic = 0x534B4C4Eu; // SKLN
static constexpr uint16_t kProtocolVersion = 5;
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
    VisualState = 9,
    SessionState = 10,
    WorldState = 11,
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
    uint32_t clientNonce = 0;
    uint8_t playerId = 1;
    uint8_t reserved[3]{};
};

struct Vec3 { float x=0, y=0, z=0; };
struct Quat { float x=0, y=0, z=0, w=1; };

// Host-authoritative entry snapshot. The client stays in the title until the
// host has a playable character, then loads the supported map and applies it.
struct SessionStatePayload {
    uint32_t sessionId = 0;
    uint32_t revision = 0;
    uint8_t ready = 0;
    uint8_t reserved[3]{};
    char scene[64]{};
    float gameTime = 0;
    int32_t day = 0;
    int32_t week = 0;
    Vec3 spawn{};
    Quat facing{};
};

// Host-authoritative persistent world mutations. This channel is deliberately
// separate from visual snapshots: late joiners need the latest object/mission
// state, not a replay of old packets.
enum class WorldKind : uint8_t {
    ObjectActive = 1,
    ItemTaken = 2,
    MissionState = 3,
    VehicleState = 4,
    MissionProgress = 5,
    WorldEvent = 6,
    NpcState = 7,
    WeatherState = 8,
};
struct WorldStatePayload {
    uint32_t sessionId = 0;
    uint32_t revision = 0;
    WorldKind kind = WorldKind::ObjectActive;
    uint8_t active = 1;
    uint8_t occupiedBy = 255;
    uint8_t reserved = 0;
    char entity[192]{};
    int32_t value = 0;
    // Generic progress fields. Mission state uses value=mission/state id,
    // step=current objective, progress/target for counters and flags for
    // completion/failure bits. Economy and relationships are intentionally
    // excluded: they belong to each player.
    int32_t step = 0;
    int32_t progress = 0;
    int32_t target = 0;
    uint32_t flags = 0;
    float amount = 0;   // health/progress scalar when a kind needs decimals
    float amount2 = 0;  // optional secondary scalar (e.g. shield)
    Vec3 position{};
    Quat rotation{};
};

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
// Visual-only replication: never includes dialogue, quest or economy data.
enum class VisualKind : uint8_t {
    Pose = 1,
    Animator = 2,
    Node = 3,
    Material = 4,
    AnimatorParameter = 5,
    Appearance = 6,
};
struct VisualStatePayload {
    uint32_t sessionId = 0;
    uint32_t sequence = 0;
    uint8_t playerId = 0;
    uint8_t npc = 0; // Only the host may send NPC state.
    VisualKind kind = VisualKind::Pose;
    uint8_t active = 1;
    char entity[192]{}; // NPC hierarchy path; empty for the sending player.
    char node[192]{};   // Relative transform path within the character.
    char asset[128]{};  // Shared material name, never a process pointer.
    Vec3 position{};
    Quat rotation{};
    Vec3 scale{1, 1, 1};
    int32_t stateHash = 0;
    int32_t layer = 0;
    float normalizedTime = 0;
    float weight = 1;
    float speed = 1;
    // AnimatorControllerParameter snapshot. Unity locomotion is commonly a
    // blend tree, so the state hash alone is not enough to reproduce walking.
    int32_t parameterHash = 0;
    uint8_t parameterType = 0; // Float=1, Int=3, Bool=4 (Trigger is state-driven).
    uint8_t parameterReserved[3]{};
    float parameterFloat = 0;
    int32_t parameterInt = 0;
    // Per-player appearance descriptor. These values are never treated as
    // shared-world state; they only rebuild the remote avatar.
    int32_t appearance[15]{};
    float color[4]{1, 1, 1, 1};
};
#pragma pack(pop)
static_assert(sizeof(VisualStatePayload) + sizeof(PacketHeader) < 1200,
              "Visual datagrams must stay below the LAN MTU");

static_assert(sizeof(PacketHeader) == 16, "Unexpected packet header layout");

template <typename T>
inline bool decodePayload(const uint8_t* bytes, size_t len, T& out) {
    if (len != sizeof(T)) return false;
    std::memcpy(&out, bytes, sizeof(T));
    return true;
}

} // namespace sakura_lan
