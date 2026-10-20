package dev.dotbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.NeutralMob;
import net.minecraft.world.entity.ambient.AmbientCreature;
import net.minecraft.world.entity.animal.AbstractGolem;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.WaterAnimal;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.npc.AbstractVillager;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.block.AbstractFurnaceBlock;
import net.minecraft.world.level.block.ButtonBlock;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.CraftingTableBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.LeverBlock;
import net.minecraft.world.level.block.TrapDoorBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.event.ViewportEvent;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Bounded, read-only perception. Call exclusively from the Minecraft client thread. */
final class VisibleWorld {
    private static final int COLUMNS = 12;
    private static final int ROWS = 8;
    private static final int MAX_ENTITIES = 32;
    private static final int CANDIDATES = 64;
    private static double renderedFov = Double.NaN;
    private static Entity renderedFovEntity;
    private static final Set<String> CONDITIONAL_VANILLA = Set.of(
            "piglin", "spider", "cave_spider", "goat", "pufferfish", "llama", "trader_llama");

    private VisibleWorld() {}

    static void recordFov(ViewportEvent.ComputeFov event) {
        if (event.usedConfiguredFov() && Double.isFinite(event.getFOV())
                && event.getFOV() > 0 && event.getFOV() < 180) {
            renderedFov = event.getFOV();
            renderedFovEntity = event.getCamera().getEntity();
        }
    }

    static JsonObject observe(Minecraft mc, int requestedRadius) {
        JsonObject result = new JsonObject();
        JsonArray blocks = new JsonArray();
        JsonArray entities = new JsonArray();
        JsonArray openings = new JsonArray();
        result.add("blocks", blocks);
        result.add("entities", entities);
        result.add("openings", openings);
        result.addProperty("visible_only", true);
        result.addProperty("loaded_only", true);
        result.addProperty("line_of_sight_required", true);
        result.addProperty("visibility_method", "sampled_camera_fov_and_first_ray_hit");
        result.addProperty("block_limit", COLUMNS * ROWS);
        result.addProperty("entity_limit", MAX_ENTITIES);
        result.addProperty("entity_candidate_limit", CANDIDATES);
        if (mc.player == null || mc.level == null) return result;
        int radius = Mth.clamp(requestedRadius, 1, 8);
        View view = view(mc);
        result.addProperty("radius", radius);
        result.add("view_origin", vector(view.eye));
        result.addProperty("vertical_fov_degrees", view.fov);
        result.add("center", blockPosition(mc.player.blockPosition()));
        if (view.fov <= 0) {
            result.addProperty("reason", "render_view_not_ready");
            return result;
        }
        Map<BlockPos, JsonObject> sampled = new LinkedHashMap<>();
        BlockHitResult[][] rays = new BlockHitResult[ROWS][COLUMNS];
        double range = Math.min(12, radius + view.eye.distanceTo(mc.player.getEyePosition()));
        for (int row = 0; row < ROWS; row++) {
            for (int column = 0; column < COLUMNS; column++) {
                double horizontal = ((column + 0.5) / COLUMNS * 2 - 1) * view.aspect;
                double vertical = 1 - (row + 0.5) / ROWS * 2;
                double scale = Math.tan(Math.toRadians(view.fov) * 0.5);
                Vec3 direction = view.forward.add(view.left.scale(horizontal * scale))
                        .add(view.up.scale(vertical * scale)).normalize();
                Vec3 end = view.eye.add(direction.scale(range));
                BlockHitResult hit = ray(mc, view.eye, end, ClipContext.Block.OUTLINE, ClipContext.Fluid.ANY);
                if (hit == null) continue; // Unloaded space is unknown, never an opening.
                if (hit.getType() == HitResult.Type.MISS) {
                    if (openings.size() < 8) {
                        JsonObject opening = new JsonObject();
                        opening.addProperty("category", "opening");
                        opening.add("direction", vector(direction));
                        opening.addProperty("clear_ray_distance", range);
                        opening.addProperty("meaning", "no_visible_surface_hit_within_sample_range");
                        openings.add(opening);
                    }
                    continue;
                }
                if (hit.getLocation().distanceTo(mc.player.getEyePosition()) > radius + 0.75) continue;
                rays[row][column] = hit;
                BlockPos position = hit.getBlockPos().immutable();
                sampled.computeIfAbsent(position, key -> block(mc, hit));
            }
        }
        // This is a visual edge candidate, not a claim that an unseen drop exists.
        for (int row = 0; row < ROWS; row++) {
            for (int column = 1; column < COLUMNS; column++) {
                BlockHitResult left = rays[row][column - 1];
                BlockHitResult right = rays[row][column];
                if (left == null || right == null) continue;
                double difference = left.getLocation().distanceTo(view.eye) - right.getLocation().distanceTo(view.eye);
                BlockHitResult near = difference < 0 ? left : right;
                if (Math.abs(difference) > 2 && near.getDirection() == Direction.UP) {
                    JsonObject entry = sampled.get(near.getBlockPos());
                    if (entry != null && !entry.has("edge_candidate")) {
                        entry.addProperty("edge_candidate", true);
                        entry.getAsJsonArray("categories").add("edge");
                        entry.addProperty("edge_evidence", "adjacent_visible_ray_depth_discontinuity");
                    }
                }
            }
        }
        sampled.values().forEach(blocks::add);
        List<Entity> nearby = nearby(mc, radius, CANDIDATES);
        nearby.sort(Comparator.comparingDouble(entity -> entity.distanceToSqr(mc.player)));
        int checked = 0;
        for (Entity entity : nearby) {
            if (entities.size() >= MAX_ENTITIES) break;
            checked++;
            if (!visible(mc, entity)) continue;
            entities.add(entity(entity, mc.player));
        }
        result.addProperty("entities_truncated", entities.size() == MAX_ENTITIES && checked < nearby.size()
                || nearby.size() == CANDIDATES);
        result.addProperty("sample_rays", COLUMNS * ROWS);
        result.addProperty("complete_map", false);
        result.add("crosshair", crosshair(mc));
        return result;
    }

