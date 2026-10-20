package dev.dotbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.protocol.game.ServerboundContainerClickPacket;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.inventory.CraftingMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.ResultSlot;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayList;
import java.util.List;

/** Slot IDs refer to the actual menu, independently of Spatial GUI's visual transforms.
 * All methods must run on the Minecraft client thread. One click may be pending at a time.
 */
public final class InventoryController {
    private static final int MAX_SLOTS = 256;
    private Pending pending;
    private Pending recovery;
    private InventoryRecovery recoveryGate;

    public boolean active() { return pending != null; }

    public JsonObject start(String id, JsonObject body, Minecraft mc, long tick) {
        InventoryCommand command = InventoryCommand.parse(body);
        updateRecovery(mc, tick);
        if (recovery != null) throw new IllegalStateException("Unconfirmed click: wait for server updates and GET /v1/inventory before another action; reconnect if no update arrives");
        if (pending != null) throw new IllegalStateException("An inventory action is already awaiting confirmation");
        requireReady(mc);
        AbstractContainerMenu menu = mc.player.containerMenu;
        if (menu.slots.size() > MAX_SLOTS) throw new IllegalStateException("Menu exceeds the supported slot limit");
        if (command.operation().equals("open")) {
            if (mc.screen != null || menu != mc.player.inventoryMenu)
                throw new IllegalStateException("Close the current screen before opening the player inventory");
            pending = new Pending(id, command, menu, tick);
            mc.setScreen(new InventoryScreen(mc.player));
        } else if (command.operation().equals("close")) {
            requireContainerScreen(mc, menu);
            if (!menu.getCarried().isEmpty())
                throw new IllegalStateException("Put the cursor stack in a slot before closing");
            if (hasCraftingIngredients(menu))
                throw new IllegalStateException("Empty the crafting grid before closing to avoid dropping ingredients");
            pending = new Pending(id, command, menu, tick);
            mc.player.closeContainer();
            mc.setScreen(null);
        } else {
            requireContainerScreen(mc, menu);
            requireClick(command, mc, menu);
            pending = new Pending(id, command, menu, tick);
            // Vanilla gameMode.handleInventoryMouseClick predicts locally and tells the server
            // those changes are already known. A correct prediction receives no acknowledgement.
            // Sending the normal click with no local prediction leaves the server's remote-slot
            // cache unchanged, so its actual changes are synchronized back by vanilla.
            // No state-ID forgery, container command, creative packet or screen coordinates.
            mc.getConnection().send(new ServerboundContainerClickPacket(menu.containerId, menu.getStateId(),
                    command.slot(), command.button(), clickType(command.clickType()),
                    menu.getCarried().copy(), new Int2ObjectOpenHashMap<>()));
        }
        JsonObject accepted = base(pending, "accepted", tick);
        accepted.addProperty("ok", true);
        return accepted;
    }

    /** Emits exactly one terminal result; absence of an explicit server update is never success. */
    public JsonObject tick(Minecraft mc, long tick) {
        updateRecovery(mc, tick);
        if (pending == null) return null;
        Pending action = pending;
        try {
            requireReady(mc);
        } catch (IllegalStateException e) {
            return finish(mc, "cancelled", e.getMessage(), tick, action.command.operation().equals("click"));
        }
        if (action.command.operation().equals("open")) {
            boolean opened = mc.screen instanceof AbstractContainerScreen<?> screen && screen.getMenu() == action.menu;
            return finish(mc, opened ? "completed" : "failed", opened ? null : "inventory_screen_did_not_open", tick, false);
        }
        if (action.command.operation().equals("close")) {
            boolean closed = mc.screen == null;
            return finish(mc, closed ? "completed" : "failed", closed ? null : "inventory_screen_did_not_close", tick, false);
        }
        if (mc.player.containerMenu != action.menu
                || !(mc.screen instanceof AbstractContainerScreen<?> screen) || screen.getMenu() != action.menu)
            return finish(mc, "cancelled", "container_changed_while_waiting_for_server", tick, true);
        List<ItemStack> now = copySlots(action.menu);
        ItemStack cursor = action.menu.getCarried();
        int state = action.menu.getStateId();
        if (state != action.lastState || different(action.lastSlots, now) || !ItemStack.matches(action.lastCursor, cursor)) {
            action.lastChange = tick;
            action.lastSlots = now;
            action.lastCursor = cursor.copy();
            action.sawServerRevision |= state != action.initialState;
            action.lastState = state;
        }
        boolean slotChanged = !ItemStack.matches(action.beforeSlots.get(action.command.slot()), now.get(action.command.slot()));
        boolean cursorChanged = !ItemStack.matches(action.beforeCursor, cursor);
        boolean resultSlot = action.menu.getSlot(action.command.slot()) instanceof ResultSlot;
        boolean effect = slotChanged || (resultSlot && cursorChanged && different(action.beforeSlots, now));
        // PICKUP changes the carried stack as well as the slot; wait for both server packets.
        // QUICK_MOVE and SWAP preserve the cursor. Item overrides with other behavior remain
        // uncertain instead of being reported as a successful standard transfer.
        effect &= action.command.clickType().equals("pickup") ? cursorChanged : !cursorChanged;
        if (InventoryCommand.settled(tick, action.lastChange, action.sawServerRevision, effect, 2))
            return finish(mc, "completed", null, tick, false);
        if (tick - action.startedTick >= action.command.timeoutTicks())
            return finish(mc, "failed", "server_confirmation_timeout_observe_inventory_before_retry", tick, true);
        return null;
    }

