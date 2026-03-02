// ============================================================
// render.js — Canvas 像素宠物/蛋渲染引擎
// 所有图形用像素块（fillRect）手绘，无外部图片依赖
// 调色板: #F5ECD7 #8BB5C8 #E8A87C #7DAF8C #5C4A6B
// ============================================================

const C = {
  bg:     '#FDF6EC',  // 主背景米白
  blue:   '#7EC8D8',  // 温泉水蓝
  orange: '#F4A261',  // 珊瑚橙
  green:  '#5CB85C',  // 成功绿
  dark:   '#4A3660',  // 深茄紫
  purple: '#9B7DB8',  // 技能紫
  gold:   '#E8C84A',  // 传说金
  steam:  '#B8E4ED',  // 蒸汽浅蓝
};

// ── 像素块绘制辅助（每个单元 = px × px 像素） ──
function pxRect(ctx, x, y, w, h, color, px = 4) {
  ctx.fillStyle = color;
  ctx.fillRect(x * px, y * px, w * px, h * px);
}

// ============================================================
// 蛋绘制
// ============================================================
/**
 * drawEgg(canvas, rarity, progress)
 * rarity: 'common' | 'rare' | 'legend'
 * progress: 0~1 孵化进度（越高越亮）
 */
function drawEgg(canvas, rarity = 'common', progress = 0) {
  const px = 4;
  const W = 14, H = 16;
  canvas.width  = W * px;
  canvas.height = H * px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 蛋壳颜色
  const shellColor = rarity === 'legend' ? C.orange :
                     rarity === 'rare'   ? C.blue   : C.bg;
  const outlineColor = C.dark;
  const glowColor = rarity === 'legend' ? C.orange :
                    rarity === 'rare'   ? C.blue   : C.green;

  // 外轮廓（蛋形）
  const egg = [
    [4,0,6,1], [3,1,8,1], [2,2,10,1],
    [1,3,12,2], [1,5,12,3], [1,8,12,3],
    [2,11,10,2], [3,13,8,1], [4,14,6,1],
  ];
  for (const [x, y, w, h] of egg) pxRect(ctx, x, y, w, h, outlineColor, px);

  // 蛋壳填充
  const fill = [
    [4,1,6,1], [3,2,8,1], [2,3,10,1],
    [2,4,10,4], [2,8,10,3], [3,11,8,2], [4,13,6,1],
  ];
  for (const [x, y, w, h] of fill) pxRect(ctx, x, y, w, h, shellColor, px);

  // 光泽点（右上）
  pxRect(ctx, 9, 3, 2, 1, C.bg, px);
  pxRect(ctx, 10, 4, 1, 1, C.bg, px);

  // 孵化进度光晕（底部）
  if (progress > 0.3) {
    ctx.globalAlpha = progress * 0.5;
    pxRect(ctx, 3, 11, 8, 3, glowColor, px);
    ctx.globalAlpha = 1;
  }

  // 传说蛋 — 额外装饰花纹
  if (rarity === 'legend') {
    pxRect(ctx, 5, 5, 1, 1, C.dark, px);
    pxRect(ctx, 8, 5, 1, 1, C.dark, px);
    pxRect(ctx, 6, 7, 2, 1, C.dark, px);
    pxRect(ctx, 5, 9, 4, 1, C.dark, px);
  }
  // 稀有蛋 — 条纹
  if (rarity === 'rare') {
    pxRect(ctx, 4, 5, 6, 1, C.dark, px);
    pxRect(ctx, 3, 8, 8, 1, C.dark, px);
    pxRect(ctx, 4, 11, 6, 1, C.dark, px);
  }
}

// ============================================================
// 宠物绘制
// ============================================================
/**
 * drawPet(canvas, type, rarity, petClass)
 * type:     'bear'|'fox'|'bunny'|'cat'|'dragon'|'wolf'|'turtle'|'phoenix'
 * rarity:   'common'|'rare'|'legend'
 * petClass: 'fighter'|'skill'  — skill 宠物右上角加紫标
 */
