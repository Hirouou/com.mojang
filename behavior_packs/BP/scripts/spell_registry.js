import { consumeMana, getStat, STATS } from "./mana_system.js";

const COLORS = { VOID: "§5", FIRE: "§6" };

export const SPELLS = [
  {
    id: "shadow_golem",
    name: "Golem Sombrio",
    color: COLORS.VOID,
    type: "channeling",
    onStart: (player) => {
      const dir = player.getViewDirection();
      const spawnPos = { x: player.location.x + dir.x * 2, y: player.location.y, z: player.location.z + dir.z * 2 };
      const entity = player.dimension.spawnEntity("wizardry:shadow_golem", spawnPos);
      entity.triggerEvent("wizardry:set_growth_0");
      return { entity, growth: 0 };
    },
    onChannel: (player, ctx) => {
      if (!ctx?.entity || !ctx.entity.isValid()) return false;

      const drain = 2 + Math.floor(ctx.growth / 35);
      if (!consumeMana(player, drain)) {
        player.sendMessage("§cMana insuficiente!");
        return false;
      }

      const power = getStat(player, STATS.POWER);
      ctx.growth = Math.min(120, ctx.growth + 1 + power * 0.15);

      if (ctx.growth === 25) ctx.entity.triggerEvent("wizardry:set_growth_1");
      if (ctx.growth === 60) ctx.entity.triggerEvent("wizardry:set_growth_2");
      if (ctx.growth === 100) ctx.entity.triggerEvent("wizardry:set_growth_3");

      try { player.dimension.spawnParticle("minecraft:obsidian_glow_dust_particle", ctx.entity.location); } catch {}
      return true;
    },
    onStop: (player, ctx) => {
      if (ctx?.entity?.isValid()) {
        try { player.playSound("mob.iron_golem.hit"); } catch {}
      }
    }
  },
  { id: "teleport", name: "Teleporte", color: COLORS.VOID, type: "instant", manaCost: 12 },
  { id: "fireball", name: "Bola de Fogo", color: COLORS.FIRE, type: "instant", manaCost: 14 },
  { id: "fire", name: "Fogo", color: COLORS.FIRE, type: "instant", manaCost: 6 }
];