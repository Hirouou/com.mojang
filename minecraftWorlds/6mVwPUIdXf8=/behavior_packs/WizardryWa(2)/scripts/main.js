import { world, system, ItemStack, ItemLockMode } from "@minecraft/server";
import { openUpgradeMenu } from "./upgrade_system.js";
import { ensureObjectives, initPlayerStats, getScore, setScore, consumeMana, OBJ } from "./mana_system.js";
import { SPELLS } from "./spell_registry.js";

const WAND_ID = "wizardry:wand";
const TOME_ID = "wizardry:tome";
const LEFT_ID = "wizardry:arrow_left";
const RIGHT_ID = "wizardry:arrow_right";

const SLOT_TOME = 6;
const SLOT_LEFT = 7;
const SLOT_RIGHT = 8;

const OBJ_SPELL = "wiz_spell_idx";

function ensureSpellObjective() {
  let o = world.scoreboard.getObjective(OBJ_SPELL);
  if (!o) o = world.scoreboard.addObjective(OBJ_SPELL, OBJ_SPELL);
  return o;
}

function getSpellIndex(player) {
  const o = ensureSpellObjective();
  const id = player.scoreboardIdentity;
  if (!id) return 0;
  try { return o.getScore(id) ?? 0; } catch { o.setScore(id, 0); return 0; }
}

function setSpellIndex(player, idx) {
  const o = ensureSpellObjective();
  const id = player.scoreboardIdentity;
  if (!id) return;
  const max = SPELLS.length;
  const norm = ((idx % max) + max) % max;
  o.setScore(id, norm);
}

function selectedSpell(player) {
  return SPELLS[getSpellIndex(player)] ?? SPELLS[0];
}

function cycle(player, dir) {
  setSpellIndex(player, getSpellIndex(player) + (dir === "next" ? 1 : -1));
  const s = selectedSpell(player);
  try { player.onScreenDisplay.setActionBar(`${s.color}${s.name}§r`); } catch {}
}

function inv(player) {
  return player.getComponent("minecraft:inventory")?.container;
}

function ensureLocked(player, slot, typeId) {
  const c = inv(player);
  if (!c) return;
  const cur = c.getItem(slot);
  if (!cur || cur.typeId !== typeId) {
    const it = new ItemStack(typeId, 1);
    it.lockMode = ItemLockMode.inventory;
    c.setItem(slot, it);
  } else if (cur.lockMode !== ItemLockMode.inventory) {
    cur.lockMode = ItemLockMode.inventory;
    c.setItem(slot, cur);
  }
}

function ensureKit(player) {
  const c = inv(player);
  if (!c) return;
  let hasWand = false;
  for (let i = 0; i < c.size; i++) {
    if (c.getItem(i)?.typeId === WAND_ID) { hasWand = true; break; }
  }
  if (!hasWand) c.addItem(new ItemStack(WAND_ID, 1));
  ensureLocked(player, SLOT_TOME, TOME_ID);
  ensureLocked(player, SLOT_LEFT, LEFT_ID);
  ensureLocked(player, SLOT_RIGHT, RIGHT_ID);
}

const channeling = new Map(); // playerId -> { spell, ctx }

world.afterEvents.worldInitialize.subscribe(() => {
  ensureObjectives();
  ensureSpellObjective();
  world.sendMessage("§a[Wizardry] Scoreboard mode ativo (1.21.73).");
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  ensureObjectives();
  ensureSpellObjective();
  initPlayerStats(ev.player);
  ensureKit(ev.player);
});

// anti-perda + init
system.runInterval(() => {
  ensureObjectives();
  ensureSpellObjective();
  for (const p of world.getPlayers()) {
    initPlayerStats(p);
    ensureKit(p);
  }
}, 20);

// clicks
world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source;
  const id = ev.itemStack?.typeId;

  if (id === RIGHT_ID) return cycle(p, "next");
  if (id === LEFT_ID) return cycle(p, "prev");
  if (id === TOME_ID) return openUpgradeMenu(p);

  if (id === WAND_ID) {
    const s = selectedSpell(p);
    if (s.type !== "instant") return;

    const cost = s.manaCost ?? 0;
    if (!consumeMana(p, cost)) return p.sendMessage("§cMana insuficiente!");

    if (s.id === "teleport") p.runCommand("tp @s ^ ^ ^6");
    if (s.id === "fireball") p.runCommand("summon minecraft:fireball ^ ^1.5 ^2");
    if (s.id === "fire") p.runCommand("fill ^-1 ^-1 ^1 ^1 ^-1 ^3 minecraft:fire replace air");
  }
});

// Channeling events (best effort)
const ae = world.afterEvents;
const startEvt = ae.itemStartUse ?? ae.itemUseStart;
const stopEvt  = ae.itemStopUse ?? ae.itemUseStop;

if (startEvt?.subscribe) {
  startEvt.subscribe((ev) => {
    const p = ev.source;
    if (ev.itemStack?.typeId !== WAND_ID) return;
    const s = selectedSpell(p);
    if (s.type !== "channeling") return;
    try { channeling.set(p.id, { spell: s, ctx: s.onStart(p) }); } catch {}
  });
}

if (stopEvt?.subscribe) {
  stopEvt.subscribe((ev) => {
    const p = ev.source;
    if (ev.itemStack?.typeId !== WAND_ID) return;
    const st = channeling.get(p.id);
    if (!st) return;
    try { st.spell.onStop?.(p, st.ctx); } catch {}
    channeling.delete(p.id);
  });
}

function manaBar(m, mx) {
  const len = 10;
  const filled = (mx <= 0) ? 0 : Math.round((m / mx) * len);
  return "§b" + "█".repeat(filled) + "§7" + "░".repeat(len - filled) + "§r";
}

system.runInterval(() => {
  for (const p of world.getPlayers()) {
    const c = inv(p);
    const main = c?.getItem(p.selectedSlotIndex);

    if (main?.typeId === WAND_ID) {
      const manaCur = getScore(p, OBJ.MANA_CUR, 0);
      const manaMax = getScore(p, OBJ.MANA_MAX, 80);
      const s = selectedSpell(p);
      try { p.onScreenDisplay.setActionBar(`${s.color}${s.name}§r  §8|  §fMana ${manaBar(manaCur, manaMax)} §7${manaCur}/${manaMax}`); } catch {}
    }

    const st = channeling.get(p.id);
    if (st) {
      const ok = st.spell.onChannel?.(p, st.ctx);
      if (!ok) {
        try { st.spell.onStop?.(p, st.ctx); } catch {}
        channeling.delete(p.id);
      }
    }
  }
}, 1);