    static JsonObject crosshair(Minecraft mc) {
        JsonObject target = new JsonObject();
        target.addProperty("type", "miss");
        if (mc.player == null || mc.level == null || mc.hitResult == null
                || mc.hitResult.getType() == HitResult.Type.MISS) return target;
        HitResult hit = mc.hitResult;
        if (hit instanceof BlockHitResult blockHit) {
            if (!mc.level.hasChunkAt(blockHit.getBlockPos()) || !inView(view(mc), hit.getLocation())) {
                target.addProperty("reason", "target_not_visible_in_current_camera");
                return target;
            }
            BlockHitResult confirmed = ray(mc, view(mc).eye, hit.getLocation().add(
                    hit.getLocation().subtract(view(mc).eye).normalize().scale(0.02)),
                    ClipContext.Block.OUTLINE, ClipContext.Fluid.ANY);
            if (confirmed == null || confirmed.getType() != HitResult.Type.BLOCK
                    || !confirmed.getBlockPos().equals(blockHit.getBlockPos())) {
                target.addProperty("reason", "target_occluded_or_unloaded");
                return target;
            }
            JsonObject surface = block(mc, blockHit);
            target.addProperty("type", "block");
            target.addProperty("id", surface.get("id").getAsString());
            target.addProperty("name", surface.get("name").getAsString());
            target.add("block", blockPosition(blockHit.getBlockPos()));
            target.addProperty("face", blockHit.getDirection().getName());
            target.addProperty("visible", true);
            target.addProperty("within_reach", mc.player.canInteractWithBlock(blockHit.getBlockPos(), 0));
            target.add("interactions", surface.get("interactions").deepCopy());
            target.addProperty("interaction_knowledge", surface.get("interaction_knowledge").getAsString());
        } else if (hit instanceof EntityHitResult entityHit && visible(mc, entityHit.getEntity())) {
            target.addProperty("type", "entity");
            target.add("entity", entity(entityHit.getEntity(), mc.player));
            target.addProperty("within_reach", mc.player.canInteractWithEntity(entityHit.getEntity(), 0));
            target.addProperty("interaction_knowledge", "requires_server_confirmation");
        }
        if (!target.get("type").getAsString().equals("miss")) {
            target.add("position", vector(hit.getLocation()));
            target.addProperty("distance", mc.player.getEyePosition().distanceTo(hit.getLocation()));
        }
        return target;
    }

