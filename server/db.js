// ============================================================
// db.js — 纯 JSON 文件存储层（无需原生 C++ 依赖）
// ============================================================
const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  players:     path.join(DATA_DIR, 'players.json'),
  eggs:        path.join(DATA_DIR, 'eggs.json'),
  pets:        path.join(DATA_DIR, 'pets.json'),
  traps:       path.join(DATA_DIR, 'traps.json'),
  steal_log:   path.join(DATA_DIR, 'steal_log.json'),
  daily_tasks: path.join(DATA_DIR, 'daily_tasks.json'),
  neighbors:   path.join(DATA_DIR, 'neighbors.json'),
};

function readDB(key) {
  try {
    if (!fs.existsSync(FILES[key])) return [];
    return JSON.parse(fs.readFileSync(FILES[key], 'utf-8'));
  } catch { return []; }
}

function writeDB(key, data) {
  fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================
// Players
// ============================================================
function createPlayer(username, password) {
  const players = readDB('players');
  if (players.find(p => p.username === username)) return null;
  const player = {
    id: uuidv4(), username, password,
    coins: 100, level: 1, exp: 0,
    last_signin: '', created_at: Math.floor(Date.now() / 1000),
  };
  players.push(player);
  writeDB('players', players);
  return { ...player };
}

function getPlayerByName(username) {
  return readDB('players').find(p => p.username === username) || null;
}

function getPlayerById(id) {
  return readDB('players').find(p => p.id === id) || null;
}

function updatePlayer(id, updater) {
  const players = readDB('players');
  const idx = players.findIndex(p => p.id === id);
  if (idx === -1) return;
  updater(players[idx]);
  writeDB('players', players);
}

function addCoins(playerId, delta) {
  updatePlayer(playerId, p => { p.coins = Math.max(0, p.coins + delta); });
}

function addExp(playerId, amount) {
  updatePlayer(playerId, p => {
    p.exp += amount;
    const needed = p.level * 100;
    if (p.exp >= needed) { p.exp -= needed; p.level += 1; }
  });
}

function signin(playerId, dateStr) {
  updatePlayer(playerId, p => { p.last_signin = dateStr; });
}

function getLeaderboard() {
  return readDB('players')
    .map(p => ({ id: p.id, username: p.username, coins: p.coins, level: p.level }))
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 50);
}

// ============================================================
// Eggs
// ============================================================
// 每种稀有度孵化时长（秒）
const HATCH_DURATION = { common: 120, rare: 300, legend: 600 };
// 稀有度随机权重
const RARITY_WEIGHTS = [
  { rarity: 'common', w: 70 },
  { rarity: 'rare',   w: 25 },
  { rarity: 'legend', w: 5  },
];

function rollRarity() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const { rarity, w } of RARITY_WEIGHTS) {
    acc += w;
    if (r < acc) return rarity;
  }
  return 'common';
}

function maxSlotsForLevel(level) {
  if (level >= 10) return 5;
  if (level >= 5)  return 4;
  if (level >= 3)  return 3;
  return 2;
}

function placeEgg(ownerId, slot) {
  const player = getPlayerById(ownerId);
  if (!player) return { error: 'player_not_found' };
  const maxSlots = maxSlotsForLevel(player.level);
  const eggs = readDB('eggs');
  const active = eggs.filter(e => e.owner_id === ownerId && !e.is_hatched);
  if (active.length >= maxSlots) return { error: 'slots_full' };
  if (active.find(e => e.slot === slot)) return { error: 'slot_occupied' };
  if (player.coins < 10) return { error: 'not_enough_coins' };

  const rarity = rollRarity();
  const now = Math.floor(Date.now() / 1000);
  const egg = {
    id: uuidv4(), owner_id: ownerId, slot,
    rarity, hatch_at: now + HATCH_DURATION[rarity],
    placed_at: now, is_hatched: false, pet_id: null,
  };
  eggs.push(egg);
  writeDB('eggs', eggs);
  addCoins(ownerId, -10);
  return { ...egg };
}

