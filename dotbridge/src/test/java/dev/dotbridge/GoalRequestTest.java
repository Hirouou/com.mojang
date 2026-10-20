package dev.dotbridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

class GoalRequestTest {
    private static GoalRequest parse(String json) {
        return GoalRequest.parse(JsonParser.parseString(json).getAsJsonObject());
    }

    @Test
    void idleAndPresentationDefaultsAreBoundedWithoutInventingTargets() {
        for (String type : new String[]{"observe", "presentation", "greet"}) {
            GoalRequest goal = parse("{\"type\":\"" + type + "\"}");
            assertEquals(type, goal.type());
            assertEquals(100, goal.maxTicks());
            assertNull(goal.target());
            assertTrue(goal.steps().isEmpty());
            assertEquals(0f, goal.forward());
            assertFalse(goal.sprint());
        }
    }

    @Test
    void pointEntityAndBlockTargetsRemainUnambiguous() {
        GoalRequest look = parse("{\"type\":\"look_at\",\"target\":{\"x\":1.25,\"y\":65,\"z\":-3.5}}");
        assertTrue(look.target().point());
        assertFalse(look.target().entity());
        assertFalse(look.target().block());
        assertEquals(1.25, look.target().x());
        GoalRequest track = parse("{\"type\":\"track\",\"target\":{\"entity_id\":42}}");
        assertTrue(track.target().entity());
        assertFalse(track.target().point());
        assertEquals(42, track.target().entityId());
        assertNull(track.target().x());
        GoalRequest mine = parse("{\"type\":\"mine\",\"target\":{\"x\":1,\"y\":64,\"z\":-3}}");
        assertTrue(mine.target().block());
        assertEquals(64.0, mine.target().y());
    }

    @ParameterizedTest
    @ValueSource(strings = {"observe", "presentation", "look_at", "interact"})
    void visualGoalsAcceptEitherExplicitTargetKind(String type) {
        GoalRequest point = parse("{\"type\":\"" + type + "\",\"target\":{\"x\":0,\"y\":64,\"z\":0}}");
        GoalRequest entity = parse("{\"type\":\"" + type + "\",\"target\":{\"entity_id\":0}}");
        assertTrue(point.target().point());
        assertTrue(entity.target().entity());
    }

    @Test
    void combatHasExplicitEntityAndMoveHasBoundedAnalogControls() {
        GoalRequest combat = parse("{\"type\":\"combat\",\"max_ticks\":1200,\"target\":{\"entity_id\":2147483647}}");
        assertEquals(1200, combat.maxTicks());
        assertEquals(Integer.MAX_VALUE, combat.target().entityId());
        GoalRequest move = parse("{\"type\":\"move\",\"forward\":0.5,\"strafe\":-1,\"sprint\":true}");
        assertEquals(.5f, move.forward());
        assertEquals(-1f, move.strafe());
        assertTrue(move.sprint());
        assertEquals(1f, parse("{\"type\":\"move\"}").forward());
    }

