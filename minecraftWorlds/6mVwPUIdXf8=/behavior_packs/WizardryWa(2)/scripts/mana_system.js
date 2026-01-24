import { world, system } from "@minecraft/server";

export const OBJ = {
  MANA_MAX: "wiz_mana_max",
  MANA_REGEN: "wiz_mana_regen",
  MANA_CUR: "wiz_mana_cur",
  POWER: "wiz_power"
};

function ensureObjective(name) {
  let obj = world.scoreboard.getObjective(name);
  if (!obj) obj = world.scoreboard.addObjective(name, name);
  return obj;
}

export function ensureObjectives() {
  for (const k of Object.values(OBJ)) ensureObjective(k);
}

function getId(player) {
  return player.scoreboardIdentity;
}

export function getScore(player, objectiveName, fallback) {
  const obj = ensureObjective(objectiveName);
  const id = getId(player);
  if (!id) return fallback;
  try {
    const v = obj.getScore(id);
    if (typeof v === "number") return v;
    obj.setScore(id, fallback);
    return fallback;
  } catch {
    obj.setScore(id, fallback);
    return fallback;
  }
}

export function setScore(player, objectiveName, value) {
  const obj = ensureObjective(objectiveName);
  const id = getId(player);
  if (!id) return;
  obj.setScore(id, Math.floor(value));
}

export function initPlayerStats(player) {
  // defaults (inteiros)
  if (getScore(player, OBJ.MANA_MAX, -1) < 0) setScore(player, OBJ.MANA_MAX, 80);
  if (getScore(player, OBJ.MANA_REGEN, -1) < 0) setScore(player, OBJ.MANA_REGEN, 2);
  if (getScore(player, OBJ.POWER, -1) < 0) setScore(player, OBJ.POWER, 0);

  const max = getScore(player, OBJ.MANA_MAX, 80);
  const cur = getScore(player, OBJ.MANA_CUR, -1);
  if (cur < 0) setScore(player, OBJ.MANA_CUR, max);
}

export function consumeMana(player, amount) {
  const cur = getScore(player, OBJ.MANA_CUR, 0);
  if (cur < amount) return false;
  setScore(player, OBJ.MANA_CUR, cur - amount);
  return true;
}

system.runInterval(() => {
  ensureObjectives();
  for (const p of world.getPlayers()) {
    initPlayerStats(p);
    const max = getScore(p, OBJ.MANA_MAX, 80);
    const cur = getScore(p, OBJ.MANA_CUR, max);
    const regen = getScore(p, OBJ.MANA_REGEN, 2);
    if (cur < max) setScore(p, OBJ.MANA_CUR, Math.min(max, cur + regen));
  }
}, 20);