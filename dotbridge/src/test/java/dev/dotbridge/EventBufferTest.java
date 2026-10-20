package dev.dotbridge;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class EventBufferTest {
    @Test void boundsMemoryPagesAndReportsDroppedEvents() {
        EventBuffer events = new EventBuffer();
        for (int i = 0; i < 150; i++) events.add("test", i, new JsonObject());
        JsonObject page = events.since(0);
        assertTrue(page.get("dropped").getAsBoolean());
        assertEquals(64, page.getAsJsonArray("events").size());
        assertEquals(86, page.get("next_after").getAsLong());
        assertTrue(page.get("has_more").getAsBoolean());
        JsonObject second = events.since(86);
        assertEquals(64, second.getAsJsonArray("events").size());
        assertFalse(second.get("has_more").getAsBoolean());
        assertFalse(second.get("dropped").getAsBoolean());
    }
    @Test void protectsPublishedValuesFromLaterMutation() {
        EventBuffer events = new EventBuffer();
        JsonObject input = new JsonObject();
        input.addProperty("value", 1);
        events.add("test", 0, input);
        input.addProperty("value", 2);
        JsonObject first = events.since(0);
        first.getAsJsonArray("events").get(0).getAsJsonObject().addProperty("type", "changed");
        assertEquals("test", events.since(0).getAsJsonArray("events").get(0).getAsJsonObject().get("type").getAsString());
        assertEquals(1, events.since(0).getAsJsonArray("events").get(0).getAsJsonObject().getAsJsonObject("details").get("value").getAsInt());
    }
}
