package dev.dotbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Finite, explicitly authorized local objectives. All methods run on the client thread. */
public final class GoalController {
    public interface Host {
        void control(ControlAction oneTickInputs);
        void release();
        void look(float yaw, float pitch);
        void camera(String perspective);
        void event(String type, JsonObject details);
        void complete(String id, String goalType, String status, String reason, JsonObject details);
    }

    private final Host host;
    private final SmoothCamera camera = new SmoothCamera();
    private Run run;
    private JsonObject last = idle();

    public GoalController(Host host) {
        this.host = java.util.Objects.requireNonNull(host);
    }

    public boolean active() { return run != null; }

    public void start(String id, GoalRequest request, Minecraft mc, long tick) {
        if (run != null) finish("cancelled", "replaced_by_goal", mc);
        release(mc);
        run = new Run(id, request, tick);
        run.step = request.type().equals("sequence") ? request.steps().getFirst() : request;
        float[] view = view(mc);
        camera.reset(view[0], view[1]);
        run.phase = "accepted";
    }

    public void cancel(String reason, Minecraft mc) {
        if (run != null) finish("cancelled", reason, mc);
        else host.release();
    }

    public JsonObject status() {
        if (run == null) return last.deepCopy();
        JsonObject result = new JsonObject();
        result.addProperty("id", run.id);
        result.addProperty("type", run.request.type());
        result.addProperty("status", run.started ? "executing" : "accepted");
        result.addProperty("state", stateName(run.step.type()));
        result.addProperty("local_state", stateName(run.step.type()));
        result.addProperty("phase", run.phase);
        result.addProperty("accepted_tick", run.acceptedTick);
        if (run.started) {
            result.addProperty("started_tick", run.startedTick);
            result.addProperty("start_delay_ms", (run.startedNanos - run.acceptedNanos) / 1_000_000.0);
        } else {
            result.add("started_tick", JsonNull.INSTANCE);
            result.add("start_delay_ms", JsonNull.INSTANCE);
        }
        result.addProperty("elapsed_ticks", run.elapsed);
        result.addProperty("max_ticks", run.request.maxTicks());
        result.addProperty("step", run.index);
        result.addProperty("step_type", run.step.type());
        result.addProperty("step_elapsed_ticks", run.stepElapsed);
        result.add("details", run.details.deepCopy());
        return result;
    }

    /** Called once in ClientTickEvent.Pre after lease/menu/manual-input gating. */
    public void tick(Minecraft mc, long tick) {
        if (run == null) return;
        if (mc.player == null || mc.level == null || mc.gameMode == null || mc.player.isDeadOrDying()
                || mc.isPaused() || mc.screen != null || mc.getOverlay() != null) {
            finish("cancelled", "game_not_controllable", mc);
            return;
        }
        run.lastTick = tick;
        if (!run.started) {
            run.started = true;
            run.startedTick = tick;
            run.startedNanos = System.nanoTime();
            beginStep(mc);
            if (run == null) return;
            host.event("action_started", status());
            event("goal_started", "executing");
        }
        if (tick - run.startedTick >= run.request.maxTicks()) {
            expire(mc, true);
            return;
        }
        if (run.stepElapsed >= run.step.maxTicks()) {
            expire(mc, false);
            return;
        }
        Run current = run;
        int stepIndex = run.index;
        switch (current.step.type()) {
            case "observe" -> observe(mc);
            case "look_at" -> lookAt(mc);
            case "track" -> track(mc);
            case "move" -> move(mc);
            case "mine" -> mine(mc);
            case "interact" -> interact(mc);
            case "combat" -> combat(mc);
            case "greet", "presentation" -> present(mc);
            default -> finish("failed", "unsupported_goal", mc);
        }
        if (run == current) {
            run.elapsed++;
            if (run.index == stepIndex) run.stepElapsed++;
        }
    }

