package dev.dotbridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.Set;

/** Validates the slot API without Minecraft state, screen coordinates or coercions. */
public record InventoryCommand(String operation, int containerId, int stateId, int slot,
                               int button, String clickType, String expectedItem, int expectedCount,
                               String expectedCursorItem, int expectedCursorCount,
                               String expectedHotbarItem, int expectedHotbarCount,
                               Integer expectedComponents, Integer expectedCursorComponents,
                               int timeoutTicks) {
    private static final Set<String> CLICK_FIELDS = Set.of("type", "operation", "container_id", "state_id",
            "slot", "button", "click_type", "expected_item", "expected_count", "expected_cursor_item",
            "expected_cursor_count", "expected_hotbar_item", "expected_hotbar_count",
            "expected_components_hash", "expected_cursor_components_hash", "timeout_ticks");

    public static InventoryCommand parse(JsonObject body) {
        if (body == null || !string(body, "type").equals("inventory"))
            throw new IllegalArgumentException("type must be inventory");
        String operation = string(body, "operation");
        if (!Set.of("open", "close", "click").contains(operation))
            throw new IllegalArgumentException("operation must be open, close or click");
        if (!operation.equals("click")) {
            only(body, Set.of("type", "operation"));
            return new InventoryCommand(operation, -1, -1, -1, 0, "", "minecraft:air", 0,
                    "minecraft:air", 0, "minecraft:air", 0, null, null, 20);
        }
        only(body, CLICK_FIELDS);
        String click = string(body, "click_type");
        if (!Set.of("pickup", "quick_move", "swap").contains(click))
            throw new IllegalArgumentException("click_type must be pickup, quick_move or swap");
        String item = item(body, "expected_item");
        int count = integer(body, "expected_count", 0, 1_000_000);
        String cursor = item(body, "expected_cursor_item");
        int cursorCount = integer(body, "expected_cursor_count", 0, 1_000_000);
        consistent(item, count, "expected slot");
        consistent(cursor, cursorCount, "expected cursor");
        String hotbar = "minecraft:air";
        int hotbarCount = 0;
        if (click.equals("swap")) {
            hotbar = item(body, "expected_hotbar_item");
            hotbarCount = integer(body, "expected_hotbar_count", 0, 1_000_000);
            consistent(hotbar, hotbarCount, "expected hotbar");
        } else if (body.has("expected_hotbar_item") || body.has("expected_hotbar_count")) {
            throw new IllegalArgumentException("Hotbar expectations are only valid for swap");
        }
        return new InventoryCommand(operation, integer(body, "container_id", 0, 255),
                integer(body, "state_id", 0, 32767), integer(body, "slot", 0, 255),
                integer(body, "button", 0, click.equals("swap") ? 8 : 1), click, item, count,
                cursor, cursorCount, hotbar, hotbarCount,
                body.has("expected_components_hash") ? integer(body, "expected_components_hash", Integer.MIN_VALUE, Integer.MAX_VALUE) : null,
                body.has("expected_cursor_components_hash") ? integer(body, "expected_cursor_components_hash", Integer.MIN_VALUE, Integer.MAX_VALUE) : null,
                body.has("timeout_ticks") ? integer(body, "timeout_ticks", 20, 200) : 80);
    }

    static boolean settled(long tick, long lastChange, boolean serverRevision, boolean changed, int stableTicks) {
        return serverRevision && changed && tick - lastChange >= stableTicks;
    }

    private static void consistent(String item, int count, String label) {
        if (item.equals("minecraft:air") != (count == 0))
            throw new IllegalArgumentException(label + " must use minecraft:air with count 0 for an empty stack");
    }

    private static String item(JsonObject body, String key) {
        String value = string(body, key);
        if (value.length() > 256 || !value.matches("[a-z0-9_.-]+:[a-z0-9/._-]+"))
            throw new IllegalArgumentException(key + " must be a namespaced item ID");
        return value;
    }

    private static String string(JsonObject body, String key) {
        JsonElement value = body.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
            throw new IllegalArgumentException(key + " must be a string");
        return value.getAsString();
    }

    private static int integer(JsonObject body, String key, int min, int max) {
        JsonElement value = body.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()
                || !value.getAsString().matches("-?(0|[1-9][0-9]*)"))
            throw new IllegalArgumentException(key + " must be an integer");
        try {
            int result = Integer.parseInt(value.getAsString());
            if (result < min || result > max) throw new NumberFormatException();
            return result;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(key + " must be between " + min + " and " + max);
        }
    }

    private static void only(JsonObject body, Set<String> allowed) {
        for (String key : body.keySet()) if (!allowed.contains(key))
            throw new IllegalArgumentException("Unknown inventory field: " + key);
    }
}
