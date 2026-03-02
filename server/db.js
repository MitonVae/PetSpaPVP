// ============================================================
// db.js — 纯 JSON 文件存储层（v2: 宠物分类+技能/邻居申请/商店/升级）
// ============================================================
const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  players:         path.join(DATA_DIR, 'players.json'),
  eggs:            path.join(DATA_DIR, 'eggs.json'),
  pets:            path.join(DATA_DIR, 'pets.json'),
  steal_log:       path.join(DATA_DIR, 'steal_log.json'),
  daily_tasks:     path.join(DATA_DIR, 'daily_tasks.json'),
  neighbors:       path.join(DATA_DIR, 'neighbors.json'),
  friend_requests: path.join(DATA_DIR, 'friend_requests.json'),
  boost_log:       path.join(DATA_DIR, 'boost_log.json'),
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
    last_signin: '',
    // 温泉池等级（1-4），影响孵化速度
    spa_level: 1,
    // 额外解锁的守卫槽数量（基础2个）
    extra_guard_slots: 0,
    // 额外解锁的蛋槽（通过购买，基础跟等级走）
    extra_egg_slots: 0,
    created_at: Math.floor(Date.now() / 1000),
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

// 温泉池升级
const SPA_UPGRADE_COST = [0, 100, 250, 500]; // level 1→2→3→4
function upgradeSpa(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return { error: 'player_not_found' };
  if (player.spa_level >= 4) return { error: 'max_level' };
  const cost = SPA_UPGRADE_COST[player.spa_level];
  if (player.coins < cost) return { error: 'not_enough_coins', cost };
  updatePlayer(playerId, p => {
    p.coins -= cost;
    p.spa_level += 1;
  });
  return { ok: true, newLevel: player.spa_level + 1 };
}

// 购买额外守卫槽（最多1个额外，即最多3个守卫槽）
const EXTRA_GUARD_COST = 150;
function buyGuardSlot(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return { error: 'player_not_found' };
  if (player.extra_guard_slots >= 1) return { error: 'max_slots' };
  if (player.coins < EXTRA_GUARD_COST) return { error: 'not_enough_coins', cost: EXTRA_GUARD_COST };
  updatePlayer(playerId, p => {
    p.coins -= EXTRA_GUARD_COST;
    p.extra_guard_slots += 1;
  });
  return { ok: true };
}

// 购买额外蛋槽
const EXTRA_EGG_SLOT_COST = 80;
function buyEggSlot(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return { error: 'player_not_found' };
  const base = maxSlotsForLevel(player.level);
  const current = base + (player.extra_egg_slots || 0);
  if (current >= 6) return { error: 'max_slots' };
  if (player.coins < EXTRA_EGG_SLOT_COST) return { error: 'not_enough_coins', cost: EXTRA_EGG_SLOT_COST };
  updatePlayer(playerId, p => {
    p.coins -= EXTRA_EGG_SLOT_COST;
    p.extra_egg_slots = (p.extra_egg_slots || 0) + 1;
  });
  return { ok: true };
}

// ============================================================
// Eggs
// ============================================================
// 基础孵化时长（秒），温泉等级会缩短
const BASE_HATCH_DURATION = { common: 120, rare: 300, legend: 600 };
// 温泉等级加速倍率
const SPA_SPEED_MULTIPLIER = [1.0, 1.0, 0.85, 0.7, 0.55];

function getHatchDuration(rarity, spaLevel = 1) {
  const base = BASE_HATCH_DURATION[rarity];
  const mult = SPA_SPEED_MULTIPLIER[spaLevel] || 1.0;
  return Math.floor(base * mult);
}

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

function totalEggSlots(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return 2;
  return maxSlotsForLevel(player.level) + (player.extra_egg_slots || 0);
}