function drawPet(canvas, type = 'bear', rarity = 'common', petClass = 'fighter') {
  const px = 4;
  const W = 16, H = 16;
  canvas.width  = W * px;
  canvas.height = H * px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bodyColor = rarity === 'legend' ? C.gold   :
                    rarity === 'rare'   ? C.blue   : C.green;
  const outline = C.dark;
  const eye = C.dark;
  const cheek = C.orange;

  const pets = {
    bear: () => {
      // 耳朵
      pxRect(ctx,2,1,3,3,outline,px); pxRect(ctx,3,2,1,1,bodyColor,px);
      pxRect(ctx,11,1,3,3,outline,px); pxRect(ctx,12,2,1,1,bodyColor,px);
      // 头
      for(const[x,y,w,h] of [[3,4,10,8],[2,5,12,6]]) pxRect(ctx,x,y,w,h,outline,px);
      for(const[x,y,w,h] of [[3,5,10,7],[4,4,8,1],[4,12,8,1]]) pxRect(ctx,x,y,w,h,bodyColor,px);
      // 眼
      pxRect(ctx,5,7,2,2,eye,px); pxRect(ctx,9,7,2,2,eye,px);
      pxRect(ctx,5,7,1,1,C.bg,px); pxRect(ctx,9,7,1,1,C.bg,px);
      // 腮红
      pxRect(ctx,4,9,2,1,cheek,px); pxRect(ctx,10,9,2,1,cheek,px);
      // 鼻子+嘴
      pxRect(ctx,7,10,2,1,outline,px);
      pxRect(ctx,6,11,1,1,outline,px); pxRect(ctx,9,11,1,1,outline,px);
    },
    fox: () => {
      // 尖耳
      pxRect(ctx,2,0,2,4,outline,px); pxRect(ctx,3,1,1,2,C.orange,px);
      pxRect(ctx,12,0,2,4,outline,px); pxRect(ctx,12,1,1,2,C.orange,px);
      // 头
      for(const[x,y,w,h] of [[3,4,10,8],[2,6,12,5]]) pxRect(ctx,x,y,w,h,outline,px);
      for(const[x,y,w,h] of [[3,5,10,7],[4,4,8,1]]) pxRect(ctx,x,y,w,h,bodyColor,px);
      // 脸白色
      pxRect(ctx,5,9,6,3,C.bg,px);
      // 眼
      pxRect(ctx,4,7,2,2,eye,px); pxRect(ctx,10,7,2,2,eye,px);
      pxRect(ctx,4,7,1,1,C.bg,px); pxRect(ctx,10,7,1,1,C.bg,px);
      // 鼻+嘴
      pxRect(ctx,7,10,2,1,C.orange,px);
      pxRect(ctx,6,11,1,1,outline,px); pxRect(ctx,9,11,1,1,outline,px);
    },
    bunny: () => {
      // 长耳
      pxRect(ctx,4,0,2,5,outline,px); pxRect(ctx,5,1,1,3,C.orange,px);
      pxRect(ctx,10,0,2,5,outline,px); pxRect(ctx,10,1,1,3,C.orange,px);
      // 头
      for(const[x,y,w,h] of [[3,5,10,7],[2,6,12,5]]) pxRect(ctx,x,y,w,h,outline,px);
      for(const[x,y,w,h] of [[3,6,10,6],[4,5,8,1]]) pxRect(ctx,x,y,w,h,bodyColor,px);
      // 眼
      pxRect(ctx,5,8,2,2,eye,px); pxRect(ctx,9,8,2,2,eye,px);
      pxRect(ctx,5,8,1,1,C.bg,px); pxRect(ctx,9,8,1,1,C.bg,px);
      // 腮红+鼻
      pxRect(ctx,4,10,2,1,cheek,px); pxRect(ctx,10,10,2,1,cheek,px);
      pxRect(ctx,7,10,2,1,C.orange,px);
      pxRect(ctx,6,11,1,1,outline,px); pxRect(ctx,9,11,1,1,outline,px);
    },
    cat: () => {
      // 三角耳
      pxRect(ctx,3,1,1,1,outline,px); pxRect(ctx,3,2,2,1,outline,px);
      pxRect(ctx,3,3,3,1,outline,px); pxRect(ctx,4,2,1,1,bodyColor,px);
      pxRect(ctx,12,1,1,1,outline,px); pxRect(ctx,11,2,2,1,outline,px);
      pxRect(ctx,10,3,3,1,outline,px); pxRect(ctx,11,2,1,1,bodyColor,px);
      // 头
      for(const[x,y,w,h] of [[3,4,10,8],[2,5,12,6]]) pxRect(ctx,x,y,w,h,outline,px);
      for(const[x,y,w,h] of [[3,5,10,7],[4,4,8,1]]) pxRect(ctx,x,y,w,h,bodyColor,px);
      // 眼（猫眼竖瞳）
      pxRect(ctx,5,7,2,3,eye,px); pxRect(ctx,9,7,2,3,eye,px);
      pxRect(ctx,6,7,0,3,C.bg,px);
      // 胡须
      pxRect(ctx,2,10,3,1,outline,px); pxRect(ctx,11,10,3,1,outline,px);
      pxRect(ctx,2,11,2,1,outline,px); pxRect(ctx,12,11,2,1,outline,px);
      // 鼻
      pxRect(ctx,7,10,2,1,C.orange,px);
    },
    dragon: () => {
      // 角
      pxRect(ctx,4,0,1,3,C.orange,px); pxRect(ctx,3,0,1,1,C.orange,px);
      pxRect(ctx,11,0,1,3,C.orange,px); pxRect(ctx,12,0,1,1,C.orange,px);
      // 头（方形）
      for(const[x,y,w,h] of [[2,3,12,9],[1,4,14,7]]) pxRect(ctx,x,y,w,h,outline,px);
      for(const[x,y,w,h] of [[2,4,12,8],[3,3,10,1]]) pxRect(ctx,x,y,w,h,bodyColor,px);
      // 眼（细长）
      pxRect(ctx,4,7,3,2,eye,px); pxRect(ctx,9,7,3,2,eye,px);
      pxRect(ctx,4,7,1,1,C.orange,px); pxRect(ctx,9,7,1,1,C.orange,px);
      // 鼻孔
      pxRect(ctx,6,10,1,1,outline,px); pxRect(ctx,9,10,1,1,outline,px);
      // 牙
      pxRect(ctx,6,11,1,2,C.bg,px); pxRect(ctx,9,11,1,2,C.bg,px);
    },

    // ── 新增宠物类型 ──
    wolf: () => {
      // 尖耳（更窄、更高）
      pxRect(ctx,3,0,1,1,outline,px); pxRect(ctx,3,1,2,1,outline,px);
      pxRect(ctx,3,2,3,1,outline,px); pxRect(ctx,4,1,1,1,bodyColor,px);
      pxRect(ctx,12,0,1,1,outline,px); pxRect(ctx,11,1,2,1,outline,px);
      pxRect(ctx,10,2,3,1,outline,px); pxRect(ctx,11,1,1,1,bodyColor,px);
      // 头
      for(const[x,y,w,h] of [[3,3,10,9],[2,5,12,6]]) pxRect(ctx,x,y,w,h,outline,px);
      for(const[x,y,w,h] of [[3,4,10,8],[4,3,8,1]]) pxRect(ctx,x,y,w,h,bodyColor,px);
      // 眼（琥珀色）
      pxRect(ctx,4,7,2,2,C.orange,px); pxRect(ctx,10,7,2,2,C.orange,px);
      pxRect(ctx,4,7,1,1,C.dark,px);   pxRect(ctx,10,7,1,1,C.dark,px);
      // 鼻口部（深色）
      pxRect(ctx,5,10,6,2,outline,px);
      pxRect(ctx,6,10,4,1,bodyColor,px);
      pxRect(ctx,7,11,2,1,C.bg,px);
      // 胡须
      pxRect(ctx,2,10,2,1,outline,px); pxRect(ctx,12,10,2,1,outline,px);
    },

    turtle: () => {
      // 壳（大半圆）—— 龟壳用格子纹理
      for(const[x,y,w,h] of [[4,1,8,10],[3,2,10,9],[2,4,12,6]]) pxRect(ctx,x,y,w,h,outline,px);
      const shellFill = rarity === 'legend' ? C.gold : rarity === 'rare' ? C.blue : C.green;
      for(const[x,y,w,h] of [[4,2,8,9],[3,3,10,7],[3,4,10,5]]) pxRect(ctx,x,y,w,h,shellFill,px);
      // 壳上花纹（六边形格）
      pxRect(ctx,6,3,4,1,outline,px);
      pxRect(ctx,5,5,2,2,outline,px); pxRect(ctx,9,5,2,2,outline,px);
      pxRect(ctx,6,7,4,1,outline,px);
      // 头部（小）
      for(const[x,y,w,h] of [[6,10,4,3],[5,11,6,2]]) pxRect(ctx,x,y,w,h,outline,px);
      pxRect(ctx,6,11,4,2,bodyColor,px);
      // 眼
      pxRect(ctx,6,11,1,1,eye,px); pxRect(ctx,9,11,1,1,eye,px);
      // 四肢（小脚丫）
      pxRect(ctx,2,5,2,2,outline,px); pxRect(ctx,3,5,1,1,bodyColor,px);
      pxRect(ctx,12,5,2,2,outline,px); pxRect(ctx,12,5,1,1,bodyColor,px);
    },

    phoenix: () => {
      // 凤冠（火焰冠）
      pxRect(ctx,6,0,1,3,C.orange,px);
      pxRect(ctx,8,0,1,2,C.gold,px);
      pxRect(ctx,10,0,1,3,C.orange,px);
      pxRect(ctx,7,1,1,1,C.gold,px); pxRect(ctx,9,1,1,1,C.gold,px);
      // 头
      for(const[x,y,w,h] of [[3,3,10,8],[2,5,12,5]]) pxRect(ctx,x,y,w,h,outline,px);
      // 羽毛体色（渐变感用两色块）
      pxRect(ctx,3,4,5,7,C.orange,px); pxRect(ctx,8,4,5,7,C.gold,px);
      // 眼（红宝石）
      pxRect(ctx,5,6,2,2,'#E05C5C',px); pxRect(ctx,9,6,2,2,'#E05C5C',px);
      pxRect(ctx,5,6,1,1,C.bg,px);      pxRect(ctx,9,6,1,1,C.bg,px);
      // 喙
      pxRect(ctx,7,10,2,1,C.gold,px);
      pxRect(ctx,6,11,1,1,outline,px); pxRect(ctx,9,11,1,1,outline,px);
      // 翼尖装饰
      pxRect(ctx,2,8,2,1,C.orange,px); pxRect(ctx,12,8,2,1,C.orange,px);
      pxRect(ctx,1,9,1,1,C.gold,px);   pxRect(ctx,14,9,1,1,C.gold,px);
    },
  };

  (pets[type] || pets.bear)();

  // ── 技能型宠物 — 角落加紫色魔法标记 ──
  if (petClass === 'skill') {
    ctx.fillStyle = C.purple;
    ctx.fillRect(0, 0, 6, 6);
    ctx.fillStyle = C.bg;
    ctx.fillText('✦', 0, 6);
  }
}

