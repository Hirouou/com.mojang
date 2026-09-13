const idOf = record => typeof record?.id === 'string' ? record.id.trim() : '';

/**
 * Applies theatre Mamute snapshots to a tactical entity adapter.
 *
 * Only `focus` and `nearby` are eligible for tactical detail. `distant` stays
 * strategic-only, while `mapContacts` remains a separate fog/intel surface and
 * is deliberately ignored here so player knowledge can never authorize spawn.
 */
export function createMamuteTacticalLifecycle({ spawn, update, despawn } = {}) {
  let active = new Map();

  function reset() {
    const despawned = [];
    for (const [id, record] of active) {
      despawn?.(id, record);
      despawned.push(id);
    }
    active = new Map();
    return Object.freeze(despawned);
  }

  function apply(snapshot) {
    if (!snapshot?.focus) {
      const despawned = reset();
      return Object.freeze({ activeIds: Object.freeze([]), spawned: Object.freeze([]), updated: Object.freeze([]), despawned });
    }

    const desired = new Map();
    const focusId = idOf(snapshot.focus);
    if (focusId) desired.set(focusId, snapshot.focus);
    for (const record of Array.isArray(snapshot.nearby) ? snapshot.nearby : []) {
      const id = idOf(record);
      if (id && !desired.has(id)) desired.set(id, record);
    }

    const spawned = [], updated = [], despawned = [];
    for (const [id, record] of active) {
      if (desired.has(id)) continue;
      despawn?.(id, record);
      despawned.push(id);
    }
    for (const [id, record] of desired) {
      const previous = active.get(id);
      if (previous) {
        update?.(record, previous);
        updated.push(id);
      } else {
        spawn?.(record);
        spawned.push(id);
      }
    }

    active = desired;
    return Object.freeze({
      activeIds: Object.freeze([...active.keys()]),
      spawned: Object.freeze(spawned),
      updated: Object.freeze(updated),
      despawned: Object.freeze(despawned),
    });
  }

  return Object.freeze({ apply, reset, activeIds: () => Object.freeze([...active.keys()]) });
}