    private void beginStep(Minecraft mc) {
        if (run == null) return;
        run.step = run.request.type().equals("sequence") ? run.request.steps().get(run.index) : run.request;
        run.stepElapsed = 0;
        run.phase = "starting";
        run.details = new JsonObject();
        run.poi = null;
        run.poiPause = 0;
        run.nextPoiScan = 0;
        run.lastPosition = mc.player == null ? null : mc.player.position();
        run.stillTicks = 0;
        run.block = null;
        run.originalBlock = null;
        run.inventoryBefore = Map.of();
        run.previousCamera = null;
        run.pulsed = false;
        run.breakElapsed = -1;
        run.predictedChangeAtMs = -1;
        run.lastStrike = -20;
        float[] view = view(mc);
        camera.reset(view[0], view[1]);
        run.baseYaw = view[0];
        run.basePitch = view[1];
        event("goal_step_started", run.step.type());
        if (mc.player == null || mc.level == null || mc.gameMode == null) {
            finish("failed", "no_world", mc);
            return;
        }
        switch (run.step.type()) {
            case "mine" -> {
                run.block = targetBlock(run.step.target());
                if (VisibleWorld.visibleBlock(mc, run.block, mc.player.blockInteractionRange()) == null) {
                    finish("failed", "block_not_visible_or_out_of_reach", mc);
                    return;
                }
                run.originalBlock = mc.level.getBlockState(run.block);
                if (run.originalBlock.isAir()) {
                    finish("failed", "target_already_air", mc);
                    return;
                }
                run.inventoryBefore = inventory(mc.player);
                BlockConfirmation.watch(run.block);
                run.details.add("block", block(run.block));
                run.details.addProperty("initial_block", BuiltInRegistries.BLOCK.getKey(run.originalBlock.getBlock()).toString());
                run.details.addProperty("broke", false);
                run.details.addProperty("collected", false);
                run.details.addProperty("collection_causal_proof", false);
                run.details.addProperty("server_confirmed", false);
                run.phase = "aiming";
            }
            case "greet", "presentation" -> {
                String risk = VisibleWorld.presentationRisk(mc);
                if (risk != null) {
                    finish("failed", "unsafe_presentation: " + risk, mc);
                    return;
                }
                run.previousCamera = ShoulderCompat.perspective();
                if (run.previousCamera == null) run.previousCamera = mc.options.getCameraType().name().toLowerCase(Locale.ROOT);
                host.camera("third_person_front");
                run.phase = "presenting";
                run.details.addProperty("camera", "third_person_front");
            }
            default -> run.phase = stateName(run.step.type());
        }
    }

    private void observe(Minecraft mc) {
        host.control(inputs(0, 0, false, false, false, false));
        if (run.step.target() != null) {
            Vec3 point = targetPoint(mc, run.step.target(), true);
            if (point != null) aim(mc, point);
            return;
        }
        if (run.poiPause > 0) {
            run.poiPause--;
            dampCamera();
            return;
        }
        if (run.poi == null && run.stepElapsed >= run.nextPoiScan) {
            run.poi = choosePoi(mc);
            run.nextPoiScan = run.stepElapsed + 20;
        }
        if (run.poi == null) {
            run.phase = "observing_no_visible_interest";
            dampCamera();
            return;
        }
        Vec3 point = poiPoint(mc, run.poi);
        if (point == null) {
            run.poi = null;
            dampCamera();
            return;
        }
        float[] angles = angles(mc.player.getEyePosition(), point);
        aim(mc, point);
        run.phase = "observing_visible_interest";
        if (camera.settled(angles[0], angles[1], 1.0f)) {
            run.poiPause = 6 + run.poiCounter % 5;
            run.poi = null;
            run.nextPoiScan = run.stepElapsed + run.poiPause;
        }
    }

    private void lookAt(Minecraft mc) {
        host.control(inputs(0, 0, false, false, false, false));
        Vec3 point = targetPoint(mc, run.step.target(), true);
        if (point == null || run == null) return;
        float[] angles = angles(mc.player.getEyePosition(), point);
        aim(mc, point);
        if (camera.settled(angles[0], angles[1], 1.0f)) stepDone("look_settled", mc);
    }

    private void track(Minecraft mc) {
        host.control(inputs(0, 0, false, false, false, false));
        Entity target = entityTarget(mc, false);
        if (target != null) {
            aim(mc, target.getBoundingBox().getCenter());
            run.phase = "tracking_visible_entity";
        }
    }

