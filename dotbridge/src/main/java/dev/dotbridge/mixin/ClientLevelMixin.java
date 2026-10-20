package dev.dotbridge.mixin;

import dev.dotbridge.BlockConfirmation;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(value = ClientLevel.class, remap = false)
abstract class ClientLevelMixin {
    @Inject(method = "setServerVerifiedBlockState(Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;I)V",
            at = @At("TAIL"), remap = false)
    private void dotbridge$serverVerified(BlockPos position, BlockState state, int flags, CallbackInfo callback) {
        BlockConfirmation.serverVerified(position, state);
    }
}
