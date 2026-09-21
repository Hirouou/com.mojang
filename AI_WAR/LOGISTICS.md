# AI WAR — Logistics & Movement

## Principle

Nothing teleports.

Every unit, vehicle, cargo shipment and reinforcement must move through the map and consume simulated travel time. Arrival happens only after the calculated route/travel duration is completed.

## Simulation scale

- 1 map pixel = 20 metres.
- 1 simulation tick = 10 seconds of simulated time.
- The browser advances ticks every 120 ms in real time while the war is running.

## Reference speeds

These are baseline game values based on real-world order-of-magnitude movement speeds, not exact vehicle specifications:

| Asset | Speed |
|---|---:|
| Soldier / Commander on foot | 1.4 m/s |
| Car / light vehicle | 22 m/s |
| Truck | 18 m/s |

The game converts speed to map displacement using:

`distance = speed_m_per_s × simulated_seconds`

No action may bypass this travel calculation.

## Logistics rule

A logistical order must have:

1. origin;
2. destination;
3. cargo/asset;
4. movement mode;
5. calculated travel time;
6. departure event;
7. arrival event.

Until the arrival event occurs, the cargo/asset remains at its origin or in transit. It cannot be used at the destination.

## Combat and visibility

Movement does not reveal hidden enemy state. A faction only receives the observations permitted by the Governor/game protocol.

## Future expansion

Roads, terrain, vehicle capacity, fuel, convoy speed, loading/unloading time and route choice may be added later. They must increase realism without introducing instantaneous movement.

The Governor treats any proposed mechanic that creates instantaneous transport or spawning as invalid unless explicitly defined as a real in-game mechanic.
