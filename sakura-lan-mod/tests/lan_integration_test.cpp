#include "LanSession.hpp"
#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

using namespace sakura_lan;

int main() {
    LanSession host, client;
    std::atomic<bool> hostRun{true};
    std::atomic<bool> hostReceived{false};
    std::atomic<bool> clientReceived{false};
    PlayerStatePayload atHost{}, atClient{};

    host.onRemoteState = [&](const PlayerStatePayload& s) { atHost = s; hostReceived = true; };
    client.onRemoteState = [&](const PlayerStatePayload& s) { atClient = s; clientReceived = true; };

    if (!host.startHost("Igor Room", 0x12345678)) {
        std::cerr << "host start failed\n";
        return 1;
    }

    std::thread hostThread([&] {
        while (hostRun) {
            host.pump(10);
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        }
    });

    if (!client.startClient()) {
        hostRun = false;
        hostThread.join();
        return 2;
    }

    std::vector<RoomInfo> rooms;
    if (!client.discover(0xABCD, rooms, 700)) {
        std::cerr << "discovery failed\n";
        hostRun = false;
        hostThread.join();
        return 3;
    }

    const auto room = rooms.front();
    std::cout << "found room=" << room.name << " ip=" << room.endpoint.ip << " port=" << room.endpoint.port << "\n";

    if (!client.join(room, "Player 2", 0xCAFE, 1000)) {
        std::cerr << "join failed\n";
        hostRun = false;
        hostThread.join();
        return 4;
    }

    PlayerStatePayload clientState{};
    clientState.position = {12.5f, 3.0f, -8.25f};
    clientState.velocity = {1, 0, 2};
    clientState.animationId = 7;
    client.sendLocalState(clientState);

    for (int i = 0; i < 80 && !hostReceived; ++i)
        std::this_thread::sleep_for(std::chrono::milliseconds(10));

    PlayerStatePayload hostState{};
    hostState.position = {-4.0f, 1.5f, 2.0f};
    hostState.animationId = 3;
    host.sendLocalState(hostState);

    for (int i = 0; i < 80 && !clientReceived; ++i) {
        client.pump(10);
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }

    hostRun = false;
    hostThread.join();

    if (!hostReceived || !clientReceived) {
        std::cerr << "two-way state sync failed\n";
        return 5;
    }
    if (atHost.playerId != 1 || atHost.position.x != 12.5f || atHost.animationId != 7) return 6;
    if (atClient.playerId != 0 || atClient.position.x != -4.0f || atClient.animationId != 3) return 7;

    std::cout << "PASS two-way LAN sync\n";
    return 0;
}