    @Test
    void sequenceIsBoundedAndImmutable() {
        GoalRequest sequence = parse("""
                {"type":"sequence","max_ticks":300,"steps":[
                  {"type":"observe","max_ticks":20},
                  {"type":"look_at","target":{"x":1,"y":65,"z":2}},
                  {"type":"move","max_ticks":5,"forward":-1}
                ]}
                """);
        assertEquals(3, sequence.steps().size());
        assertEquals(300, sequence.maxTicks());
        assertEquals(20, sequence.steps().getFirst().maxTicks());
        assertThrows(UnsupportedOperationException.class, () -> sequence.steps().clear());
        assertEquals(8, parse("{\"type\":\"sequence\",\"steps\":[" +
                "{\"type\":\"observe\"},".repeat(7) + "{\"type\":\"greet\"}]}").steps().size());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}", "{\"type\":null}", "{\"type\":true}", "{\"type\":\"wander_forever\"}",
            "{\"type\":\"observe\",\"unknown\":1}",
            "{\"type\":\"observe\",\"max_ticks\":0}",
            "{\"type\":\"observe\",\"max_ticks\":1201}",
            "{\"type\":\"observe\",\"max_ticks\":1.0}",
            "{\"type\":\"observe\",\"max_ticks\":1e1}",
            "{\"type\":\"observe\",\"max_ticks\":true}",
            "{\"type\":\"observe\",\"max_ticks\":\"10\"}",
            "{\"type\":\"observe\",\"max_ticks\":999999999999999}",
            "{\"type\":\"observe\",\"target\":null}",
            "{\"type\":\"look_at\"}",
            "{\"type\":\"interact\",\"target\":[]}",
            "{\"type\":\"track\",\"target\":{\"x\":0,\"y\":0,\"z\":0}}",
            "{\"type\":\"combat\",\"target\":{\"x\":0,\"y\":0,\"z\":0}}",
            "{\"type\":\"mine\",\"target\":{\"entity_id\":42}}",
            "{\"type\":\"mine\",\"target\":{\"x\":1.5,\"y\":64,\"z\":0}}",
            "{\"type\":\"mine\",\"target\":{\"x\":0,\"y\":64,\"z\":0,\"block\":false}}",
            "{\"type\":\"look_at\",\"target\":{\"entity_id\":1,\"x\":0,\"y\":0,\"z\":0}}",
            "{\"type\":\"track\",\"target\":{\"entity_id\":-1}}",
            "{\"type\":\"track\",\"target\":{\"entity_id\":1.5}}",
            "{\"type\":\"track\",\"target\":{\"entity_id\":\"1\"}}",
            "{\"type\":\"track\",\"target\":{\"entity_id\":1,\"block\":false}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":0,\"y\":64}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":30000001,\"y\":0,\"z\":0}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":0,\"y\":2049,\"z\":0}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":0,\"y\":0,\"z\":-30000001}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":\"0\",\"y\":0,\"z\":0}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":1e999,\"y\":0,\"z\":0}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":0,\"y\":0,\"z\":0,\"block\":\"true\"}}",
            "{\"type\":\"look_at\",\"target\":{\"x\":0.5,\"y\":0,\"z\":0,\"block\":true}}",
            "{\"type\":\"move\",\"forward\":1.1}",
            "{\"type\":\"move\",\"strafe\":-1.1}",
            "{\"type\":\"move\",\"sprint\":\"true\"}",
            "{\"type\":\"move\",\"target\":{\"entity_id\":1}}",
            "{\"type\":\"greet\",\"target\":{\"entity_id\":1}}",
            "{\"type\":\"sequence\",\"steps\":[]}",
            "{\"type\":\"sequence\",\"steps\":{}}",
            "{\"type\":\"sequence\",\"steps\":[null]}",
            "{\"type\":\"sequence\",\"steps\":[{\"type\":\"sequence\",\"steps\":[{\"type\":\"observe\"}]}]}"
    })
    void rejectsInvalidTargetsDurationsTypesAndSequences(String json) {
        assertThrows(IllegalArgumentException.class, () -> parse(json));
    }

    @Test
    void rejectsExcessiveSequenceAndNonFiniteProgrammaticCoordinates() {
        assertThrows(IllegalArgumentException.class, () -> GoalRequest.parse(null));
        assertThrows(IllegalArgumentException.class, () -> parse("{\"type\":\"sequence\",\"steps\":[" +
                "{\"type\":\"observe\"},".repeat(8) + "{\"type\":\"greet\"}]}"));
        for (double number : new double[]{Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            JsonObject body = new JsonObject();
            body.addProperty("type", "look_at");
            JsonObject target = new JsonObject();
            target.addProperty("x", number);
            target.addProperty("y", 64);
            target.addProperty("z", 0);
            body.add("target", target);
            assertThrows(IllegalArgumentException.class, () -> GoalRequest.parse(body));
        }
    }
}
