// ============================================================
// game.js — 客户端 WebSocket 逻辑 + UI 控制器
// ============================================================

// ── WebSocket 连接 ──
const WS_URL = location.protocol === 'https:'
  ? `wss://${location.host}`
  : `ws://${location.host}`;

let ws = null;
let state = null;        // 当前玩家完整状态
let visitView = null;    // 当前访问的他人视图
let selectedEggId = null;
let selectedStrategy = null;
let selectedAttackerPetId = null;
let prevLevel = 1;       // 升级检测用

// ============================================================
// WebSocket 初始化
// ============================================================
function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('✅ WebSocket 已连接');
    // 自动重连间隔重置
    reconnectDelay = 1000;
  };

  ws.onmessage = (ev) => {
    const { type, payload } = JSON.parse(ev.data);
    handleServerMsg(type, payload);
  };

  ws.onclose = () => {
    console.warn('⚠️ WebSocket 断开，3秒后重连');
    setTimeout(connectWS, 3000);
  };
}

let reconnectDelay = 1000;

function send(type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

// ============================================================
// 服务端消息处理（基础路由，由下方完整版覆盖）
// ============================================================
function _baseMsgHandler(type, payload) {
  switch (type) {
    case 'LOGGED_IN':
      onLoggedIn(payload);
      break;

    case 'BEEN_STOLEN':
      state = payload.defenderState;
      renderMyScene();
      if (payload.success) {
        showGlobalNotice(`⚠️ ${payload.attacker.username} 偷走了你的蛋！`);
      } else {
        showGlobalNotice(`🛡️ 守卫成功阻止了 ${payload.attacker.username} 的偷窃！`);
      }
      break;

    case 'LEGEND_HATCH':
      showGlobalNotice(`✨ 全服广播：${payload.owner} 孵出了传说宠物 ${petTypeLabel(payload.petType)}！快去偷蛋！`);
      break;

    case 'VISITOR_VIEW':
      visitView = payload;
      renderVisitView();
      updateStealRates();
      break;

    case 'SEARCH_RESULT':
      onSearchResult(payload);
      break;

    case 'LEADERBOARD':
      renderLeaderboard(payload.list);
      renderHotNeighborList(payload.list);
      break;

    case 'ERROR':
      showError(payload.msg || payload.code);
      break;

    default:
      console.log('[server]', type, payload);
  }
}


// ============================================================
// 登录/注册界面
// ============================================================
let loginMode = 'login'; // 'login' | 'register'

document.getElementById('login-submit').addEventListener('click', () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!username || !password) return showLoginError('请填写用户名和密码');
  send(loginMode === 'login' ? 'LOGIN' : 'REGISTER', { username, password });
});

document.getElementById('login-switch').addEventListener('click', () => {
  loginMode = loginMode === 'login' ? 'register' : 'login';
  document.getElementById('login-title').textContent = loginMode === 'login' ? '登录' : '注册';
  document.getElementById('login-submit').textContent = loginMode === 'login' ? '🌸 进入游戏' : '🥚 创建账号';
  document.getElementById('login-switch').textContent =
    loginMode === 'login' ? '还没有账号？点此注册' : '已有账号？点此登录';
});

function showLoginError(msg) {
  document.getElementById('login-err').textContent = msg;
}

function onLoggedIn(payload) {
  state = payload;
  prevLevel = payload.player.level;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  updateTopbar();
  renderMyScene();
  // 启动本地定时器刷新倒计时
  startCountdownLoop();
  // 初始化温泉背景
  const bgCanvas = document.getElementById('spa-bg-canvas');
  if (bgCanvas) PixelRender.drawSpaBackground(bgCanvas);
  // 加载邻居列表
  send('GET_NEIGHBORS');
}