function getActiveEggs(ownerId) {
  return readDB('eggs').filter(e => e.owner_id === ownerId && !e.is_hatched);
}

function getEggById(id) {
  return readDB('eggs').find(e => e.id === id) || null;
}

// ============================================================
// Pets
// ============================================================
const PET_TYPES = ['bear', 'fox', 'bunny', 'cat', 'dragon'];

function rollPetStats(rarity) {
  const base = rarity === 'legend' ? 25 : rarity === 'rare' ? 18 : 12;
  const rand = () => base + Math.floor(Math.random() * 8);
  return { atk: rand(), def: rand(), spd: rand() };
}

function hatchEgg(eggId) {
  const eggs = readDB('eggs');
  const eggIdx = eggs.findIndex(e => e.id === eggId);
  if (eggIdx === -1 || eggs[eggIdx].is_hatched) return null;

  const egg = eggs[eggIdx];
  const stats = rollPetStats(egg.rarity);
  const PET_TYPES = ['bear', 'fox', 'bunny', 'cat', 'dragon'];
  const type = PET_TYPES[Math.floor(Math.random() * PET_TYPES.length)];
  const name = type[0].toUpperCase() + type.slice(1);
  const petId = uuidv4();

  const pet = {
    id: petId, owner_id: egg.owner_id, name, type,
    rarity: egg.rarity, ...stats,
    level: 1, exp: 0, role: 'idle', guard_slot: null,
    obtained_at: Math.floor(Date.now() / 1000),
  };
  const pets = readDB('pets');
  pets.push(pet);
  writeDB('pets', pets);

  eggs[eggIdx].is_hatched = true;
  eggs[eggIdx].pet_id = petId;
  writeDB('eggs', eggs);

  addExp(egg.owner_id, 20);
  return { ...pet };
}

function getPetsByOwner(ownerId) {
  return readDB('pets').filter(p => p.owner_id === ownerId);
}

function getGuards(ownerId) {
  return readDB('pets').filter(p => p.owner_id === ownerId && p.role === 'guard');
}

function updatePet(id, updater) {
  const pets = readDB('pets');
  const idx = pets.findIndex(p => p.id === id);
  if (idx === -1) return;
  updater(pets[idx]);
  writeDB('pets', pets);
}

function setGuard(petId, ownerId, guardSlot) {
  const pets = readDB('pets');
  pets.forEach(p => {
    if (p.owner_id === ownerId && p.guard_slot === guardSlot && p.role === 'guard') {
      p.role = 'idle'; p.guard_slot = null;
    }
  });
  const idx = pets.findIndex(p => p.id === petId);
  if (idx !== -1) { pets[idx].role = 'guard'; pets[idx].guard_slot = guardSlot; }
  writeDB('pets', pets);
}

function unguard(petId) {
  updatePet(petId, p => { p.role = 'idle'; p.guard_slot = null; });
}

function addPetExp(petId, amount) {
  updatePet(petId, p => {
    p.exp += amount;
    const needed = p.level * 50;
    if (p.exp >= needed) {
      p.exp -= needed; p.level += 1;
      p.atk += 1; p.def += 1; p.spd += 1;
    }
  });
}

// ============================================================
// Traps
// ============================================================
const TRAP_COST = { mud: 15, thorn: 25, sleep: 35 };

function placeTrap(ownerId, slot, type) {
  const player = getPlayerById(ownerId);
  const cost = TRAP_COST[type] || 15;
  if (player.coins < cost) return { error: 'not_enough_coins' };
  const traps = readDB('traps');
  const existing = traps.find(t => t.owner_id === ownerId && t.slot === slot && !t.triggered);
  if (existing) return { error: 'slot_has_trap' };
  const trap = {
    id: uuidv4(), owner_id: ownerId, slot, type,
    triggered: false, placed_at: Math.floor(Date.now() / 1000),
  };
  traps.push(trap);
  writeDB('traps', traps);
  addCoins(ownerId, -cost);
  return { ...trap };
}