// ============================================================
// 技能型宠物技能图标绘制（替代旧陷阱图标）
// ============================================================
/**
 * drawSkillIcon(canvas, skill)
 * skill: 'mud'|'thorn'|'sleep'
 */
function drawSkillIcon(canvas, skill = 'mud') {
  const px = 4;
  canvas.width  = 10 * px;
  canvas.height = 10 * px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 紫色背景圆角块
  ctx.fillStyle = C.purple;
  ctx.fillRect(px, px, 8*px, 8*px);

  if (skill === 'mud') {
    // 泥地符文（波浪+泡泡）
    pxRect(ctx,2,4,6,1,C.dark,px);
    pxRect(ctx,1,5,8,2,C.dark,px);
    pxRect(ctx,2,7,2,1,C.blue,px);
    pxRect(ctx,6,7,2,1,C.blue,px);
    pxRect(ctx,3,3,1,1,C.dark,px);
    pxRect(ctx,6,3,1,1,C.dark,px);
  } else if (skill === 'thorn') {
    // 荆棘符文
    pxRect(ctx,4,1,2,8,C.dark,px);
    pxRect(ctx,1,4,8,2,C.dark,px);
    pxRect(ctx,2,2,2,2,C.green,px);
    pxRect(ctx,6,2,2,2,C.green,px);
    pxRect(ctx,2,6,2,2,C.green,px);
    pxRect(ctx,6,6,2,2,C.green,px);
  } else if (skill === 'sleep') {
    // 催眠符文（zzz）
    pxRect(ctx,2,3,6,1,C.steam,px);
    pxRect(ctx,5,4,3,1,C.steam,px);
    pxRect(ctx,2,5,6,1,C.steam,px);
    pxRect(ctx,6,6,2,1,C.dark,px);
    pxRect(ctx,3,7,2,1,C.dark,px);
  }
}

