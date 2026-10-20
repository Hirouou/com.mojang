package dev.dotbridge;

import org.junit.jupiter.api.Test;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class ControlLeaseTest {
    @Test void expiresWithoutGameTicksAndCanBeRevoked() {
        AtomicLong clock = new AtomicLong();
        ControlLease lease = new ControlLease(clock::get);
        assertFalse(lease.valid());
        lease.renew(3000);
        clock.set(2_999_000_000L);
        assertTrue(lease.valid());
        assertEquals(1, lease.remainingMs());
        clock.set(3_000_000_000L);
        assertFalse(lease.valid());
        lease.renew(500);
        assertTrue(lease.valid());
        lease.revoke();
        assertFalse(lease.valid());
    }
    @Test void refusesUnboundedLeasesAndHandlesClockWrap() {
        AtomicLong clock = new AtomicLong(Long.MAX_VALUE - 1_000_000);
        ControlLease lease = new ControlLease(clock::get);
        assertThrows(IllegalArgumentException.class, () -> lease.renew(499));
        assertThrows(IllegalArgumentException.class, () -> lease.renew(10001));
        lease.renew(500);
        assertTrue(lease.valid());
        clock.addAndGet(500_000_000);
        assertFalse(lease.valid());
    }
}