// 放蛋（来源：hatch/buy/signin/task/gift）
function placeEgg(ownerId, slot, rarity = null, source = 'hatch') {
  const player = getPlayerById(ownerId);
  if (!player) return { error: 'player_not_found' };
  const maxSlots = totalEggSlots(ownerId);
  const eggs = readDB('eggs');
  const active = eggs.filter(e => e.owner_id === ownerId && !e.is_hatched);
  if (active.length >= maxSlots) return { error: 'slots_full' };
  if (active.find(e => e.slot === slot)) return { error: 'slot_occupied' };

  // 普通孵蛋需花费金币
  if (source === 'hatch') {
    if (player.coins < 10) return { error: 'not_enough_coins' };
    addCoins(ownerId, -10);
  }

  const finalRarity = rarity || rollRarity();
  const now = Math.floor(Date.now() / 1000);
  const duration = getHatchDuration(finalRarity, player.spa_level || 1);
  const egg = {
    id: uuidv4(), owner_id: ownerId, slot,
    rarity: finalRarity,
    hatch_at: now + duration,
    placed_at: now,
    is_hatched: false,
    pet_id: null,
    source,   // 来源：hatch/buy/signin/task/gift
  };
  eggs.push(egg);
  writeDB('eggs', eggs);
  return { ...egg };
}

// 商店购买蛋（保底品级）
const SHOP_EGG_PRICES = { common: 10, rare: 50, legend: 180 };
function buyEgg(ownerId, rarity) {
  if (!['common','rare','legend'].includes(rarity)) return { error: 'invalid_rarity' };
  const player = getPlayerById(ownerId);
  if (!player) return { error: 'player_not_found' };
  const cost = SHOP_EGG_PRICES[rarity];
  if (player.coins < cost) return { error: 'not_enough_coins', cost };

  // 找空槽
  const maxSlots = totalEggSlots(ownerId);
  const eggs = readDB('eggs');
  const active = eggs.filter(e => e.owner_id === ownerId && !e.is_hatched);
  if (active.length >= maxSlots) return { error: 'slots_full' };
  const occupiedSlots = new Set(active.map(e => e.slot));
  let freeSlot = null;
  for (let i = 0; i < maxSlots; i++) {
    if (!occupiedSlots.has(i)) { freeSlot = i; break; }
  }
  if (freeSlot === null) return { error: 'slots_full' };

  addCoins(ownerId, -cost);
  return placeEgg(ownerId, freeSlot, rarity, 'buy');
}

function getActiveEggs(ownerId) {
  return readDB('eggs').filter(e => e.owner_id === ownerId && !e.is_hatched);
}

function getEggById(id) {
  return readDB('eggs').find(e => e.id === id) || null;
}

// 邻居帮助加速孵化（+60秒减少孵化等待）
function boostEgg(boosterId, targetOwnerId, eggId) {
  const booster = getPlayerById(boosterId);
  const owner   = getPlayerById(targetOwnerId);
  if (!booster || !owner) return { error: 'player_not_found' };
  if (boosterId === targetOwnerId) return { error: 'cant_boost_self' };

  // 检查邻居关系
  const neighbors = readDB('neighbors');
  const isNeighbor = neighbors.some(
    n => n.player_id === boosterId && n.neighbor_id === targetOwnerId
  );
  if (!isNeighbor) return { error: 'not_neighbor' };

  // 每日加速次数限制（每个 booster 对每个 target 最多3次/天）
  const today = new Date().toISOString().slice(0, 10);
  const boostLog = readDB('boost_log');
  const todayBoosts = boostLog.filter(
    b => b.booster_id === boosterId && b.target_id === targetOwnerId && b.date === today
  );
  if (todayBoosts.length >= 3) return { error: 'boost_limit', limit: 3 };

  const eggs = readDB('eggs');
  const eggIdx = eggs.findIndex(e => e.id === eggId && e.owner_id === targetOwnerId && !e.is_hatched);
  if (eggIdx === -1) return { error: 'egg_not_found' };

  const now = Math.floor(Date.now() / 1000);
  // 减少60秒，不低于当前时间
  eggs[eggIdx].hatch_at = Math.max(now, eggs[eggIdx].hatch_at - 60);
  writeDB('eggs', eggs);

  // 记录加速日志
  boostLog.push({ id: uuidv4(), booster_id: boosterId, target_id: targetOwnerId, egg_id: eggId, date: today, at: now });
  writeDB('boost_log', boostLog.slice(-2000));

  // 助推者获得经验
  addExp(boosterId, 5);

  return { ok: true, newHatchAt: eggs[eggIdx].hatch_at, boosterExp: 5 };
}

