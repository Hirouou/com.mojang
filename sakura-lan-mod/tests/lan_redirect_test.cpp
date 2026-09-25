#include "LanSession.hpp"
#include <atomic>
#include <thread>
#include <iostream>
using namespace sakura_lan;

int main() {
    UdpTransport ingress, replies;
    if (!ingress.open(39656) || !replies.open(39657)) return 1;
    std::atomic<bool> running{true}, gotClientState{false};
    std::thread server([&] {
        while (running) {
            auto d = ingress.receive(10);
            if (!d || d->bytes.size() < sizeof(PacketHeader)) continue;
            PacketHeader h{};
            std::memcpy(&h, d->bytes.data(), sizeof(h));
            if (h.type == PacketType::JoinRequest) {
                JoinRequestPayload request{};
                if (!decodePayload(d->bytes.data()+sizeof(h), h.payloadBytes, request)) continue;
                JoinAcceptPayload accept{};
                accept.sessionId = 123;
                accept.clientNonce = request.clientNonce;
                h.type = PacketType::JoinAccept;
                h.payloadBytes = sizeof(accept);
                uint8_t bytes[sizeof(h)+sizeof(accept)];
                std::memcpy(bytes, &h, sizeof(h));
                std::memcpy(bytes+sizeof(h), &accept, sizeof(accept));
                replies.sendTo(d->from, bytes, sizeof(bytes));
            } else if (h.type == PacketType::PlayerState) {
                PlayerStatePayload state{};
                if (decodePayload(d->bytes.data()+sizeof(h), h.payloadBytes, state) &&
                    state.sessionId == 123 && state.playerId == 1 && state.position.x == 42)
                    gotClientState = true;
            }
        }
    });
    LanSession client;
    RoomInfo room;
    room.endpoint = {"127.0.0.1", 39656};
    bool joined = client.startClient() && client.join(room, "Client", 987, 1000);
    PlayerStatePayload state{};
    state.position.x = 42;
    if (joined) client.sendLocalState(state);
    for (int i=0; i<100 && !gotClientState; ++i)
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    running = false;
    server.join();
    if (!joined || !gotClientState) return 2;
    std::cout << "PASS replies from alternate port preserve configured client ingress\n";
}
