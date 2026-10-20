package dev.dotbridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

class ControlActionTest {
    private static ControlAction parse(String json) {
        return ControlAction.parse(JsonParser.parseString(json).getAsJsonObject());
    }

    @Test
    void idleControlHasBoundedSafeDefaults() {
        ControlAction action = parse("{\"type\":\"control\"}");
        assertTrue(action.timed());
        assertEquals(1, action.ticks());
        assertEquals(0f, action.forward());
        assertEquals(0f, action.strafe());
        assertFalse(action.jump());
        assertFalse(action.sneak());
        assertFalse(action.sprint());
        assertFalse(action.attack());
        assertFalse(action.use());
        assertNull(action.yaw());
        assertNull(action.slot());
        assertNull(action.cameraMode());
    }

    @Test
    void controlKeepsAnalogAxesAndExplicitFlags() {
        ControlAction action = parse("""
                {"type":"control","forward":0.5,"strafe":-1,"jump":true,
                 "sneak":true,"sprint":false,"attack":true,"ticks":200}
                """);
        assertEquals(.5f, action.forward());
        assertEquals(-1f, action.strafe());
        assertTrue(action.jump());
        assertTrue(action.sneak());
        assertFalse(action.sprint());
        assertTrue(action.attack());
        assertFalse(action.use());
        assertEquals(200, action.ticks());
    }

    @Test
    void attackAndUseAreTimedSeparateActions() {
        ControlAction attack = parse("{\"type\":\"attack\",\"ticks\":10}");
        assertTrue(attack.attack());
        assertFalse(attack.use());
        assertTrue(attack.timed());
        assertEquals(10, attack.ticks());
        ControlAction use = parse("{\"type\":\"use\"}");
        assertTrue(use.use());
        assertFalse(use.attack());
        assertEquals(1, use.ticks());
    }

    @Test
    void lookNormalizesYawAndAllowsPitchBounds() {
        ControlAction action = parse("{\"type\":\"look\",\"yaw\":725.5,\"pitch\":-90}");
        assertEquals(5.5f, action.yaw());
        assertEquals(-90f, action.pitch());
        assertFalse(action.timed());
        assertEquals(-5.5f, parse("{\"type\":\"look\",\"yaw\":-725.5,\"pitch\":90}").yaw());
        assertTrue(Float.isFinite(parse("{\"type\":\"look\",\"yaw\":1e300,\"pitch\":0}").yaw()));
    }

    @Test
    void hotbarUsesHumanFacingOneBasedSlot() {
        assertEquals(1, parse("{\"type\":\"hotbar\",\"slot\":1}").slot());
        assertEquals(9, parse("{\"type\":\"hotbar\",\"slot\":9}").slot());
        assertFalse(parse("{\"type\":\"hotbar\",\"slot\":9}").timed());
        assertFalse(parse("{\"type\":\"stop\"}").timed());
    }

    @Test
    void cameraDefaultsToCycleWithoutMovementOrDuration() {
        ControlAction action = parse("{\"type\":\"camera\"}");
        assertEquals("cycle", action.cameraMode());
        assertEquals("camera", action.type());
        assertFalse(action.timed());
        assertEquals(0, action.ticks());
        assertEquals(0f, action.forward());
        assertEquals(0f, action.strafe());
        assertFalse(action.attack());
        assertFalse(action.use());
        assertNull(action.yaw());
        assertNull(action.slot());
    }

    @ParameterizedTest
    @ValueSource(strings = {"cycle", "first_person", "third_person_back", "third_person_front"})
    void cameraAcceptsEachExplicitMode(String mode) {
        ControlAction action = parse("{\"type\":\"camera\",\"mode\":\"" + mode + "\"}");
        assertEquals(mode, action.cameraMode());
        assertFalse(action.timed());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}",
            "{\"type\":null}",
            "{\"type\":true}",
            "{\"type\":\"shell\"}",
            "{\"type\":\"control\",\"typo\":true}",
            "{\"type\":\"control\",\"jump\":\"true\"}",
            "{\"type\":\"control\",\"jump\":1}",
            "{\"type\":\"control\",\"jump\":null}",
            "{\"type\":\"control\",\"forward\":true}",
            "{\"type\":\"control\",\"forward\":\"1\"}",
            "{\"type\":\"control\",\"forward\":1.01}",
            "{\"type\":\"control\",\"strafe\":-1.01}",
            "{\"type\":\"control\",\"forward\":null}",
            "{\"type\":\"control\",\"attack\":true,\"use\":true}",
            "{\"type\":\"control\",\"ticks\":0}",
            "{\"type\":\"control\",\"ticks\":201}",
            "{\"type\":\"control\",\"ticks\":1.5}",
            "{\"type\":\"control\",\"ticks\":1.0}",
            "{\"type\":\"control\",\"ticks\":1e1}",
            "{\"type\":\"control\",\"ticks\":\"10\"}",
            "{\"type\":\"control\",\"ticks\":99999999999999999999}",
            "{\"type\":\"control\",\"yaw\":1}",
            "{\"type\":\"attack\",\"attack\":true}",
            "{\"type\":\"use\",\"ticks\":null}",
            "{\"type\":\"look\",\"yaw\":0}",
            "{\"type\":\"look\",\"pitch\":0}",
            "{\"type\":\"look\",\"yaw\":0,\"pitch\":90.01}",
            "{\"type\":\"look\",\"yaw\":0,\"pitch\":-90.01}",
            "{\"type\":\"look\",\"yaw\":1e999,\"pitch\":0}",
            "{\"type\":\"look\",\"yaw\":\"NaN\",\"pitch\":0}",
            "{\"type\":\"look\",\"yaw\":0,\"pitch\":\"Infinity\"}",
            "{\"type\":\"look\",\"yaw\":0,\"pitch\":0,\"ticks\":1}",
            "{\"type\":\"hotbar\"}",
            "{\"type\":\"hotbar\",\"slot\":0}",
            "{\"type\":\"hotbar\",\"slot\":10}",
            "{\"type\":\"hotbar\",\"slot\":1.0}",
            "{\"type\":\"camera\",\"mode\":null}",
            "{\"type\":\"camera\",\"mode\":true}",
            "{\"type\":\"camera\",\"mode\":5}",
            "{\"type\":\"camera\",\"mode\":[]}",
            "{\"type\":\"camera\",\"mode\":\"\"}",
            "{\"type\":\"camera\",\"mode\":\"FIRST_PERSON\"}",
            "{\"type\":\"camera\",\"mode\":\"third_person\"}",
            "{\"type\":\"camera\",\"mode\":\"first_person\",\"ticks\":1}",
            "{\"type\":\"camera\",\"mode\":\"cycle\",\"yaw\":0}",
            "{\"type\":\"control\",\"mode\":\"cycle\"}",
            "{\"type\":\"stop\",\"ticks\":1}"
    })
    void rejectsInvalidRequestsBeforeScheduling(String json) {
        assertThrows(IllegalArgumentException.class, () -> parse(json));
    }

    @Test
    void rejectsNullAndNonFiniteProgrammaticNumbers() {
        assertThrows(IllegalArgumentException.class, () -> ControlAction.parse(null));
        for (double value : new double[]{Double.NaN, Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY}) {
            JsonObject body = new JsonObject();
            body.addProperty("type", "look");
            body.addProperty("yaw", value);
            body.addProperty("pitch", 0);
            assertThrows(IllegalArgumentException.class, () -> ControlAction.parse(body));
        }
    }
}
