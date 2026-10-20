package dev.dotbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Strict, bounded local objectives. Parsing never reads or modifies Minecraft. */
public record GoalRequest(String type, int maxTicks, Target target, float forward,
                          float strafe, boolean sprint, List<GoalRequest> steps) {
    public static final int MAX_TICKS = 1200;
    public static final int MAX_STEPS = 8;

    public GoalRequest {
        steps = List.copyOf(steps);
    }

    /** Entity IDs are mutually exclusive with world coordinates. Block positions use their origin. */
    public record Target(Double x, Double y, Double z, Integer entityId, boolean block) {
        public boolean entity() { return entityId != null; }
        public boolean point() { return entityId == null; }
    }

    public static GoalRequest parse(JsonObject body) {
        return parse(body, false);
    }

    private static GoalRequest parse(JsonObject body, boolean insideSequence) {
        if (body == null) throw invalid("Goal must be a JSON object");
        String type = string(body, "type");
        int maxTicks = integer(body, "max_ticks", 1, MAX_TICKS, 100);
        return switch (type) {
            case "observe", "presentation" -> {
                only(body, Set.of("type", "max_ticks", "target"));
                Target target = body.has("target") ? target(body, false) : null;
                yield goal(type, maxTicks, target);
            }
            case "look_at", "interact" -> {
                only(body, Set.of("type", "max_ticks", "target"));
                yield goal(type, maxTicks, target(body, false));
            }
            case "track", "combat" -> {
                only(body, Set.of("type", "max_ticks", "target"));
                Target target = target(body, false);
                if (!target.entity()) throw invalid(type + " requires an entity_id target");
                yield goal(type, maxTicks, target);
            }
            case "mine" -> {
                only(body, Set.of("type", "max_ticks", "target"));
                yield goal(type, maxTicks, target(body, true));
            }
            case "move" -> {
                only(body, Set.of("type", "max_ticks", "forward", "strafe", "sprint"));
                float forward = body.has("forward") ? (float) ranged(body, "forward", -1, 1) : 1;
                float strafe = body.has("strafe") ? (float) ranged(body, "strafe", -1, 1) : 0;
                boolean sprint = bool(body, "sprint", false);
                yield new GoalRequest(type, maxTicks, null, forward, strafe, sprint, List.of());
            }
            case "greet" -> {
                only(body, Set.of("type", "max_ticks"));
                yield goal(type, maxTicks, null);
            }
            case "sequence" -> {
                only(body, Set.of("type", "max_ticks", "steps"));
                if (insideSequence) throw invalid("Nested goal sequences are not allowed");
                JsonElement element = body.get("steps");
                if (element == null || !element.isJsonArray()) throw invalid("steps must be an array");
                JsonArray array = element.getAsJsonArray();
                if (array.isEmpty() || array.size() > MAX_STEPS) throw invalid("steps must contain 1..8 goals");
                List<GoalRequest> steps = new ArrayList<>(array.size());
                for (JsonElement step : array) {
                    if (!step.isJsonObject()) throw invalid("Every sequence step must be a goal object");
                    steps.add(parse(step.getAsJsonObject(), true));
                }
                yield new GoalRequest(type, maxTicks, null, 0, 0, false, steps);
            }
            default -> throw invalid("Unknown goal type: " + type);
        };
    }

    private static GoalRequest goal(String type, int maxTicks, Target target) {
        return new GoalRequest(type, maxTicks, target, 0, 0, false, List.of());
    }

    private static Target target(JsonObject body, boolean mining) {
        JsonElement element = body.get("target");
        if (element == null || !element.isJsonObject()) throw invalid("target must be an object");
        JsonObject target = element.getAsJsonObject();
        if (target.has("entity_id")) {
            only(target, Set.of("entity_id"));
            if (mining) throw invalid("mine requires block coordinates, not an entity_id");
            int id = integer(target, "entity_id", 0, Integer.MAX_VALUE, null);
            return new Target(null, null, null, id, false);
        }
        only(target, Set.of("x", "y", "z", "block"));
        double x = ranged(target, "x", -30_000_000, 30_000_000);
        double y = ranged(target, "y", -2048, 2048);
        double z = ranged(target, "z", -30_000_000, 30_000_000);
        boolean block = bool(target, "block", mining);
        if (mining && !block) throw invalid("mine requires a block target");
        if (block && (x != Math.rint(x) || y != Math.rint(y) || z != Math.rint(z))) {
            throw invalid("Block target coordinates must be integers");
        }
        return new Target(x, y, z, null, block);
    }

    private static String string(JsonObject body, String key) {
        JsonElement element = body.get(key);
        if (element == null || !element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
            throw invalid(key + " must be a string");
        }
        return element.getAsString();
    }

    private static boolean bool(JsonObject body, String key, boolean fallback) {
        if (!body.has(key)) return fallback;
        JsonElement element = body.get(key);
        if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isBoolean()) {
            throw invalid(key + " must be a boolean");
        }
        return element.getAsBoolean();
    }

    private static double ranged(JsonObject body, String key, double minimum, double maximum) {
        JsonElement element = body.get(key);
        if (element == null || !element.isJsonPrimitive() || !element.getAsJsonPrimitive().isNumber()) {
            throw invalid(key + " must be a finite number");
        }
        double value;
        try {
            value = element.getAsDouble();
        } catch (NumberFormatException error) {
            throw invalid(key + " must be a finite number");
        }
        if (!Double.isFinite(value) || value < minimum || value > maximum) {
            throw invalid(key + " must be a finite number between " + minimum + " and " + maximum);
        }
        return value;
    }

    private static int integer(JsonObject body, String key, int minimum, int maximum, Integer fallback) {
        if (!body.has(key)) {
            if (fallback != null) return fallback;
            throw invalid(key + " is required");
        }
        JsonElement element = body.get(key);
        if (!element.isJsonPrimitive()) throw invalid(key + " must be an integer");
        JsonPrimitive primitive = element.getAsJsonPrimitive();
        if (!primitive.isNumber() || !primitive.getAsString().matches("-?(0|[1-9][0-9]*)")) {
            throw invalid(key + " must be an integer");
        }
        try {
            int value = Integer.parseInt(primitive.getAsString());
            if (value >= minimum && value <= maximum) return value;
        } catch (NumberFormatException ignored) {
            // Report the bounded field without echoing arbitrary input data.
        }
        throw invalid(key + " must be between " + minimum + " and " + maximum);
    }

    private static void only(JsonObject body, Set<String> allowed) {
        for (String key : body.keySet()) {
            if (!allowed.contains(key)) throw invalid("Unknown goal field: " + key);
        }
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }
}
