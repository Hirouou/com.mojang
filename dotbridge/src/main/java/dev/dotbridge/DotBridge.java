package dev.dotbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.mojang.logging.LogUtils;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.neoforged.neoforge.client.event.InputEvent;
import org.lwjgl.glfw.GLFW;
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
    private long snapshotSequence;
    private JsonObject observationCache;
    private long observationTick = -100;
    private int observationRadius;
    private final ControlLease lease = new ControlLease();
    private boolean explicitLease;
    private final EventBuffer events = new EventBuffer();
    private final InventoryController inventoryController = new InventoryController();
    private ControlAction goalInput;
    private String interruption = "not_authorized";
    private volatile long controlEpoch;
    private long lastManualNanos;
    private double mouseX, mouseY;
    private boolean mouseSampled, mouseGrabbed;
    private float previousHealth = Float.NaN;
    private JsonArray previousInventory;
    private long preWorkNanos;
    private double workMicros, workEwmaMicros, workMaxMicros;
    private final GoalController goals = new GoalController(new GoalController.Host() {
        public void control(ControlAction command) {
            boolean clickAttack = command.attack() && (goalInput == null || !goalInput.attack());
            boolean clickUse = command.use() && (goalInput == null || !goalInput.use());
            goalInput = command;
            applyInputs(command, clickAttack, clickUse);
        }
        public void release() { goalInput = null; releaseKeys(); }
        public void look(float yaw, float pitch) { setLook(yaw, pitch); }
        public void camera(String mode) { setCamera(mode); }
        public void event(String type, JsonObject details) { events.add(type, tick, details); }
        public void complete(String id, String type, String status, String reason, JsonObject details) {
            remember(id, type, status, reason, details);
        }
    });

    public DotBridge(IEventBus modBus) {
        modBus.addListener(this::setup);
        NeoForge.EVENT_BUS.addListener(this::preTick);
        NeoForge.EVENT_BUS.addListener(this::postTick);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, this::movement);
        NeoForge.EVENT_BUS.addListener(this::manualKey);
        NeoForge.EVENT_BUS.addListener(this::manualButton);
        NeoForge.EVENT_BUS.addListener(this::manualScroll);
        NeoForge.EVENT_BUS.addListener(EventPriority.LOWEST, VisibleWorld::recordFov);
    }

    private static JsonObject initialSnapshot() {
        JsonObject state = new JsonObject();
        state.addProperty("ok", true);
        state.addProperty("tick", 0);
        state.addProperty("sequence", 0);
        long captured = System.currentTimeMillis();
        state.addProperty("captured_at_ms", captured);
        state.addProperty("time_ms", captured);
        state.addProperty("snapshot_age_ms", 0);
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
        long start = System.nanoTime();
        tick++;
        Minecraft mc = Minecraft.getInstance();
        sampleManualMouse(mc);
        boolean operating = active != null || goals.active() || inventoryController.active() || !pendingCameras.isEmpty();
        if (operating && !lease.valid()) interrupt("heartbeat_expired");
        if ((active != null || goals.active() || !pendingCameras.isEmpty()) && !canControl(mc)) {
            interrupt("paused_menu_death_or_disconnect");
        }
        if (inventoryController.active() && !canUseInventory(mc)) interrupt("inventory_context_lost");
        if (active != null) {
            ControlAction action = active.action;
            String risk = (action.forward() != 0 || action.strafe() != 0)
                    ? VisibleWorld.movementRisk(mc, action.forward(), action.strafe()) : null;
            if (risk != null) {
                JsonObject detail = new JsonObject(); detail.addProperty("reason", risk);
                events.add("movement_blocked", tick, detail);
                finish("failed", risk);
            } else {
                applyInputs(action, !active.started && action.attack(), !active.started && action.use());
                if (!active.started) {
                    active.started = true;
                    active.startedTick = tick;
                    active.startedNanos = System.nanoTime();
                    events.add("action_started", tick, activeInfo());
                }
            }
        }
        if (goals.active()) goals.tick(mc, tick);
        JsonObject inventoryResult = inventoryController.tick(mc, tick);
        if (inventoryResult != null) recordResult(inventoryResult);
        preWorkNanos = System.nanoTime() - start;
    }

    private void applyInputs(ControlAction action, boolean attackClick, boolean useClick) {
        Minecraft mc = Minecraft.getInstance();
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
        if (attackClick) KeyMapping.click(mc.options.keyAttack.getKey());
        if (useClick) KeyMapping.click(mc.options.keyUse.getKey());
    }

    private static boolean canUseInventory(Minecraft mc) {
        return mc.player != null && mc.level != null && mc.gameMode != null
                && !mc.player.isDeadOrDying() && !mc.isPaused() && mc.getOverlay() == null
                && (mc.screen == null || mc.screen instanceof AbstractContainerScreen<?>);
    }

    private void manualKey(InputEvent.Key event) {
        if (event.getAction() != GLFW.GLFW_RELEASE) {
            var physical = InputConstants.getKey(event.getKey(), event.getScanCode());
            boolean preservePerspectiveClick = event.getAction() == GLFW.GLFW_PRESS
                    && !pendingCameras.isEmpty()
                    && Minecraft.getInstance().options.keyTogglePerspective.getKey().equals(physical);
            var restored = new java.util.HashMap<KeyMapping, Boolean>();
            for (KeyMapping key : pressedKeys) {
                if (key.getKey().equals(physical)) restored.put(key, key.isDown());
            }
            manualOverride();
            // Vanilla already processed this key. Restore only bindings owned by the bridge,
            // without toggling a ToggleKeyMapping a second time.
            restored.forEach(DotBridge::setKeyState);
            if (preservePerspectiveClick) KeyMapping.click(physical);
        }
    }
    private void manualButton(InputEvent.MouseButton.Pre event) {
        if (event.getAction() == GLFW.GLFW_PRESS) manualOverride();
    }
    private void manualScroll(InputEvent.MouseScrollingEvent event) { manualOverride(); }
    private void manualOverride() {
        lastManualNanos = System.nanoTime();
        interrupt("manual_input");
    }
    private void sampleManualMouse(Minecraft mc) {
        double x = mc.mouseHandler.xpos(), y = mc.mouseHandler.ypos();
        boolean grabbed = mc.mouseHandler.isMouseGrabbed();
        if (mouseSampled && grabbed && mouseGrabbed && (Math.abs(x - mouseX) > 0.5 || Math.abs(y - mouseY) > 0.5)) {
            manualOverride();
        }
        mouseX = x; mouseY = y; mouseGrabbed = grabbed; mouseSampled = true;
    }
    private void ensureManualIdle() {
        Minecraft mc = Minecraft.getInstance();
        if (System.nanoTime() - lastManualNanos < 250_000_000L) throw new BridgeServer.ApiException(409, "Manual input has priority; wait for physical controls to be released");
        for (KeyMapping key : new KeyMapping[]{mc.options.keyUp, mc.options.keyDown, mc.options.keyLeft,
                mc.options.keyRight, mc.options.keyJump, mc.options.keyShift, mc.options.keySprint,
                mc.options.keyAttack, mc.options.keyUse}) {
            InputConstants.Key physical = key.getKey();
            boolean down = physical.getType() == InputConstants.Type.KEYSYM && physical.getValue() >= 0
                    ? GLFW.glfwGetKey(mc.getWindow().getWindow(), physical.getValue()) == GLFW.GLFW_PRESS
                    : physical.getType() == InputConstants.Type.MOUSE && physical.getValue() >= 0
                    && GLFW.glfwGetMouseButton(mc.getWindow().getWindow(), physical.getValue()) == GLFW.GLFW_PRESS;
            if (down) throw new BridgeServer.ApiException(409, "Physical input is held; manual control has priority");
        }
    }
    private void interrupt(String reason) {
        controlEpoch++;
        interruption = reason;
        lease.revoke();
        explicitLease = false;
        cancelActions(reason);
    }
    private void cancelActions(String reason) {
        goals.cancel(reason, Minecraft.getInstance());
        JsonObject result = inventoryController.cancel(reason, tick);
        if (result != null) recordResult(result);
        finish("cancelled", reason);
        finishCameras("cancelled", reason);
        goalInput = null;
    }

    private void movement(MovementInputUpdateEvent event) {
        if (!canControl(Minecraft.getInstance())) return;
        ControlAction action = active != null ? active.action : goalInput;
        if (action == null) return;
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
        long start = System.nanoTime();
        if (active != null && active.started) {
            if (--active.remaining <= 0) finish("completed", null);
            else if (!canControl(Minecraft.getInstance())) finish("cancelled", "Game disconnected, paused, or a screen opened");
        }
        if (!pendingCameras.isEmpty()) {
            boolean ready = canControl(Minecraft.getInstance());
            finishCameras(ready ? "completed" : "cancelled", ready ? null : "Game is no longer controllable");
        }
        snapshot = captureState();
        detectChanges(snapshot);
        workMicros = (preWorkNanos + System.nanoTime() - start) / 1000.0;
        workEwmaMicros = workEwmaMicros == 0 ? workMicros : workEwmaMicros * 0.95 + workMicros * 0.05;
        workMaxMicros = Math.max(workMaxMicros, workMicros);
    }

    private void detectChanges(JsonObject state) {
        if (!state.has("player")) { previousInventory = null; previousHealth = Float.NaN; return; }
        float health = state.getAsJsonObject("player").get("health").getAsFloat();
        if (Float.isFinite(previousHealth) && health < previousHealth) {
            JsonObject detail = new JsonObject(); detail.addProperty("amount", previousHealth - health);
            detail.addProperty("health", health); events.add("damage", tick, detail);
        }
        previousHealth = health;
        JsonArray inventory = state.getAsJsonArray("inventory");
        if (previousInventory != null && !previousInventory.equals(inventory)) {
            JsonObject detail = new JsonObject(); detail.add("inventory", inventory.deepCopy());
            events.add("inventory_changed", tick, detail);
        }
        previousInventory = inventory.deepCopy();
    }

    private void finishCameras(String status, String reason) {
        if (!pendingCameras.isEmpty() && !status.equals("completed")) {
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
        if (pressedKeys.isEmpty()) return;
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
            JsonObject timing = new JsonObject();
            timing.addProperty("accepted_tick", active.acceptedTick);
            if (active.started) {
                timing.addProperty("started_tick", active.startedTick);
                timing.addProperty("start_delay_ms", (active.startedNanos - active.acceptedNanos) / 1_000_000.0);
            }
            remember(active.id, active.action.type(), status.equals("replaced") ? "cancelled" : status, reason, timing);
            active = null;
        }
        releaseKeys();
    }

    private void remember(String id, String type, String status, String reason) {
        remember(id, type, status, reason, new JsonObject());
    }
    private void remember(String id, String type, String status, String reason, JsonObject details) {
        JsonObject result = new JsonObject();
        result.addProperty("id", id);
        result.addProperty("type", type);
        result.addProperty("status", status);
        result.addProperty("tick", tick);
        result.addProperty("time_ms", System.currentTimeMillis());
        if (reason != null) result.addProperty("reason", reason);
        result.add("details", details);
        recordResult(result);
    }
    private void recordResult(JsonObject result) {
        history.addFirst(result.deepCopy());
        while (history.size() > 32) history.removeLast();
        events.add("action_completed", tick, result);
    }
    private JsonObject activeInfo() {
        if (active != null) {
            JsonObject info = new JsonObject();
            info.addProperty("id", active.id); info.addProperty("type", active.action.type());
            info.addProperty("status", active.started ? "executing" : "accepted");
            info.addProperty("remaining_ticks", active.remaining);
            info.addProperty("accepted_tick", active.acceptedTick);
            if (active.started) { info.addProperty("started_tick", active.startedTick);
                info.addProperty("start_delay_ms", (active.startedNanos - active.acceptedNanos) / 1_000_000.0); }
            return info;
        }
        if (goals.active()) return goals.status();
        return inventoryController.status();
    }
    @Override
    public JsonObject state() {
        JsonObject published = snapshot.deepCopy();
        if (published.has("captured_at_ms")) published.addProperty("snapshot_age_ms",
                Math.max(0, System.currentTimeMillis() - published.get("captured_at_ms").getAsLong()));
        return published;
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

    private void setLook(float yaw, float pitch) {
        Minecraft mc = Minecraft.getInstance();
        mc.player.setYRot(yaw); mc.player.setXRot(pitch); mc.player.setYHeadRot(yaw);
        ShoulderCompat.look(yaw, pitch);
        mc.gameRenderer.pick(1.0f);
    }
    private void setCamera(String mode) {
        Minecraft mc = Minecraft.getInstance();
        if (ShoulderCompat.changePerspective(mode)) return;
        CameraType previous = mc.options.getCameraType();
        CameraType next = switch (mode) {
            case "first_person" -> CameraType.FIRST_PERSON;
            case "third_person_back", "shoulder_surfing" -> CameraType.THIRD_PERSON_BACK;
            case "third_person_front" -> CameraType.THIRD_PERSON_FRONT;
            default -> throw new IllegalArgumentException("Unsupported camera mode");
        };
        mc.options.setCameraType(next);
        if (previous.isFirstPerson() != next.isFirstPerson()) {
            mc.gameRenderer.checkEntityPostEffect(next.isFirstPerson() ? mc.getCameraEntity() : null);
        }
        mc.levelRenderer.needsUpdate();
    }
    private JsonObject ack(String id) {
        snapshot = captureState();
        JsonObject result = new JsonObject();
        result.addProperty("ok", true); result.addProperty("action_id", id);
        result.addProperty("status", "accepted"); result.addProperty("accepted_tick", tick);
        result.addProperty("accepted_at_ms", System.currentTimeMillis());
        return result;
    }
    @Override
    public CompletableFuture<JsonObject> action(JsonObject body) {
        final ControlAction command;
        try { command = ControlAction.parse(body); }
        catch (IllegalArgumentException e) { return CompletableFuture.failedFuture(new BridgeServer.ApiException(400, e.getMessage())); }
        long epoch = controlEpoch;
        return onClientThread(() -> {
            Minecraft mc = Minecraft.getInstance();
            String id = UUID.randomUUID().toString();
            if (command.type().equals("stop")) {
                interrupt("stopped_by_controller");
                remember(id, "stop", "completed", null);
                return ack(id);
            }
            if (epoch != controlEpoch) throw new BridgeServer.ApiException(409, "Command cancelled by intervening stop or manual input");
            if (!canControl(mc)) throw new BridgeServer.ApiException(409, "Enter a world, close menus and unpause before controlling");
            ensureManualIdle();
            if (goals.active()) goals.cancel("replaced_by_manual_command", mc);
            if (inventoryController.active()) recordResult(inventoryController.cancel("replaced_by_manual_command", tick));
            // Legacy requests remain bounded at 200 ticks; a short implicit watchdog preserves their API.
            if (!lease.valid() || !explicitLease) lease.renew(10_000);
            interruption = null;
            switch (command.type()) {
                case "look" -> { setLook(command.yaw(), command.pitch()); remember(id, "look", "completed", null); }
                case "camera" -> {
                    if (command.cameraMode().equals("cycle")) {
                        if (pendingCameras.size() >= 16) throw new BridgeServer.ApiException(429, "Camera queue is full");
                        KeyMapping.click(mc.options.keyTogglePerspective.getKey()); pendingCameras.addLast(id);
                    } else { setCamera(command.cameraMode()); remember(id, "camera", "completed", null); }
                }
                case "hotbar" -> { mc.player.getInventory().selected = command.slot() - 1; remember(id, "hotbar", "completed", null); }
                default -> {
                    if (active != null) finish("cancelled", "replaced_by_new_action");
                    active = new ActiveAction(id, command, tick);
                }
            }
            return ack(id);
        });
    }
    @Override
    public CompletableFuture<JsonObject> heartbeat(JsonObject body) {
        long epoch = controlEpoch;
        return onClientThread(() -> {
            if (epoch != controlEpoch) throw new BridgeServer.ApiException(409, "Heartbeat cancelled by intervening stop or manual input");
            if (body.size() > 1 || body.size() == 1 && !body.has("ttl_ms")) throw new BridgeServer.ApiException(400, "Only ttl_ms is accepted");
            int ttl = 3000;
            if (body.has("ttl_ms")) {
                var value = body.get("ttl_ms");
                if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()
                        || !value.getAsString().matches("[0-9]{1,5}")) throw new BridgeServer.ApiException(400, "ttl_ms must be an integer");
                ttl = value.getAsInt();
            }
            if (ttl < 500 || ttl > 10000) throw new BridgeServer.ApiException(400, "ttl_ms must be 500..10000");
            ensureManualIdle();
            lease.renew(ttl);
            explicitLease = true;
            JsonObject result = new JsonObject(); result.addProperty("ok", true);
            result.addProperty("ttl_ms", ttl); result.addProperty("expires_at_ms", System.currentTimeMillis() + ttl);
            return result;
        });
    }
    @Override
    public CompletableFuture<JsonObject> goal(JsonObject body) {
        final GoalRequest request;
        try { request = GoalRequest.parse(body); }
        catch (IllegalArgumentException e) { return CompletableFuture.failedFuture(new BridgeServer.ApiException(400, e.getMessage())); }
        long epoch = controlEpoch;
        return onClientThread(() -> {
            Minecraft mc = Minecraft.getInstance();
            if (epoch != controlEpoch) throw new BridgeServer.ApiException(409, "Goal cancelled before dispatch");
            if (!canControl(mc)) throw new BridgeServer.ApiException(409, "Close menus and enter a live world");
            ensureManualIdle();
            if (!lease.valid()) throw new BridgeServer.ApiException(409, "Send heartbeat before starting a local goal");
            cancelActions("replaced_by_new_goal");
            interruption = null;
            String id = UUID.randomUUID().toString();
            try { goals.start(id, request, mc, tick); }
            catch (IllegalArgumentException e) { throw new BridgeServer.ApiException(400, e.getMessage()); }
            catch (IllegalStateException e) { throw new BridgeServer.ApiException(409, e.getMessage()); }
            events.add("action_accepted", tick, goals.status() == null ? new JsonObject() : goals.status());
            return ack(id);
        });
    }
    @Override
    public CompletableFuture<JsonObject> events(long after) { return onClientThread(() -> events.since(after)); }
    @Override
    public CompletableFuture<JsonObject> inventory() {
        return onClientThread(() -> {
            if (Minecraft.getInstance().player == null) throw new BridgeServer.ApiException(409, "No world loaded");
            JsonObject result = inventoryController.observe(Minecraft.getInstance(), tick);
            stamp(result); return result;
        });
    }
    @Override
    public CompletableFuture<JsonObject> inventoryAction(JsonObject body) {
        try { InventoryCommand.parse(body); }
        catch (IllegalArgumentException e) { return CompletableFuture.failedFuture(new BridgeServer.ApiException(400, e.getMessage())); }
        long epoch = controlEpoch;
        return onClientThread(() -> {
            if (epoch != controlEpoch) throw new BridgeServer.ApiException(409, "Inventory action cancelled before dispatch");
            Minecraft mc = Minecraft.getInstance();
            if (!canUseInventory(mc)) throw new BridgeServer.ApiException(409, "Inventory is unavailable in this context");
            ensureManualIdle();
            if (!lease.valid()) throw new BridgeServer.ApiException(409, "Send heartbeat before inventory actions");
            if (inventoryController.active()) throw new BridgeServer.ApiException(409, "Wait for the current inventory action to confirm");
            goals.cancel("inventory_requested", mc); finish("cancelled", "inventory_requested");
            finishCameras("cancelled", "inventory_requested");
            String id = UUID.randomUUID().toString();
            try { inventoryController.start(id, body, mc, tick); }
            catch (IllegalArgumentException e) { throw new BridgeServer.ApiException(400, e.getMessage()); }
            catch (IllegalStateException e) { throw new BridgeServer.ApiException(409, e.getMessage()); }
            interruption = null;
            return ack(id);
        });
    }
    @Override
    public CompletableFuture<JsonObject> observe(int radius) {
        return onClientThread(() -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.player == null || mc.level == null) throw new BridgeServer.ApiException(409, "No world loaded");
            if (observationCache != null && tick - observationTick < 4) {
                if (radius != observationRadius) throw new BridgeServer.ApiException(429, "Observation budget: wait four ticks before changing radius");
                JsonObject cached = observationCache.deepCopy();
                cached.addProperty("snapshot_age_ms", Math.max(0,
                        System.currentTimeMillis() - cached.get("captured_at_ms").getAsLong()));
                cached.addProperty("cached", true);
                return cached;
            }
            JsonObject result = captureState();
            JsonObject visible = VisibleWorld.observe(mc, radius);
            for (var entry : visible.entrySet()) result.add(entry.getKey(), entry.getValue());
            observationCache = result.deepCopy();
            observationTick = tick;
            observationRadius = radius;
            return result;
        });
    }
    private void stamp(JsonObject state) {
        state.addProperty("sequence", ++snapshotSequence);
        state.addProperty("tick", tick);
        state.addProperty("captured_at_ms", System.currentTimeMillis());
        state.addProperty("time_ms", state.get("captured_at_ms").getAsLong());
        state.addProperty("snapshot_age_ms", 0);
    }

    private JsonObject captureState() {
        Minecraft mc = Minecraft.getInstance();
        JsonObject state = new JsonObject();
        state.addProperty("ok", true);
        state.addProperty("tick", tick);
        stamp(state);
        state.addProperty("lease_remaining_ms", lease.remainingMs());
        state.addProperty("local_state", localState());
        if (interruption != null) state.addProperty("interruption_reason", interruption);
        JsonObject metrics = new JsonObject();
        metrics.addProperty("client_tick_work_us", workMicros);
        metrics.addProperty("client_tick_work_ewma_us", workEwmaMicros);
        metrics.addProperty("client_tick_work_max_us", workMaxMicros);
        metrics.addProperty("fps", mc.getFps());
        state.add("metrics", metrics);
        state.addProperty("connected", mc.player != null && mc.level != null);
        state.addProperty("paused", mc.isPaused());
        state.addProperty("can_control", canControl(mc));
        state.addProperty("camera", mc.options.getCameraType().name().toLowerCase(java.util.Locale.ROOT));
        String perspective = ShoulderCompat.perspective();
        state.addProperty("camera_perspective", perspective != null ? perspective
                : mc.options.getCameraType().name().toLowerCase(java.util.Locale.ROOT));
        if (mc.screen == null) state.add("screen", JsonNull.INSTANCE);
        else state.addProperty("screen", mc.screen.getClass().getSimpleName());
        JsonObject ongoing = activeInfo();
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
        state.add("crosshair", VisibleWorld.crosshair(mc));
        return state;
    }

    private static JsonObject item(ItemStack stack) {
        JsonObject item = new JsonObject();
        item.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        item.addProperty("count", stack.getCount());
        item.addProperty("name", stack.getHoverName().getString());
        return item;
    }

    private String localState() {
        if (inventoryController.active()) return "interacting";
        if (goals.active()) {
            JsonObject status = goals.status();
            if (status != null && status.has("local_state")) return status.get("local_state").getAsString();
            return "observing";
        }
        if (active != null) {
            if (active.action.attack()) return "mining";
            if (active.action.use()) return "interacting";
            if (active.action.forward() != 0 || active.action.strafe() != 0) return "moving";
            return "observing";
        }
        return interruption == null ? "idle" : "interrupted";
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
        final long acceptedTick;
        final long acceptedNanos = System.nanoTime();
        long startedTick, startedNanos;

        ActiveAction(String id, ControlAction action, long tick) {
            this.acceptedTick = tick;
            this.id = id;
            this.action = action;
            this.remaining = action.ticks();
        }
    }
}