// ============================================================
// 顶栏更新（含EXP进度条）
// ============================================================
function updateTopbar() {
  if (!state) return;
  const p = state.player;
  document.getElementById('tb-name').textContent = p.username;
  document.getElementById('tb-level').textContent = `Lv.${p.level}`;
  document.getElementById('tb-coins').textContent = `🪙 ${p.coins}`;
  const needed = p.level * 100;
  const pct = Math.min(100, Math.floor((p.exp / needed) * 100));
  // 支持新版EXP进度条
  const expLabel = document.getElementById('tb-exp-label');
  const expFill  = document.getElementById('tb-exp-fill');
  const expOld   = document.getElementById('tb-exp');
  if (expLabel) expLabel.textContent = `EXP ${p.exp}/${needed}`;
  if (expFill)  expFill.style.width = pct + '%';
  if (expOld)   expOld.textContent  = `EXP ${p.exp}/${needed}`;
}

// ============================================================
// 升级检测与弹窗
// ============================================================
function checkLevelUp(newState) {
  if (!newState || !newState.player) return;
  const newLv = newState.player.level;
  if (newLv > prevLevel) {
    prevLevel = newLv;
    showLevelUpModal(newLv);
  }
}

function showLevelUpModal(level) {
  const slotMsg = { 3:'🎁 解锁第3个蛋池槽位！', 5:'🎁 解锁第4个蛋池槽位！', 10:'🎁 解锁第5个蛋池槽位（上限）！' };
  const extra = slotMsg[level] ? '\n' + slotMsg[level] : '';
  const descEl = document.getElementById('levelup-desc');
  const modal  = document.getElementById('levelup-modal');
  if (descEl) descEl.textContent = `恭喜升到 Lv.${level}！${extra}\n继续孵蛋·偷蛋·完成任务获得更多经验！`;
  if (modal)  modal.classList.add('active');
  else        showModal(`🎉 升级了！ Lv.${level}`, `升到 Lv.${level}！${extra}`, true);
}

const levelupCloseBtn = document.getElementById('levelup-close');
if (levelupCloseBtn) {
  levelupCloseBtn.addEventListener('click', () => {
    const m = document.getElementById('levelup-modal');
    if (m) m.classList.remove('active');
  });
}

// ============================================================
// 主场景渲染（我的蛋池）
// ============================================================
function renderMyScene() {
  updateTopbar();
  renderEggPool();
  renderGuardSlots();
  renderPetList();
  renderTrapList();
  renderTaskList();
}

// ── 蛋池 ──
function renderEggPool() {
  const pool = document.getElementById('egg-pool');
  pool.innerHTML = '';
  const maxSlots = state.maxSlots || 2;
  const eggs = state.eggs || [];

  for (let slot = 0; slot < maxSlots; slot++) {
    const egg = eggs.find(e => e.slot === slot);
    const div = document.createElement('div');

    if (egg) {
      const now = Math.floor(Date.now() / 1000);
      const total = egg.hatch_at - egg.placed_at;
      const elapsed = Math.min(now - egg.placed_at, total);
      const progress = elapsed / total;
      const isReady = now >= egg.hatch_at;

      div.className = 'egg-slot';
      // 稀有度标签
      const badge = document.createElement('div');
      badge.className = `rarity-badge ${egg.rarity}`;
      badge.textContent = rarityLabel(egg.rarity);
      div.appendChild(badge);

      // Canvas 蛋
      const canvas = document.createElement('canvas');
      canvas.className = 'egg-canvas';
      PixelRender.drawEgg(canvas, egg.rarity, progress);
      div.appendChild(canvas);

      // 倒计时
      const timer = document.createElement('div');
      timer.className = 'egg-timer';
      timer.dataset.eggId = egg.id;
      timer.dataset.hatchAt = egg.hatch_at;
      if (isReady) {
        timer.innerHTML = `<div class="ready">✨ 点击孵化！</div>`;
        div.addEventListener('click', () => send('COLLECT_EGG', { eggId: egg.id }));
      } else {
        timer.innerHTML = `<div class="time-left">${formatTime(egg.hatch_at - now)}</div><div>孵化中</div>`;
        div.addEventListener('click', () => {
          showGlobalNotice('蛋还没孵好！等等呀~');
        });
      }
      div.appendChild(timer);
    } else {
      div.className = 'egg-slot empty';
      div.addEventListener('click', () => {
        if (state.player.coins < 10) return showGlobalNotice('金币不足 10！');
        send('PLACE_EGG', { slot });
      });
    }
    pool.appendChild(div);
  }
}