    private void move(Minecraft mc) {
        String risk = VisibleWorld.movementRisk(mc, run.step.forward(), run.step.strafe());
        if (risk != null) {
            event("movement_blocked", risk);
            finish("failed", "movement_risk: " + risk, mc);
            return;
        }
        if (run.lastPosition != null && run.stepElapsed > 0) {
            if (mc.player.position().distanceToSqr(run.lastPosition) < 0.0001) run.stillTicks++;
            else run.stillTicks = 0;
            if (run.stillTicks >= 12 && (run.step.forward() != 0 || run.step.strafe() != 0)) {
                event("movement_blocked", "no_progress");
                finish("failed", "movement_blocked_no_progress", mc);
                return;
            }
        }
        run.lastPosition = mc.player.position();
        host.control(inputs(run.step.forward(), run.step.strafe(), false, run.step.sprint(), false, false));
        run.phase = "moving";
    }

    private void mine(Minecraft mc) {
        if (!mc.level.hasChunkAt(run.block)) {
            lost(mc, "block_chunk_unloaded");
            return;
        }
        BlockState current = mc.level.getBlockState(run.block);
        boolean changed = !current.is(run.originalBlock.getBlock());
        boolean serverConfirmed = BlockConfirmation.confirmedChanged(run.originalBlock);
        if (run.breakElapsed >= 0) {
            host.control(inputs(0, 0, false, false, false, false));
            if (!changed) {
                run.details.addProperty("broke", false);
                finish("failed", "block_change_reverted", mc);
                return;
            }
            JsonArray increases = positiveInventoryDelta(run.inventoryBefore, inventory(mc.player));
            run.details.add("inventory_increases", increases);
            Map<String, Integer> pickups = BlockConfirmation.pickups();
            JsonArray correlated = pickupInventoryIncreases(increases, pickups);
            run.details.add("server_pickups_near_target", counts(pickups));
            run.details.add("collected_item_increases", correlated);
            boolean matchingIncrease = !correlated.isEmpty();
            run.details.addProperty("collected", matchingIncrease);
            run.details.addProperty("collection_evidence", matchingIncrease
                    ? "server_pickup_near_target_and_inventory_increase" : increases.isEmpty() ? "not_observed" : "inventory_increase_without_correlated_pickup");
            if (matchingIncrease || run.stepElapsed - run.breakElapsed >= 40) {
                event("collection_finished", matchingIncrease ? "inventory_increase_observed_not_causal_proof" : "collection_unverified");
                stepDone(matchingIncrease ? "block_changed_and_inventory_increase_observed" : "block_changed_collection_unverified", mc);
            }
            return;
        }
        if (changed && serverConfirmed) {
            host.control(inputs(0, 0, false, false, false, false));
            run.breakElapsed = run.stepElapsed;
            run.phase = "collecting_observation";
            run.details.addProperty("broke", true);
            run.details.addProperty("server_confirmed", true);
            run.details.addProperty("server_confirmed_at_ms", BlockConfirmation.confirmedAtMs());
            run.details.addProperty("block_change_observed_tick", run.lastTick);
            run.details.addProperty("break_causal_proof", false);
            event("block_broken", "server_confirmed_block_change");
            return;
        }
        if (changed || serverConfirmed) {
            if (run.predictedChangeAtMs < 0) run.predictedChangeAtMs = System.currentTimeMillis();
            host.control(inputs(0, 0, false, false, false, false));
            run.phase = "awaiting_server_block_confirmation";
            return;
        }
        if (run.predictedChangeAtMs >= 0) {
            host.control(inputs(0, 0, false, false, false, false));
            if (BlockConfirmation.received() && BlockConfirmation.confirmedAtMs() >= run.predictedChangeAtMs) {
                finish("failed", "server_rejected_block_change", mc);
            } else run.phase = "awaiting_server_block_confirmation";
            return;
        }
        BlockHitResult visible = VisibleWorld.visibleBlock(mc, run.block, mc.player.blockInteractionRange());
        if (visible == null) {
            lost(mc, "block_not_visible_or_out_of_reach");
            return;
        }
        aim(mc, visible.getLocation());
        boolean locked = blockAimed(mc, run.block) && closeAim(mc, visible.getLocation(), 2);
        host.control(inputs(0, 0, false, false, locked, false));
        run.phase = locked ? "mining" : "aiming";
    }