    public JsonObject cancel(String reason, long tick) {
        if (pending == null) return null;
        return finish(Minecraft.getInstance(), "cancelled", reason, tick, pending.command.operation().equals("click"));
    }

    public JsonObject status() {
        if (pending == null) return null;
        JsonObject result = base(pending, "executing", pending.startedTick);
        result.addProperty("started_tick", pending.startedTick);
        result.addProperty("container_id", pending.menu.containerId);
        result.addProperty("state_id", pending.initialState);
        if (pending.command.operation().equals("click")) result.addProperty("slot", pending.command.slot());
        return result;
    }

    /** Reading a stable authoritative menu explicitly clears the retry barrier. */
    public JsonObject observe(Minecraft mc, long tick) {
        updateRecovery(mc, tick);
        boolean recovered = recovery != null && recoveryGate.canObserveRecovery(tick);
        if (recovered) clearRecovery();
        JsonObject result = snapshot(mc);
        result.addProperty("recovery_required", recovery != null);
        result.addProperty("recovery_acknowledged", recovered);
        if (recovery != null) {
            result.addProperty("uncertain_action_id", recovery.id);
            result.addProperty("recovery_reason", "Wait for authoritative server updates to settle, then observe again; reconnect if none arrive");
        }
        return result;
    }

    private void updateRecovery(Minecraft mc, long tick) {
        if (recovery == null) return;
        if (mc.player == null || mc.getConnection() == null || mc.player.containerMenu != recovery.menu) {
            clearRecovery();
            return;
        }
        List<ItemStack> now = copySlots(recovery.menu);
        ItemStack cursor = recovery.menu.getCarried();
        boolean changed = different(recovery.lastSlots, now) || !ItemStack.matches(recovery.lastCursor, cursor);
        recoveryGate.update(recovery.menu.getStateId(), changed, tick);
        recovery.lastSlots = now;
        recovery.lastCursor = cursor.copy();
    }

    private void clearRecovery() { recovery = null; recoveryGate = null; }

    public static JsonObject snapshot(Minecraft mc) {
        JsonObject result = new JsonObject();
        result.addProperty("available", mc.player != null);
        if (mc.player == null) return result;
        AbstractContainerMenu menu = mc.player.containerMenu;
        boolean shown = mc.screen instanceof AbstractContainerScreen<?> screen && screen.getMenu() == menu;
        result.addProperty("open", shown);
        result.addProperty("container_id", menu.containerId);
        result.addProperty("state_id", menu.getStateId());
        result.addProperty("slot_count", menu.slots.size());
        result.addProperty("truncated", menu.slots.size() > MAX_SLOTS);
        result.addProperty("menu_kind", menu instanceof InventoryMenu ? "player_inventory"
                : menu instanceof CraftingMenu ? "crafting_table" : "container");
        result.addProperty("confirmation_mode", "server_updates_without_client_prediction");
        result.add("cursor", stack(menu.getCarried()));
        JsonArray slots = new JsonArray();
        for (int i = 0; i < Math.min(menu.slots.size(), MAX_SLOTS); i++) {
            Slot slot = menu.getSlot(i);
            JsonObject entry = stack(slot.getItem());
            entry.addProperty("slot", i);
            entry.addProperty("inventory_index", slot.getContainerSlot());
            entry.addProperty("role", role(menu, slot, i));
            entry.addProperty("may_pickup", slot.mayPickup(mc.player));
            entry.addProperty("may_place_cursor", !menu.getCarried().isEmpty() && slot.mayPlace(menu.getCarried()));
            slots.add(entry);
        }
        result.add("slots", slots);
        return result;
    }