    static JsonObject entity(Entity entity, LocalPlayer player) {
        JsonObject entry = new JsonObject();
        entry.addProperty("id", entity.getId());
        entry.addProperty("uuid", entity.getUUID().toString());
        entry.addProperty("type", BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString());
        entry.addProperty("name", entity.getName().getString());
        entry.add("position", vector(entity.position()));
        entry.addProperty("distance", entity.distanceTo(player));
        View rendered = view(Minecraft.getInstance());
        Vec3 delta = entity.getBoundingBox().getCenter().subtract(rendered.eye);
        double relative = Math.toDegrees(Math.atan2(-delta.dot(rendered.left), delta.dot(rendered.forward)));
        entry.addProperty("relative_yaw", relative);
        entry.addProperty("relative_direction_frame", "render_camera");
        entry.addProperty("relative_direction", Math.abs(relative) <= 35 ? "ahead"
                : Math.abs(relative) >= 145 ? "behind" : relative > 0 ? "right" : "left");
        entry.addProperty("line_of_sight", true); // Only invoke after visible() confirms it.
        entry.addProperty("classification", classification(entity));
        entry.addProperty("aggression", "not_inferred_from_presence");
        entry.addProperty("alive", entity.isAlive());
        return entry;
    }

    static boolean visible(Minecraft mc, Entity entity) {
        if (mc.player == null || mc.level == null || entity == mc.player || !entity.isAlive()
                || entity.isInvisibleTo(mc.player) || !mc.level.hasChunkAt(entity.blockPosition())) return false;
        View view = view(mc);
        Vec3 center = entity.getBoundingBox().getCenter();
        Vec3 eyes = entity.getEyePosition();
        return visiblePoint(mc, view, center) || visiblePoint(mc, view, eyes);
    }

    static BlockHitResult visibleBlock(Minecraft mc, BlockPos position, double maxDistance) {
        if (mc.player == null || mc.level == null || !mc.level.hasChunkAt(position)
                || !Double.isFinite(maxDistance) || maxDistance <= 0 || maxDistance > 16) return null;
        Vec3 point = Vec3.atCenterOf(position);
        if (mc.player.getEyePosition().distanceTo(point) > maxDistance || !inView(view(mc), point)) return null;
        BlockHitResult hit = ray(mc, view(mc).eye, point, ClipContext.Block.OUTLINE, ClipContext.Fluid.ANY);
        return hit != null && hit.getType() == HitResult.Type.BLOCK && hit.getBlockPos().equals(position) ? hit : null;
    }

    /** Recheck an already sampled surface without aiming through its block's hidden center. */
    static boolean visibleSurface(Minecraft mc, BlockPos position, Vec3 point, double maxDistance) {
        if (mc.player == null || mc.level == null || position == null || point == null
                || !mc.level.hasChunkAt(position) || !Double.isFinite(maxDistance)
                || maxDistance <= 0 || maxDistance > 16
                || !Double.isFinite(point.x) || !Double.isFinite(point.y) || !Double.isFinite(point.z)) return false;
        // A stale or malformed surface must still belong to the previously observed block.
        if (point.x < position.getX() - .03 || point.x > position.getX() + 1.03
                || point.y < position.getY() - .03 || point.y > position.getY() + 1.03
                || point.z < position.getZ() - .03 || point.z > position.getZ() + 1.03
                || mc.player.getEyePosition().distanceTo(point) > maxDistance) return false;
        View current = view(mc);
        if (!inView(current, point)) return false;
        Vec3 direction = point.subtract(current.eye);
        double length = direction.length();
        if (!Double.isFinite(length) || length < 0.00001) return false;
        // End just behind the original face so exact surface endpoints do not become misses.
        Vec3 end = point.add(direction.scale(.02 / length));
        BlockHitResult hit = ray(mc, current.eye, end, ClipContext.Block.OUTLINE, ClipContext.Fluid.ANY);
        return hit != null && hit.getType() == HitResult.Type.BLOCK && hit.getBlockPos().equals(position);
    }