// ── 守卫槽（显示当前守卫宠物） ──
function renderGuardSlots() {
  const container = document.getElementById('guard-slots');
  container.innerHTML = '';
  const guards = (state.pets || []).filter(p => p.role === 'guard');

  for (let i = 0; i < 2; i++) {
    const guard = guards.find(g => g.guard_slot === i);
    const div = document.createElement('div');
    div.className = 'guard-slot' + (guard ? '' : ' empty');

    const label = document.createElement('div');
    label.className = 'slot-label';
    label.textContent = `守卫槽 ${i + 1}`;
    div.appendChild(label);

    if (guard) {
      const canvas = document.createElement('canvas');
      PixelRender.drawPet(canvas, guard.type, guard.rarity);
      div.appendChild(canvas);
      const name = document.createElement('div');
      name.style.cssText = 'font-size:6px;margin-top:3px;text-align:center;';
      name.textContent = guard.name;
      div.appendChild(name);
      div.addEventListener('click', () => {
        if (confirm(`撤回守卫 ${guard.name}？`)) send('UNGUARD', { petId: guard.id });
      });
    } else {
      const txt = document.createElement('div');
      txt.style.cssText = 'font-size:7px;opacity:0.5;margin-top:8px;';
      txt.textContent = '空置';
      div.appendChild(txt);
    }

    // 陷阱展示
    const trap = (state.traps || []).find(t => t.slot === i && !t.triggered);
    if (trap) {
      const tc = document.createElement('canvas');
      PixelRender.drawTrap(tc, trap.type);
      tc.style.marginTop = '4px';
      div.appendChild(tc);
      const tl = document.createElement('div');
      tl.style.cssText = 'font-size:6px;color:#5C4A6B;text-align:center;';
      tl.textContent = trapLabel(trap.type);
      div.appendChild(tl);
    }

    container.appendChild(div);
  }
}

// ── 宠物列表（含经验条）──
function renderPetList() {
  const list = document.getElementById('pet-list');
  list.innerHTML = '';
  const pets = state.pets || [];
  if (pets.length === 0) {
    list.innerHTML = '<div style="font-size:8px;opacity:0.5;">还没有宠物，快去孵蛋吧！</div>';
    return;
  }
  pets.forEach(pet => {
    const card = document.createElement('div');
    card.className = 'pet-card' + (pet.role === 'guard' ? ' guard-active' : '');

    if (pet.role === 'guard') {
      const tag = document.createElement('div');
      tag.className = 'guard-tag';
      tag.textContent = '守卫中';
      card.appendChild(tag);
    }

    const canvas = document.createElement('canvas');
    PixelRender.drawPet(canvas, pet.type, pet.rarity);
    card.appendChild(canvas);

    const needed = pet.level * 50;
    const expPct  = Math.min(100, Math.floor(((pet.exp || 0) / needed) * 100));

    const info = document.createElement('div');
    info.style.cssText = 'width:100%;';
    info.innerHTML = `
      <div class="pet-name">${pet.name}</div>
      <div class="pet-level">Lv.${pet.level}</div>
      <div class="pet-rarity">${rarityLabel(pet.rarity)}</div>
      <div class="pet-stats">
        <span>⚔️${pet.atk}</span>
        <span>🛡️${pet.def}</span>
        <span>💨${pet.spd}</span>
      </div>
      <div style="font-size:6px;opacity:0.7;margin-top:3px;">EXP ${pet.exp||0}/${needed}</div>
      <div class="pet-exp-bar"><div class="fill" style="width:${expPct}%"></div></div>
    `;
    card.appendChild(info);

    // 点击管理守卫
    card.addEventListener('click', () => openPetActionModal(pet));
    list.appendChild(card);
  });
}

