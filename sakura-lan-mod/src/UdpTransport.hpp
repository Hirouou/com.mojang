#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace sakura_lan {

struct Endpoint {
    std::string ip;
    uint16_t port = 0;
};

struct Datagram {
    Endpoint from;
    std::vector<uint8_t> bytes;
};

class UdpTransport {
public:
    UdpTransport();
    ~UdpTransport();
    UdpTransport(const UdpTransport&) = delete;
    UdpTransport& operator=(const UdpTransport&) = delete;

    bool open(uint16_t bindPort, bool enableBroadcast = true);
    void close();
    bool sendTo(const Endpoint& to, const void* data, size_t len) const;
    std::optional<Datagram> receive(int timeoutMs) const;
    bool valid() const { return fd_ >= 0; }

private:
    int fd_ = -1;
};

} // namespace sakura_lan
