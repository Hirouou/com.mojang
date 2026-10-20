package dev.dotbridge;

/** Pure camera-frustum calculation, independent of game state. */
final class VisibilityMath {
    private VisibilityMath() {}

    static boolean inView(double depth, double side, double up, double verticalFov, double aspect) {
        if (!Double.isFinite(depth) || !Double.isFinite(side) || !Double.isFinite(up)
                || !Double.isFinite(verticalFov) || !Double.isFinite(aspect)
                || depth <= 0 || aspect <= 0 || verticalFov <= 0 || verticalFov >= 180) return false;
        double verticalExtent = depth * Math.tan(Math.toRadians(verticalFov) * 0.5);
        return Math.abs(up) <= verticalExtent && Math.abs(side) <= verticalExtent * aspect;
    }
}