// 宠物管理弹窗（替代 prompt）
let petActionTarget = null;
function openPetActionModal(pet) {
  petActionTarget = pet;
  const modal = document.getElementById('pet-action-modal');
  if (!modal) {
    // 降级处理
    openPetActions(pet);
    return;
  }
  document.getElementById('pet-action-name').textContent = `${pet.name} · ${rarityLabel(pet.rarity)} Lv.${pet.level}`;
  const guardBtn = document.getElementById('pet-action-guard');
  if (pet.role === 'guard') {
    guardBtn.textContent = '🔓 撤回守卫';
    guardBtn.onclick = () => { send('UNGUARD', { petId: pet.id }); modal.classList.remove('active'); };
  } else {
    guardBtn.textContent = '🛡️ 设为守卫';
    guardBtn.onclick = () => {
      const freeSlot = [0,1].find(i => !(state.pets||[]).some(p => p.role==='guard' && p.guard_slot===i));
      if (freeSlot === undefined) { showGlobalNotice('守卫槽已满！先撤回一只再试'); return; }
      send('SET_GUARD', { petId: pet.id, guardSlot: freeSlot });
      modal.classList.remove('active');
    };
  }
  modal.classList.add('active');
}

function openPetActions(pet) {
  if (pet.role === 'guard') {
    if (confirm(`撤回守卫 ${pet.name}？`)) send('UNGUARD', { petId: pet.id });
    return;
  }
  const slot = prompt(`将 ${pet.name} 设为守卫槽 1 还是 2？（输入 1 或 2）`);
  if (slot === '1') send('SET_GUARD', { petId: pet.id, guardSlot: 0 });
  else if (slot === '2') send('SET_GUARD', { petId: pet.id, guardSlot: 1 });
}

// 宠物弹窗关闭
const petActionClose = document.getElementById('pet-action-close');
if (petActionClose) petActionClose.addEventListener('click', () => {
  document.getElementById('pet-action-modal').classList.remove('active');
});

// ── 陷阱购买区 ──
function renderTrapList() {
  // 该区域已在HTML静态声明，只需绑定按钮事件
}

// ── 任务列表（含奖励显示）──
function renderTaskList() {
  const list = document.getElementById('task-list-container');
  if (!list) return;
  list.innerHTML = '';
  const tasks = state.tasks || [];
  const templates = [
    { type: 'signin',  desc: '每日签到',      target: 1, reward_coins: 15, reward_exp: 5  },
    { type: 'steal',   desc: '偷窃成功 2 次', target: 2, reward_coins: 30, reward_exp: 20 },
    { type: 'defend',  desc: '成功防御 1 次', target: 1, reward_coins: 20, reward_exp: 15 },
    { type: 'hatch',   desc: '孵化 1 只宠物', target: 1, reward_coins: 25, reward_exp: 10 },
  ];
  templates.forEach(tmpl => {
    const task = tasks.find(t => t.task_type === tmpl.type);
    const prog  = task ? task.progress : 0;
    const done  = task ? task.completed : false;
    const target = tmpl.target;
    const pct = Math.min(100, Math.floor((prog / target) * 100));

    const item = document.createElement('div');
    item.className = 'task-item' + (done ? ' done' : '');
    item.innerHTML = `
      <div class="task-check">${done ? '✅' : '⭕'}</div>
      <div class="task-desc">
        <span>${tmpl.desc}</span>
        <div class="task-prog-bar"><div class="fill" style="width:${pct}%"></div></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:52px;">
        <div class="task-prog">${prog}/${target}</div>
        <div class="task-reward">+${tmpl.reward_coins}🪙 +${tmpl.reward_exp}EXP</div>
      </div>
    `;
    list.appendChild(item);
  });
}

