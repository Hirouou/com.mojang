import { cabinCrewPose } from './cabin-controls.js';

/**
 * Convert the public cabin snapshot into the compact collision-safe pose used
 * by multiplayer replication. This keeps transport/session code from reaching
 * into movement/camera internals or trusting arbitrary renderer state.
 */
export function crewLocalPoseFromCabinSnapshot(snapshot) {
  const position = snapshot?.position;
  if (!position) return null;
  return cabinCrewPose({
    x: position.x,
    z: position.z,
    yaw: snapshot.yaw,
    pitch: snapshot.pitch,
  });
}
