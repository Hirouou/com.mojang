package dev.dotbridge;

import com.mojang.logging.LogUtils;
import net.neoforged.fml.ModList;
import org.slf4j.Logger;

import java.lang.reflect.Method;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Optional Shoulder Surfing 5 public API integration, with no required mod dependency. */
final class ShoulderCompat {
    private static final Logger LOGGER = LogUtils.getLogger();
    private static final AtomicBoolean WARNED = new AtomicBoolean();
    private static boolean attempted;
    private static Access access;

    private ShoulderCompat() {}

    /** Whether the optional mod is installed, even if a future version changes its API. */
    static boolean loaded() {
        ModList mods = ModList.get();
        return mods != null && mods.isLoaded("shouldersurfing");
    }

    /**
     * Call on the client thread after setting the player's rotation. Shoulder Surfing
     * keeps a separate camera rotation that would otherwise overwrite the look command.
     */
    static void look(float yaw, float pitch) {
        Access api = access();
        if (api == null) return;
        try {
            Object camera = api.getCamera.invoke(api.instance);
            api.setXRot.invoke(camera, pitch);
            api.setYRot.invoke(camera, yaw);
        } catch (ReflectiveOperationException | LinkageError | RuntimeException error) {
            unavailable(error);
        }
    }

    /** Returns first_person, third_person_back, third_person_front, shoulder_surfing, or null. */
    static String perspective() {
        Access api = access();
        if (api == null) return null;
        try {
            Object perspective = api.currentPerspective.invoke(null);
            if (perspective instanceof Enum<?> value) {
                return value.name().toLowerCase(Locale.ROOT);
            }
            unavailable(new IllegalStateException("Perspective API did not return an enum"));
        } catch (ReflectiveOperationException | LinkageError | RuntimeException error) {
            unavailable(error);
        }
        return null;
    }

    /** Read on the client thread; inactive views use the ordinary player rotation. */
    static float[] rotation() {
        Access api = access();
        if (api == null) return null;
        try {
            if (!Boolean.TRUE.equals(api.isShoulderSurfing.invoke(api.instance))) return null;
            Object camera = api.getCamera.invoke(api.instance);
            float yaw = ((Number) api.getYRot.invoke(camera)).floatValue();
            float pitch = ((Number) api.getXRot.invoke(camera)).floatValue();
            return Float.isFinite(yaw) && Float.isFinite(pitch) ? new float[]{yaw, pitch} : null;
        } catch (ReflectiveOperationException | LinkageError | RuntimeException error) {
            unavailable(error);
            return null;
        }
    }

    private static synchronized Access access() {
        if (!loaded()) return null;
        if (!attempted) {
            attempted = true;
            try {
                ClassLoader loader = ShoulderCompat.class.getClassLoader();
                // Resolve methods on documented public interfaces, never implementation classes.
                Class<?> api = Class.forName(
                        "com.github.exopandora.shouldersurfing.api.client.IShoulderSurfing", false, loader);
                Class<?> camera = Class.forName(
                        "com.github.exopandora.shouldersurfing.api.client.IShoulderSurfingCamera", false, loader);
                Class<?> perspective = Class.forName(
                        "com.github.exopandora.shouldersurfing.api.client.Perspective", false, loader);
                Object instance = api.getMethod("getInstance").invoke(null);
                access = new Access(instance, api.getMethod("getCamera"), api.getMethod("isShoulderSurfing"),
                        camera.getMethod("setXRot", float.class), camera.getMethod("setYRot", float.class),
                        camera.getMethod("getXRot"), camera.getMethod("getYRot"),
                        perspective.getMethod("current"));
            } catch (ReflectiveOperationException | LinkageError | RuntimeException error) {
                unavailable(error);
            }
        }
        return access;
    }

    private static synchronized void unavailable(Throwable error) {
        attempted = true;
        access = null;
        if (WARNED.compareAndSet(false, true)) {
            LOGGER.warn("DotBridge: optional Shoulder Surfing camera integration unavailable ({})",
                    error.getClass().getSimpleName());
        }
    }

    private record Access(Object instance, Method getCamera, Method isShoulderSurfing, Method setXRot,
                          Method setYRot, Method getXRot, Method getYRot, Method currentPerspective) {}
}