    private void interact(Minecraft mc) {
        if (run.pulsed) {
            host.control(inputs(0, 0, false, false, false, false));
            run.details.addProperty("input_sent", true);
            run.details.addProperty("result_verified", false);
            stepDone("interaction_input_sent_result_unverified", mc);
            return;
        }
        GoalRequest.Target requested = run.step.target();
        Vec3 point;
        boolean locked;
        if (requested.entity()) {
            Entity target = entityTarget(mc, false);
            if (target == null) return;
            if (target.distanceToSqr(mc.player) > square(mc.player.entityInteractionRange())) {
                lost(mc, "entity_out_of_interaction_reach");
                return;
            }
            point = target.getBoundingBox().getCenter();
            aim(mc, point);
            locked = entityAimed(mc, target) && closeAim(mc, point, 3);
        } else {
            BlockPos position = targetBlock(requested);
            BlockHitResult hit = VisibleWorld.visibleBlock(mc, position, mc.player.blockInteractionRange());
            if (hit == null) {
                lost(mc, "block_not_visible_or_out_of_reach");
                return;
            }
            point = hit.getLocation();
            aim(mc, point);
            locked = blockAimed(mc, position) && closeAim(mc, point, 2);
        }
        host.control(inputs(0, 0, false, false, false, locked));
        run.phase = locked ? "interacting" : "aiming";
        if (locked) {
            run.pulsed = true;
            event("interaction_sent", "result_unverified");
        }
    }

    private void combat(Minecraft mc) {
        Entity target = entityTarget(mc, true);
        if (target == null) return;
        if (target.distanceToSqr(mc.player) > square(mc.player.entityInteractionRange())) {
            lost(mc, "entity_out_of_attack_reach");
            return;
        }
        Vec3 point = target.getBoundingBox().getCenter();
        aim(mc, point);
        boolean strike = entityAimed(mc, target) && closeAim(mc, point, 3)
                && mc.player.getAttackStrengthScale(0.5f) >= 0.95f && run.stepElapsed - run.lastStrike >= 2;
        host.control(inputs(0, 0, false, false, strike, false));
        run.phase = strike ? "combat_attack" : "combat_aim_or_cooldown";
        if (strike) {
            run.lastStrike = run.stepElapsed;
            event("combat_attack", "explicit_target_normal_input");
        }
    }

    private void present(Minecraft mc) {
        String risk = VisibleWorld.presentationRisk(mc);
        if (risk != null) {
            finish("failed", "unsafe_presentation: " + risk, mc);
            return;
        }
        int elapsed = run.stepElapsed;
        boolean greeting = run.step.type().equals("greet");
        boolean crouch = greeting && (between(elapsed, 6, 10) || between(elapsed, 18, 22) || between(elapsed, 30, 34));
        host.control(inputs(0, 0, crouch, false, false, false));
        if (greeting && (elapsed == 12 || elapsed == 24 || elapsed == 36)) {
            // Visual animation only. Never call gameMode.attack or inject an attack key here.
            mc.player.swing(InteractionHand.MAIN_HAND);
            event("presentation_gesture", "air_swing_animation_only");
        }
        if (run.step.target() != null) {
            Vec3 target = targetPoint(mc, run.step.target(), true);
            if (target == null || run == null) return;
            aim(mc, target);
        } else {
            float nod = elapsed % 40 < 20 ? 3 : -2;
            SmoothCamera.Rotation rotation = camera.step(run.baseYaw, nod);
            host.look(rotation.yaw(), rotation.pitch());
        }
        run.phase = crouch ? "presentation_crouch" : "presenting";
        if (greeting && elapsed >= 45) stepDone("greeting_finished", mc);
    }

    private void aim(Minecraft mc, Vec3 point) {
        float[] target = angles(mc.player.getEyePosition(), point);
        SmoothCamera.Rotation rotation = camera.step(target[0], target[1]);
        host.look(rotation.yaw(), rotation.pitch());
        mc.gameRenderer.pick(1.0f);
    }

