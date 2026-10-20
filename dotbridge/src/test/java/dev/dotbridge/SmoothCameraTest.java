package dev.dotbridge;

import org.junit.jupiter.api.Test;

import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

class SmoothCameraTest {
    @Test
    void accelerationAndVelocityStayBoundedWhenTargetsChange() {
        SmoothCamera camera = new SmoothCamera(5, .7f);
        camera.reset(0, 0);
        SmoothCamera.Rotation previous = camera.rotation();
        for (int tick = 0; tick < 150; tick++) {
            float yaw = tick < 55 ? 120 : -80;
            float pitch = tick < 55 ? 35 : -35;
            SmoothCamera.Rotation next = camera.step(yaw, pitch);
            assertTrue(Math.abs(next.yawVelocity()) <= 5.0001);
            assertTrue(Math.abs(next.pitchVelocity()) <= 5.0001);
            assertTrue(Math.abs(next.yawVelocity() - previous.yawVelocity()) <= .7001);
            assertTrue(Math.abs(next.pitchVelocity() - previous.pitchVelocity()) <= .7001);
            previous = next;
        }
        assertTrue(camera.settled(-80, -35, .1f));
    }

    @Test
    void crossingNorthUsesShortestRotationWithoutAFullSpin() {
        SmoothCamera camera = new SmoothCamera();
        camera.reset(179, 0);
        float distance = 0;
        for (int tick = 0; tick < 50; tick++) {
            var next = camera.step(-179, 0);
            distance += Math.abs(next.yawVelocity());
        }
        assertTrue(distance < 3);
        assertTrue(camera.settled(-179, 0, .01f));
    }

    @Test
    void physicalPitchBoundsAreRespected() {
        SmoothCamera camera = new SmoothCamera();
        camera.reset(0, 80);
        for (int i = 0; i < 100; i++) assertTrue(camera.step(0, 100).pitch() <= 90);
        for (int i = 0; i < 150; i++) assertTrue(camera.step(0, -100).pitch() >= -90);
        assertTrue(camera.settled(0, -100, .01f));
    }

    @Test
    void boundaryReversalsNeverSnapOrExceedAcceleration() {
        SmoothCamera camera = new SmoothCamera(12, .3f);
        camera.reset(179, 89.5f);
        var previous = camera.rotation();
        for (int tick = 0; tick < 1600; tick++) {
            float targetPitch = tick % 73 < 37 ? 200 : -200;
            float targetYaw = tick % 53 < 29 ? -179 : 179;
            var next = camera.step(targetYaw, targetPitch);
            assertMotion(previous, next, 12, .3f);
            previous = next;
        }
    }

    @Test
    void deterministicMovingTargetsPreserveAllMotionBounds() {
        Random random = new Random(2147259);
        float[][] limits = {{5, .7f}, {12, .01f}, {.25f, .01f}, {1, 1}, {12, 12}};
        for (float[] limit : limits) {
            SmoothCamera camera = new SmoothCamera(limit[0], limit[1]);
            camera.reset(170, 89.99999f);
            var previous = camera.rotation();
            for (int tick = 0; tick < 5000; tick++) {
                float targetYaw = tick % 19 == 0 ? (tick % 2 == 0 ? Float.MAX_VALUE : -Float.MAX_VALUE)
                        : random.nextFloat() * 720 - 360;
                float targetPitch = tick % 7 == 0 ? (tick % 2 == 0 ? 1000 : -1000)
                        : random.nextFloat() * 180 - 90;
                var next = camera.step(targetYaw, targetPitch);
                assertMotion(previous, next, limit[0], limit[1]);
                previous = next;
            }
        }
    }

    @Test
    void stationaryTargetsConvergeWithoutOscillatingAcrossTheTarget() {
        for (float[] limit : new float[][]{{5, .7f}, {12, .01f}, {.25f, .01f}, {1, 1}}) {
            SmoothCamera camera = new SmoothCamera(limit[0], limit[1]);
            camera.reset(-100, -85);
            float priorYawError = SmoothCamera.difference(-100, 40);
            float priorPitchError = 175;
            for (int tick = 0; tick < 2000; tick++) {
                var result = camera.step(40, 90);
                float yawError = SmoothCamera.difference(result.yaw(), 40);
                float pitchError = 90 - result.pitch();
                assertTrue(yawError >= -.0001f && yawError <= priorYawError + .0001f);
                assertTrue(pitchError >= 0 && pitchError <= priorPitchError + .0001f);
                priorYawError = yawError;
                priorPitchError = pitchError;
            }
            assertTrue(camera.settled(40, 90, .001f));
        }
    }

    @Test
    void hugeFiniteYawDifferencesDoNotOverflow() {
        assertTrue(Float.isFinite(SmoothCamera.difference(-Float.MAX_VALUE, Float.MAX_VALUE)));
        assertTrue(Math.abs(SmoothCamera.difference(-Float.MAX_VALUE, Float.MAX_VALUE)) <= 180);
        SmoothCamera camera = new SmoothCamera();
        camera.reset(Float.MAX_VALUE, 0);
        var result = camera.step(-Float.MAX_VALUE, 0);
        assertTrue(Float.isFinite(result.yaw()));
        assertTrue(Math.abs(result.yawVelocity()) <= .7001f);
    }

    private static void assertMotion(SmoothCamera.Rotation previous, SmoothCamera.Rotation next,
                                     float speed, float acceleration) {
        assertTrue(next.pitch() >= -90 && next.pitch() <= 90, "physical pitch bound");
        assertTrue(Math.abs(next.yawVelocity()) <= speed + .0001f, "yaw speed");
        assertTrue(Math.abs(next.pitchVelocity()) <= speed + .0001f, "pitch speed");
        assertTrue(Math.abs(next.yawVelocity() - previous.yawVelocity()) <= acceleration + .0001f,
                "yaw acceleration");
        assertTrue(Math.abs(next.pitchVelocity() - previous.pitchVelocity()) <= acceleration + .0001f,
                "pitch acceleration");
        assertEquals(next.yawVelocity(), SmoothCamera.difference(previous.yaw(), next.yaw()), .0001f);
        assertEquals(next.pitchVelocity(), next.pitch() - previous.pitch(), .0001f);
    }

    @Test
    void invalidAnglesAndLimitsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> new SmoothCamera(Float.NaN, 1));
        assertThrows(IllegalArgumentException.class, () -> new SmoothCamera(1, 2));
        SmoothCamera camera = new SmoothCamera();
        assertThrows(IllegalStateException.class, () -> camera.step(0, 0));
        assertThrows(IllegalArgumentException.class, () -> camera.reset(Float.POSITIVE_INFINITY, 0));
        camera.reset(0, 0);
        assertThrows(IllegalArgumentException.class, () -> camera.step(0, Float.NaN));
        assertThrows(IllegalArgumentException.class, () -> SmoothCamera.wrap(Float.POSITIVE_INFINITY));
        assertThrows(IllegalArgumentException.class, () -> camera.settled(0, 0, -1));
    }
}