    static String movementRisk(Minecraft mc, float forward, float strafe) {
        if (mc.player == null || mc.level == null) return "not_connected";
        if (!Float.isFinite(forward) || !Float.isFinite(strafe)) return "invalid_movement";
        if (Math.abs(forward) + Math.abs(strafe) < 0.001) return null;
        LocalPlayer player = mc.player;
        if (player.isInLava()) return "lava_at_player";
        if (player.isInWater()) return "water_at_player";
        // Shoulder Surfing's NORMAL input listener subsequently rotates the raw
        // axes into camera-relative motion. Guard the same direction, not the body.
        float[] shoulderView = ShoulderCompat.rotation();
        double yaw = Math.toRadians(shoulderView == null ? player.getYRot() : shoulderView[0]);
        Vec3 direction = new Vec3(-Math.sin(yaw) * forward + Math.cos(yaw) * strafe, 0,
                Math.cos(yaw) * forward + Math.sin(yaw) * strafe).normalize();
        double distance = Mth.clamp(player.getDeltaMovement().horizontalDistance() * 3 + 0.4, 0.55, 1.1);
        Vec3 offset = direction.scale(distance);
        AABB body = player.getBoundingBox().deflate(0.001);
        AABB swept = body.expandTowards(offset).inflate(0.01, 0, 0.01);
        if (!loadedBox(mc, swept.inflate(1, 1.3, 1))) return "unloaded_space_ahead";
        if (!mc.level.noBlockCollision(player, swept)) return "immediate_obstacle";
        String fluid = fluidRisk(mc, swept);
        if (fluid != null) return fluid;
        double halfWidth = Math.max(0.05, player.getBbWidth() * 0.45);
        double x = player.getX() + offset.x;
        double z = player.getZ() + offset.z;
        double feet = player.getY();
        for (double sx : new double[]{-halfWidth, halfWidth}) {
            for (double sz : new double[]{-halfWidth, halfWidth}) {
                Vec3 start = new Vec3(x + sx, feet + 0.08, z + sz);
                BlockHitResult support = ray(mc, start, start.add(0, -1.18, 0),
                        ClipContext.Block.COLLIDER, ClipContext.Fluid.ANY);
                if (support == null) return "unloaded_support_ahead";
                if (support.getType() != HitResult.Type.BLOCK) return "cliff_or_missing_support";
                var state = mc.level.getFluidState(support.getBlockPos());
                if (state.is(FluidTags.LAVA)) return "lava_ahead";
                if (state.is(FluidTags.WATER)) return "water_ahead";
                if (!state.isEmpty()) return "unknown_fluid_ahead";
            }
        }
        return null;
    }

