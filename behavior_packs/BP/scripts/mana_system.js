import { world, system, DynamicPropertiesDefinition, MinecraftEntityTypes } from "@minecraft/server";

export const STATS = {
  MANA_MAX: "wiz_mana_max",
  MANA_REGEN: "wiz_mana_regen",
  MANA_CURRENT: "wiz_mana_cur",
  POWER: "wiz_power"
};

export function registerPlayerStats(propertyRegistry) {
  const def = new DynamicPropertiesDefinition();
  def.defineNumber(STATS.MANA_MAX);
  def.defineNumber(STATS.MANA_REGEN);
  def.defineNumber(STATS.MANA_CURRENT);
  def.defineNumber(STATS.POWER);
  propertyRegistry.registerEntityTypeDynamicProperties(def, MinecraftEntityTypes.player);
}

export function initPlayerStats(player) {
  if (typeof player.getDynamicProperty(STATS.MANA_MAX) !== "number") {
    player.setDynamicProperty(STATS.MANA_MAX, 80);
    player.setDynamicProperty(STATS.MANA_REGEN, 2);
    player.setDynamicProperty(STATS.MANA_CURRENT, 80);
    player.setDynamicProperty(STATS.POWER, 0);
  }
}

export function getStat(player, statKey) {
  const v = player.getDynamicProperty(statKey);
  return (typeof v === "number") ? v : 0;
}

export function setStat(player, statKey, value) {
  player.setDynamicProperty(statKey, value);
}

export function consumeMana(player, amount) {
  const cur = getStat(player, STATS.MANA_CURRENT);
  if (cur < amount) return false;
  setStat(player, STATS.MANA_CURRENT, cur - amount);
  return true;
}

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    initPlayerStats(player);
    const max = getStat(player, STATS.MANA_MAX);
    const cur = getStat(player, STATS.MANA_CURRENT);
    const regen = getStat(player, STATS.MANA_REGEN);
    if (max > 0 && cur < max) {
      setStat(player, STATS.MANA_CURRENT, Math.min(max, cur + regen));
    }
  }
}, 20);