// ============================================================
// 陷阱图标绘制（向后兼容，内部调用 drawSkillIcon）
// ============================================================
function drawTrap(canvas, type = 'mud') {
  drawSkillIcon(canvas, type);
}

// ============================================================
// 旧版陷阱图标（保留像素风格，独立实现）
// ============================================================
function drawTrapLegacy(canvas, type = 'mud') {
  const px = 4;
  canvas.width  = 10 * px;
  canvas.height = 10 * px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (type === 'mud') {
    pxRect(ctx,1,5,8,4,C.dark,px);
    pxRect(ctx,2,6,6,2,C.blue,px);
    pxRect(ctx,3,4,4,2,C.dark,px);
  } else if (type === 'thorn') {
    for (let i = 1; i < 9; i += 2) pxRect(ctx,i,0,1,3,C.dark,px);
    pxRect(ctx,1,3,8,5,C.dark,px);
    pxRect(ctx,2,4,6,3,C.green,px);
  } else if (type === 'sleep') {
    pxRect(ctx,2,3,6,5,C.dark,px);
    pxRect(ctx,3,4,4,3,C.blue,px);
    pxRect(ctx,7,1,1,1,C.dark,px);
    pxRect(ctx,8,0,1,1,C.dark,px);
    pxRect(ctx,9,1,1,1,C.dark,px);
  }
}