// ============================================================
// 访问他人（偷窃面板）
// ============================================================
function renderVisitView() {
  if (!visitView) return;
  const vv = document.getElementById('visit-view');
  vv.style.display = 'block';

  const p = visitView.player;
  document.getElementById('visit-target-name').textContent = `${p.username}  Lv.${p.level}`;
  document.getElementById('visit-target-coins').textContent = `🪙 ${p.coins}`;

  // 守卫展示
  const guardInfo = document.getElementById('visit-guards');
  guardInfo.innerHTML = '';
  if (visitView.guards.length === 0) {
    guardInfo.innerHTML = '<span style="font-size:7px;opacity:0.6;">无守卫</span>';
  } else {
    visitView.guards.forEach(g => {
      const canvas = document.createElement('canvas');
      PixelRender.drawPet(canvas, g.type, g.rarity);
      canvas.title = `${g.name} DEF:${g.def}`;
      guardInfo.appendChild(canvas);
    });
  }

  // 陷阱提示
  const trapInfo = document.getElementById('visit-traps');
  trapInfo.innerHTML = visitView.traps.length > 0
    ? `⚠️ 检测到 ${visitView.traps.length} 个陷阱`
    : '无陷阱';

  // 蛋列表
  const eggsContainer = document.getElementById('visit-target-eggs');
  eggsContainer.innerHTML = '';
  if (visitView.eggs.length === 0) {
    eggsContainer.innerHTML = '<div style="font-size:8px;opacity:0.6;">没有蛋可偷</div>';
  } else {
    visitView.eggs.forEach(egg => {
      const now = Math.floor(Date.now() / 1000);
      const total = egg.hatch_at - egg.placed_at;
      const progress = Math.min((now - egg.placed_at) / total, 1);

      const card = document.createElement('div');
      card.className = 'visit-egg-card' + (selectedEggId === egg.id ? ' selected' : '');

      const canvas = document.createElement('canvas');
      PixelRender.drawEgg(canvas, egg.rarity, progress);
      card.appendChild(canvas);

      const info = document.createElement('div');
      info.style.cssText = 'font-size:7px;text-align:center;';
      info.textContent = rarityLabel(egg.rarity);
      card.appendChild(info);

      const prog = document.createElement('div');
      prog.style.cssText = 'font-size:6px;color:#7DAF8C;';
      prog.textContent = `进度${Math.floor(progress * 100)}%`;
      card.appendChild(prog);

      card.addEventListener('click', () => {
        selectedEggId = egg.id;
        renderVisitView(); // 重绘选中状态
        document.getElementById('strategy-panel').classList.add('active');
        renderAttackerPetSelect();
      });
      eggsContainer.appendChild(card);
    });
  }
}

function renderAttackerPetSelect() {
  const container = document.getElementById('attacker-pet-select');
  container.innerHTML = '<div style="font-size:7px;margin-bottom:4px;width:100%;">选择出击宠物（可不选）：</div>';

  const noneOpt = document.createElement('div');
  noneOpt.className = 'attacker-pet-opt' + (!selectedAttackerPetId ? ' selected' : '');
  noneOpt.textContent = '不选';
  noneOpt.addEventListener('click', () => {
    selectedAttackerPetId = null;
    renderAttackerPetSelect();
  });
  container.appendChild(noneOpt);

  (state.pets || []).filter(p => p.role !== 'guard').forEach(pet => {
    const opt = document.createElement('div');
    opt.className = 'attacker-pet-opt' + (selectedAttackerPetId === pet.id ? ' selected' : '');
    opt.innerHTML = `${pet.name}<br><span style="opacity:0.7">ATK${pet.atk} SPD${pet.spd}</span>`;
    opt.addEventListener('click', () => {
      selectedAttackerPetId = pet.id;
      renderAttackerPetSelect();
    });
    container.appendChild(opt);
  });
}

// 策略按钮
document.querySelectorAll('.strategy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedStrategy = btn.dataset.strategy;
  });
});

document.getElementById('confirm-steal').addEventListener('click', () => {
  if (!selectedEggId) return showGlobalNotice('请先选择一颗蛋！');
  if (!selectedStrategy) return showGlobalNotice('请选择偷窃策略！');
  if (!visitView) return;

  send('STEAL', {
    targetId: visitView.player.id,
    eggId: selectedEggId,
    strategy: selectedStrategy,
    attackerPetId: selectedAttackerPetId,
  });

  // 重置选择
  selectedEggId = null;
  selectedStrategy = null;
  selectedAttackerPetId = null;
  document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('strategy-panel').classList.remove('active');
});

