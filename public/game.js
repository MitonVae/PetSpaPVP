// ============================================================
// game.js — 客户端完整控制器（重写版）
// ============================================================

// ── 全局状态 ──
const WS_URL = location.protocol === 'https:'
  ? `wss://${location.host}` : `ws://${location.host}`;

let ws = null;
let state = null;
let visitView = null;
let selectedEggId = null;
let selectedStrategy = null;
let selectedAttackerPetId = null;
let prevLevel = 1;
let guardSlotTarget = -1;
let petActionTarget = null;

// ── 登录/注册 等待队列（WS未就绪时暂存） ──
window._wsQueue = [];

// ── WebSocket ──
function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('✅ WS connected');
    // 冲刷登录等待队列
    if (window._wsQueue && window._wsQueue.length > 0) {
      console.log('📤 冲刷 WS 队列，共', window._wsQueue.length, '条');
      window._wsQueue.forEach(function(data) {
        ws.send(data);
        console.log('📤 队列发送:', data);
      });
      window._wsQueue = [];
    }
    // 通知 index.html 的脚本 WS 已就绪
    if (typeof window._onWsReady === 'function') window._onWsReady();
  };

  ws.onclose = () => setTimeout(connectWS, 3000);
  ws.onmessage = (ev) => {
    try { const { type, payload } = JSON.parse(ev.data); handleServerMsg(type, payload); }
    catch(e) { console.error('WS parse error', e); }
  };
}

function send(type, payload = {}) {
  const data = JSON.stringify({ type, payload });
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  } else {
    // WS 未就绪时放入队列，onopen 时自动发送
    console.log('⏳ WS 未就绪，入队:', type);
    window._wsQueue.push(data);
  }
}

// ── Toast ──
function showToast(msg, cls = 'info', ms = 3000) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}
function showError(msg)   { showToast('❌ ' + msg, 'error', 4000); }
function showSuccess(msg) { showToast('✅ ' + msg, 'success'); }
function showInfo(msg)    { showToast(msg, 'info'); }

// ── 全服通知条 ──
let _noticeT = null;
function showGlobalNotice(msg) {
  const el = document.getElementById('global-notice');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('active');
  clearTimeout(_noticeT);
  _noticeT = setTimeout(() => el.classList.remove('active'), 4000);
}

// ── 弹窗 ──
function showModal(title, desc, ok) {
  const m = document.getElementById('result-modal');
  if (!m) return;
  m.querySelector('.modal-title').textContent = title;
  m.querySelector('.modal-title').className = 'modal-title ' + (ok ? 'success' : 'fail');
  m.querySelector('.modal-desc').textContent = desc;
  m.classList.add('active');
}

