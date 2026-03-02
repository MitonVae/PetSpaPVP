// ============================================================
// render.js — Canvas 像素宠物/蛋渲染引擎
// 所有图形用像素块（fillRect）手绘，无外部图片依赖
// 调色板: #F5ECD7 #8BB5C8 #E8A87C #7DAF8C #5C4A6B
// ============================================================

const C = {
  bg:     '#F5ECD7',
  blue:   '#8BB5C8',
  orange: '#E8A87C',
  green:  '#7DAF8C',
  dark:   '#5C4A6B',
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
 * drawPet(canvas, type, rarity)
 * type: 'bear'|'fox'|'bunny'|'cat'|'dragon'
 */
function drawPet(canvas, type = 'bear', rarity = 'common') {
  const px = 4;
  const W = 16, H = 16;
  canvas.width  = W * px;
  canvas.height = H * px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bodyColor = rarity === 'legend' ? C.orange :
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
  };

  (pets[type] || pets.bear)();
}

// ============================================================
// 陷阱图标绘制
// ============================================================
function drawTrap(canvas, type = 'mud') {
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
// Exports
// ============================================================
window.PixelRender = { drawEgg, drawPet, drawTrap, drawSpaBackground, drawStars, C };
