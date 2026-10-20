package dev.dotbridge;

/** Tick-based camera motion; both angular speed and acceleration are bounded. */
public final class SmoothCamera {
    public record Rotation(float yaw, float pitch, float yawVelocity, float pitchVelocity) {}

    private final double maxSpeed;
    private final double maxAcceleration;
    private double yaw;
    private double pitch;
    private double yawVelocity;
    private double pitchVelocity;
    private boolean initialized;

    public SmoothCamera() {
        this(5.0f, 0.7f);
    }

    public SmoothCamera(float maxSpeed, float maxAcceleration) {
        if (!Float.isFinite(maxSpeed) || !Float.isFinite(maxAcceleration)
                || maxSpeed <= 0 || maxSpeed > 12 || maxAcceleration <= 0 || maxAcceleration > maxSpeed) {
            throw new IllegalArgumentException("Camera limits must be finite, positive and acceleration <= speed <= 12");
        }
        this.maxSpeed = maxSpeed;
        this.maxAcceleration = maxAcceleration;
    }

    public void reset(float yaw, float pitch) {
        finite(yaw, pitch);
        this.yaw = wrap(yaw);
        this.pitch = clamp(pitch, -90, 90);
        yawVelocity = 0;
        pitchVelocity = 0;
        initialized = true;
    }

    public Rotation step(float targetYaw, float targetPitch) {
        finite(targetYaw, targetPitch);
        if (!initialized) throw new IllegalStateException("Reset the camera before stepping it");
        double yawError = wrapped((double) targetYaw - yaw);
        double pitchError = clamp(targetPitch, -90, 90) - pitch;
        yawVelocity = nextVelocity(yawVelocity, yawError, -maxSpeed, maxSpeed);
        // Keep enough room to brake at a physical boundary even if the target moves.
        // Clamping the position after movement would create an unbounded deceleration.
        pitchVelocity = nextVelocity(pitchVelocity, pitchError,
                -stoppingSpeed(pitch + 90), stoppingSpeed(90 - pitch));
        yaw = wrapped(yaw + yawVelocity);
        pitch += pitchVelocity;
        return rotation();
    }

    public boolean settled(float targetYaw, float targetPitch, float tolerance) {
        finite(targetYaw, targetPitch);
        if (!Float.isFinite(tolerance) || tolerance < 0) throw new IllegalArgumentException("Tolerance must be finite and nonnegative");
        return initialized && Math.abs(wrapped((double) targetYaw - yaw)) <= tolerance
                && Math.abs(pitch - clamp(targetPitch, -90, 90)) <= tolerance
                && Math.abs(yawVelocity) < 0.25f && Math.abs(pitchVelocity) < 0.25f;
    }

    public Rotation rotation() {
        return new Rotation((float) yaw, (float) pitch, (float) yawVelocity, (float) pitchVelocity);
    }

    /** Minecraft yaw/pitch for a direction vector; independent of world or game classes. */
    public static float[] angles(double deltaX, double deltaY, double deltaZ) {
        if (!Double.isFinite(deltaX) || !Double.isFinite(deltaY) || !Double.isFinite(deltaZ)) {
            throw new IllegalArgumentException("Look direction must be finite");
        }
        float yaw = (float) Math.toDegrees(Math.atan2(-deltaX, deltaZ));
        float pitch = (float) -Math.toDegrees(Math.atan2(deltaY, Math.hypot(deltaX, deltaZ)));
        return new float[]{wrap(yaw), Math.max(-90, Math.min(90, pitch))};
    }

    /** Signed shortest angular distance from one yaw to another. */
    public static float difference(float from, float to) {
        finite(from, to);
        return (float) wrapped((double) to - from);
    }

    public static float wrap(float angle) {
        if (!Float.isFinite(angle)) throw new IllegalArgumentException("Camera angles must be finite");
        return (float) wrapped(angle);
    }

    private static double wrapped(double angle) {
        double result = angle % 360;
        if (result >= 180) result -= 360;
        if (result < -180) result += 360;
        return result;
    }

    private double nextVelocity(double current, double error, double minimum, double maximum) {
        // The proportional term softens arrival; the stopping cap also handles low acceleration.
        double targetSpeed = Math.min(Math.abs(error) * 0.24, stoppingSpeed(Math.abs(error)));
        double desired = Math.copySign(Math.min(maxSpeed, targetSpeed), error);
        double lower = Math.max(Math.max(-maxSpeed, current - maxAcceleration), minimum);
        double upper = Math.min(Math.min(maxSpeed, current + maxAcceleration), maximum);
        return clamp(desired, lower, upper);
    }

    /**
     * Largest next velocity whose discrete braking path fits in distance. If n
     * positive steps remain, distance = n*v - a*n*(n-1)/2. This includes this
     * tick's movement, so a future full-braking step always remains feasible.
     */
    private double stoppingSpeed(double distance) {
        if (distance <= 0) return 0;
        double steps = Math.max(1, Math.ceil((Math.sqrt(1 + 8 * distance / maxAcceleration) - 1) / 2));
        return distance / steps + maxAcceleration * (steps - 1) / 2;
    }

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static void finite(float yaw, float pitch) {
        if (!Float.isFinite(yaw) || !Float.isFinite(pitch)) throw new IllegalArgumentException("Camera angles must be finite");
    }
}
