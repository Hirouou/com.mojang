#include "UdpTransport.hpp"
#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

namespace sakura_lan {

UdpTransport::UdpTransport() = default;
UdpTransport::~UdpTransport() { close(); }

bool UdpTransport::open(uint16_t bindPort, bool enableBroadcast) {
    close();
    fd_ = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (fd_ < 0) return false;

    int yes = 1;
    ::setsockopt(fd_, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    if (enableBroadcast) ::setsockopt(fd_, SOL_SOCKET, SO_BROADCAST, &yes, sizeof(yes));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(bindPort);
    if (::bind(fd_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        close();
        return false;
    }
    return true;
}

void UdpTransport::close() {
    if (fd_ >= 0) { ::close(fd_); fd_ = -1; }
}

bool UdpTransport::sendTo(const Endpoint& to, const void* data, size_t len) const {
    if (fd_ < 0) return false;
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(to.port);
    if (::inet_pton(AF_INET, to.ip.c_str(), &addr.sin_addr) != 1) return false;
    const auto n = ::sendto(fd_, data, len, 0, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
    return n == static_cast<ssize_t>(len);
}

std::optional<Datagram> UdpTransport::receive(int timeoutMs) const {
    if (fd_ < 0) return std::nullopt;
    pollfd pfd{fd_, POLLIN, 0};
    if (::poll(&pfd, 1, timeoutMs) <= 0 || !(pfd.revents & POLLIN)) return std::nullopt;

    uint8_t buf[2048];
    sockaddr_in from{};
    socklen_t fromLen = sizeof(from);
    const auto n = ::recvfrom(fd_, buf, sizeof(buf), 0, reinterpret_cast<sockaddr*>(&from), &fromLen);
    if (n <= 0) return std::nullopt;

    char ip[INET_ADDRSTRLEN]{};
    ::inet_ntop(AF_INET, &from.sin_addr, ip, sizeof(ip));
    Datagram d;
    d.from.ip = ip;
    d.from.port = ntohs(from.sin_port);
    d.bytes.assign(buf, buf + n);
    return d;
}

} // namespace sakura_lan