// ============================================================
// 排行榜
// ============================================================
function renderLeaderboard(list) {
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '';
  list.forEach((p, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'rank-1';
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${i < 3 ? ['🥇','🥈','🥉'][i] : ''} ${p.username}</td>
      <td>Lv.${p.level}</td>
      <td>🪙 ${p.coins}</td>
      <td><button class="btn small" onclick="visitPlayer('${p.id}')">去看看</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// 搜索玩家
// ============================================================
document.getElementById('search-btn').addEventListener('click', () => {
  const name = document.getElementById('search-input').value.trim();
  if (!name) return;
  send('SEARCH_PLAYER', { username: name });
});

document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('search-btn').click();
});

function onSearchResult(player) {
  const resultDiv = document.getElementById('search-result');
  resultDiv.innerHTML = `
    <div class="px-border" style="padding:10px;background:var(--bg);display:inline-flex;align-items:center;gap:14px;">
      <div>
        <div style="font-size:9px;">${player.username}</div>
        <div style="font-size:7px;opacity:0.7;">Lv.${player.level} · 🪙${player.coins}</div>
      </div>
      <button class="btn small" onclick="visitPlayer('${player.id}')">前去偷蛋</button>
    </div>
  `;
}

function visitPlayer(targetId) {
  send('VIEW_PLAYER', { targetId });
  switchTab('steal');
}
window.visitPlayer = visitPlayer;

// ============================================================
// 陷阱购买
// ============================================================
document.querySelectorAll('.trap-item').forEach(item => {
  item.addEventListener('click', () => {
    const type = item.dataset.trapType;
    const slot = parseInt(item.dataset.slot ?? 0);
    // 弹出槽位选择
    const s = prompt('放到守卫槽 1 还是 2？（输入 1 或 2）');
    if (s === '1') send('PLACE_TRAP', { slot: 0, trapType: type });
    else if (s === '2') send('PLACE_TRAP', { slot: 1, trapType: type });
  });
});

// ============================================================
// 每日签到
// ============================================================
document.getElementById('signin-btn').addEventListener('click', () => {
  send('DAILY_SIGNIN');
});

// ============================================================
// Tab 导航
// ============================================================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tabName) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tabName));

  if (tabName === 'leaderboard') send('GET_LEADERBOARD');
  if (tabName === 'my') renderMyScene();
}

// ============================================================
// 倒计时循环（每秒刷新蛋池计时器）
// ============================================================
function startCountdownLoop() {
  setInterval(() => {
    document.querySelectorAll('.egg-timer').forEach(timer => {
      const hatchAt = parseInt(timer.dataset.hatchAt);
      const now = Math.floor(Date.now() / 1000);
      const remain = hatchAt - now;
      if (remain <= 0) {
        timer.innerHTML = `<div class="ready">✨ 点击孵化！</div>`;
      } else {
        timer.querySelector('.time-left') && (timer.querySelector('.time-left').textContent = formatTime(remain));
      }
    });
  }, 1000);
}

// ============================================================
// 弹窗 / 全服通知
// ============================================================
function showModal(title, desc, isSuccess) {
  const modal = document.getElementById('result-modal');
  modal.querySelector('.modal-title').textContent = title;
  modal.querySelector('.modal-title').className = 'modal-title ' + (isSuccess ? 'success' : 'fail');
  modal.querySelector('.modal-desc').textContent = desc;
  modal.classList.add('active');
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('result-modal').classList.remove('active');
});

let noticeTimer = null;
function showGlobalNotice(msg, duration = 3500) {
  const el = document.getElementById('global-notice');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { el.style.display = 'none'; }, duration);
}

function showError(msg) {
  showGlobalNotice('❌ ' + msg, 4000);
}