// ── 工具函数 ──
function formatTime(secs) {
  if (secs <= 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h${String(m).padStart(2,'0')}m`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function rarityLabel(r)    { return {legend:'传说',rare:'稀有',common:'普通'}[r] || r; }
function petClassLabel(c)  { return {fighter:'战斗型',skill:'技能型'}[c] || c; }
function petTypeLabel(t)   {
  return {bear:'小熊',fox:'狐狸',bunny:'兔子',cat:'猫咪',dragon:'小龙',
          wolf:'灰狼',turtle:'神龟',phoenix:'凤凰'}[t] || t;
}
function strategyLabel(s)  { return {fight:'强攻',sneak:'潜行',bribe:'贿赂'}[s] || s; }
function skillLabel(sk)    {
  return {mud:'泥潭减速',thorn:'荆棘反伤',sleep:'催眠术',
          heal:'温泉治愈',shield:'铁甲护盾'}[sk] || sk;
}

// ── Tab 切换 ──
function switchTab(tabId) {
  // HTML 中按钮用 data-panel，面板 id 也是 panel 名，统一用 data-panel
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', (b.dataset.panel || b.dataset.tab) === tabId));
  document.querySelectorAll('.panel').forEach(p =>
    p.classList.toggle('active', p.id === tabId));
  if (tabId === 'leaderboard') send('GET_LEADERBOARD');
  if (tabId === 'social') { send('GET_NEIGHBORS'); send('GET_HOT_PLAYERS'); }
}

// ── 子导航切换（社交面板内） ──
function switchSubTab(subId) {
  document.querySelectorAll('.sub-nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sub === subId));
  document.querySelectorAll('.sub-panel').forEach(p =>
    p.classList.toggle('active', p.id === subId));
  if (subId === 'sub-neighbors') send('GET_NEIGHBORS');
  if (subId === 'sub-raid') send('GET_HOT_PLAYERS');
}

// ── 升级检测 ──
function checkLevelUp(ns) {
  if (!ns || !ns.player) return;
  if (ns.player.level > prevLevel) {
    prevLevel = ns.player.level;
    const d = document.getElementById('levelup-desc');
    if (d) d.textContent = `恭喜升到 Lv.${prevLevel}！继续孵蛋·偷蛋获得更多经验！`;
    const m = document.getElementById('levelup-modal');
    if (m) m.classList.add('active');
  }
}

// ── 顶栏更新 ──
function updateTopbar() {
  if (!state) return;
  const p = state.player;
  const $ = id => document.getElementById(id);
  $('playerName').textContent = p.username;
  $('playerLevel').textContent = p.level;
  $('playerCoins').textContent = p.coins;
  const needed = p.level * 100;
  const pct = Math.min(100, Math.floor(p.exp / needed * 100));
  const expBar = $('expBar');
  if (expBar) expBar.style.width = pct + '%';
  const spaLevel = $('spaLevel');
  if (spaLevel) spaLevel.textContent = state.spa_level || 1;
  const spaLevelBadge = $('spaLevelBadge');
  if (spaLevelBadge) spaLevelBadge.textContent = state.spa_level || 1;
}

// ── 倒计时循环 ──
function startCountdownLoop() {
  setInterval(() => {
    document.querySelectorAll('.egg-timer[data-hatch-at]').forEach(el => {
      const remain = parseInt(el.dataset.hatchAt) - Math.floor(Date.now() / 1000);
      const tl = el.querySelector('.time-left');
      if (remain <= 0) el.innerHTML = '<span class="ready-pulse">✨ 点击孵化！</span>';
      else if (tl) tl.textContent = formatTime(remain);
    });
  }, 1000);
}

// ============================================================
// Part 2 — 登录 / 主场景 / 蛋池 / 守卫 / 宠物 / 任务渲染
// ============================================================

// ── 登录界面（统一设计） ──
let isRegisterMode = false;

// 切换登录/注册模式
function toggleMode() {
  isRegisterMode = !isRegisterMode;
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const loginBtn = document.getElementById('login');
  const registerBtn = document.getElementById('register');
  const errorDiv = document.getElementById('loginErr');
  
  if (isRegisterMode) {
    confirmPasswordInput.style.display = 'block';
    loginBtn.style.display = 'none';
    registerBtn.textContent = '确认注册';
  } else {
    confirmPasswordInput.style.display = 'none';
    loginBtn.style.display = 'block';
    registerBtn.textContent = '注册';
  }
  errorDiv.textContent = '';
}

// 页面加载时检查localStorage
function checkAutoLogin() {
  const savedUsername = localStorage.getItem('petspa_username');
  const savedToken = localStorage.getItem('petspa_token');
  
  if (savedUsername && savedToken) {
    document.getElementById('username').value = savedUsername;
    document.getElementById('rememberMe').checked = true;
    // 尝试用token自动登录
    send('AUTO_LOGIN', { username: savedUsername, token: savedToken });
  }
}

// 登录和注册按钮事件绑定现在移动到 DOMContentLoaded 中

// ── 登录成功 ──
function onLoggedIn(payload) {
  state     = payload;
  prevLevel = payload.player.level;
  
  // 保存token用于自动登录
  if (payload.token) {
    localStorage.setItem('petspa_token', payload.token);
  }
  
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display  = 'block';
  updateTopbar();
  renderMyScene();
  renderFriendRequests();
  startCountdownLoop();
  send('GET_NEIGHBORS');
}

// ── 主场景 ──
function renderMyScene() {
  if (!state) return;
  updateTopbar();
  renderEggPool();
  renderGuardSlots();
  renderPetList();
  renderTaskList();
}

// ── 蛋池 ──
function renderEggPool() {
  const pool = document.getElementById('egg-pool');
  const info = document.getElementById('egg-slot-info');
  pool.innerHTML = '';
  const maxSlots = state.egg_slots || 2;
  const eggs     = state.eggs || [];
  if (info) info.textContent = `${eggs.length} / ${maxSlots} 槽`;

  for (let slot = 0; slot < maxSlots; slot++) {
    const egg = eggs.find(e => e.slot === slot);
    const div = document.createElement('div');
    if (egg) {
      const now   = Math.floor(Date.now() / 1000);
      const total = egg.hatch_at - egg.placed_at;
      const prog  = Math.min(1, (now - egg.placed_at) / total);
      const ready = now >= egg.hatch_at;
      div.className = 'egg-slot' + (ready ? ' ready' : '');

      const badge = document.createElement('div');
      badge.className = `rarity-badge ${egg.rarity}`;
      badge.textContent = rarityLabel(egg.rarity);
      div.appendChild(badge);

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 40;
      if (window.PixelRender) PixelRender.drawEgg(canvas, egg.rarity, prog);
      div.appendChild(canvas);

      // 蛋来源角标
      if (egg.source) {
        const src = document.createElement('div');
        src.className = 'egg-source-tag';
        src.textContent = egg.source === 'shop' ? '🛒 商店' : egg.source === 'stolen' ? '⚔ 偷来' : '🌸 自产';
        div.appendChild(src);
      }

      const timer = document.createElement('div');
      timer.className = 'egg-timer';
      timer.dataset.hatchAt = egg.hatch_at;
      if (ready) {
        timer.innerHTML = '<span class="ready-pulse">✨ 点击孵化！</span>';
        div.addEventListener('click', () => send('COLLECT_EGG', { eggId: egg.id }));
      } else {
        timer.innerHTML = `<span class="time-left">${formatTime(egg.hatch_at - now)}</span><br><small>孵化中</small>`;
        div.addEventListener('click', () => showInfo('🥚 蛋还没孵好，再等等呀～'));
      }
      div.appendChild(timer);
    } else {
      div.className = 'egg-slot empty';
      div.innerHTML = '<div class="empty-slot-hint">空槽<br><small>前往商店购蛋放入</small></div>';
    }
    pool.appendChild(div);
  }
}

// ── 守卫槽 ──
function renderGuardSlots() {
  const container = document.getElementById('guard-slots');
  const info      = document.getElementById('guard-slot-info');
  container.innerHTML = '';
  const maxGuard = state.guard_slots || 2;
  const guards   = (state.pets || []).filter(p => p.role === 'guard');
  if (info) info.textContent = `${guards.length} / ${maxGuard} 槽`;

  for (let i = 0; i < maxGuard; i++) {
    const guard = guards.find(g => g.guard_slot === i);
    const div = document.createElement('div');
    div.className = 'guard-slot' + (guard ? ' filled' : ' empty');

    const lbl = document.createElement('div');
    lbl.className = 'slot-label';
    lbl.textContent = `守卫 ${i + 1}`;
    div.appendChild(lbl);

    if (guard) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 40;
      if (window.PixelRender) PixelRender.drawPet(canvas, guard.type, guard.rarity, guard.petClass || 'fighter');
      div.appendChild(canvas);

      const nm = document.createElement('div');
      nm.style.cssText = 'font-size:8px;margin-top:3px;text-align:center;';
      nm.textContent = guard.name;
      div.appendChild(nm);

      // 技能标签
      if (guard.pet_class === 'skill' && guard.skill) {
        const sk = document.createElement('div');
        sk.className = 'skill-tag';
        sk.textContent = skillLabel(guard.skill);
        div.appendChild(sk);
      }

      div.addEventListener('click', () => openPetActionModal(guard));
    } else {
      const txt = document.createElement('div');
      txt.style.cssText = 'font-size:8px;opacity:0.5;margin-top:8px;text-align:center;';
      txt.textContent = '点击选择守卫';
      div.appendChild(txt);
      div.addEventListener('click', () => openGuardSelectModal(i));
    }
    container.appendChild(div);
  }
}

// ── 宠物列表 ──
function renderPetList() {
  const list = document.getElementById('pet-list');
  const hint = document.getElementById('pet-empty-hint');
  list.innerHTML = '';
  const pets = state.pets || [];
  if (hint) hint.style.display = pets.length === 0 ? 'block' : 'none';
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
    canvas.width = canvas.height = 40;
    if (window.PixelRender) PixelRender.drawPet(canvas, pet.type, pet.rarity, pet.petClass || 'fighter');
    card.appendChild(canvas);

    const needed = pet.level * 50;
    const expPct = Math.min(100, Math.floor((pet.exp || 0) / needed * 100));

    const cls  = petClassLabel(pet.pet_class || 'fighter');
    const skills = pet.pet_class === 'skill' && pet.skill
      ? `<span class="skill-badge">${skillLabel(pet.skill)}</span>` : '';

    const info = document.createElement('div');
    info.className = 'pet-info';
    info.innerHTML = `
      <div class="pet-name">${pet.name}</div>
      <div style="font-size:7px;display:flex;gap:4px;flex-wrap:wrap;margin-bottom:2px;">
        <span class="rarity-badge ${pet.rarity}">${rarityLabel(pet.rarity)}</span>
        <span class="class-badge ${pet.pet_class||'fighter'}">${cls}</span>
        ${skills}
      </div>
      <div class="pet-stats">⚔${pet.atk} 🛡${pet.def} 💨${pet.spd}</div>
      <div style="font-size:6px;opacity:0.6;">EXP ${pet.exp||0}/${needed}</div>
      <div class="pet-exp-bar"><div class="fill" style="width:${expPct}%"></div></div>
    `;
    card.appendChild(info);
    card.addEventListener('click', () => openPetActionModal(pet));
    list.appendChild(card);
  });
}

// ── 任务列表 ──
const TASK_TEMPLATES = [
  { type:'signin',  desc:'每日签到',       target:1, rc:20, re:5  },
  { type:'steal',   desc:'偷窃成功 2 次',  target:2, rc:30, re:20 },
  { type:'defend',  desc:'成功防御 1 次',  target:1, rc:20, re:15 },
  { type:'hatch',   desc:'孵化 1 只宠物',  target:1, rc:25, re:10 },
];
function renderTaskList() {
  const list = document.getElementById('task-list');
  if (!list) return;
  list.innerHTML = '';
  const tasks = state.tasks || [];
  TASK_TEMPLATES.forEach(tmpl => {
    const task = tasks.find(t => t.task_type === tmpl.type);
    const prog = task ? task.progress : 0;
    const done = task ? task.completed : false;
    const pct  = Math.min(100, Math.floor(prog / tmpl.target * 100));
    const item = document.createElement('div');
    item.className = 'task-item' + (done ? ' done' : '');
    item.innerHTML = `
      <div class="task-check">${done ? '✅' : '⭕'}</div>
      <div class="task-body">
        <div class="task-desc">${tmpl.desc}</div>
        <div class="task-prog-bar"><div class="fill" style="width:${pct}%"></div></div>
      </div>
      <div class="task-right">
        <div class="task-prog">${prog}/${tmpl.target}</div>
        <div class="task-reward">+${tmpl.rc}🪙 +${tmpl.re}EXP</div>
      </div>
    `;
    list.appendChild(item);
  });
}

// ── 友邻申请 ──
function renderFriendRequests() {
  const area = document.getElementById('friend-requests-area');
  if (!area) return;
  const reqs = state.incoming_requests || [];
  area.innerHTML = '';
  reqs.forEach(req => {
    const div = document.createElement('div');
    div.className = 'friend-req-card';
    div.innerHTML = `
      <span>👋 <b>${req.from_username}</b> 想成为你的邻居</span>
      <div>
        <button class="btn small" onclick="acceptFriend('${req.from_id}')">✓ 同意</button>
        <button class="btn small outline" onclick="rejectFriend('${req.from_id}')">✕ 拒绝</button>
      </div>
    `;
    area.appendChild(div);
  });
}
window.acceptFriend = (id) => { send('ACCEPT_FRIEND', { fromId: id }); };
window.rejectFriend = (id) => { send('REJECT_FRIEND', { fromId: id }); };

// ============================================================
// Part 3 — 弹窗 / 宠物操作 / 守卫选择 / 偷袭 / 邻居 / 商店 / 消息路由
// ============================================================

// ── 宠物操作弹窗 ──
function openPetActionModal(pet) {
  petActionTarget = pet;
  const m = document.getElementById('pet-action-modal');
  if (!m) return;

  // 填充宠物信息
  const canvas = document.getElementById('pet-detail-canvas');
  if (window.PixelRender && canvas) PixelRender.drawPet(canvas, pet.type, pet.rarity, pet.petClass || 'fighter');
  document.getElementById('pet-detail-name').textContent = `${pet.name} · Lv.${pet.level}`;

  const cls = pet.pet_class || 'fighter';
  const badge = document.getElementById('pet-detail-class-badge');
  badge.innerHTML = `<span class="rarity-badge ${pet.rarity}">${rarityLabel(pet.rarity)}</span>
    <span class="class-badge ${cls}" style="margin-left:4px;">${petClassLabel(cls)}</span>`;

  document.getElementById('pet-detail-stats').innerHTML =
    `⚔ ATK ${pet.atk} &nbsp; 🛡 DEF ${pet.def} &nbsp; 💨 SPD ${pet.spd}`;

  const skillDiv = document.getElementById('pet-detail-skills');
  if (cls === 'skill' && pet.skill) {
    skillDiv.style.display = 'block';
    skillDiv.textContent   = `✦ 技能：${skillLabel(pet.skill)}`;
  } else { skillDiv.style.display = 'none'; }

  const guardBtn   = document.getElementById('btn-set-guard-confirm');
  const unguardBtn = document.getElementById('btn-unguard-confirm');
  if (pet.role === 'guard') {
    guardBtn.style.display   = 'none';
    unguardBtn.style.display = 'inline-block';
  } else {
    guardBtn.style.display   = 'inline-block';
    unguardBtn.style.display = 'none';
  }
  m.classList.add('active');
}

// 守卫按钮
document.getElementById('btn-set-guard-confirm').addEventListener('click', () => {
  if (!petActionTarget) return;
  // 找空槽
  const maxG = state.guard_slots || 2;
  const guards = (state.pets || []).filter(p => p.role === 'guard');
  const freeSlot = [...Array(maxG).keys()].find(i => !guards.some(g => g.guard_slot === i));
  if (freeSlot === undefined) { showInfo('守卫槽已满！请先撤回一只守卫'); return; }
  send('SET_GUARD', { petId: petActionTarget.id, guardSlot: freeSlot });
  document.getElementById('pet-action-modal').classList.remove('active');
});

document.getElementById('btn-unguard-confirm').addEventListener('click', () => {
  if (!petActionTarget) return;
  send('UNGUARD', { petId: petActionTarget.id });
  document.getElementById('pet-action-modal').classList.remove('active');
});

// ── 守卫槽点击选择弹窗 ──
function openGuardSelectModal(slotIdx) {
  guardSlotTarget = slotIdx;
  const m = document.getElementById('guard-select-modal');
  if (!m) return;
  const picker = document.getElementById('guard-pet-picker');
  picker.innerHTML = '';
  const freePets = (state.pets || []).filter(p => p.role !== 'guard');
  if (freePets.length === 0) {
    picker.innerHTML = '<div style="font-size:8px;opacity:0.6;">没有可用宠物（所有宠物都在守卫中）</div>';
  } else {
    freePets.forEach(pet => {
      const opt = document.createElement('div');
      opt.className = 'pet-pick-opt';
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      if (window.PixelRender) PixelRender.drawPet(canvas, pet.type, pet.rarity, pet.petClass || 'fighter');
      opt.appendChild(canvas);
      const nm = document.createElement('div');
      nm.style.cssText = 'font-size:7px;margin-top:2px;';
      nm.textContent = pet.name;
      opt.appendChild(nm);
      opt.addEventListener('click', () => {
        send('SET_GUARD', { petId: pet.id, guardSlot: slotIdx });
        m.classList.remove('active');
      });
      picker.appendChild(opt);
    });
  }
  m.classList.add('active');
}

// ── 模态关闭按钮通用绑定 ──
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const m = btn.closest('[id$="-modal"]');
    if (m) m.classList.remove('active');
  });
});

// ── 邻居面板 ──
document.getElementById('btn-search-neighbor').addEventListener('click', () => {
  const name = document.getElementById('neighbor-search-input').value.trim();
  if (!name) return;
  send('SEARCH_PLAYER', { username: name, context: 'neighbor' });
});
document.getElementById('neighbor-search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-search-neighbor').click();
});

function onSearchResult(player, context) {
  const div = context === 'neighbor'
    ? document.getElementById('neighbor-search-result')
    : document.getElementById('raid-search-result');
  if (!div) return;
  div.innerHTML = `
    <div class="search-result-card">
      <div>
        <div style="font-size:10px;">${player.username}</div>
        <div style="font-size:8px;opacity:0.7;">Lv.${player.level} · 🪙${player.coins}</div>
      </div>
      <div style="display:flex;gap:6px;">
        ${context === 'neighbor'
          ? `<button class="btn small" onclick="sendFriendReq('${player.id}')">➕ 添加邻居</button>
             <button class="btn small outline" onclick="visitPlayer('${player.id}')">👀 参观</button>`
          : `<button class="btn small" onclick="visitPlayer('${player.id}')">⚔ 前去偷蛋</button>`}
      </div>
    </div>`;
}

function renderNeighborList(list) {
  const container = document.getElementById('neighbor-list');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = '<div style="font-size:8px;opacity:0.5;padding:10px;">还没有邻居，快去搜索添加吧！</div>';
    return;
  }
  container.innerHTML = '';
  list.forEach(n => {
    const card = document.createElement('div');
    card.className = 'neighbor-card';
    card.innerHTML = `
      <div class="neighbor-info">
        <div style="font-size:9px;font-weight:bold;">${n.username}</div>
        <div style="font-size:7px;opacity:0.7;">Lv.${n.level} · 🪙${n.coins}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn small" onclick="visitPlayer('${n.id}')">👀 参观</button>
        <button class="btn small water" onclick="boostNeighbor('${n.id}')">💨 加速</button>
        <button class="btn small danger outline" onclick="removeNeighbor('${n.id}')">✕</button>
      </div>`;
    container.appendChild(card);
  });
}

window.sendFriendReq = (id) => { send('SEND_FRIEND_REQ', { targetId: id }); showInfo('好友申请已发送，等待对方同意'); };
window.visitPlayer   = (id) => { send('VIEW_PLAYER', { targetId: id }); switchTab('tab-social'); switchSubTab('sub-raid'); };
window.boostNeighbor = (id) => { send('BOOST_EGG', { targetId: id }); };
window.removeNeighbor= (id) => { send('REMOVE_NEIGHBOR', { targetId: id }); setTimeout(() => send('GET_NEIGHBORS'), 300); };

// ── 热门玩家列表 ──
function renderHotPlayersList(list) {
  const container = document.getElementById('hot-players-list');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-hint">暂无热门玩家</div>';
    return;
  }
  container.innerHTML = '';
  list.slice(0, 10).forEach((player, i) => {
    const card = document.createElement('div');
    card.className = 'hot-player-card';
    card.innerHTML = `
      <div class="hot-player-rank">#${i + 1}</div>
      <div class="hot-player-info">
        <div style="font-size:8px;">${player.username}</div>
        <div style="font-size:6px;opacity:0.7;">Lv.${player.level} · 🪙${player.coins}</div>
      </div>
    `;
    card.addEventListener('click', () => visitPlayer(player.id));
    container.appendChild(card);
  });
}

// ── 偷袭面板 ──
document.getElementById('btn-raid-search').addEventListener('click', () => {
  const name = document.getElementById('raid-search-input').value.trim();
  if (!name) return;
  send('SEARCH_PLAYER', { username: name, context: 'raid' });
});
document.getElementById('raid-search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-raid-search').click();
});

// 访问视图渲染
function renderVisitView() {
  if (!visitView) return;
  const vv = document.getElementById('visit-view');
  vv.style.display = 'block';
  const p = visitView.player;
  document.getElementById('visit-target-name').textContent  = `🏡 ${p.username}的温泉`;
  document.getElementById('visit-target-level').textContent = `Lv.${p.level} · 🪙${p.coins}`;

  // 守卫展示
  const guardDiv = document.getElementById('visit-guards');
  guardDiv.innerHTML = '';
  if (!visitView.guards || visitView.guards.length === 0) {
    guardDiv.innerHTML = '<span style="font-size:8px;opacity:0.5;">无守卫</span>';
  } else {
    visitView.guards.forEach(g => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:2px;margin-right:6px;';
      const c = document.createElement('canvas');
      c.width = c.height = 36;
      if (window.PixelRender) PixelRender.drawPet(c, g.type, g.rarity, g.petClass || 'fighter');
      wrap.appendChild(c);
      if (g.pet_class === 'skill' && g.skill) {
        const sk = document.createElement('div');
        sk.className = 'skill-tag';
        sk.textContent = skillLabel(g.skill);
        wrap.appendChild(sk);
      }
      guardDiv.appendChild(wrap);
    });
  }

  // 蛋展示
  const eggsDiv = document.getElementById('target-eggs');
  eggsDiv.innerHTML = '';
  if (!visitView.eggs || visitView.eggs.length === 0) {
    eggsDiv.innerHTML = '<div style="font-size:8px;opacity:0.6;">没有蛋可偷</div>';
  } else {
    visitView.eggs.forEach(egg => {
      const now   = Math.floor(Date.now() / 1000);
      const total = egg.hatch_at - egg.placed_at;
      const prog  = Math.min(1, (now - egg.placed_at) / total);
      const card = document.createElement('div');
      card.className = 'visit-egg' + (selectedEggId === egg.id ? ' selected' : '');
      const c = document.createElement('canvas');
      c.width = c.height = 40;
      if (window.PixelRender) PixelRender.drawEgg(c, egg.rarity, prog);
      card.appendChild(c);
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:7px;text-align:center;margin-top:2px;';
      lbl.textContent = `${rarityLabel(egg.rarity)} ${Math.floor(prog*100)}%`;
      card.appendChild(lbl);
      card.addEventListener('click', () => {
        selectedEggId = egg.id;
        renderVisitView();
        document.getElementById('strategy-panel').style.display = 'block';
        renderAttackerPetSelect();
      });
      eggsDiv.appendChild(card);
    });
  }
}

// 攻击宠物选择
function renderAttackerPetSelect() {
  const c = document.getElementById('attacker-pet-select');
  c.innerHTML = '';
  const none = document.createElement('div');
  none.className = 'attacker-opt' + (!selectedAttackerPetId ? ' selected' : '');
  none.textContent = '不选';
  none.addEventListener('click', () => { selectedAttackerPetId = null; renderAttackerPetSelect(); updateStealPreview(); });
  c.appendChild(none);
  (state.pets || []).filter(p => p.role !== 'guard').forEach(pet => {
    const opt = document.createElement('div');
    opt.className = 'attacker-opt' + (selectedAttackerPetId === pet.id ? ' selected' : '');
    opt.innerHTML = `${pet.name}<br><small>⚔${pet.atk} 💨${pet.spd} [${petClassLabel(pet.pet_class||'fighter')}]</small>`;
    opt.addEventListener('click', () => { selectedAttackerPetId = pet.id; renderAttackerPetSelect(); updateStealPreview(); });
    c.appendChild(opt);
  });
}

// 策略按钮
document.querySelectorAll('.strategy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedStrategy = btn.dataset.strategy;
    updateStealPreview();
    document.getElementById('btn-confirm-steal').style.display = 'inline-block';
  });
});

function updateStealPreview() {
  const prev = document.getElementById('steal-preview');
  if (!prev || !visitView) return;
  const rate = calcStealRate(selectedStrategy || 'sneak');
  const atk  = selectedAttackerPetId
    ? (state.pets || []).find(p => p.id === selectedAttackerPetId) : null;
  const guards = visitView.guards || [];
  const skillGuards = guards.filter(g => g.pet_class === 'skill');
  let hint = skillGuards.length > 0
    ? `⚠️ 对方有 ${skillGuards.length} 只技能型守卫（${skillGuards.map(g=>skillLabel(g.skill)).join('、')}）` : '';
  prev.innerHTML = `
    <div style="font-size:9px;">预计成功率：<b style="color:var(--water)">${rate}</b></div>
    ${atk ? `<div style="font-size:8px;">出击宠物：${atk.name} [${petClassLabel(atk.pet_class||'fighter')}]</div>` : ''}
    ${hint ? `<div style="font-size:7px;color:#E0784A;">${hint}</div>` : ''}
  `;
}

function calcStealRate(strategy) {
  if (!visitView) return '--';
  const defenders  = visitView.guards || [];
  const attacker   = selectedAttackerPetId ? (state.pets||[]).find(p=>p.id===selectedAttackerPetId) : null;
  const atkAtk = attacker ? attacker.atk : 8;
  const atkSpd = attacker ? attacker.spd : 8;
  const totalDef = defenders.reduce((s,g)=>s+(g.def||10), 0) || 1;
  const totalSpd = defenders.reduce((s,g)=>s+(g.spd||10), 0) || 1;
  // 技能型守卫惩罚
  const mudCount   = defenders.filter(g=>g.pet_class==='skill'&&g.skill==='mud').length;
  const thornCount = defenders.filter(g=>g.pet_class==='skill'&&g.skill==='thorn').length;
  let rate = 0.5;
  if (strategy === 'fight')  rate = atkAtk / (atkAtk + totalDef);
  else if (strategy === 'sneak') rate = atkSpd / (atkSpd + totalSpd) * 0.9;
  else if (strategy === 'bribe') rate = Math.max(0.1, 0.7 - defenders.length * 0.1);
  rate -= mudCount * 0.12;
  rate  = Math.min(0.93, Math.max(0.05, rate));
  return Math.round(rate * 100) + '%';
}

document.getElementById('btn-confirm-steal').addEventListener('click', () => {
  if (!selectedEggId)   { showInfo('请先点击选择要偷的蛋！'); return; }
  if (!selectedStrategy){ showInfo('请选择出击策略！'); return; }
  if (!visitView)       return;
  send('STEAL', { targetId: visitView.player.id, eggId: selectedEggId, strategy: selectedStrategy, attackerPetId: selectedAttackerPetId });
  selectedEggId = null; selectedStrategy = null; selectedAttackerPetId = null;
  document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('btn-confirm-steal').style.display = 'none';
  document.getElementById('steal-preview').innerHTML = '<div>选择策略查看成功率...</div>';
});

document.getElementById('btn-visit-close').addEventListener('click', () => {
  document.getElementById('visit-view').style.display = 'none';
  visitView = null;
});
document.getElementById('btn-visit-boost').addEventListener('click', () => {
  if (!visitView) return;
  send('BOOST_EGG', { targetId: visitView.player.id });
});

// ── 签到 ──
document.getElementById('btn-signin').addEventListener('click', () => send('DAILY_SIGNIN'));
document.getElementById('btn-daily-signin-tasks').addEventListener('click', () => send('DAILY_SIGNIN'));

// ── 排行榜 ──
document.getElementById('btn-refresh-rank').addEventListener('click', () => send('GET_LEADERBOARD'));
function renderLeaderboard(list) {
  const tbody = document.getElementById('rank-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${['🥇','🥈','🥉'][i] || (i+1)}</td>
      <td>${p.username}</td>
      <td>Lv.${p.level}</td>
      <td>🪙${p.coins}</td>`;
    tbody.appendChild(tr);
  });
}