    static String presentationRisk(Minecraft mc) {
        if (mc.player == null || mc.level == null) return "not_connected";
        LocalPlayer player = mc.player;
        if (player.isDeadOrDying()) return "player_dead";
        if (mc.isPaused() || mc.screen != null || mc.getOverlay() != null) return "game_not_controllable";
        if (!player.onGround() || player.getAbilities().flying) return "player_not_on_stable_ground";
        if (player.isInWater() || player.isInLava() || player.isOnFire()) return "player_in_fluid_or_on_fire";
        if (player.hurtTime > 0) return "recent_damage";
        if (view(mc).fov <= 0) return "render_view_not_ready";
        for (float[] direction : new float[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
            String risk = movementRisk(mc, direction[0], direction[1]);
            if (risk != null) return "unsafe_presentation_area:" + risk;
        }
        for (Entity candidate : nearby(mc, 6, CANDIDATES)) {
            if (!(candidate instanceof LivingEntity) || !visible(mc, candidate)) continue;
            String type = classification(candidate);
            if (type.equals("hostile")) return "visible_hostile_nearby";
            if (candidate.distanceToSqr(player) <= 16 && (type.equals("neutral") || type.equals("unknown"))) {
                return "nearby_creature_disposition_not_safe_for_presentation";
            }
        }
        double yaw = Math.toRadians(player.getYRot());
        Vec3 eye = player.getEyePosition();
        Vec3 camera = eye.add(-Math.sin(yaw) * 3.5, 0.2, Math.cos(yaw) * 3.5);
        AABB clearance = new AABB(camera.x - 0.35, camera.y - 0.35, camera.z - 0.35,
                camera.x + 0.35, camera.y + 0.35, camera.z + 0.35);
        if (!loadedBox(mc, clearance.inflate(1))) return "front_camera_space_unloaded";
        BlockHitResult cameraRay = ray(mc, eye, camera, ClipContext.Block.VISUAL, ClipContext.Fluid.ANY);
        if (cameraRay == null || cameraRay.getType() != HitResult.Type.MISS
                || !mc.level.noBlockCollision(player, clearance)) return "insufficient_front_camera_clearance";
        return null;
    }

    private static JsonObject block(Minecraft mc, BlockHitResult hit) {
        BlockPos position = hit.getBlockPos();
        BlockState state = mc.level.getBlockState(position);
        var identifier = BuiltInRegistries.BLOCK.getKey(state.getBlock());
        JsonObject entry = blockPosition(position);
        entry.add("position", blockPosition(position));
        entry.addProperty("id", identifier.toString());
        entry.addProperty("name", state.getBlock().getName().getString());
        entry.addProperty("face", hit.getDirection().getName());
        entry.addProperty("distance", mc.player.getEyePosition().distanceTo(hit.getLocation()));
        entry.add("hit_position", vector(hit.getLocation()));
        entry.addProperty("visible", true);
        boolean collision = !state.getCollisionShape(mc.level, position).isEmpty();
        entry.addProperty("collision", collision);
        String category = state.getFluidState().is(FluidTags.LAVA) ? "lava"
                : state.getFluidState().is(FluidTags.WATER) ? "water"
                : state.is(BlockTags.LOGS) || state.is(BlockTags.LEAVES) ? "tree"
                : hit.getDirection() == Direction.UP && collision ? "floor" : "obstacle";
        entry.addProperty("category", category);
        JsonArray categories = new JsonArray();
        categories.add(category);
        entry.add("categories", categories);
        JsonArray interactions = new JsonArray();
        if (!identifier.getNamespace().equals("minecraft")) {
            interactions.add("unknown");
            entry.addProperty("interaction_knowledge", "unknown_modded_block");
        } else {
            if (state.getDestroySpeed(mc.level, position) >= 0) interactions.add("mine_attempt");
            var block = state.getBlock();
            if (block instanceof CraftingTableBlock) interactions.add("crafting_menu");
            else if (block instanceof ChestBlock || block instanceof AbstractFurnaceBlock) interactions.add("container_menu");
            else if (block instanceof DoorBlock || block instanceof TrapDoorBlock
                    || block instanceof ButtonBlock || block instanceof LeverBlock) interactions.add("use_attempt");
            else interactions.add("use_unknown_or_item_dependent");
            entry.addProperty("interaction_knowledge", "vanilla_candidates_require_server_confirmation");
        }
        entry.add("interactions", interactions);
        return entry;
    }

    private static String classification(Entity entity) {
        var identifier = BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType());
        // Conditional aggression wins over Enemy: e.g. piglins and daytime spiders.
        if (entity instanceof NeutralMob || identifier.getNamespace().equals("minecraft")
                && CONDITIONAL_VANILLA.contains(identifier.getPath())) return "neutral";
        if (!identifier.getNamespace().equals("minecraft")) return "unknown";
        if (entity instanceof Enemy) return "hostile";
        if (entity instanceof Animal || entity instanceof AbstractVillager || entity instanceof AmbientCreature
                || entity instanceof WaterAnimal || entity instanceof AbstractGolem) return "passive";
        if (entity instanceof Player) return "unknown";
        return "unknown";
    }

    private static List<Entity> nearby(Minecraft mc, int radius, int limit) {
        List<Entity> result = new ArrayList<>();
        mc.level.getEntities(EntityTypeTest.forClass(Entity.class), mc.player.getBoundingBox().inflate(radius),
                entity -> entity != mc.player && entity.isAlive() && !entity.isInvisibleTo(mc.player)
                        && entity.distanceToSqr(mc.player) <= radius * radius, result, limit);
        return result;
    }