// ============================================================
// 工具函数
// ============================================================
function formatTime(secs) {
  if (secs <= 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function rarityLabel(r) {
  return r === 'legend' ? '传说' : r === 'rare' ? '稀有' : '普通';
}

function petTypeLabel(t) {
  const map = { bear:'小熊', fox:'狐狸', bunny:'兔子', cat:'猫咪', dragon:'小龙' };
  return map[t] || t;
}

function trapLabel(t) {
  const map = { mud:'泥潭', thorn:'荆棘', sleep:'睡眠香' };
  return map[t] || t;
}

// ============================================================
// 偷窃成功率预测（本地计算）
// ============================================================
function calcStealRate(strategy) {
  if (!visitView || !state) return '--';
  const defenders = visitView.guards || [];
  const attacker  = selectedAttackerPetId
    ? (state.pets || []).find(p => p.id === selectedAttackerPetId)
    : null;

  const atkAtk = attacker ? attacker.atk : 10;
  const atkSpd = attacker ? attacker.spd : 10;
  const atkDef = attacker ? attacker.def : 10;

  const totalDefDef = defenders.reduce((s, g) => s + (g.def || 10), 0) || 1;
  const totalDefSpd = defenders.reduce((s, g) => s + (g.spd || 10), 0) || 1;
  const totalDefAtk = defenders.reduce((s, g) => s + (g.atk || 10), 0) || 1;

  const hasTrap = (visitView.traps || []).length > 0;
  const trapPenalty = hasTrap ? 0.85 : 1.0;

  let rate = 0;
  if (strategy === 'charge') {
    // 强攻：ATK vs DEF
    rate = atkAtk / (atkAtk + totalDefDef);
  } else if (strategy === 'sneak') {
    // 潜行：SPD vs DEF SPD
    rate = atkSpd / (atkSpd + totalDefSpd) * 0.9;
  } else if (strategy === 'bribe') {
    // 贿赂：固定70%基础 - 守卫数量影响
    rate = 0.7 - defenders.length * 0.12;
    rate = Math.max(0.1, rate);
  }

  rate *= trapPenalty;
  rate = Math.min(0.92, Math.max(0.05, rate));
  return Math.round(rate * 100) + '%';
}

function updateStealRates() {
  const strategies = ['charge', 'sneak', 'bribe'];
  strategies.forEach(s => {
    const el = document.getElementById(`rate-${s}`);
    if (el) el.textContent = `成功率 ${calcStealRate(s)}`;
  });
}

// 每次策略按钮点击后更新成功率
document.querySelectorAll('.strategy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    updateStealRates();
  });
});

// ============================================================
// 孵化稀有/传说专属弹窗
// ============================================================
function showHatchModal(pet) {
  if (pet.rarity === 'legend') {
    showModal(
      `🌟✨ 传说宠物孵化！✨🌟`,
      `极其罕见！\n孵出了 ${petTypeLabel(pet.type)}！\nATK ${pet.atk} · DEF ${pet.def} · SPD ${pet.spd}\n\n快去让它守护你的蛋池！`,
      true
    );
  } else if (pet.rarity === 'rare') {
    showModal(
      `⭐ 稀有宠物孵化！`,
      `运气不错！孵出了 ${petTypeLabel(pet.type)}！\nATK ${pet.atk} · DEF ${pet.def} · SPD ${pet.spd}`,
      true
    );
  } else {
    showModal(
      `🥚 蛋孵化了！`,
      `孵出了 ${rarityLabel(pet.rarity)} ${petTypeLabel(pet.type)}！\nATK ${pet.atk} · DEF ${pet.def} · SPD ${pet.spd}`,
      true
    );
  }
}

