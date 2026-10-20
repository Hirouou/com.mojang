package dev.dotbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.ArrayDeque;

/** Main-thread bounded event journal; readers explicitly learn when their cursor fell behind. */
final class EventBuffer {
    private final ArrayDeque<JsonObject> entries = new ArrayDeque<>();
    private long sequence;

    void add(String type, long tick, JsonObject details) {
        JsonObject event = new JsonObject();
        event.addProperty("sequence", ++sequence);
        event.addProperty("type", type);
        event.addProperty("tick", tick);
        event.addProperty("time_ms", System.currentTimeMillis());
        event.add("details", details.deepCopy());
        entries.addLast(event);
        if (entries.size() > 128) entries.removeFirst();
    }

    JsonObject since(long after) {
        JsonObject result = new JsonObject();
        result.addProperty("ok", true);
        long oldest = entries.isEmpty() ? sequence + 1 : entries.getFirst().get("sequence").getAsLong();
        result.addProperty("dropped", after < oldest - 1);
        JsonArray events = new JsonArray();
        long next = after;
        for (JsonObject entry : entries) {
            if (entry.get("sequence").getAsLong() <= after) continue;
            if (events.size() == 64) break;
            events.add(entry.deepCopy());
            next = entry.get("sequence").getAsLong();
        }
        result.add("events", events);
        result.addProperty("next_after", next);
        result.addProperty("latest_sequence", sequence);
        result.addProperty("has_more", next < sequence);
        return result;
    }
}