function getTraps(ownerId) {
  return readDB('traps').filter(t => t.owner_id === ownerId && !t.triggered);
}

function triggerTrap(trapId) {
  const traps = readDB('traps');
  const idx = traps.findIndex(t => t.id === trapId);
  if (idx !== -1) { traps[idx].triggered = true; writeDB('traps', traps); }
}

// ============================================================
// Steal Logic
// ============================================================
function calcStealResult(attacker, defender, strategy, attackerPet, defenderGuards, traps, eggId) {
  const egg = getEggById(eggId);
  if (!egg) return { success: false, reason: 'no_egg' };

  let successRate = 0.5;
  let penaltyCoins = 0;
  let bribeCost = 0;

  const atkPower = attackerPet ? attackerPet.atk + attackerPet.spd : 10;
  const defPower = defenderGuards.reduce((s, g) => s + g.def, 0) || 5;

  if (strategy === 'charge') {
    successRate = 0.4 + (atkPower / (atkPower + defPower)) * 0.5;
    penaltyCoins = 30;
  } else if (strategy === 'sneak') {
    const spdA = attackerPet ? attackerPet.spd : 10;
    const spdD = defenderGuards.length
      ? defenderGuards.reduce((s, g) => s + g.spd, 0) / defenderGuards.length : 5;
    successRate = 0.35 + (spdA / (spdA + spdD)) * 0.55;
    penaltyCoins = 10;
  } else if (strategy === 'bribe') {
    bribeCost = 40 + defPower;
    if (attacker.coins < bribeCost) return { success: false, reason: 'no_coins_for_bribe', bribeCost };
    successRate = 0.85;
  }

  // 陷阱惩罚（潜行策略可绕过）
  let triggeredTrap = null;
  if (traps.length > 0 && strategy !== 'sneak') {
    const trap = traps[Math.floor(Math.random() * traps.length)];
    triggeredTrap = trap;
    triggerTrap(trap.id);
    if (trap.type === 'mud')   successRate -= 0.2;
    if (trap.type === 'thorn') { successRate -= 0.3; penaltyCoins += 20; }
    if (trap.type === 'sleep') successRate -= 0.45;
  }

  const success = Math.random() < successRate;
  let coinsGain = 0;

  if (success) {
    const now = Math.floor(Date.now() / 1000);
    const totalTime = egg.hatch_at - egg.placed_at;
    const elapsed = Math.min(now - egg.placed_at, totalTime);
    const progress = elapsed / totalTime;
    const rarityMul = egg.rarity === 'legend' ? 5 : egg.rarity === 'rare' ? 2.5 : 1;
    coinsGain = Math.floor(30 * rarityMul * (0.3 + progress * 0.7));

    // 删除被偷的蛋
    const eggs = readDB('eggs');
    writeDB('eggs', eggs.filter(e => e.id !== eggId));

    addCoins(attacker.id, coinsGain - bribeCost);
    addCoins(defender.id, -Math.floor(coinsGain * 0.5));
    addExp(attacker.id, 15);
    if (attackerPet) addPetExp(attackerPet.id, 10);
  } else {
    addCoins(attacker.id, -(penaltyCoins + bribeCost));
    if (attackerPet) addPetExp(attackerPet.id, 5);
    defenderGuards.forEach(g => addPetExp(g.id, 8));
  }

  // 记录日志（最多保留 500 条）
  const logs = readDB('steal_log');
  logs.push({
    id: uuidv4(), attacker_id: attacker.id, defender_id: defender.id,
    egg_id: eggId, strategy, success, coins_delta: coinsGain,
    happened_at: Math.floor(Date.now() / 1000),
  });
  writeDB('steal_log', logs.slice(-500));

  return { success, coinsGain, penaltyCoins, bribeCost, triggeredTrap, eggRarity: egg.rarity };
}

