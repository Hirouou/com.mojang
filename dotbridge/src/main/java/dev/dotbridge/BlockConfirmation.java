package dev.dotbridge;

import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.protocol.game.ClientboundTakeItemEntityPacket;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Client-thread evidence for one watched block. Predicted local block changes
 * never enter this helper; only server-verified block updates and pickup packets do.
 * Nearby pickup packets identify actual collected items, not a block's loot table.
 */
public final class BlockConfirmation {
    private static final int MAX_PICKUP_TYPES = 64;
    private static BlockPos watched;
    private static BlockState verifiedState;
    private static long verifiedAtMs;
    private static final Map<String, Integer> PICKUPS = new HashMap<>();

    private BlockConfirmation() {}

    public static void watch(BlockPos position) {
        clear();
        watched = Objects.requireNonNull(position, "Watched block position").immutable();
    }

    public static void clear() {
        watched = null;
        verifiedState = null;
        verifiedAtMs = 0;
        PICKUPS.clear();
    }

    public static boolean received() {
        return verifiedState != null;
    }

    public static boolean confirmedChanged(BlockState original) {
        return confirmedBlockChanged(original);
    }

    /** Property-only updates to the same block cannot confirm a mined block. */
    public static boolean confirmedBlockChanged(BlockState original) {
        return original != null && verifiedState != null && !verifiedState.is(original.getBlock());
    }

    public static long confirmedAtMs() {
        return verifiedAtMs;
    }

    public static Map<String, Integer> pickups() {
        return Map.copyOf(PICKUPS);
    }

    /** Called only by ClientLevel.setServerVerifiedBlockState's tail injection. */
    public static void serverVerified(BlockPos position, BlockState state) {
        if (watched != null && watched.equals(position)) {
            verifiedState = state;
            verifiedAtMs = System.currentTimeMillis();
        }
    }

    /** Called on the game thread before vanilla shrinks/removes the packet's item entity. */
    public static void itemTaken(ClientboundTakeItemEntityPacket packet) {
        if (watched == null || packet.getAmount() <= 0) return;
        Minecraft minecraft = Minecraft.getInstance();
        if (!minecraft.isSameThread() || minecraft.player == null || minecraft.level == null
                || packet.getPlayerId() != minecraft.player.getId()) return;
        var entity = minecraft.level.getEntity(packet.getItemId());
        if (!(entity instanceof ItemEntity item)
                || item.position().distanceToSqr(Vec3.atCenterOf(watched)) > 2.5 * 2.5) return;
        var stack = item.getItem();
        if (stack.isEmpty()) return;
        int count = Math.min(packet.getAmount(), stack.getCount());
        if (count <= 0) return;
        String id = BuiltInRegistries.ITEM.getKey(stack.getItem()).toString();
        if (PICKUPS.size() >= MAX_PICKUP_TYPES && !PICKUPS.containsKey(id)) return;
        int previous = PICKUPS.getOrDefault(id, 0);
        PICKUPS.put(id, (int) Math.min(Integer.MAX_VALUE, previous + (long) count));
    }
}
