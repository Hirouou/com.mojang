import { world, system } from "@minecraft/server";
import { SPELLS } from "./spell_registry.js";

const DP_SELECTED = "wizardry:selected_spell_index";
const DP_LASTCAST = "wizardry:last_cast_tick";
const DP_MANA = "wizardry:mana_current";
const MAX_MANA = 100;
const REGEN_MANA = 2; 
const COOLDOWN_TICKS = 6;

// --- Funções de Performance ---

function getMana(player) {
    const m = player.getDynamicProperty(DP_MANA);
    return (typeof m === "number") ? m : MAX_MANA;
}

function showSpell(player) {
    const idx = getSpellIndex(player);
    const s = SPELLS[idx];
    const mana = Math.floor(getMana(player));
    
    // Barra de mana otimizada (azul)
    const segments = 10;
    const filled = Math.round((mana / MAX_MANA) * segments);
    const bar = "§9" + "█".repeat(filled) + "§8" + "█".repeat(segments - filled);
    
    player.onScreenDisplay.setActionBar(
        `§bMagia: §f${s.name} §7(${idx + 1}/${SPELLS.length})\n${bar} §b${mana}§f/§b${MAX_MANA}`
    );
}

function getSpellIndex(player) {
    const v = player.getDynamicProperty(DP_SELECTED);
    return (typeof v === "number") ? v : 0;
}

// --- Lógica de Disparo Otimizada ---

function spawnProjectile(player, entityId, speed = 1.2) {
    const dim = player.dimension;
    const head = player.getHeadLocation();
    const dir = player.getViewDirection();
    
    const spawnPos = { 
        x: head.x + (dir.x * 2), 
        y: head.y + (dir.y * 2), 
        z: head.z + (dir.z * 2) 
    };

    try {
        const e = dim.spawnEntity(entityId, spawnPos);
        e.applyImpulse({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed });
    } catch (err) {
        // Silencia erros de spawn para evitar spikes no log
    }
}

function castSelected(player) {
    const last = player.getDynamicProperty(DP_LASTCAST);
    if (typeof last === "number" && (system.currentTick - last) < COOLDOWN_TICKS) return;

    const mana = getMana(player);
    if (mana < 15) return;

    player.setDynamicProperty(DP_MANA, mana - 15);
    player.setDynamicProperty(DP_LASTCAST, system.currentTick);

    const s = SPELLS[getSpellIndex(player)];
    
    switch (s.id) {
        case "ghast_fireball": spawnProjectile(player, "minecraft:fireball"); break;
        case "wither_skull":  spawnProjectile(player, "minecraft:wither_skull_dangerous"); break;
        case "blaze_fire":    spawnProjectile(player, "minecraft:small_fireball"); break;
        case "teleport":      player.runCommand(`tp ^ ^ ^12`); break; // TP via comando é mais leve que loop de blocos
    }
    showSpell(player);
}

// --- Registro e Ciclos de Sistema ---

world.beforeEvents.worldInitialize.subscribe(({ itemComponentRegistry }) => {
    itemComponentRegistry.registerCustomComponent("wizardry:spell_next_button", {
        onUse(ev) { 
            const p = ev.source;
            const next = (getSpellIndex(p) + 1) % SPELLS.length;
            p.setDynamicProperty(DP_SELECTED, next);
            showSpell(p);
        }
    });

    itemComponentRegistry.registerCustomComponent("wizardry:spell_prev_button", {
        onUse(ev) { 
            const p = ev.source;
            const prev = (getSpellIndex(p) - 1 + SPELLS.length) % SPELLS.length;
            p.setDynamicProperty(DP_SELECTED, prev);
            showSpell(p);
        }
    });

    itemComponentRegistry.registerCustomComponent("wizardry:spell_caster", { onUse(ev) {} });
});

// Atualização de Mana: Rodar apenas 1x por segundo (20 ticks) reduz o lag significativamente
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        const current = getMana(player);
        if (current < MAX_MANA) {
            player.setDynamicProperty(DP_MANA, Math.min(MAX_MANA, current + REGEN_MANA));
            showSpell(player);
        }
    }
}, 20);

world.afterEvents.itemStopUse.subscribe((ev) => {
    if (ev.itemStack?.typeId === "wizardry:staff") {
        castSelected(ev.source);
    }
});