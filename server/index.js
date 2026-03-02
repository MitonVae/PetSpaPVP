// ============================================================
// server/index.js — Express + WebSocket 游戏服务器
// ============================================================
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const {
  createPlayer, getPlayerByName, getPlayerById, addCoins, signin, getLeaderboard,
  placeEgg, getActiveEggs, getEggById, hatchEgg, maxSlotsForLevel,
  getPetsByOwner, getGuards, setGuard, unguard,
  placeTrap, getTraps,
  calcStealResult,
  ensureDailyTasks, progressTask, getDailyTasks, TASK_TEMPLATES,
  addNeighbor, removeNeighbor, getNeighbors,
} = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ── 在线玩家 Map: playerId -> ws ──
const onlinePlayers = new Map();

// ============================================================
// 工具函数
// ============================================================
function send(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(type, payload, excludeId = null) {
  for (const [id, ws] of onlinePlayers) {
    if (id !== excludeId) send(ws, type, payload);
  }
}

function sendToPlayer(playerId, type, payload) {
  const ws = onlinePlayers.get(playerId);
  if (ws) send(ws, type, payload);
}

function buildPlayerState(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return null;
  const eggs  = getActiveEggs(playerId);
  const pets  = getPetsByOwner(playerId);
  const traps = getTraps(playerId);
  const tasks = getDailyTasks(playerId);
  const maxSlots = maxSlotsForLevel(player.level);
  return { player, eggs, pets, traps, tasks, maxSlots };
}

function buildVisitorView(targetId) {
  const player = getPlayerById(targetId);
  if (!player) return null;
  const eggs   = getActiveEggs(targetId);
  const guards = getGuards(targetId);
  const traps  = getTraps(targetId);
  return {
    player: { id: player.id, username: player.username, level: player.level, coins: player.coins },
    eggs, guards, traps,
  };
}

// ============================================================
// 孵化定时器 — 每10秒扫描一次熟蛋
// ============================================================
const fs = require('fs');

function checkHatchLoop() {
  const now = Math.floor(Date.now() / 1000);
  const eggsFile = path.join(__dirname, '../data/eggs.json');
  let allEggs = [];
  try { allEggs = JSON.parse(fs.readFileSync(eggsFile, 'utf-8')); } catch {}
  const readyEggs = allEggs.filter(e => !e.is_hatched && e.hatch_at <= now);

  for (const egg of readyEggs) {
    const pet = hatchEgg(egg.id);
    if (!pet) continue;

    progressTask(egg.owner_id, 'hatch');
    const ownerState = buildPlayerState(egg.owner_id);
    sendToPlayer(egg.owner_id, 'EGG_HATCHED', { egg, pet, state: ownerState });

    // 传说蛋孵化 → 全服广播
    if (egg.rarity === 'legend') {
      const owner = getPlayerById(egg.owner_id);
      broadcast('LEGEND_HATCH', {
        owner: owner.username,
        petType: pet.type,
        petName: pet.name,
      });
    }
  }
}
setInterval(checkHatchLoop, 10_000);

// ============================================================
// WebSocket 消息路由
// ============================================================
wss.on('connection', (ws) => {
  let currentPlayerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload } = msg;

    // ── 注册 ──
    if (type === 'REGISTER') {
      const { username, password } = payload;
      if (!username || !password || username.length < 2 || username.length > 16) {
        return send(ws, 'ERROR', { code: 'INVALID_INPUT', msg: '用户名2-16位' });
      }
      if (getPlayerByName(username)) {
        return send(ws, 'ERROR', { code: 'NAME_TAKEN', msg: '用户名已存在' });
      }
      const player = createPlayer(username, password);
      ensureDailyTasks(player.id);
      currentPlayerId = player.id;
      onlinePlayers.set(player.id, ws);
      send(ws, 'LOGGED_IN', buildPlayerState(player.id));
      return;
    }

    // ── 登录 ──
    if (type === 'LOGIN') {
      const { username, password } = payload;
      const player = getPlayerByName(username);
      if (!player || player.password !== password) {
        return send(ws, 'ERROR', { code: 'AUTH_FAIL', msg: '用户名或密码错误' });
      }
      currentPlayerId = player.id;
      onlinePlayers.set(player.id, ws);
      ensureDailyTasks(player.id);
      send(ws, 'LOGGED_IN', buildPlayerState(player.id));
      return;
    }

    // 以下操作需要登录
    if (!currentPlayerId) {
      return send(ws, 'ERROR', { code: 'NOT_LOGGED_IN', msg: '请先登录' });
    }

    // ── 放蛋 ──
    if (type === 'PLACE_EGG') {
      const { slot } = payload;
      const result = placeEgg(currentPlayerId, slot);
      if (result.error) return send(ws, 'ERROR', { code: result.error });
      send(ws, 'STATE_UPDATE', buildPlayerState(currentPlayerId));
      return;
    }

    // ── 手动收取已孵蛋（客户端轮询触发） ──
    if (type === 'COLLECT_EGG') {
      const { eggId } = payload;
      const egg = getEggById(eggId);
      if (!egg || egg.owner_id !== currentPlayerId) {
        return send(ws, 'ERROR', { code: 'NOT_YOUR_EGG' });
      }
      const now = Math.floor(Date.now() / 1000);
      if (egg.hatch_at > now) {
        return send(ws, 'ERROR', { code: 'NOT_READY', remainSec: egg.hatch_at - now });
      }
      const pet = hatchEgg(eggId);
      progressTask(currentPlayerId, 'hatch');
      send(ws, 'EGG_HATCHED', { egg, pet, state: buildPlayerState(currentPlayerId) });
      if (egg.rarity === 'legend') {
        const owner = getPlayerById(currentPlayerId);
        broadcast('LEGEND_HATCH', { owner: owner.username, petType: pet.type, petName: pet.name });
      }
      return;
    }

    // ── 设置守卫 ──
    if (type === 'SET_GUARD') {
      const { petId, guardSlot } = payload;
      const pet = getPetsByOwner(currentPlayerId).find(p => p.id === petId);
      if (!pet) return send(ws, 'ERROR', { code: 'NOT_YOUR_PET' });
      setGuard(petId, currentPlayerId, guardSlot);
      send(ws, 'STATE_UPDATE', buildPlayerState(currentPlayerId));
      return;
    }

    // ── 取消守卫 ──
    if (type === 'UNGUARD') {
      const { petId } = payload;
      const pet = getPetsByOwner(currentPlayerId).find(p => p.id === petId);
      if (!pet) return send(ws, 'ERROR', { code: 'NOT_YOUR_PET' });
      unguard(petId);
      send(ws, 'STATE_UPDATE', buildPlayerState(currentPlayerId));
      return;
    }

    // ── 放置陷阱 ──
    if (type === 'PLACE_TRAP') {
      const { slot, trapType } = payload;
      const result = placeTrap(currentPlayerId, slot, trapType);
      if (result.error) return send(ws, 'ERROR', { code: result.error });
      send(ws, 'STATE_UPDATE', buildPlayerState(currentPlayerId));
      return;
    }

    // ── 查看他人蛋池 ──
    if (type === 'VIEW_PLAYER') {
      const { targetId } = payload;
      const view = buildVisitorView(targetId);
      if (!view) return send(ws, 'ERROR', { code: 'PLAYER_NOT_FOUND' });
      send(ws, 'VISITOR_VIEW', view);
      return;
    }

    // ── 偷窃 ──
    if (type === 'STEAL') {
      const { targetId, eggId, strategy, attackerPetId } = payload;
      if (targetId === currentPlayerId) return send(ws, 'ERROR', { code: 'CANT_STEAL_SELF' });
      const attacker = getPlayerById(currentPlayerId);
      const defender = getPlayerById(targetId);
      if (!attacker || !defender) return send(ws, 'ERROR', { code: 'PLAYER_NOT_FOUND' });

      const egg = getEggById(eggId);
      if (!egg || egg.owner_id !== targetId || egg.is_hatched) {
        return send(ws, 'ERROR', { code: 'EGG_GONE', msg: '蛋已消失或孵化' });
      }

      const attackerPet = attackerPetId
        ? getPetsByOwner(currentPlayerId).find(p => p.id === attackerPetId)
        : null;
      const defenderGuards = getGuards(targetId);
      const traps = getTraps(targetId);

      const result = calcStealResult(attacker, defender, strategy, attackerPet, defenderGuards, traps, eggId);
      if (result.reason === 'no_egg') return send(ws, 'ERROR', { code: 'EGG_GONE' });
      if (result.reason === 'no_coins_for_bribe') return send(ws, 'ERROR', { code: 'NOT_ENOUGH_COINS', bribeCost: result.bribeCost });

      // 进度任务
      if (result.success) progressTask(currentPlayerId, 'steal');
      else                progressTask(targetId, 'defend');

      // 通知攻击者（注入 strategy / expGain 字段供前端展示）
      send(ws, 'STEAL_RESULT', { ...result, strategy, expGain: result.success ? 15 : 0, attackerState: buildPlayerState(currentPlayerId) });
      // 通知被攻击者
      sendToPlayer(targetId, 'BEEN_STOLEN', {
        ...result,
        attacker: { username: attacker.username, level: attacker.level },
        defenderState: buildPlayerState(targetId),
      });
      return;
    }

    // ── 排行榜 ──
    if (type === 'GET_LEADERBOARD') {
      send(ws, 'LEADERBOARD', { list: getLeaderboard() });
      return;
    }

    // ── 搜索玩家 ──
    if (type === 'SEARCH_PLAYER') {
      const { username } = payload;
      const target = getPlayerByName(username);
      if (!target) return send(ws, 'ERROR', { code: 'PLAYER_NOT_FOUND' });
      send(ws, 'SEARCH_RESULT', {
        id: target.id, username: target.username,
        level: target.level, coins: target.coins,
      });
      return;
    }

    // ── 每日签到 ──
    if (type === 'DAILY_SIGNIN') {
      const today = new Date().toISOString().slice(0, 10);
      const player = getPlayerById(currentPlayerId);
      if (player.last_signin === today) {
        return send(ws, 'ERROR', { code: 'ALREADY_SIGNED', msg: '今日已签到' });
      }
      signin(currentPlayerId, today);
      addCoins(currentPlayerId, 20);
      progressTask(currentPlayerId, 'signin');
      send(ws, 'SIGNIN_OK', buildPlayerState(currentPlayerId));
      return;
    }

    // ── 添加邻居 ──
    if (type === 'ADD_NEIGHBOR') {
      const { targetId } = payload;
      const result = addNeighbor(currentPlayerId, targetId);
      if (result.error) return send(ws, 'ERROR', { code: result.error, msg: {
        cant_add_self: '不能添加自己', already_neighbor: '已经是邻居了', player_not_found: '玩家不存在'
      }[result.error] });
      send(ws, 'NEIGHBOR_ADDED', { neighbor: result.neighbor });
      return;
    }

    // ── 删除邻居 ──
    if (type === 'REMOVE_NEIGHBOR') {
      const { targetId } = payload;
      removeNeighbor(currentPlayerId, targetId);
      send(ws, 'NEIGHBORS_LIST', { list: getNeighbors(currentPlayerId) });
      return;
    }

    // ── 获取邻居列表 ──
    if (type === 'GET_NEIGHBORS') {
      send(ws, 'NEIGHBORS_LIST', { list: getNeighbors(currentPlayerId) });
      return;
    }

    // ── 获取当前完整状态 ──
    if (type === 'GET_STATE') {
      send(ws, 'STATE_UPDATE', buildPlayerState(currentPlayerId));
      return;
    }
  });

  ws.on('close', () => {
    if (currentPlayerId) onlinePlayers.delete(currentPlayerId);
  });
});

// ============================================================
// HTTP 路由（仅提供前端静态文件）
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================================
// 启动
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌸 温泉宠物镇服务器已启动 → http://localhost:${PORT}`);
});