// ============================================================
// 温泉背景装饰（简单波纹）
// ============================================================
function drawSpaBackground(canvas) {
  const px = 3;
  canvas.width  = 80 * px;
  canvas.height = 16 * px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.blue;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 波纹行
  for (let y = 2; y < 14; y += 4) {
    for (let x = 0; x < 80; x += 6) {
      pxRect(ctx, x, y, 3, 1, C.bg, px);
      pxRect(ctx, x+3, y+1, 3, 1, C.bg, px);
    }
  }
  // 蒸汽气泡
  for (let x = 8; x < 80; x += 16) {
    pxRect(ctx, x, 0, 2, 2, C.bg, px);
    pxRect(ctx, x+5, 1, 1, 1, C.bg, px);
  }
}

// ============================================================
// 星星/稀有度图标
// ============================================================
function drawStars(ctx, x, y, count, px = 4) {
  ctx.fillStyle = C.orange;
  for (let i = 0; i < count; i++) {
    ctx.fillRect(x + i * 8, y, 4, 4);
    ctx.fillRect(x + i * 8 - 2, y + 2, 8, 2);
    ctx.fillRect(x + i * 8, y + 1, 4, 6);
  }
}

// ============================================================
// 宠物类型→像素颜色预览（用于宠物列表小图标）
// ============================================================
/**
 * drawPetMini(canvas, type, rarity, petClass)
 * 绘制 32×32 的简化宠物头像（用于宠物列表/守卫槽）
 */
function drawPetMini(canvas, type = 'bear', rarity = 'common', petClass = 'fighter') {
  drawPet(canvas, type, rarity, petClass);
  // 技能类右上角紫色角标
  if (petClass === 'skill') {
    const ctx = canvas.getContext('2d');
    const s = canvas.width;
    ctx.fillStyle = C.purple;
    ctx.fillRect(s - 10, 0, 10, 10);
    ctx.fillStyle = '#fff';
    ctx.font = '6px monospace';
    ctx.fillText('✦', s - 9, 8);
  }
}

// ============================================================
// 蛋品级颜色表（供 HTML/CSS 一致性参考）
// ============================================================
const RARITY_COLOR = {
  common: C.bg,
  rare:   C.blue,
  legend: C.gold,
};

// 宠物类型表
const PET_TYPES = ['bear','fox','bunny','cat','dragon','wolf','turtle','phoenix'];
// 技能型宠物（出孵蛋默认为技能型的类型）
const SKILL_TYPES = ['turtle','phoenix'];

// ============================================================
// Exports
// ============================================================
window.PixelRender = {
  drawEgg, drawPet, drawPetMini, drawSkillIcon, drawTrap,
  drawSpaBackground, drawStars,
  C, RARITY_COLOR, PET_TYPES, SKILL_TYPES
};
