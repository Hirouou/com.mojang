package dev.dotbridge.mixin;

import dev.dotbridge.BlockConfirmation;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundTakeItemEntityPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(value = ClientPacketListener.class, remap = false)
abstract class ClientPacketListenerMixin {
    // The first getEntity occurs after PacketUtils.ensureRunningOnSameThread,
    // and before vanilla shrinks the pickup stack or removes the entity.
    @Inject(method = "handleTakeItemEntity(Lnet/minecraft/network/protocol/game/ClientboundTakeItemEntityPacket;)V",
            at = @At(value = "INVOKE",
                    target = "Lnet/minecraft/client/multiplayer/ClientLevel;getEntity(I)Lnet/minecraft/world/entity/Entity;",
                    ordinal = 0, shift = At.Shift.BEFORE, remap = false), remap = false)
    private void dotbridge$confirmedPickup(ClientboundTakeItemEntityPacket packet, CallbackInfo callback) {
        BlockConfirmation.itemTaken(packet);
    }
}