// ============================================================
// 邻居系统
// ============================================================
function renderNeighborList(list) {
  const container = document.getElementById('neighbor-list');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = '<div style="font-size:8px;opacity:0.5;padding:10px;">还没有邻居，去偷蛋后点击"添加邻居"吧！</div>';
    return;
  }
  list.forEach(n => {
    const card = document.createElement('div');
    card.className = 'neighbor-card';
    card.innerHTML = `
      <div class="neighbor-info">
        <div style="font-size:9px;font-weight:bold;">${n.username}</div>
        <div style="font-size:7px;opacity:0.7;">Lv.${n.level} · 🪙${n.coins}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn small" onclick="visitNeighbor('${n.id}')">🥚 去偷</button>
        <button class="btn small danger" onclick="removeNeighbor('${n.id}')">✕</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderHotNeighborList(leaderboardList) {
  // 排行榜数据同步到邻居推荐列表（若有该容器）
  const recContainer = document.getElementById('neighbor-recommend') || document.getElementById('hot-neighbor-list');
  if (!recContainer) return;
  recContainer.innerHTML = '';
  leaderboardList.slice(0, 5).forEach(p => {
    if (p.id === (state && state.player.id)) return;
    const item = document.createElement('div');
    item.className = 'neighbor-card';
    item.innerHTML = `
      <div class="neighbor-info">
        <div style="font-size:9px;">${p.username}</div>
        <div style="font-size:7px;opacity:0.7;">Lv.${p.level} · 🪙${p.coins}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn small" onclick="visitNeighbor('${p.id}')">👀 去看</button>
        <button class="btn small" onclick="addNeighbor('${p.id}')">➕</button>
      </div>
    `;
    recContainer.appendChild(item);
  });
}

function visitNeighbor(targetId) {
  send('VIEW_PLAYER', { targetId });
  switchTab('steal');
}
window.visitNeighbor = visitNeighbor;

function addNeighbor(targetId) {
  send('ADD_NEIGHBOR', { targetId });
}
window.addNeighbor = addNeighbor;

function removeNeighbor(targetId) {
  send('REMOVE_NEIGHBOR', { targetId });
  setTimeout(() => send('GET_NEIGHBORS'), 300);
}
window.removeNeighbor = removeNeighbor;

// 访问某人时提供"添加邻居"按钮
function addCurrentVisitAsNeighbor() {
  if (!visitView) return;
  send('ADD_NEIGHBOR', { targetId: visitView.player.id });
}
window.addCurrentVisitAsNeighbor = addCurrentVisitAsNeighbor;

// ============================================================
// 更新消息路由：支持新事件类型
// ============================================================
function handleServerMsg(type, payload) {
  switch(type) {
    case 'NEIGHBOR_ADDED':
      showGlobalNotice(`✅ 已添加邻居！`);
      send('GET_NEIGHBORS');
      break;
    case 'NEIGHBORS_LIST':
      renderNeighborList(payload.list);
      break;
    case 'EGG_HATCHED':
      // 升级检测
      checkLevelUp(payload.state);
      state = payload.state;
      renderMyScene();
      showHatchModal(payload.pet);
      break;
    case 'STEAL_RESULT':
      checkLevelUp(payload.attackerState);
      state = payload.attackerState;
      renderMyScene();
      showStealResultModal(payload);
      break;
    case 'STATE_UPDATE':
      checkLevelUp(payload);
      state = payload;
      renderMyScene();
      break;
    case 'SIGNIN_OK':
      checkLevelUp(payload);
      state = payload;
      renderMyScene();
      showModal('✅ 签到成功！', '获得 20 金币！+5 EXP\n签到任务进度 +1', true);
      break;
    default:
      _baseMsgHandler(type, payload);
  }
}

// 偷窃详情弹窗
function showStealResultModal(payload) {
  if (payload.success) {
    showModal('🎉 偷窃成功！',
      `策略：${strategyLabel(payload.strategy)}\n` +
      `成功带走了一颗 ${rarityLabel(payload.eggRarity)} 蛋！\n` +
      `获得 🪙${payload.coinsGain} 金币 · EXP +${payload.expGain || 10}`,
      true
    );
  } else {
    const trapMsg = payload.triggeredTrap
      ? `\n踩到了 ${trapLabel(payload.triggeredTrap.type)}！` : '';
    const penMsg  = payload.penaltyCoins > 0
      ? `损失 🪙${payload.penaltyCoins}` : '没有损失金币';
    showModal('😢 偷窃失败！',
      `策略：${strategyLabel(payload.strategy)}\n被守卫拦截！${penMsg}${trapMsg}`,
      false
    );
  }
}

function strategyLabel(s) {
  const m = { charge:'强攻', sneak:'潜行', bribe:'贿赂' };
  return m[s] || s;
}

// ============================================================
// 偷窃面板"添加邻居"按钮绑定
// ============================================================
const addNeighborBtn = document.getElementById('add-neighbor-btn') || document.getElementById('visit-add-neighbor-btn');
if (addNeighborBtn) {
  addNeighborBtn.addEventListener('click', addCurrentVisitAsNeighbor);
}

// 邻居标签切换时加载列表
document.querySelectorAll('.nav-btn').forEach(btn => {
  if (btn.dataset.tab === 'neighbors') {
    btn.addEventListener('click', () => {
      send('GET_NEIGHBORS');
      send('GET_LEADERBOARD'); // 同时加载推荐列表
    });
  }
});

// ============================================================
// 启动
// ============================================================
connectWS();
// 初始显示登录界面
document.getElementById('game-screen').style.display = 'none';