    private void dampCamera() {
        SmoothCamera.Rotation current = camera.rotation();
        SmoothCamera.Rotation next = camera.step(current.yaw(), current.pitch());
        host.look(next.yaw(), next.pitch());
    }

    private boolean closeAim(Minecraft mc, Vec3 point, float tolerance) {
        float[] target = angles(mc.player.getEyePosition(), point);
        float[] view = view(mc);
        return Math.abs(SmoothCamera.difference(view[0], target[0])) <= tolerance
                && Math.abs(view[1] - target[1]) <= tolerance;
    }

    private Entity entityTarget(Minecraft mc, boolean deathCompletes) {
        int id = run.step.target().entityId();
        Entity entity = mc.level.getEntity(id);
        if (entity != null && !entity.isAlive()) {
            if (deathCompletes) {
                run.details.addProperty("target_death_observed", true);
                run.details.addProperty("kill_causal_proof", false);
                stepDone("target_death_observed", mc);
            } else lost(mc, "entity_died");
            return null;
        }
        if (entity == null || entity == mc.player || entity.distanceToSqr(mc.player) > 32 * 32
                || !VisibleWorld.visible(mc, entity)) {
            lost(mc, entity == null ? "entity_missing" : "entity_not_visible_or_out_of_tracking_range");
            return null;
        }
        run.details.addProperty("entity_id", id);
        return entity;
    }

    private Vec3 targetPoint(Minecraft mc, GoalRequest.Target requested, boolean failLost) {
        if (!requested.entity()) return new Vec3(requested.x() + (requested.block() ? .5 : 0),
                requested.y() + (requested.block() ? .5 : 0), requested.z() + (requested.block() ? .5 : 0));
        Entity entity = mc.level.getEntity(requested.entityId());
        if (entity == null || !entity.isAlive() || !VisibleWorld.visible(mc, entity)) {
            if (failLost) lost(mc, "entity_not_visible_or_missing");
            return null;
        }
        return entity.getBoundingBox().getCenter();
    }

    private Poi choosePoi(Minecraft mc) {
        JsonObject observation = VisibleWorld.observe(mc, 5);
        List<Poi> points = new ArrayList<>();
        JsonArray entities = observation.getAsJsonArray("entities");
        if (entities != null) for (JsonElement element : entities) {
            JsonObject entity = element.getAsJsonObject();
            Entity visible = mc.level.getEntity(entity.get("id").getAsInt());
            if (visible != null && visible.isAlive()) points.add(new Poi(visible.getBoundingBox().getCenter(), visible.getId(), null));
        }
        JsonArray blocks = observation.getAsJsonArray("blocks");
        if (blocks != null) for (int i = 0; i < blocks.size() && points.size() < 24; i += 4) {
            JsonObject candidate = blocks.get(i).getAsJsonObject();
            JsonObject position = candidate.getAsJsonObject("hit_position");
            if (position == null) continue;
            points.add(new Poi(vector(position), null,
                    new BlockPos(candidate.get("x").getAsInt(), candidate.get("y").getAsInt(), candidate.get("z").getAsInt())));
        }
        run.details.addProperty("visible_interest_count", points.size());
        if (points.isEmpty()) return null;
        return points.get(Math.floorMod(run.poiCounter++, points.size()));
    }

    private Vec3 poiPoint(Minecraft mc, Poi point) {
        if (point.entityId != null) {
            Entity entity = mc.level.getEntity(point.entityId);
            return entity != null && entity.isAlive() && VisibleWorld.visible(mc, entity)
                    ? entity.getBoundingBox().getCenter() : null;
        }
        return point.block == null || VisibleWorld.visibleSurface(mc, point.block, point.position, 12) ? point.position : null;
    }

    private void expire(Minecraft mc, boolean overall) {
        if (run.step.type().equals("mine") && run.breakElapsed >= 0) {
            stepDone("block_changed_collection_deadline", mc);
        } else if (run.step.type().equals("mine") && run.predictedChangeAtMs >= 0) {
            finish("failed", "server_block_confirmation_timeout", mc);
        } else if (List.of("look_at", "mine", "interact", "combat").contains(run.step.type())) {
            finish("failed", "goal_deadline_exceeded", mc);
        } else if (overall && run.request.type().equals("sequence") && run.index + 1 < run.request.steps().size()) {
            finish("failed", "sequence_deadline_exceeded", mc);
        } else {
            stepDone("authorized_duration_completed", mc);
        }
    }