    private static boolean visiblePoint(Minecraft mc, View view, Vec3 point) {
        if (point.distanceToSqr(view.eye) > 24 * 24 || !inView(view, point)) return false;
        BlockHitResult hit = ray(mc, view.eye, point, ClipContext.Block.VISUAL, ClipContext.Fluid.ANY);
        return hit != null && hit.getType() == HitResult.Type.MISS;
    }

    private static BlockHitResult ray(Minecraft mc, Vec3 start, Vec3 end,
                                      ClipContext.Block block, ClipContext.Fluid fluid) {
        double length = start.distanceTo(end);
        if (!Double.isFinite(length) || length > 32) return null;
        // Check the whole tiny chunk rectangle, not approximate point samples.
        // The conservative rectangle can omit a ray, but cannot cross an unloaded corner.
        if (!loadedBox(mc, new AABB(start, end))) return null;
        return mc.level.clip(new ClipContext(start, end, block, fluid, mc.player));
    }

    private static boolean loadedBox(Minecraft mc, AABB box) {
        int minX = Mth.floor(box.minX) >> 4;
        int maxX = Mth.floor(box.maxX) >> 4;
        int minZ = Mth.floor(box.minZ) >> 4;
        int maxZ = Mth.floor(box.maxZ) >> 4;
        if (maxX - minX > 4 || maxZ - minZ > 4) return false;
        for (int x = minX; x <= maxX; x++) {
            for (int z = minZ; z <= maxZ; z++) {
                if (!mc.level.hasChunk(x, z)) return false;
            }
        }
        return true;
    }

    private static String fluidRisk(Minecraft mc, AABB box) {
        int examined = 0;
        for (BlockPos position : BlockPos.betweenClosed(BlockPos.containing(box.minX, box.minY, box.minZ),
                BlockPos.containing(box.maxX, Math.min(box.maxY, box.minY + 1.2), box.maxZ))) {
            if (++examined > 64) return "body_clearance_too_large_to_verify";
            var fluid = mc.level.getFluidState(position);
            if (fluid.isEmpty() || position.getY() + fluid.getHeight(mc.level, position) <= box.minY) continue;
            if (fluid.is(FluidTags.LAVA)) return "lava_ahead";
            if (fluid.is(FluidTags.WATER)) return "water_ahead";
            return "unknown_fluid_ahead";
        }
        return null;
    }

    private static View view(Minecraft mc) {
        Camera camera = mc.gameRenderer.getMainCamera();
        boolean ready = camera.isInitialized() && camera.getEntity() == mc.player
                && camera.getPosition().distanceToSqr(mc.player.getEyePosition()) <= 64;
        Vec3 eye = ready ? camera.getPosition() : mc.player.getEyePosition();
        Vec3 forward = ready ? new Vec3(camera.getLookVector()) : mc.player.getViewVector(1).normalize();
        Vec3 left = ready ? new Vec3(camera.getLeftVector()) : new Vec3(forward.z, 0, -forward.x).normalize();
        Vec3 up = ready ? new Vec3(camera.getUpVector()) : forward.cross(left).normalize();
        double aspect = mc.getWindow().getWidth() / (double) Math.max(1, mc.getWindow().getHeight());
        double fov = ready && renderedFovEntity == mc.player && Double.isFinite(renderedFov)
                ? Mth.clamp(renderedFov, 1, 170) : 0;
        return new View(eye, forward, left, up, fov, aspect);
    }

    private static boolean inView(View view, Vec3 position) {
        Vec3 delta = position.subtract(view.eye);
        return VisibilityMath.inView(delta.dot(view.forward), delta.dot(view.left), delta.dot(view.up), view.fov, view.aspect);
    }

    private static JsonObject vector(Vec3 position) {
        JsonObject value = new JsonObject();
        value.addProperty("x", position.x);
        value.addProperty("y", position.y);
        value.addProperty("z", position.z);
        return value;
    }

    private static JsonObject blockPosition(BlockPos position) {
        JsonObject value = new JsonObject();
        value.addProperty("x", position.getX());
        value.addProperty("y", position.getY());
        value.addProperty("z", position.getZ());
        return value;
    }

    private record View(Vec3 eye, Vec3 forward, Vec3 left, Vec3 up, double fov, double aspect) {}
}
