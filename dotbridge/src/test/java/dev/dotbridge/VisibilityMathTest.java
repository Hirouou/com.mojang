package dev.dotbridge;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VisibilityMathTest {
    @Test
    void behindAndCameraPlaneAreNeverVisible() {
        assertFalse(VisibilityMath.inView(-1, 0, 0, 70, 16.0 / 9));
        assertFalse(VisibilityMath.inView(0, 0, 0, 70, 16.0 / 9));
    }

    @Test
    void centerIsVisibleAndVerticalBoundaryIsRespected() {
        assertTrue(VisibilityMath.inView(5, 0, 0, 90, 1));
        assertTrue(VisibilityMath.inView(5, 0, 4.99, 90, 1));
        assertFalse(VisibilityMath.inView(5, 0, 5.01, 90, 1));
    }

    @Test
    void horizontalFovUsesActualAspectRatio() {
        assertFalse(VisibilityMath.inView(5, 6, 0, 90, 1));
        assertTrue(VisibilityMath.inView(5, 6, 0, 90, 16.0 / 9));
        assertFalse(VisibilityMath.inView(5, 9, 0, 90, 16.0 / 9));
    }

    @Test
    void narrowFovDoesNotRevealOffscreenSurfaces() {
        assertFalse(VisibilityMath.inView(2, 1, 0, 30, 1));
        assertTrue(VisibilityMath.inView(2, 0.5, 0, 30, 1));
    }

    @Test
    void invalidInputsNeverPassVisibility() {
        assertFalse(VisibilityMath.inView(Double.NaN, 0, 0, 70, 1));
        assertFalse(VisibilityMath.inView(1, Double.POSITIVE_INFINITY, 0, 70, 1));
        assertFalse(VisibilityMath.inView(1, 0, 0, 180, 1));
        assertFalse(VisibilityMath.inView(1, 0, 0, 70, 0));
    }
}
