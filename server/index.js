// ============================================================
// server/index.js — Express + WebSocket 游戏服务器（v2）
// ============================================================
const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');
const fs      = require('fs');
const {
  createPlayer, getPlayerByName, getPlayerById, addCoins, signin, getLeaderboard,
  placeEgg, buyEgg, getActiveEggs, getEggById, hatchEgg, maxSlotsForLevel, totalEggSlots,
  getPetsByOwner, getGuards, setGuard, unguard, totalGuardSlots,
  calcStealResult,
  ensureDailyTasks, progressTask, getDailyTasks, TASK_TEMPLATES,
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest, getPendingRequests,
  removeNeighbor, getNeighbors,
  boostEgg,
  upgradeSpa, buyGuardSlot, buyEggSlot,
  SHOP_EGG_PRICES, SPA_UPGRADE_COST, EXTRA_GUARD_COST, EXTRA_EGG_SLOT_COST,
} = require('./db');

const app = express();
app.use(express.json());

// ================= 健康检查和状态端点 =================
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0'
  });
});

app.get('/api/status', (req, res) => {
  // 简单的系统状态检查
  try {
    const players = getLeaderboard();
    res.json({
      status: 'healthy',
      players: players.length,
      onlineCount: onlinePlayers.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Status check failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Database not accessible',
      timestamp: new Date().toISOString()
    });
  }
});

app.use(express.static(path.join(__dirname, '../public')));

// 在线玩家 Map: playerId -> ws
const onlinePlayers = new Map();

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

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
  const player  = getPlayerById(playerId);
  if (!player) return null;
  const eggs    = getActiveEggs(playerId);
  const pets    = getPetsByOwner(playerId);
  const tasks   = getDailyTasks(playerId);
  const pending = getPendingRequests(playerId);
  const maxSlots     = totalEggSlots(playerId);
  const guardSlots   = totalGuardSlots(playerId);
  return { player, eggs, pets, tasks, pending, maxSlots, guardSlots };
}

function buildVisitorView(targetId) {
  const player = getPlayerById(targetId);
  if (!player) return null;
  const eggs   = getActiveEggs(targetId);
  const guards = getGuards(targetId);
  return {
    player: {
      id: player.id, username: player.username,
      level: player.level, coins: player.coins,
      spa_level: player.spa_level || 1,
    },
    eggs, guards,
  };
}