// ── 商店按钮 ──
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const rarity = btn.dataset.rarity;
    send(action, rarity ? { rarity } : {});
  });
});

// ── 升级弹窗关闭 ──
document.getElementById('levelup-close').addEventListener('click', () => {
  document.getElementById('levelup-modal').classList.remove('active');
});

// ── 孵化弹窗 ──
function showHatchModal(pet) {
  const emojis = { legend:'✨🌟', rare:'⭐', common:'🐣' };
  const e = emojis[pet.rarity] || '🐣';
  showModal(
    `${e} ${rarityLabel(pet.rarity)}宠物孵化！`,
    `孵出了 ${petTypeLabel(pet.type)}！\n类型：${petClassLabel(pet.pet_class||'fighter')}\nATK ${pet.atk} · DEF ${pet.def} · SPD ${pet.spd}${pet.skill ? '\n技能：'+skillLabel(pet.skill) : ''}`,
    true
  );
  if (pet.rarity === 'legend') showGlobalNotice(`🌟 全服广播：${state.player.username} 孵出了传说宠物 ${petTypeLabel(pet.type)}！`);
}

// ── Tab 导航绑定 ──
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // 兼容 data-panel 和 data-tab 两种写法
    const tabId = btn.dataset.panel || btn.dataset.tab;
    if (tabId) switchTab(tabId);
  });
});

