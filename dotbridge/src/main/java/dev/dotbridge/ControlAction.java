package dev.dotbridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import java.util.Set;

/** A validated, bounded request. All Minecraft access happens after parsing. */
public record ControlAction(
        String type,
        float forward,
        float strafe,
        boolean jump,
        boolean sneak,
        boolean sprint,
        boolean attack,
        boolean use,
        int ticks,
        Float yaw,
        Float pitch,
        Integer slot,
        String cameraMode) {

    public static final int MAX_TICKS = 200;

    private static final Set<String> CONTROL_FIELDS = Set.of(
            "type", "forward", "strafe", "jump", "sneak", "sprint", "attack", "use", "ticks");

    /**
     * Parses the public action API without touching the game or accepting coercions.
     * Positive forward means forwards; positive strafe means left.
     */
    public static ControlAction parse(JsonObject body) {
        if (body == null) {
            throw invalid("Action must be a JSON object");
        }
        String type = requiredString(body, "type");
        return switch (type) {
            case "control" -> parseControl(body);
            case "attack", "use" -> {
                only(body, Set.of("type", "ticks"));
                int ticks = integer(body, "ticks", 1, MAX_TICKS, 1);
                yield new ControlAction(type, 0, 0, false, false, false,
                        type.equals("attack"), type.equals("use"), ticks, null, null, null, null);
            }
            case "look" -> {
                only(body, Set.of("type", "yaw", "pitch"));
                double rawYaw = requiredNumber(body, "yaw");
                float yaw = (float) (((rawYaw % 360.0) + 540.0) % 360.0 - 180.0);
                float pitch = (float) rangedNumber(body, "pitch", -90, 90);
                yield new ControlAction(type, 0, 0, false, false, false,
                        false, false, 0, yaw, pitch, null, null);
            }
            case "hotbar" -> {
                only(body, Set.of("type", "slot"));
                int slot = integer(body, "slot", 1, 9, null);
                yield new ControlAction(type, 0, 0, false, false, false,
                        false, false, 0, null, null, slot, null);
            }
            case "camera" -> {
                only(body, Set.of("type", "mode"));
                String mode = body.has("mode") ? requiredString(body, "mode") : "cycle";
                if (!Set.of("cycle", "first_person", "third_person_back", "third_person_front").contains(mode)) {
                    throw invalid("mode must be cycle, first_person, third_person_back, or third_person_front");
                }
                yield new ControlAction(type, 0, 0, false, false, false,
                        false, false, 0, null, null, null, mode);
            }
            case "stop" -> {
                only(body, Set.of("type"));
                yield new ControlAction(type, 0, 0, false, false, false,
                        false, false, 0, null, null, null, null);
            }
            default -> throw invalid("Unknown action type: " + type);
        };
    }

    public boolean timed() {
        return type.equals("control") || type.equals("attack") || type.equals("use");
    }

    private static ControlAction parseControl(JsonObject body) {
        only(body, CONTROL_FIELDS);
        float forward = optionalRangedNumber(body, "forward", -1, 1, 0);
        float strafe = optionalRangedNumber(body, "strafe", -1, 1, 0);
        boolean attack = bool(body, "attack", false);
        boolean use = bool(body, "use", false);
        if (attack && use) {
            throw invalid("attack and use cannot both be true");
        }
        return new ControlAction("control", forward, strafe,
                bool(body, "jump", false), bool(body, "sneak", false),
                bool(body, "sprint", false), attack, use,
                integer(body, "ticks", 1, MAX_TICKS, 1), null, null, null, null);
    }

    private static String requiredString(JsonObject body, String key) {
        JsonElement element = body.get(key);
        if (element == null || !element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
            throw invalid(key + " must be a string");
        }
        return element.getAsString();
    }

    private static boolean bool(JsonObject body, String key, boolean fallback) {
        if (!body.has(key)) {
            return fallback;
        }
        JsonElement element = body.get(key);
        if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isBoolean()) {
            throw invalid(key + " must be a boolean");
        }
        return element.getAsBoolean();
    }

    private static double requiredNumber(JsonObject body, String key) {
        JsonElement element = body.get(key);
        if (element == null || !element.isJsonPrimitive() || !element.getAsJsonPrimitive().isNumber()) {
            throw invalid(key + " must be a finite number");
        }
        double number;
        try {
            number = element.getAsDouble();
        } catch (NumberFormatException exception) {
            throw invalid(key + " must be a finite number");
        }
        if (!Double.isFinite(number)) {
            throw invalid(key + " must be a finite number");
        }
        return number;
    }

    private static double rangedNumber(JsonObject body, String key, double min, double max) {
        double number = requiredNumber(body, key);
        if (number < min || number > max) {
            throw invalid(key + " must be between " + min + " and " + max);
        }
        return number;
    }

    private static float optionalRangedNumber(JsonObject body, String key, double min, double max, float fallback) {
        return body.has(key) ? (float) rangedNumber(body, key, min, max) : fallback;
    }

    private static int integer(JsonObject body, String key, int min, int max, Integer fallback) {
        if (!body.has(key)) {
            if (fallback != null) {
                return fallback;
            }
            throw invalid(key + " is required");
        }
        JsonElement element = body.get(key);
        if (!element.isJsonPrimitive()) {
            throw invalid(key + " must be an integer");
        }
        JsonPrimitive primitive = element.getAsJsonPrimitive();
        if (!primitive.isNumber() || !primitive.getAsString().matches("-?(0|[1-9][0-9]*)")) {
            throw invalid(key + " must be an integer");
        }
        int value;
        try {
            value = Integer.parseInt(primitive.getAsString());
        } catch (NumberFormatException exception) {
            throw invalid(key + " must be between " + min + " and " + max);
        }
        if (value < min || value > max) {
            throw invalid(key + " must be between " + min + " and " + max);
        }
        return value;
    }

    private static void only(JsonObject body, Set<String> allowed) {
        for (String key : body.keySet()) {
            if (!allowed.contains(key)) {
                throw invalid("Unknown field: " + key);
            }
        }
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }
}
