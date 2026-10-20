package dev.dotbridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class InventoryCommandTest {
    private static JsonObject click() {
        return JsonParser.parseString("""
                {"type":"inventory","operation":"click","container_id":0,"state_id":7,
                 "slot":9,"button":0,"click_type":"pickup","expected_item":"minecraft:oak_log",
                 "expected_count":4,"expected_cursor_item":"minecraft:air","expected_cursor_count":0}
                """).getAsJsonObject();
    }

    @Test void acceptsGuardedSlotClick() {
        InventoryCommand action = InventoryCommand.parse(click());
        assertEquals(9, action.slot());
        assertEquals(7, action.stateId());
        assertEquals(80, action.timeoutTicks());
    }
    @Test void requiresRealMenuStateAndCursorObservation() {
        for (String key : new String[]{"container_id", "state_id", "slot", "expected_item", "expected_count", "expected_cursor_item", "expected_cursor_count"}) {
            JsonObject body = click(); body.remove(key);
            assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body), key);
        }
    }
    @Test void rejectsCoordinatesDropCloneAndDrag() {
        JsonObject body = click(); body.addProperty("x", 24);
        assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
        for (String operation : new String[]{"throw", "clone", "quick_craft", "pickup_all"}) {
            JsonObject other = click(); other.addProperty("click_type", operation);
            assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(other));
        }
    }
    @Test void rejectsOutsideSlotDropAndUnknownSlot() {
        for (int slot : new int[]{-999, -1, 256}) {
            JsonObject body = click(); body.addProperty("slot", slot);
            assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
        }
    }
    @Test void rejectsIntegerCoercions() {
        for (String value : new String[]{"\"1\"", "true", "1.0", "1e0", "null"}) {
            JsonObject body = click(); body.add("state_id", JsonParser.parseString(value));
            assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
        }
    }
    @Test void requiresConsistentEmptyStack() {
        JsonObject body = click(); body.addProperty("expected_count", 0);
        assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
        JsonObject cursorBody = click(); cursorBody.addProperty("expected_cursor_count", 1);
        assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(cursorBody));
    }
    @Test void boundsStateButtonAndTimeout() {
        for (String key : new String[]{"state_id", "button", "timeout_ticks"}) {
            JsonObject body = click(); body.addProperty(key, 40000);
            assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
        }
    }
    @Test void hotbarSwapRequiresItsOwnObservedStack() {
        JsonObject body = click(); body.addProperty("click_type", "swap"); body.addProperty("button", 8);
        assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
        body.addProperty("expected_hotbar_item", "minecraft:air"); body.addProperty("expected_hotbar_count", 0);
        assertEquals(8, InventoryCommand.parse(body).button());
    }
    @Test void openAndCloseRejectClickFields() {
        for (String operation : new String[]{"open", "close"}) {
            JsonObject body = new JsonObject(); body.addProperty("type", "inventory"); body.addProperty("operation", operation);
            assertEquals(operation, InventoryCommand.parse(body).operation());
            body.addProperty("slot", 1);
            assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
        }
    }
    @Test void confirmationNeedsServerRevisionAndEffectAndQuietTicks() {
        assertFalse(InventoryCommand.settled(12, 10, false, true, 2));
        assertFalse(InventoryCommand.settled(12, 10, true, false, 2));
        assertFalse(InventoryCommand.settled(11, 10, true, true, 2));
        assertTrue(InventoryCommand.settled(12, 10, true, true, 2));
    }
    @Test void rejectsUnknownItemSyntax() {
        JsonObject body = click(); body.addProperty("expected_item", "Oak Log");
        assertThrows(IllegalArgumentException.class, () -> InventoryCommand.parse(body));
    }
}