// ── 子导航绑定（社交面板内） ──
document.querySelectorAll('.sub-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchSubTab(btn.dataset.sub));
});

// ── 服务端消息路由 ──
function handleServerMsg(type, payload) {
  switch (type) {
    case 'LOGGED_IN':
      onLoggedIn(payload);
      break;
    case 'REGISTER_OK':
      showSuccess('注册成功！请登录');
      document.getElementById('loginErr').textContent = '';
      // 重置到登录模式
      if (isRegisterMode) {
        toggleMode();
      }
      break;
    case 'AUTO_LOGIN':
      if (payload.success) {
        onLoggedIn(payload.state);
      } else {
        // 自动登录失败，清除token
        localStorage.removeItem('petspa_token');
        document.getElementById('loginErr').textContent = '自动登录失败，请重新登录';
      }
      break;
    case 'AUTH_ERROR':
    case 'ERROR': // 添加对服务器实际发送的ERROR消息的处理
      const errMsg = payload.msg || payload.code || '操作失败';
      
      // 只有当前在登录界面时才显示登录错误
      if (document.getElementById('login-screen').style.display !== 'none') {
        const loginErrElement = document.getElementById('loginErr');
        if (loginErrElement) {
          loginErrElement.textContent = errMsg;
          
          // 如果是用户不存在错误，询问是否注册
          if (payload.code === 'AUTH_FAIL' && errMsg.includes('用户名或密码错误')) {
            loginErrElement.innerHTML = 
              '用户名或密码错误！<button class="btn small" onclick="askToRegister()" style="margin-left:8px;">立即注册</button>';
          }
        }
      } else {
        // 如果已经在游戏中，显示toast错误提示
        showError(errMsg);
      }
      break;
    case 'STATE_UPDATE':
      checkLevelUp(payload);
      state = payload;
      renderMyScene();
      break;
    case 'EGG_HATCHED':
      checkLevelUp(payload.state);
      state = payload.state;
      renderMyScene();
      showHatchModal(payload.pet);
      break;
    case 'STEAL_RESULT':
      checkLevelUp(payload.attackerState);
      state = payload.attackerState;
      renderMyScene();
      if (payload.success) {
        showModal('🎉 偷窃成功！',
          `策略：${strategyLabel(payload.strategy)}\n带走了 ${rarityLabel(payload.eggRarity)} 蛋！\n+🪙${payload.coinsGain}  +EXP ${payload.expGain||10}`, true);
      } else {
        const skillMsg = payload.triggeredSkill ? `\n受到 ${skillLabel(payload.triggeredSkill)} 影响！` : '';
        showModal('😢 偷窃失败！',
          `策略：${strategyLabel(payload.strategy)}\n守卫阻止了你！${payload.penaltyCoins > 0 ? '损失🪙'+payload.penaltyCoins : '无损失'}${skillMsg}`, false);
      }
      break;
    case 'BEEN_STOLEN':
      if (payload.defenderState) { state = payload.defenderState; renderMyScene(); }
      showGlobalNotice(payload.success
        ? `⚠️ ${payload.attacker.username} 偷走了你的蛋！`
        : `🛡️ 你的守卫阻止了 ${payload.attacker.username}！`);
      break;
    case 'VISITOR_VIEW':
      visitView = payload;
      renderVisitView();
      break;
    case 'SEARCH_RESULT':
      onSearchResult(payload, payload.context || 'raid');
      break;
    case 'NEIGHBORS_LIST':
      renderNeighborList(payload.list);
      break;
    case 'FRIEND_REQ_SENT':
      showSuccess('好友申请已发送！');
      break;
    case 'FRIEND_REQ_RECEIVED':
      if (state) {
        state.incoming_requests = state.incoming_requests || [];
        state.incoming_requests.push({ from_id: payload.fromId, from_username: payload.fromUsername });
        renderFriendRequests();
      }
      showInfo(`👋 ${payload.fromUsername} 想成为你的邻居`);
      break;
    case 'FRIEND_ACCEPTED':
      send('GET_NEIGHBORS');
      showSuccess(`🎉 ${payload.friendUsername} 同意了你的邻居申请！`);
      break;
    case 'BOOST_OK':
      showSuccess(`💨 帮助加速成功！为 ${payload.targetName} 节省了 ${formatTime(payload.timeSaved)} 孵化时间`);
      break;
    case 'BEEN_BOOSTED':
      showInfo(`💨 ${payload.boosterName} 帮你加速孵化了！节省 ${formatTime(payload.timeSaved)}`);
      if (payload.state) { state = payload.state; renderMyScene(); }
      break;
    case 'UPGRADE_OK':
      checkLevelUp(payload);
      state = payload;
      renderMyScene();
      showSuccess('升级成功！');
      break;
    case 'SIGNIN_OK':
      checkLevelUp(payload);
      state = payload;
      renderMyScene();
      showModal('✅ 签到成功！', '获得 20 金币！+5 EXP', true);
      break;
    case 'LEADERBOARD':
      renderLeaderboard(payload.list);
      break;
    case 'HOT_PLAYERS':
      renderHotPlayersList(payload.list);
      break;
    case 'EGG_PURCHASED':
      checkLevelUp(payload.state);
      state = payload.state;
      renderMyScene();
      showSuccess(`🛒 购买成功！${rarityLabel(payload.egg.rarity)}蛋已放入孵化池`);
      break;
    case 'ERROR':
      showError(payload.msg || payload.code || '操作失败');
      break;
    default:
      console.log('[WS]', type, payload);
  }
}

// ── 辅助函数 ──
// 询问用户是否要注册（当用户不存在时）
window.askToRegister = function() {
  if (!isRegisterMode) {
    toggleMode();
  }
  document.getElementById('loginErr').textContent = '';
};

// ── 启动 ──
// handleLogin / handleRegister / enterGuestMode 由 index.html 内联脚本定义
// （在 game.js 之后执行，拥有10秒硬超时安全机制）
connectWS();
checkAutoLogin();
