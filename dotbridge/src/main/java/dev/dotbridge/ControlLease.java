package dev.dotbridge;

import java.util.function.LongSupplier;

/** Main-thread watchdog. Monotonic time still expires when simulation ticks stall. */
final class ControlLease {
    private final LongSupplier clock;
    private long deadline;
    private boolean granted;

    ControlLease() { this(System::nanoTime); }
    ControlLease(LongSupplier clock) { this.clock = clock; }

    void renew(int ttlMs) {
        if (ttlMs < 500 || ttlMs > 10_000) throw new IllegalArgumentException("ttl_ms must be 500..10000");
        deadline = clock.getAsLong() + ttlMs * 1_000_000L;
        granted = true;
    }

    boolean valid() { return granted && deadline - clock.getAsLong() > 0; }
    long remainingMs() { return valid() ? Math.max(0, (deadline - clock.getAsLong()) / 1_000_000L) : 0; }
    void revoke() { granted = false; }
}