// ============================================================
// Daily Tasks
// ============================================================
const TASK_TEMPLATES = [
  { type: 'steal',  target: 2, reward_coins: 30, reward_exp: 20, desc: '偷窃成功 2 次' },
  { type: 'defend', target: 1, reward_coins: 20, reward_exp: 15, desc: '成功防御 1 次' },
  { type: 'hatch',  target: 1, reward_coins: 25, reward_exp: 10, desc: '孵化 1 只宠物' },
  { type: 'signin', target: 1, reward_coins: 15, reward_exp: 5,  desc: '每日签到' },
];

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDailyTasks(playerId) {
  const today = getTodayStr();
  const tasks = readDB('daily_tasks');
  const existing = tasks.filter(t => t.player_id === playerId && t.date === today);
  if (existing.length > 0) return existing;

  const newTasks = TASK_TEMPLATES.map(t => ({
    id: uuidv4(), player_id: playerId, task_type: t.type,
    target: t.target, progress: 0, completed: false, date: today,
  }));
  newTasks.forEach(t => tasks.push(t));
  writeDB('daily_tasks', tasks);
  return newTasks;
}

function progressTask(playerId, taskType, amount = 1) {
  const today = getTodayStr();
  const tasks = readDB('daily_tasks');
  const idx = tasks.findIndex(
    t => t.player_id === playerId && t.task_type === taskType && t.date === today && !t.completed
  );
  if (idx === -1) return null;

  tasks[idx].progress += amount;
  if (tasks[idx].progress >= tasks[idx].target) {
    tasks[idx].progress = tasks[idx].target;
    tasks[idx].completed = true;
    writeDB('daily_tasks', tasks);
    const tmpl = TASK_TEMPLATES.find(t => t.type === taskType);
    if (tmpl) { addCoins(playerId, tmpl.reward_coins); addExp(playerId, tmpl.reward_exp); }
    return { completed: true, task: tasks[idx] };
  }
  writeDB('daily_tasks', tasks);
  return { completed: false, task: tasks[idx] };
}

function getDailyTasks(playerId) {
  const today = getTodayStr();
  return readDB('daily_tasks').filter(t => t.player_id === playerId && t.date === today);
}

// ============================================================
// Neighbors (好友/邻居系统)
// ============================================================
function addNeighbor(playerId, targetId) {
  if (playerId === targetId) return { error: 'cant_add_self' };
  const target = getPlayerById(targetId);
  if (!target) return { error: 'player_not_found' };
  const neighbors = readDB('neighbors');
  const existing = neighbors.find(n => n.player_id === playerId && n.neighbor_id === targetId);
  if (existing) return { error: 'already_neighbor' };
  neighbors.push({
    id: uuidv4(), player_id: playerId, neighbor_id: targetId,
    added_at: Math.floor(Date.now() / 1000),
  });
  writeDB('neighbors', neighbors);
  return { ok: true, neighbor: { id: target.id, username: target.username, level: target.level, coins: target.coins } };
}

function removeNeighbor(playerId, targetId) {
  const neighbors = readDB('neighbors');
  writeDB('neighbors', neighbors.filter(n => !(n.player_id === playerId && n.neighbor_id === targetId)));
}

function getNeighbors(playerId) {
  const neighbors = readDB('neighbors').filter(n => n.player_id === playerId);
  return neighbors.map(n => {
    const p = getPlayerById(n.neighbor_id);
    if (!p) return null;
    const eggs = getActiveEggs(n.neighbor_id);
    return { id: p.id, username: p.username, level: p.level, coins: p.coins, eggCount: eggs.length };
  }).filter(Boolean);
}

// ============================================================
// Exports
// ============================================================
module.exports = {
  // player
  createPlayer, getPlayerByName, getPlayerById, addCoins, addExp, signin, getLeaderboard,
  // egg
  placeEgg, getActiveEggs, getEggById, hatchEgg, maxSlotsForLevel, HATCH_DURATION,
  // pet
  getPetsByOwner, getGuards, setGuard, unguard, addPetExp,
  // trap
  placeTrap, getTraps,
  // steal
  calcStealResult,
  // task
  ensureDailyTasks, progressTask, getDailyTasks, TASK_TEMPLATES,
  // neighbors
  addNeighbor, removeNeighbor, getNeighbors,
};
