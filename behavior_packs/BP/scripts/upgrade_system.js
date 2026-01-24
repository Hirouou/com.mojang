import { ActionFormData } from "@minecraft/server-ui";
import { getStat, setStat, STATS } from "./mana_system.js";

const UPGRADES = [
  { name: "Mana Máxima", stat: STATS.MANA_MAX, increment: 20, base: 40 },
  { name: "Regen de Mana", stat: STATS.MANA_REGEN, increment: 1, base: 60 },
  { name: "Poder Mágico", stat: STATS.POWER, increment: 1, base: 80 }
];

function costFor(up, currentVal) {
  return Math.floor(up.base + Math.abs(currentVal) * 10);
}

export async function openUpgradeMenu(player) {
  const xp = player.getTotalXp();
  const form = new ActionFormData()
    .title("Tomo de Upgrades")
    .body(`XP Total: ${xp}\n\nEscolha um upgrade permanente:`);

  for (const up of UPGRADES) {
    const cur = getStat(player, up.stat);
    const cost = costFor(up, cur);
    form.button(`${up.name} (+${up.increment})\nCusto: ${cost} XP`);
  }

  const res = await form.show(player);
  if (res.canceled) return;

  const chosen = UPGRADES[res.selection];
  const cur = getStat(player, chosen.stat);
  const cost = costFor(chosen, cur);

  if (player.getTotalXp() < cost) {
    player.sendMessage("§cXP insuficiente.");
    try { player.playSound("note.bass"); } catch {}
    return;
  }

  player.addExperience(-cost);
  setStat(player, chosen.stat, cur + chosen.increment);
  player.sendMessage("§aUpgrade realizado!");
  try { player.playSound("random.levelup"); } catch {}
}