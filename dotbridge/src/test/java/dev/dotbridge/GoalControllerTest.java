package dev.dotbridge;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** Pure aim geometry used by the goal controller; gameplay behavior has in-game tests. */
class GoalControllerTest {
    @Test
    void aimAnglesMatchMinecraftCardinalDirectionsAndVerticalPitch() {
        assertEquals(0, SmoothCamera.angles(0, 0, 1)[0], .001);
        assertEquals(-90, SmoothCamera.angles(1, 0, 0)[0], .001);
        assertEquals(90, SmoothCamera.angles(-1, 0, 0)[0], .001);
        assertEquals(-180, SmoothCamera.angles(0, 0, -1)[0], .001);
        assertEquals(-90, SmoothCamera.angles(0, 1, 0)[1], .001);
        assertEquals(90, SmoothCamera.angles(0, -1, 0)[1], .001);
        assertEquals(45, SmoothCamera.angles(0, -1, 1)[1], .001);
    }

    @Test
    void invalidAimVectorsCannotIntroduceNaNIntoTheCamera() {
        assertThrows(IllegalArgumentException.class, () -> SmoothCamera.angles(Double.NaN, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> SmoothCamera.angles(0, Double.POSITIVE_INFINITY, 0));
        assertTrue(Float.isFinite(SmoothCamera.angles(0, 0, 0)[0]));
        assertTrue(Float.isFinite(SmoothCamera.angles(0, 0, 0)[1]));
    }
}