// ============================================================
// Pets（v2: 增加 pet_class + skill 字段）
// ============================================================
const PET_TYPES = ['bear', 'fox', 'bunny', 'cat', 'dragon'];

// 技能型宠物可能拥有的技能列表
const SKILL_LIST = [
  { id: 'mud',      name: '泥潭术',  desc: '守卫时降低入侵成功率 -20%', effect: 'rate_down', value: 0.20 },
  { id: 'thorn',    name: '荆棘甲',  desc: '守卫时成功率-30%，失败者额外损失20金', effect: 'rate_down_penalty', value: 0.30, penalty: 20 },
  { id: 'sleep',    name: '催眠曲',  desc: '守卫时成功率 -45%（最强防御）', effect: 'rate_down', value: 0.45 },
  { id: 'foresee',  name: '预知眼',  desc: '守卫时额外反制 +15% 防御效果', effect: 'rate_down', value: 0.15 },
  { id: 'inspire',  name: '鼓舞',    desc: '友方战斗型守卫 ATK+20%', effect: 'buff_ally', value: 0.20 },
];

function rollPetClass() {
  // 60%战斗型，40%技能型
  return Math.random() < 0.6 ? 'fighter' : 'skill';
}

function rollPetStats(rarity, petClass) {
  const base = rarity === 'legend' ? 25 : rarity === 'rare' ? 18 : 12;
  const rand = () => base + Math.floor(Math.random() * 8);
  if (petClass === 'fighter') {
    // 战斗型属性更高
    return { atk: rand() + 3, def: rand() + 3, spd: rand() + 2 };
  }
  // 技能型基础属性略低，依靠技能补强
  return { atk: rand(), def: rand(), spd: rand() };
}

function rollSkill() {
  return SKILL_LIST[Math.floor(Math.random() * SKILL_LIST.length)];
}