    private JsonObject finish(Minecraft mc, String status, String reason, long tick, boolean uncertain) {
        Pending action = pending;
        pending = null;
        if (uncertain && action.command.operation().equals("click")) {
            recovery = action;
            recoveryGate = new InventoryRecovery(action.initialState, action.lastState,
                    action.lastChange, action.sawServerRevision);
        }
        JsonObject result = base(action, status, tick);
        result.addProperty("ok", status.equals("completed"));
        if (reason != null) result.addProperty("reason", reason);
        JsonObject details = new JsonObject();
        details.addProperty("container_id", action.menu.containerId);
        details.addProperty("state_id", action.menu.getStateId());
        details.addProperty("confirmation", action.command.operation().equals("click") ? "server_updates" : "local_screen");
        details.addProperty("uncertain", uncertain);
        details.addProperty("recovery_required", recovery != null);
        details.add("cursor", stack(action.menu.getCarried()));
        JsonArray changed = new JsonArray();
        if (mc.player != null && mc.player.containerMenu == action.menu) {
            for (int i = 0; i < action.beforeSlots.size(); i++) {
                ItemStack current = action.menu.getSlot(i).getItem();
                if (!ItemStack.matches(action.beforeSlots.get(i), current)) {
                    JsonObject change = new JsonObject();
                    change.addProperty("slot", i);
                    change.add("before", stack(action.beforeSlots.get(i)));
                    change.add("after", stack(current));
                    changed.add(change);
                }
            }
        }
        details.add("changed_slots", changed);
        result.add("details", details);
        return result;
    }

    private static void requireReady(Minecraft mc) {
        if (mc.player == null || mc.level == null || mc.gameMode == null || mc.getConnection() == null)
            throw new IllegalStateException("Game is disconnected");
        if (mc.player.isDeadOrDying() || mc.isPaused() || mc.getOverlay() != null)
            throw new IllegalStateException("Game is paused, player is dead, or an overlay is open");
        if (mc.player.isSpectator() || mc.gameMode.hasInfiniteItems() || mc.screen instanceof CreativeModeInventoryScreen)
            throw new IllegalStateException("Inventory automation requires survival or adventure mode");
    }

    private static void requireContainerScreen(Minecraft mc, AbstractContainerMenu menu) {
        if (!(mc.screen instanceof AbstractContainerScreen<?> screen) || screen.getMenu() != menu)
            throw new IllegalStateException("Open the inventory or a container before sending slot actions");
    }

    private static void requireClick(InventoryCommand command, Minecraft mc, AbstractContainerMenu menu) {
        if (menu.containerId != command.containerId() || menu.getStateId() != command.stateId())
            throw new IllegalStateException("Stale container_id or state_id; observe the menu again");
        if (command.slot() >= menu.slots.size()) throw new IllegalStateException("Slot is not present in this menu");
        Slot slot = menu.getSlot(command.slot());
        ItemStack item = slot.getItem();
        ItemStack cursor = menu.getCarried();
        requireStack(item, command.expectedItem(), command.expectedCount(), command.expectedComponents(), "slot");
        requireStack(cursor, command.expectedCursorItem(), command.expectedCursorCount(), command.expectedCursorComponents(), "cursor");
        if (!slot.isActive()) throw new IllegalStateException("Slot is inactive");
        if (!item.isEmpty() && !slot.mayPickup(mc.player)) throw new IllegalStateException("Slot does not allow taking this item");
        if (slot instanceof ResultSlot) {
            if (item.isEmpty()) throw new IllegalStateException("No observed crafting result is available");
            if (!command.clickType().equals("pickup") || command.button() != 0)
                throw new IllegalStateException("Crafting result requires one left pickup per confirmed action");
            if (!cursor.isEmpty() && (!ItemStack.isSameItemSameComponents(item, cursor)
                    || item.getCount() + cursor.getCount() > cursor.getMaxStackSize()))
                throw new IllegalStateException("Cursor cannot accept the complete observed crafting result");
        }
        if (command.clickType().equals("quick_move")) {
            if (item.isEmpty() || !cursor.isEmpty())
                throw new IllegalStateException("quick_move requires a nonempty source and an empty cursor");
        } else if (command.clickType().equals("swap")) {
            if (!cursor.isEmpty()) throw new IllegalStateException("swap requires an empty cursor");
            ItemStack hotbar = mc.player.getInventory().getItem(command.button());
            requireStack(hotbar, command.expectedHotbarItem(), command.expectedHotbarCount(), null, "hotbar");
            if (!hotbar.isEmpty() && (!slot.mayPlace(hotbar) || hotbar.getCount() > slot.getMaxStackSize(hotbar)))
                throw new IllegalStateException("Swap would not fit this slot and could drop an item");
            if (ItemStack.matches(item, hotbar)) throw new IllegalStateException("Swap would not change the slot");
        } else if (item.isEmpty() && cursor.isEmpty()) {
            throw new IllegalStateException("Both slot and cursor are empty");
        } else if (!cursor.isEmpty() && !slot.mayPlace(cursor)
                && (item.isEmpty() || !ItemStack.isSameItemSameComponents(item, cursor))) {
            throw new IllegalStateException("Slot cannot accept the cursor stack");
        }
    }

