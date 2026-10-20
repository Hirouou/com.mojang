package dev.dotbridge;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class InventoryRecoveryTest {
    @Test void anImmediateGetDoesNotPermitDuplicatingAnUnconfirmedClick() {
        var gate = new InventoryRecovery(7, 7, 100, false);
        assertFalse(gate.canObserveRecovery(100));
        assertFalse(gate.canObserveRecovery(1000));
    }
    @Test void waitsForLateServerRevisionAndSettlingBeforeFreshObservation() {
        var gate = new InventoryRecovery(7, 7, 100, false);
        gate.update(8, true, 105);
        assertFalse(gate.canObserveRecovery(105));
        assertFalse(gate.canObserveRecovery(106));
        assertTrue(gate.canObserveRecovery(107));
    }
    @Test void aLaterCursorPacketRestartsTheQuietPeriod() {
        var gate = new InventoryRecovery(7, 7, 100, false);
        gate.update(8, true, 105);
        gate.update(8, true, 106);
        assertFalse(gate.canObserveRecovery(107));
        assertTrue(gate.canObserveRecovery(108));
    }
    @Test void localContentChangeWithoutServerRevisionCannotClearBarrier() {
        var gate = new InventoryRecovery(7, 7, 100, false);
        gate.update(7, true, 105);
        assertFalse(gate.canObserveRecovery(1000));
    }
    @Test void preservesAlreadyObservedServerRevisionWhenAnActionIsCancelled() {
        var gate = new InventoryRecovery(7, 8, 105, true);
        assertFalse(gate.canObserveRecovery(106));
        assertTrue(gate.canObserveRecovery(107));
    }
    @Test void supportsVanillaStateIdWraparound() {
        var gate = new InventoryRecovery(32767, 32767, 100, false);
        gate.update(0, true, 101);
        assertTrue(gate.canObserveRecovery(103));
    }
}