    private void stepDone(String reason, Minecraft mc) {
        if (run == null) return;
        release(mc);
        restoreCamera();
        if (run.step.type().equals("mine")) BlockConfirmation.clear();
        JsonObject step = run.details.deepCopy();
        step.addProperty("step", run.index);
        step.addProperty("type", run.step.type());
        step.addProperty("reason", reason);
        run.results.add(step);
        event("goal_step_finished", reason);
        if (run.request.type().equals("sequence") && ++run.index < run.request.steps().size()) {
            if (run.elapsed >= run.request.maxTicks()) finish("failed", "sequence_deadline_exceeded", mc);
            else beginStep(mc);
        } else finish("completed", reason, mc);
    }

    private void lost(Minecraft mc, String reason) {
        event("target_lost", reason);
        finish("failed", reason, mc);
    }

    private void finish(String status, String reason, Minecraft mc) {
        if (run == null) return;
        release(mc);
        restoreCamera();
        if (run.step.type().equals("mine")) BlockConfirmation.clear();
        JsonObject details = run.details.deepCopy();
        details.addProperty("elapsed_ticks", run.elapsed);
        details.addProperty("state", "interrupted");
        details.addProperty("accepted_tick", run.acceptedTick);
        if (run.started) {
            details.addProperty("started_tick", run.startedTick);
            details.addProperty("start_delay_ms", (run.startedNanos - run.acceptedNanos) / 1_000_000.0);
        }
        JsonArray steps = new JsonArray();
        for (JsonObject result : run.results) steps.add(result.deepCopy());
        if (!steps.isEmpty()) details.add("steps", steps);
        JsonObject result = new JsonObject();
        result.addProperty("id", run.id);
        result.addProperty("type", run.request.type());
        result.addProperty("status", status);
        result.addProperty("state", "interrupted");
        result.addProperty("local_state", "interrupted");
        result.addProperty("reason", reason);
        result.addProperty("tick", run.lastTick);
        result.add("details", details);
        String id = run.id;
        String type = run.request.type();
        last = result;
        run = null;
        host.event("goal_finished", result.deepCopy());
        host.complete(id, type, status, reason, details.deepCopy());
    }

    private void release(Minecraft mc) {
        host.release();
        if (mc != null && mc.gameMode != null && mc.player != null) {
            mc.gameMode.stopDestroyBlock();
            if (mc.player.isUsingItem()) mc.gameMode.releaseUsingItem(mc.player);
        }
    }

    private void restoreCamera() {
        if (run != null && run.previousCamera != null) {
            host.camera(run.previousCamera);
            run.previousCamera = null;
        }
    }

    private void event(String type, String reason) {
        if (run == null) return;
        JsonObject event = new JsonObject();
        event.addProperty("goal_id", run.id);
        event.addProperty("goal_type", run.step == null ? run.request.type() : run.step.type());
        event.addProperty("reason", reason);
        event.addProperty("tick", run.lastTick);
        host.event(type, event);
    }

    static float[] angles(Vec3 origin, Vec3 point) {
        Vec3 delta = point.subtract(origin);
        return SmoothCamera.angles(delta.x, delta.y, delta.z);
    }

