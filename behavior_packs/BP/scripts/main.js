import { world, system, ItemStack, ItemLockMode, DynamicPropertiesDefinition } from "@minecraft/server";
import { openUpgradeMenu } from "./upgrade_system.js";
import { initPlayerStats, getStat, STATS, registerPlayerStats } from "./mana_system.js";
import { SPELLS } from "./spell_registry.js";

// IDs
const WAND_ID = "wizardry:wand";
const TOME_ID = "wizardry:tome";
const LEFT_ID = "wizardry:arrow_left";
const RIGHT_ID = "wizardry:arrow_right";

// Hotbar fixo
const SLOT_TOME = 6;
const SLOT_LEFT = 7;
const SLOT_RIGHT = 8;

// Spell index no player
const P_SPELL_INDEX = "wiz_spell_idx";

// Canalizacao
const channeling = new Map(); // playerId -> { spell, ctx }

world.afterEvents.worldInitialize.subscribe((e) => {
  registerPlayerStats(e.propertyRegistry);

  const def = new DynamicPropertiesDefinition();
  def.defineNumber(P_SPELL_INDEX);
  e.propertyRegistry.registerEntityTypeDynamicProperties(def, "minecraft:player");

  world.sendMessage("§a[Wizardry] Base carregada. Slot 6 (tomo) e 7/8 (setas) travados.");
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  const p = ev.player;
  initPlayerStats(p);
  ensureKit(p);
});

function getInv(player) {
  return player.getComponent("minecraft:inventory")?.container;
}

function ensureLockedInSlot(player, slot, typeId) {
  const inv = getInv(player);
  if (!inv) return;

  const cur = inv.getItem(slot);
  if (!cur || cur.typeId !== typeId) {
    const it = new ItemStack(typeId, 1);
    it.lockMode = ItemLockMode.inventory;
    inv.setItem(slot, it);
  } else if (cur.lockMode !== ItemLockMode.inventory) {
    cur.lockMode = ItemLockMode.inventory;
    inv.setItem(slot, cur);
  }
}

function ensureKit(player) {
  const inv = getInv(player);
  if (!inv) return;

  // dá varinha se não tiver
  let hasWand = false;
  for (let i = 0; i < inv.size; i++) {
    if (inv.getItem(i)?.typeId === WAND_ID) { hasWand = true; break; }
  }
  if (!hasWand) inv.addItem(new ItemStack(WAND_ID, 1));

  ensureLockedInSlot(player, SLOT_TOME, TOME_ID);
  ensureLockedInSlot(player, SLOT_LEFT, LEFT_ID);
  ensureLockedInSlot(player, SLOT_RIGHT, RIGHT_ID);
}

// anti-perda
system.runInterval(() => {
  for (const p of world.getPlayers()) ensureKit(p);
}, 20);

function getSpellIndex(player) {
  const v = player.getDynamicProperty(P_SPELL_INDEX);
  return (typeof v === "number") ? v : 0;
}
function setSpellIndex(player, idx) {
  const max = SPELLS.length;
  const norm = ((idx % max) + max) % max;
  player.setDynamicProperty(P_SPELL_INDEX, norm);
}
function getSelectedSpell(player) {
  return SPELLS[getSpellIndex(player)] ?? SPELLS[0];
}
function cycleSpell(player, dir) {
  setSpellIndex(player, getSpellIndex(player) + (dir === "next" ? 1 : -1));
  const spell = getSelectedSpell(player);
  try { player.onScreenDisplay.setActionBar(`${spell.color}${spell.name}§r`); } catch {}
}

// cliques
world.afterEvents.itemUse.subscribe((ev) => {
  const player = ev.source;
  const itemId = ev.itemStack?.typeId;

  if (itemId === RIGHT_ID) return cycleSpell(player, "next");
  if (itemId === LEFT_ID) return cycleSpell(player, "prev");
  if (itemId === TOME_ID) return openUpgradeMenu(player);

  if (itemId === WAND_ID) {
    const spell = getSelectedSpell(player);
    if (spell.type !== "instant") return;

    const cost = spell.manaCost ?? 0;
    const curMana = getStat(player, STATS.MANA_CURRENT);
    if (curMana < cost) {
      player.sendMessage("§cMana insuficiente!");
      return;
    }
    player.setDynamicProperty(STATS.MANA_CURRENT, curMana - cost);

    // efeitos de teste
    if (spell.id === "teleport") {
      player.runCommand("tp @s ^ ^ ^6");
    } else if (spell.id === "fireball") {
      player.runCommand("summon minecraft:fireball ^ ^1.5 ^2");
    } else if (spell.id === "fire") {
      player.runCommand("fill ^-1 ^-1 ^1 ^1 ^-1 ^3 minecraft:fire replace air");
    }
  }
});

// canalizacao
world.afterEvents.itemStartUse.subscribe((ev) => {
  const player = ev.source;
  if (ev.itemStack?.typeId !== WAND_ID) return;

  const spell = getSelectedSpell(player);
  if (spell.type !== "channeling") return;

  try {
    const ctx = spell.onStart(player);
    channeling.set(player.id, { spell, ctx });
  } catch {
    player.sendMessage("§cFalha ao iniciar magia.");
  }
});

world.afterEvents.itemStopUse.subscribe((ev) => {
  const player = ev.source;
  if (ev.itemStack?.typeId !== WAND_ID) return;

  const st = channeling.get(player.id);
  if (!st) return;
  try { st.spell.onStop?.(player, st.ctx); } catch {}
  channeling.delete(player.id);
});

function manaBar(mana, max) {
  const len = 10;
  const filled = (max <= 0) ? 0 : Math.round((mana / max) * len);
  return "§b" + "█".repeat(filled) + "§7" + "░".repeat(len - filled) + "§r";
}

// HUD + tick canalizacao
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    initPlayerStats(player);

    const inv = getInv(player);
    const main = inv?.getItem(player.selectedSlotIndex);
    if (main?.typeId === WAND_ID) {
      const manaCur = Math.floor(getStat(player, STATS.MANA_CURRENT));
      const manaMax = Math.floor(getStat(player, STATS.MANA_MAX));
      const spell = getSelectedSpell(player);
      try {
        player.onScreenDisplay.setActionBar(
          `${spell.color}${spell.name}§r  §8|  §fMana ${manaBar(manaCur, manaMax)} §7${manaCur}/${manaMax}`
        );
      } catch {}
    }

    const st = channeling.get(player.id);
    if (st) {
      const ok = st.spell.onChannel?.(player, st.ctx);
      if (!ok) {
        try { st.spell.onStop?.(player, st.ctx); } catch {}
        channeling.delete(player.id);
      }
    }
  }
}, 1);