function hatchEgg(eggId) {
  const eggs = readDB('eggs');
  const eggIdx = eggs.findIndex(e => e.id === eggId);
  if (eggIdx === -1 || eggs[eggIdx].is_hatched) return null;

  const egg = eggs[eggIdx];
  const petClass = rollPetClass();
  const stats = rollPetStats(egg.rarity, petClass);
  const type = PET_TYPES[Math.floor(Math.random() * PET_TYPES.length)];
  const name = type[0].toUpperCase() + type.slice(1);
  const petId = uuidv4();

  const skill = petClass === 'skill' ? rollSkill() : null;

  const pet = {
    id: petId, owner_id: egg.owner_id, name, type,
    rarity: egg.rarity,
    pet_class: petClass,   // 'fighter' | 'skill'
    skill: skill,          // 技能对象（仅 skill 类型有）
    ...stats,
    level: 1, exp: 0,
    role: 'idle',          // 'idle' | 'guard'
    guard_slot: null,
    obtained_at: Math.floor(Date.now() / 1000),
    egg_source: egg.source || 'hatch',
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

// 守卫槽总数（基础2 + 额外购买）
function totalGuardSlots(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return 2;
  return 2 + (player.extra_guard_slots || 0);
}

function setGuard(petId, ownerId, guardSlot) {
  const pets = readDB('pets');
  // 移除同一槽位上的旧守卫
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
// Steal Logic（v2: 移除陷阱，改用技能型守卫效果）
// ============================================================
function calcStealResult(attacker, defender, strategy, attackerPet, defenderGuards, eggId) {
  const egg = getEggById(eggId);
  if (!egg) return { success: false, reason: 'no_egg' };

  // 战斗型守卫数值
  const fighters = defenderGuards.filter(g => g.pet_class !== 'skill');
  const skillPets = defenderGuards.filter(g => g.pet_class === 'skill');

  const atkPower = attackerPet ? attackerPet.atk + attackerPet.spd : 10;

  // 战斗型守卫的防御力（有"鼓舞"技能时提升20%）
  const hasInspire = skillPets.some(g => g.skill && g.skill.id === 'inspire');
  const fighterDefBase = fighters.reduce((s, g) => s + g.def, 0) || 5;
  const defPower = hasInspire ? Math.floor(fighterDefBase * 1.2) : fighterDefBase;

  let successRate = 0.5;
  let penaltyCoins = 0;
  let bribeCost = 0;

  if (strategy === 'charge') {
    successRate = 0.4 + (atkPower / (atkPower + defPower)) * 0.5;
    penaltyCoins = 30;
  } else if (strategy === 'sneak') {
    const spdA = attackerPet ? attackerPet.spd : 10;
    const spdD = defenderGuards.length
      ? defenderGuards.reduce((s, g) => s + (g.spd || 10), 0) / defenderGuards.length : 5;
    successRate = 0.35 + (spdA / (spdA + spdD)) * 0.55;
    penaltyCoins = 10;
  } else if (strategy === 'bribe') {
    bribeCost = 40 + defPower;
    if (attacker.coins < bribeCost) return { success: false, reason: 'no_coins_for_bribe', bribeCost };
    successRate = 0.85;
  }

  // 技能型守卫技能效果
  let skillEffects = [];
  for (const sp of skillPets) {
    if (!sp.skill) continue;
    const sk = sp.skill;
    if (sk.effect === 'rate_down') {
      successRate -= sk.value;
      skillEffects.push({ skillName: sk.name, desc: sk.desc });
    } else if (sk.effect === 'rate_down_penalty' && strategy !== 'bribe') {
      successRate -= sk.value;
      penaltyCoins += (sk.penalty || 0);
      skillEffects.push({ skillName: sk.name, desc: sk.desc });
    } else if (sk.effect === 'buff_ally') {
      // 已在上方处理（鼓舞）
      skillEffects.push({ skillName: sk.name, desc: sk.desc });
    }
  }

  // 预知眼 vs 强攻策略
  const hasForesee = skillPets.some(g => g.skill && g.skill.id === 'foresee');
  if (hasForesee && strategy === 'charge') {
    successRate -= 0.15;
    skillEffects.push({ skillName: '预知眼', desc: '预判强攻，额外-15%' });
  }

  const success = Math.random() < Math.max(0.05, Math.min(0.95, successRate));
  let coinsGain = 0;

  if (success) {
    const now = Math.floor(Date.now() / 1000);
    const totalTime = egg.hatch_at - egg.placed_at;
    const elapsed = Math.min(now - egg.placed_at, totalTime);
    const progress = elapsed / totalTime;
    const rarityMul = egg.rarity === 'legend' ? 5 : egg.rarity === 'rare' ? 2.5 : 1;
    coinsGain = Math.floor(30 * rarityMul * (0.3 + progress * 0.7));

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

  const logs = readDB('steal_log');
  logs.push({
    id: uuidv4(), attacker_id: attacker.id, defender_id: defender.id,
    egg_id: eggId, strategy, success, coins_delta: coinsGain,
    happened_at: Math.floor(Date.now() / 1000),
  });
  writeDB('steal_log', logs.slice(-500));

  return { success, coinsGain, penaltyCoins, bribeCost, skillEffects, eggRarity: egg.rarity };
}

// ============================================================
// Daily Tasks
// ============================================================
const TASK_TEMPLATES = [
  { type: 'steal',  target: 2, reward_coins: 30, reward_exp: 20, desc: '偷窃成功 2 次' },
  { type: 'defend', target: 1, reward_coins: 20, reward_exp: 15, desc: '成功防御 1 次' },
  { type: 'hatch',  target: 1, reward_coins: 25, reward_exp: 10, desc: '孵化 1 只宠物' },
  { type: 'signin', target: 1, reward_coins: 15, reward_exp: 5,  desc: '每日签到' },
  { type: 'boost',  target: 1, reward_coins: 10, reward_exp: 8,  desc: '帮邻居加速孵化 1 次' },
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
// Neighbors + Friend Requests（v2: 申请/同意机制）
// ============================================================

function sendFriendRequest(fromId, toId) {
  if (fromId === toId) return { error: 'cant_add_self' };
  const toPlayer = getPlayerById(toId);
  if (!toPlayer) return { error: 'player_not_found' };

  // 已是邻居？
  const neighbors = readDB('neighbors');
  if (neighbors.some(n => n.player_id === fromId && n.neighbor_id === toId)) {
    return { error: 'already_neighbor' };
  }

  // 已发过请求？
  const requests = readDB('friend_requests');
  if (requests.some(r => r.from_id === fromId && r.to_id === toId && r.status === 'pending')) {
    return { error: 'request_pending' };
  }

  const req = {
    id: uuidv4(), from_id: fromId, to_id: toId,
    status: 'pending', created_at: Math.floor(Date.now() / 1000),
  };
  requests.push(req);
  writeDB('friend_requests', requests);
  return { ok: true, requestId: req.id, toPlayer: { id: toPlayer.id, username: toPlayer.username } };
}

function acceptFriendRequest(requestId, acceptorId) {
  const requests = readDB('friend_requests');
  const idx = requests.findIndex(r => r.id === requestId && r.to_id === acceptorId && r.status === 'pending');
  if (idx === -1) return { error: 'request_not_found' };

  const req = requests[idx];
  requests[idx].status = 'accepted';
  writeDB('friend_requests', requests);

  // 双向添加邻居
  const neighbors = readDB('neighbors');
  const now = Math.floor(Date.now() / 1000);
  if (!neighbors.some(n => n.player_id === req.from_id && n.neighbor_id === req.to_id)) {
    neighbors.push({ id: uuidv4(), player_id: req.from_id, neighbor_id: req.to_id, added_at: now });
  }
  if (!neighbors.some(n => n.player_id === req.to_id && n.neighbor_id === req.from_id)) {
    neighbors.push({ id: uuidv4(), player_id: req.to_id, neighbor_id: req.from_id, added_at: now });
  }
  writeDB('neighbors', neighbors);

  const fromPlayer = getPlayerById(req.from_id);
  const toPlayer   = getPlayerById(req.to_id);
  return { ok: true, from: { id: fromPlayer.id, username: fromPlayer.username }, to: { id: toPlayer.id, username: toPlayer.username } };
}

function rejectFriendRequest(requestId, rejectorId) {
  const requests = readDB('friend_requests');
  const idx = requests.findIndex(r => r.id === requestId && r.to_id === rejectorId && r.status === 'pending');
  if (idx === -1) return { error: 'request_not_found' };
  requests[idx].status = 'rejected';
  writeDB('friend_requests', requests);
  return { ok: true };
}

function getPendingRequests(playerId) {
  // 收到的待处理请求
  const requests = readDB('friend_requests').filter(r => r.to_id === playerId && r.status === 'pending');
  return requests.map(r => {
    const from = getPlayerById(r.from_id);
    return { requestId: r.id, from: { id: from.id, username: from.username, level: from.level } };
  });
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
  upgradeSpa, buyGuardSlot, buyEggSlot,
  EXTRA_GUARD_COST, EXTRA_EGG_SLOT_COST, SPA_UPGRADE_COST,
  // egg
  placeEgg, buyEgg, getActiveEggs, getEggById, hatchEgg,
  maxSlotsForLevel, totalEggSlots, getHatchDuration, boostEgg,
  SHOP_EGG_PRICES, BASE_HATCH_DURATION,
  // pet
  getPetsByOwner, getGuards, setGuard, unguard, addPetExp,
  totalGuardSlots, SKILL_LIST,
  // steal
  calcStealResult,
  // task
  ensureDailyTasks, progressTask, getDailyTasks, TASK_TEMPLATES,
  // neighbors / friend requests
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
  getPendingRequests, removeNeighbor, getNeighbors,
};