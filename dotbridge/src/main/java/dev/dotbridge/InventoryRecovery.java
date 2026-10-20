package dev.dotbridge;

/** A failed/cancelled sent click cannot be retried merely because HTTP returned.
 * A fresh observation must follow an authoritative revision and a quiet period.
 * This is a retry barrier, not a claim that vanilla supplies transaction acknowledgements.
 */
final class InventoryRecovery {
    private final int initialState;
    private int state;
    private long lastChange;
    private boolean serverRevision;

    InventoryRecovery(int initialState, int currentState, long lastChange, boolean sawRevision) {
        this.initialState = initialState;
        state = currentState;
        this.lastChange = lastChange;
        serverRevision = sawRevision || currentState != initialState;
    }

    void update(int currentState, boolean contentsChanged, long tick) {
        if (state != currentState || contentsChanged) lastChange = tick;
        state = currentState;
        serverRevision |= currentState != initialState;
    }

    boolean canObserveRecovery(long tick) {
        return InventoryCommand.settled(tick, lastChange, serverRevision, true, 2);
    }
}