    static JsonArray positiveInventoryDelta(Map<String, Integer> before, Map<String, Integer> after) {
        JsonArray result = new JsonArray();
        after.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
            int increase = entry.getValue() - before.getOrDefault(entry.getKey(), 0);
            if (increase > 0 && result.size() < 16) {
                JsonObject change = new JsonObject();
                change.addProperty("id", entry.getKey());
                change.addProperty("increase", increase);
                result.add(change);
            }
        });
        return result;
    }

    private static Map<String, Integer> inventory(LocalPlayer player) {
        Map<String, Integer> result = new HashMap<>();
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
            ItemStack stack = player.getInventory().getItem(slot);
            if (!stack.isEmpty()) result.merge(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString(), stack.getCount(), Integer::sum);
        }
        return result;
    }

    private static JsonArray pickupInventoryIncreases(JsonArray increases, Map<String, Integer> pickups) {
        JsonArray evidence = new JsonArray();
        for (JsonElement element : increases) {
            JsonObject increase = element.getAsJsonObject();
            String id = increase.get("id").getAsString();
            int observed = Math.min(increase.get("increase").getAsInt(), pickups.getOrDefault(id, 0));
            if (observed > 0) {
                JsonObject item = new JsonObject();
                item.addProperty("id", id);
                item.addProperty("count", observed);
                evidence.add(item);
            }
        }
        return evidence;
    }

    private static JsonObject counts(Map<String, Integer> values) {
        JsonObject result = new JsonObject();
        values.entrySet().stream().sorted(Map.Entry.comparingByKey()).limit(16)
                .forEach(entry -> result.addProperty(entry.getKey(), entry.getValue()));
        return result;
    }

    private static boolean blockAimed(Minecraft mc, BlockPos block) {
        return mc.hitResult instanceof BlockHitResult hit && hit.getType() == HitResult.Type.BLOCK && hit.getBlockPos().equals(block);
    }

    private static boolean entityAimed(Minecraft mc, Entity entity) {
        return mc.hitResult instanceof EntityHitResult hit && hit.getEntity() == entity;
    }

    private static ControlAction inputs(float forward, float strafe, boolean sneak, boolean sprint, boolean attack, boolean use) {
        return new ControlAction("control", forward, strafe, false, sneak, sprint, attack, use, 1, null, null, null, null);
    }

    private static float[] view(Minecraft mc) {
        float[] shoulder = ShoulderCompat.rotation();
        return shoulder != null ? shoulder : mc.player != null ? new float[]{mc.player.getYRot(), mc.player.getXRot()} : new float[]{0, 0};
    }

    private static BlockPos targetBlock(GoalRequest.Target target) { return BlockPos.containing(target.x(), target.y(), target.z()); }
    private static boolean between(int value, int minimum, int maximum) { return value >= minimum && value <= maximum; }
    private static double square(double value) { return value * value; }
    private static Vec3 vector(JsonObject value) { return new Vec3(value.get("x").getAsDouble(), value.get("y").getAsDouble(), value.get("z").getAsDouble()); }
    private static JsonObject block(BlockPos point) {
        JsonObject value = new JsonObject();
        value.addProperty("x", point.getX()); value.addProperty("y", point.getY()); value.addProperty("z", point.getZ());
        return value;
    }

    private static String stateName(String type) {
        return switch (type) {
            case "move" -> "moving";
            case "mine" -> "mining";
            case "interact" -> "interacting";
            case "combat" -> "combat";
            default -> "observing";
        };
    }

    private static JsonObject idle() {
        JsonObject result = new JsonObject();
        result.addProperty("status", "idle");
        result.addProperty("state", "interrupted");
        result.addProperty("local_state", "interrupted");
        result.add("id", JsonNull.INSTANCE);
        return result;
    }

    private record Poi(Vec3 position, Integer entityId, BlockPos block) {}

    private static final class Run {
        final String id;
        final GoalRequest request;
        final long acceptedTick;
        final long acceptedNanos = System.nanoTime();
        final List<JsonObject> results = new ArrayList<>();
        GoalRequest step;
        long lastTick, startedTick, startedNanos, predictedChangeAtMs = -1;
        int index, elapsed, stepElapsed, stillTicks, poiPause, poiCounter, nextPoiScan;
        int breakElapsed = -1, lastStrike = -20;
        boolean pulsed, started;
        String phase = "starting", previousCamera;
        float baseYaw, basePitch;
        Vec3 lastPosition;
        Poi poi;
        BlockPos block;
        BlockState originalBlock;
        Map<String, Integer> inventoryBefore = Map.of();
        JsonObject details = new JsonObject();
        Run(String id, GoalRequest request, long tick) {
            this.id = id; this.request = request; this.acceptedTick = tick; this.lastTick = tick;
        }
    }
}