// ============================================================
// 孵化定时器 — 每10秒扫描一次熟蛋
// ============================================================
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
    if (egg.rarity === 'legend') {
      const owner = getPlayerById(egg.owner_id);
      broadcast('LEGEND_HATCH', { owner: owner.username, petType: pet.type, petName: pet.name });
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

    // ── 放蛋（普通孵蛋） ──
    if (type === 'PLACE_EGG') {
      const { slot } = payload;
      const result = placeEgg(currentPlayerId, slot);
      if (result.error) return send(ws, 'ERROR', { code: result.error });
      send(ws, 'STATE_UPDATE', buildPlayerState(currentPlayerId));
      return;
    }

    // ── 商店购买蛋 ──
    if (type === 'BUY_EGG') {
      const { rarity } = payload;
      const result = buyEgg(currentPlayerId, rarity);
      if (result.error) {
        const msgs = {
          slots_full: '蛋池已满！',
          not_enough_coins: `金币不足！需要 ${SHOP_EGG_PRICES[rarity]} 🪙`,
          invalid_rarity: '无效品级',
        };
        return send(ws, 'ERROR', { code: result.error, msg: msgs[result.error] || result.error });
      }
      send(ws, 'EGG_PURCHASED', { egg: result, state: buildPlayerState(currentPlayerId) });
      return;
    }

    // ── 手动收取已孵蛋 ──
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
      if (!pet) return send(ws, 'ERROR', { code: 'HATCH_FAILED' });
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
      const maxGuard = totalGuardSlots(currentPlayerId);
      if (guardSlot >= maxGuard) return send(ws, 'ERROR', { code: 'SLOT_LOCKED', msg: '守卫槽未解锁' });
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
        return send(ws, 'ERROR', { code: 'EGG_GONE', msg: '蛋已消失或已孵化' });
      }

      const attackerPet    = attackerPetId
        ? getPetsByOwner(currentPlayerId).find(p => p.id === attackerPetId)
        : null;
      const defenderGuards = getGuards(targetId);

      const result = calcStealResult(attacker, defender, strategy, attackerPet, defenderGuards, eggId);
      if (result.reason === 'no_egg')             return send(ws, 'ERROR', { code: 'EGG_GONE' });
      if (result.reason === 'no_coins_for_bribe') return send(ws, 'ERROR', { code: 'NOT_ENOUGH_COINS', bribeCost: result.bribeCost });

      if (result.success) progressTask(currentPlayerId, 'steal');
      else                progressTask(targetId, 'defend');

      send(ws, 'STEAL_RESULT', {
        ...result, strategy,
        expGain: result.success ? 15 : 0,
        attackerState: buildPlayerState(currentPlayerId),
      });
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
      const { username, context } = payload;
      const target = getPlayerByName(username);
      if (!target) return send(ws, 'ERROR', { code: 'PLAYER_NOT_FOUND', msg: '找不到该玩家', context: context || 'social' });
      if (target.id === currentPlayerId) return send(ws, 'ERROR', { code: 'SEARCH_SELF', msg: '不能搜索自己', context: context || 'social' });
      send(ws, 'SEARCH_RESULT', {
        id: target.id, username: target.username,
        level: target.level, coins: target.coins,
        context: context || 'social',
      });
      return;
    }

    // ── 全服热门玩家（按金币排序取前10） ──
    if (type === 'GET_HOT_PLAYERS') {
      const list = getLeaderboard(10);
      send(ws, 'HOT_PLAYERS', { list });
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

    // ── 发送邻居申请 ──
    if (type === 'SEND_FRIEND_REQ') {
      const { targetId } = payload;
      const result = sendFriendRequest(currentPlayerId, targetId);
      if (result.error) {
        const msgs = {
          cant_add_self: '不能添加自己',
          already_neighbor: '已经是邻居了',
          player_not_found: '找不到该玩家',
          request_pending: '已发送过申请，等待对方同意',
        };
        return send(ws, 'ERROR', { code: result.error, msg: msgs[result.error] || result.error });
      }
      send(ws, 'FRIEND_REQ_SENT', { to: result.toPlayer });
      // 通知对方
      sendToPlayer(targetId, 'FRIEND_REQ_RECEIVED', {
        requestId: result.requestId,
        from: { id: getPlayerById(currentPlayerId).id, username: getPlayerById(currentPlayerId).username, level: getPlayerById(currentPlayerId).level },
      });
      return;
    }

    // ── 同意邻居申请 ──
    if (type === 'ACCEPT_FRIEND') {
      const { requestId, fromId } = payload;
      // 兼容两种传参方式
      const result = acceptFriendRequest(requestId || fromId, currentPlayerId);
      if (result.error) return send(ws, 'ERROR', { code: result.error, msg: '申请不存在或已处理' });
      send(ws, 'FRIEND_ACCEPTED', { neighbor: result.from, state: buildPlayerState(currentPlayerId) });
      // 通知申请方
      sendToPlayer(result.from.id, 'YOUR_REQUEST_ACCEPTED', {
        neighbor: result.to,
        state: buildPlayerState(result.from.id),
      });
      return;
    }

    // ── 拒绝邻居申请 ──
    if (type === 'REJECT_FRIEND') {
      const { requestId, fromId } = payload;
      const result = rejectFriendRequest(requestId || fromId, currentPlayerId);
      if (result.error) return send(ws, 'ERROR', { code: result.error });
      send(ws, 'STATE_UPDATE', buildPlayerState(currentPlayerId));
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

    // ── 邻居帮助加速孵化 ──
    if (type === 'BOOST_EGG') {
      const { targetId, eggId } = payload;
      const result = boostEgg(currentPlayerId, targetId, eggId);
      if (result.error) {
        const msgs = {
          not_neighbor:    '你们还不是邻居',
          boost_limit:     `今日助力次数已用完（每日最多3次）`,
          egg_not_found:   '蛋不存在',
          cant_boost_self: '不能为自己加速',
        };
        return send(ws, 'ERROR', { code: result.error, msg: msgs[result.error] || result.error });
      }
      progressTask(currentPlayerId, 'boost');
      send(ws, 'BOOST_DONE', { boosterExp: result.boosterExp, state: buildPlayerState(currentPlayerId) });
      // 通知被助力方
      sendToPlayer(targetId, 'EGG_BOOSTED', {
        eggId, newHatchAt: result.newHatchAt,
        booster: { username: getPlayerById(currentPlayerId).username },
        state: buildPlayerState(targetId),
      });
      return;
    }

    // ── 温泉池升级 ──
    if (type === 'UPGRADE_SPA') {
      const result = upgradeSpa(currentPlayerId);
      if (result.error) {
        const msgs = { max_level: '温泉池已达最高等级', not_enough_coins: `金币不足！` };
        return send(ws, 'ERROR', { code: result.error, msg: msgs[result.error] || result.error });
      }
      send(ws, 'UPGRADE_OK', { type: 'spa', newLevel: result.newLevel, state: buildPlayerState(currentPlayerId) });
      return;
    }

    // ── 购买额外守卫槽 ──
    if (type === 'BUY_GUARD_SLOT') {
      const result = buyGuardSlot(currentPlayerId);
      if (result.error) {
        const msgs = { max_slots: '守卫槽已达上限', not_enough_coins: `需要 ${EXTRA_GUARD_COST} 🪙` };
        return send(ws, 'ERROR', { code: result.error, msg: msgs[result.error] || result.error });
      }
      send(ws, 'UPGRADE_OK', { type: 'guard_slot', state: buildPlayerState(currentPlayerId) });
      return;
    }

    // ── 购买额外蛋槽 ──
    if (type === 'BUY_EGG_SLOT') {
      const result = buyEggSlot(currentPlayerId);
      if (result.error) {
        const msgs = { max_slots: '蛋槽已达上限（6个）', not_enough_coins: `需要 ${EXTRA_EGG_SLOT_COST} 🪙` };
        return send(ws, 'ERROR', { code: result.error, msg: msgs[result.error] || result.error });
      }
      send(ws, 'UPGRADE_OK', { type: 'egg_slot', state: buildPlayerState(currentPlayerId) });
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
// HTTP 路由（静态文件）
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================================
// 启动
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌸 温泉宠物镇服务器 v2 已启动 → http://localhost:${PORT}`);
});