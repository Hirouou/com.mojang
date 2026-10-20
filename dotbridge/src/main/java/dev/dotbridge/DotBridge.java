package dev.dotbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.mojang.logging.LogUtils;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.MovementInputUpdateEvent;
import net.neoforged.neoforge.common.NeoForge;
import org.slf4j.Logger;

import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;

/** All Minecraft reads and writes run on its client thread. HTTP reads cached snapshots. */
@Mod(value = DotBridge.MOD_ID, dist = Dist.CLIENT)
public final class DotBridge implements BridgeServer.Backend {
    public static final String MOD_ID = "dotbridge";
    private static final Logger LOGGER = LogUtils.getLogger();
    private final AtomicInteger queuedTasks = new AtomicInteger();
    private final ArrayDeque<JsonObject> history = new ArrayDeque<>();
    private final ArrayDeque<String> pendingCameras = new ArrayDeque<>();
    private final Set<KeyMapping> pressedKeys = new HashSet<>();
    private volatile JsonObject snapshot = initialSnapshot();
    private BridgeServer server;
    private ActiveAction active;
    private long tick;

    public DotBridge(IEventBus modBus) {
        modBus.addListener(this::setup);
        NeoForge.EVENT_BUS.addListener(this::preTick);
        NeoForge.EVENT_BUS.addListener(this::postTick);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, this::movement);
    }

    private static JsonObject initialSnapshot() {
        JsonObject state = new JsonObject();
        state.addProperty("ok", true);
        state.addProperty("tick", 0);
        state.addProperty("connected", false);
        state.addProperty("paused", false);
        state.addProperty("can_control", false);
        state.add("active_action", JsonNull.INSTANCE);
        state.add("last_action", JsonNull.INSTANCE);
        state.add("recent_actions", new JsonArray());
        return state;
    }

    private void setup(FMLClientSetupEvent event) {
        event.enqueueWork(() -> {
            try {
                BridgeConfig config = BridgeConfig.load(FMLPaths.CONFIGDIR.get());
                server = new BridgeServer(config.port, config.token, this);
                server.start();
                if (config.backgroundControl) {
                    // Keep simulation running while the local agent uses a terminal.
                    Minecraft.getInstance().options.pauseOnLostFocus = false;
                }
                Runtime.getRuntime().addShutdownHook(new Thread(server::close, "dotbridge-shutdown"));
                LOGGER.info("DotBridge ready at http://127.0.0.1:{}; token file: {}",
                        server.getPort(), FMLPaths.CONFIGDIR.get().resolve("dotbridge.token"));
            } catch (Exception e) {
                LOGGER.error("DotBridge could not start. Check port and config/dotbridge.json: {}", e.toString());
            }
        });
    }

    private static boolean canControl(Minecraft mc) {
        return mc.player != null && mc.level != null && mc.gameMode != null
                && !mc.player.isDeadOrDying() && !mc.isPaused()
                && mc.screen == null && mc.getOverlay() == null;
    }

    private void preTick(ClientTickEvent.Pre event) {
        tick++;
        if (!pendingCameras.isEmpty() && !canControl(Minecraft.getInstance())) {
            finishCameras("cancelled", "Game disconnected, paused, or a screen opened");
        }
        if (active == null) return;
        Minecraft mc = Minecraft.getInstance();
        if (!canControl(mc)) {
            finish("cancelled", "Game disconnected, paused, or a screen opened");
            return;
        }
        ControlAction action = active.action;
        setKey(mc.options.keyUp, action.forward() > 0);
        setKey(mc.options.keyDown, action.forward() < 0);
        setKey(mc.options.keyLeft, action.strafe() > 0);
        setKey(mc.options.keyRight, action.strafe() < 0);
        setKey(mc.options.keyJump, action.jump());
        setKey(mc.options.keyShift, action.sneak());
        setKey(mc.options.keySprint, action.sprint());
        if (!action.sprint()) mc.player.setSprinting(false);
        setKey(mc.options.keyAttack, action.attack());
        setKey(mc.options.keyUse, action.use());
        if (!active.started) {
            active.started = true;
            if (action.attack()) KeyMapping.click(mc.options.keyAttack.getKey());
            if (action.use()) KeyMapping.click(mc.options.keyUse.getKey());
        }
    }

    private void movement(MovementInputUpdateEvent event) {
        if (active == null || !canControl(Minecraft.getInstance())) return;
        ControlAction action = active.action;
        var input = event.getInput();
        input.up = action.forward() > 0;
        input.down = action.forward() < 0;
        input.left = action.strafe() > 0;
        input.right = action.strafe() < 0;
        input.forwardImpulse = action.forward();
        input.leftImpulse = action.strafe();
        // Preserve vanilla's pose and Swift Sneak scaling after replacing its input axes.
        LocalPlayer player = Minecraft.getInstance().player;
        if (player.isMovingSlowly()) {
            float speed = (float) player.getAttributeValue(Attributes.SNEAKING_SPEED);
            input.forwardImpulse *= speed;
            input.leftImpulse *= speed;
        }
        input.jumping = action.jump();
        input.shiftKeyDown = action.sneak();
    }

    private void postTick(ClientTickEvent.Post event) {
        if (active != null && active.started) {
            if (--active.remaining <= 0) finish("completed", null);
            else if (!canControl(Minecraft.getInstance())) finish("cancelled", "Game disconnected, paused, or a screen opened");
        }
        if (!pendingCameras.isEmpty()) {
            boolean ready = canControl(Minecraft.getInstance());
            finishCameras(ready ? "completed" : "cancelled", ready ? null : "Game is no longer controllable");
        }
        snapshot = captureState();
    }

    private void finishCameras(String status, String reason) {
        if (!status.equals("completed")) {
            while (Minecraft.getInstance().options.keyTogglePerspective.consumeClick()) {}
        }
        while (!pendingCameras.isEmpty()) remember(pendingCameras.removeFirst(), "camera", status, reason);
    }

    private void setKey(KeyMapping mapping, boolean down) {
        // Claim all control keys, including false values, so physical input does not mix with a command.
        setKeyState(mapping, down);
        pressedKeys.add(mapping);
    }

    private static void setKeyState(KeyMapping mapping, boolean down) {
        Minecraft mc = Minecraft.getInstance();
        var toggleOption = mapping == mc.options.keyShift ? mc.options.toggleCrouch()
                : mapping == mc.options.keySprint ? mc.options.toggleSprint() : null;
        // ToggleKeyMapping.setDown(true) flips state and setDown(false) is ignored.
        // Bypass that behavior synchronously, including when a GUI makes its key context inactive.
        boolean toggled = toggleOption != null && toggleOption.get();
        if (toggled) toggleOption.set(false);
        try {
            mapping.setDown(down);
        } finally {
            if (toggled) toggleOption.set(true);
        }
    }

    private void releaseKeys() {
        for (KeyMapping mapping : pressedKeys) {
            setKeyState(mapping, false);
            // A screen or overlay can prevent vanilla from consuming an injected click.
            while (mapping.consumeClick()) {}
        }
        pressedKeys.clear();
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null) {
            mc.player.setSprinting(false);
            mc.player.input.up = false;
            mc.player.input.down = false;
            mc.player.input.left = false;
            mc.player.input.right = false;
            mc.player.input.forwardImpulse = 0;
            mc.player.input.leftImpulse = 0;
            mc.player.input.jumping = false;
            mc.player.input.shiftKeyDown = false;
        }
    }

    private void finish(String status, String reason) {
        if (active != null) {
            remember(active.id, active.action.type(), status, reason);
            active = null;
        }
        releaseKeys();
    }

    private void remember(String id, String type, String status, String reason) {
        JsonObject result = new JsonObject();
        result.addProperty("id", id);
        result.addProperty("type", type);
        result.addProperty("status", status);
        result.addProperty("tick", tick);
        if (reason != null) result.addProperty("reason", reason);
        history.addFirst(result);
        while (history.size() > 32) history.removeLast();
    }

    @Override
    public JsonObject state() {
        return snapshot;
    }

    private CompletableFuture<JsonObject> onClientThread(Callable<JsonObject> task) {
        if (queuedTasks.incrementAndGet() > 16) {
            queuedTasks.decrementAndGet();
            return CompletableFuture.failedFuture(new BridgeServer.ApiException(429, "Client task queue is full"));
        }
        CompletableFuture<JsonObject> future = new CompletableFuture<>();
        Minecraft.getInstance().execute(() -> {
            try {
                if (!future.isDone()) future.complete(task.call());
            } catch (Throwable e) {
                future.completeExceptionally(e);
            } finally {
                queuedTasks.decrementAndGet();
            }
        });
        return future;
    }

    @Override
    public CompletableFuture<JsonObject> action(JsonObject body) {
        final ControlAction command;
        try {
            command = ControlAction.parse(body);
        } catch (IllegalArgumentException e) {
            return CompletableFuture.failedFuture(new BridgeServer.ApiException(400, e.getMessage()));
        }
        return onClientThread(() -> {
            Minecraft mc = Minecraft.getInstance();
            if (!command.type().equals("stop") && !canControl(mc)) {
                throw new BridgeServer.ApiException(409, "Enter a world, close menus and unpause before controlling");
            }
            String id = UUID.randomUUID().toString();
            switch (command.type()) {
                case "stop" -> {
                    finish("cancelled", "Stopped by client");
                    finishCameras("cancelled", "Stopped by client");
                    remember(id, "stop", "completed", null);
                }
                case "look" -> {
                    mc.player.setYRot(command.yaw());
                    mc.player.setXRot(command.pitch());
                    mc.player.setYHeadRot(command.yaw());
                    ShoulderCompat.look(command.yaw(), command.pitch());
                    // Refresh the target before publishing a state with the new rotation.
                    mc.gameRenderer.pick(1.0f);
                    remember(id, "look", "completed", null);
                }
                case "camera" -> {
                    if (command.cameraMode().equals("cycle")) {
                        if (pendingCameras.size() >= 16) throw new BridgeServer.ApiException(429, "Camera queue is full");
                        // Let vanilla and camera mods consume the real perspective binding.
                        // Shoulder Surfing has its own cycle, which CameraType.cycle() bypasses.
                        KeyMapping.click(mc.options.keyTogglePerspective.getKey());
                        pendingCameras.addLast(id);
                        break;
                    }
                    CameraType previous = mc.options.getCameraType();
                    CameraType next = switch (command.cameraMode()) {
                        case "first_person" -> CameraType.FIRST_PERSON;
                        case "third_person_back" -> CameraType.THIRD_PERSON_BACK;
                        case "third_person_front" -> CameraType.THIRD_PERSON_FRONT;
                        default -> throw new IllegalArgumentException("Unsupported camera mode");
                    };
                    // Same state changes as vanilla F5, regardless of keyboard remapping.
                    mc.options.setCameraType(next);
                    if (previous.isFirstPerson() != next.isFirstPerson()) {
                        mc.gameRenderer.checkEntityPostEffect(next.isFirstPerson() ? mc.getCameraEntity() : null);
                    }
                    mc.levelRenderer.needsUpdate();
                    remember(id, "camera", "completed", null);
                }
                case "hotbar" -> {
                    mc.player.getInventory().selected = command.slot() - 1;
                    remember(id, "hotbar", "completed", null);
                }
                default -> {
                    if (active != null) finish("replaced", "Replaced by a new timed action");
                    active = new ActiveAction(id, command);
                }
            }
            snapshot = captureState();
            JsonObject ack = new JsonObject();
            ack.addProperty("ok", true);
            ack.addProperty("action_id", id);
            return ack;
        });
    }

    @Override
    public CompletableFuture<JsonObject> observe(int radius) {
        return onClientThread(() -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.player == null || mc.level == null) throw new BridgeServer.ApiException(409, "No world loaded");
            JsonObject observation = captureState();
            observation.addProperty("radius", radius);
            observation.addProperty("air_omitted", true);
            observation.addProperty("unloaded_omitted", true);
            BlockPos center = mc.player.blockPosition();
            observation.add("center", blockPos(center));
            JsonArray blocks = new JsonArray();
            for (BlockPos pos : BlockPos.betweenClosed(center.offset(-radius, -radius, -radius),
                    center.offset(radius, radius, radius))) {
                if (!mc.level.hasChunkAt(pos)) continue;
                var block = mc.level.getBlockState(pos);
                if (block.isAir()) continue;
                JsonObject entry = blockPos(pos);
                entry.addProperty("id", BuiltInRegistries.BLOCK.getKey(block.getBlock()).toString());
                entry.addProperty("collision", !block.getCollisionShape(mc.level, pos).isEmpty());
                blocks.add(entry);
            }
            observation.add("blocks", blocks);
            JsonArray entities = new JsonArray();
            var nearby = mc.level.getEntities(mc.player, mc.player.getBoundingBox().inflate(radius), Entity::isAlive);
            nearby.sort(Comparator.comparingDouble(entity -> entity.distanceToSqr(mc.player)));
            for (int i = 0; i < Math.min(32, nearby.size()); i++) entities.add(entity(nearby.get(i), mc.player));
            observation.add("entities", entities);
            observation.addProperty("entities_truncated", nearby.size() > 32);
            return observation;
        });
    }

    private JsonObject captureState() {
        Minecraft mc = Minecraft.getInstance();
        JsonObject state = new JsonObject();
        state.addProperty("ok", true);
        state.addProperty("tick", tick);
        state.addProperty("time_ms", System.currentTimeMillis());
        state.addProperty("connected", mc.player != null && mc.level != null);
        state.addProperty("paused", mc.isPaused());
        state.addProperty("can_control", canControl(mc));
        state.addProperty("camera", mc.options.getCameraType().name().toLowerCase(java.util.Locale.ROOT));
        String perspective = ShoulderCompat.perspective();
        state.addProperty("camera_perspective", perspective != null ? perspective
                : mc.options.getCameraType().name().toLowerCase(java.util.Locale.ROOT));
        if (mc.screen == null) state.add("screen", JsonNull.INSTANCE);
        else state.addProperty("screen", mc.screen.getClass().getSimpleName());
        JsonObject ongoing = null;
        if (active != null) {
            ongoing = new JsonObject();
            ongoing.addProperty("id", active.id);
            ongoing.addProperty("type", active.action.type());
            ongoing.addProperty("remaining_ticks", active.remaining);
        }
        state.add("active_action", ongoing == null ? JsonNull.INSTANCE : ongoing);
        state.add("last_action", history.isEmpty() ? JsonNull.INSTANCE : history.peekFirst().deepCopy());
        JsonArray results = new JsonArray();
        for (JsonObject entry : history) results.add(entry.deepCopy());
        state.add("recent_actions", results);
        if (mc.player == null || mc.level == null) return state;
        LocalPlayer player = mc.player;
        state.addProperty("dimension", mc.level.dimension().location().toString());
        JsonObject info = new JsonObject();
        info.add("position", vector(player.position()));
        JsonObject rotation = new JsonObject();
        rotation.addProperty("yaw", player.getYRot());
        rotation.addProperty("pitch", player.getXRot());
        info.add("rotation", rotation);
        float[] cameraRotation = ShoulderCompat.rotation();
        JsonObject viewRotation = rotation.deepCopy();
        if (cameraRotation != null) {
            viewRotation.addProperty("yaw", cameraRotation[0]);
            viewRotation.addProperty("pitch", cameraRotation[1]);
        }
        state.add("view_rotation", viewRotation);
        info.add("velocity", vector(player.getDeltaMovement()));
        info.addProperty("health", player.getHealth());
        info.addProperty("max_health", player.getMaxHealth());
        info.addProperty("food", player.getFoodData().getFoodLevel());
        info.addProperty("saturation", player.getFoodData().getSaturationLevel());
        info.addProperty("air", player.getAirSupply());
        info.addProperty("on_ground", player.onGround());
        info.addProperty("horizontal_collision", player.horizontalCollision);
        info.addProperty("sprinting", player.isSprinting());
        info.addProperty("sneaking", player.isShiftKeyDown());
        info.addProperty("selected_slot", player.getInventory().selected + 1);
        info.add("held_item", item(player.getMainHandItem()));
        if (mc.gameMode != null) info.addProperty("game_mode", mc.gameMode.getPlayerMode().getName());
        state.add("player", info);
        JsonArray inventory = new JsonArray();
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
            ItemStack stack = player.getInventory().getItem(slot);
            if (stack.isEmpty()) continue;
            JsonObject entry = item(stack);
            entry.addProperty("slot", slot);
            if (slot < 9) entry.addProperty("hotbar_slot", slot + 1);
            inventory.add(entry);
        }
        state.add("inventory", inventory);
        state.add("crosshair", crosshair(mc));
        return state;
    }

    private static JsonObject item(ItemStack stack) {
        JsonObject item = new JsonObject();
        item.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        item.addProperty("count", stack.getCount());
        item.addProperty("name", stack.getHoverName().getString());
        return item;
    }

    private static JsonObject crosshair(Minecraft mc) {
        JsonObject target = new JsonObject();
        if (mc.hitResult == null) {
            target.addProperty("type", "miss");
            return target;
        }
        target.addProperty("type", mc.hitResult.getType().name().toLowerCase(java.util.Locale.ROOT));
        target.add("position", vector(mc.hitResult.getLocation()));
        target.addProperty("distance", mc.player.getEyePosition().distanceTo(mc.hitResult.getLocation()));
        if (mc.hitResult instanceof BlockHitResult block && mc.hitResult.getType() == net.minecraft.world.phys.HitResult.Type.BLOCK) {
            target.add("block", blockPos(block.getBlockPos()));
            target.addProperty("face", block.getDirection().getName());
            target.addProperty("id", BuiltInRegistries.BLOCK.getKey(mc.level.getBlockState(block.getBlockPos()).getBlock()).toString());
        } else if (mc.hitResult instanceof EntityHitResult hit) {
            target.add("entity", entity(hit.getEntity(), mc.player));
        }
        return target;
    }

    private static JsonObject entity(Entity entity, LocalPlayer player) {
        JsonObject entry = new JsonObject();
        entry.addProperty("id", entity.getId());
        entry.addProperty("type", BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString());
        entry.addProperty("name", entity.getName().getString());
        entry.add("position", vector(entity.position()));
        entry.addProperty("distance", entity.distanceTo(player));
        return entry;
    }

    private static JsonObject vector(Vec3 position) {
        JsonObject json = new JsonObject();
        json.addProperty("x", position.x);
        json.addProperty("y", position.y);
        json.addProperty("z", position.z);
        return json;
    }

    private static JsonObject blockPos(BlockPos position) {
        JsonObject json = new JsonObject();
        json.addProperty("x", position.getX());
        json.addProperty("y", position.getY());
        json.addProperty("z", position.getZ());
        return json;
    }

    private static final class ActiveAction {
        final String id;
        final ControlAction action;
        int remaining;
        boolean started;

        ActiveAction(String id, ControlAction action) {
            this.id = id;
            this.action = action;
            this.remaining = action.ticks();
        }
    }
}
