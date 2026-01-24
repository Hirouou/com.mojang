import { ActionFormData } from "@minecraft/server-ui";
import { getScore, setScore, OBJ } from "./mana_system.js";

const UPGRADES = [
  { name: "Mana Máxima", obj: OBJ.MANA_MAX, inc: 20, baseLv: 2 },
  { name: "Regen de Mana", obj: OBJ.MANA_REGEN, inc: 1, baseLv: 3 },
  { name: "Poder Mágico", obj: OBJ.POWER, inc: 1, baseLv: 4 }
];

function costLevels(up, cur) {
  return Math.max(up.baseLv, Math.floor(up.baseLv + cur / 20));
}

export async function openUpgradeMenu(player) {
  const form = new ActionFormData()
    .title("Tomo de Upgrades")
    .body(`Nível atual: ${player.level}\n\nEscolha um upgrade permanente:`);

  for (const up of UPGRADES) {
    const cur = getScore(player, up.obj, 0);
    const cost = costLevels(up, cur);
    form.button(`${up.name} (+${up.inc})\nCusto: ${cost} níveis`);
  }

  const res = await form.show(player);
  if (res.canceled) return;

  const up = UPGRADES[res.selection];
  const cur = getScore(player, up.obj, 0);
  const cost = costLevels(up, cur);

  if (player.level < cost) {
    player.sendMessage("§cXP insuficiente.");
    try { player.playSound("note.bass"); } catch {}
    return;
  }

  player.addLevels(-cost);
  setScore(player, up.obj, cur + up.inc);
  player.sendMessage("§aUpgrade realizado!");
  try { player.playSound("random.levelup"); } catch {}
}