    private static boolean hasCraftingIngredients(AbstractContainerMenu menu) {
        int end = menu instanceof InventoryMenu ? 5 : menu instanceof CraftingMenu ? 10 : 1;
        for (int i = 1; i < end; i++) if (!menu.getSlot(i).getItem().isEmpty()) return true;
        return false;
    }

    private static String role(AbstractContainerMenu menu, Slot slot, int i) {
        if (slot instanceof ResultSlot) return "crafting_result";
        if (menu instanceof InventoryMenu) {
            if (i >= 1 && i <= 4) return "crafting_grid";
            if (i >= 5 && i <= 8) return "armor";
            if (i >= 36 && i <= 44) return "hotbar";
            if (i == 45) return "offhand";
            return "inventory";
        }
        if (menu instanceof CraftingMenu && i >= 1 && i <= 9) return "crafting_grid";
        return "container_slot";
    }

    private static void requireStack(ItemStack stack, String item, int count, Integer components, String label) {
        String actualItem = stack.isEmpty() ? "minecraft:air" : BuiltInRegistries.ITEM.getKey(stack.getItem()).toString();
        int actualCount = stack.isEmpty() ? 0 : stack.getCount();
        if (!actualItem.equals(item) || actualCount != count || (components != null && components != stack.getComponents().hashCode()))
            throw new IllegalStateException("Observed " + label + " changed; refresh its item, count and components before retry");
    }

    private static JsonObject stack(ItemStack stack) {
        JsonObject result = new JsonObject();
        result.addProperty("item", stack.isEmpty() ? "minecraft:air" : BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        result.addProperty("count", stack.isEmpty() ? 0 : stack.getCount());
        if (!stack.isEmpty()) {
            result.addProperty("name", stack.getHoverName().getString());
            result.addProperty("components_hash", stack.getComponents().hashCode());
        }
        return result;
    }

    private static ClickType clickType(String value) {
        return switch (value) { case "quick_move" -> ClickType.QUICK_MOVE; case "swap" -> ClickType.SWAP; default -> ClickType.PICKUP; };
    }

    private static List<ItemStack> copySlots(AbstractContainerMenu menu) {
        List<ItemStack> result = new ArrayList<>(menu.slots.size());
        for (Slot slot : menu.slots) result.add(slot.getItem().copy());
        return result;
    }

    private static boolean different(List<ItemStack> before, List<ItemStack> after) {
        if (before.size() != after.size()) return true;
        for (int i = 0; i < before.size(); i++) if (!ItemStack.matches(before.get(i), after.get(i))) return true;
        return false;
    }

    private static JsonObject base(Pending action, String status, long tick) {
        JsonObject result = new JsonObject();
        result.addProperty("id", action.id);
        result.addProperty("type", "inventory");
        result.addProperty("operation", action.command.operation());
        result.addProperty("status", status);
        result.addProperty("tick", tick);
        return result;
    }

    private static final class Pending {
        final String id;
        final InventoryCommand command;
        final AbstractContainerMenu menu;
        final long startedTick;
        final int initialState;
        final List<ItemStack> beforeSlots;
        final ItemStack beforeCursor;
        int lastState;
        long lastChange;
        boolean sawServerRevision;
        List<ItemStack> lastSlots;
        ItemStack lastCursor;
        Pending(String id, InventoryCommand command, AbstractContainerMenu menu, long tick) {
            this.id = id;
            this.command = command;
            this.menu = menu;
            startedTick = tick;
            initialState = lastState = menu.getStateId();
            beforeSlots = copySlots(menu);
            beforeCursor = menu.getCarried().copy();
            lastSlots = beforeSlots;
            lastCursor = beforeCursor;
            lastChange = tick;
        }
    }
}
