# 🌸 温泉宠物镇 PetSpaPVP

一个浏览器多人弱PVP孵蛋小游戏，基于 Node.js + WebSocket 实现，无需数据库，纯 JSON 文件存储。

---

## 📦 技术栈

- **后端**：Node.js + Express + ws（WebSocket）
- **前端**：原生 HTML / CSS / JavaScript（无框架）
- **存储**：纯 JSON 文件（`data/` 目录）

---

## 🚀 本地运行

```bash
npm install
npm start
# 浏览器打开 http://localhost:3000
```

---

## � 外网部署教程

### 方式一：Railway（推荐，国内可访问）

Railway 提供每月 $5 免费额度，部署后会得到一个 `*.up.railway.app` 公网地址。

**步骤：**

1. 注册 [Railway](https://railway.app/) 账号（可用 GitHub 登录）
2. 将本项目推送到 GitHub 仓库：
   ```bash
   git init
   git add .
   git commit -m "init"
   git remote add origin https://github.com/你的用户名/PetSpaPVP.git
   git push -u origin main
   ```
3. 在 Railway 控制台点击 **New Project → Deploy from GitHub Repo**
4. 选择你的仓库，Railway 会自动检测 `railway.json` 配置并部署
5. 部署完成后，点击项目 → **Settings → Networking → Generate Domain**
6. 得到公网 URL，例如：`https://petspapvp-production.up.railway.app`

> ⚠️ **注意**：Railway 是无状态容器，每次重新部署数据会重置。如需持久化数据，可在 Railway 控制台添加 **Volume（挂载卷）**，挂载路径设为 `/app/data`。

---

### 方式二：Render.com（免费，但有冷启动）

Render 免费版实例15分钟不活跃会休眠，第一次访问会有约30秒冷启动延迟。

**步骤：**

1. 注册 [Render](https://render.com/) 账号（可用 GitHub 登录）
2. 将本项目推送到 GitHub 仓库（同上）
3. 在 Render 控制台点击 **New → Web Service**
4. 连接 GitHub 仓库
5. Render 会自动检测 `render.yaml` 配置：
   - Build Command: `npm install`
   - Start Command: `node server/index.js`
6. 点击 **Create Web Service**，等待约2分钟部署完成
7. 得到公网 URL，例如：`https://pet-spa-pvp.onrender.com`

> ⚠️ **注意**：Render 免费实例文件系统是临时的，重启/重新部署后数据会丢失。如需持久化，升级到 Starter 计划并启用 `render.yaml` 中注释的 Disk 配置。

---

### 方式三：Glitch.com（最简单，无需 GitHub）

Glitch 完全免费，可直接在线编辑代码，适合快速试玩。

**步骤：**

1. 打开 [Glitch](https://glitch.com/) 并登录
2. 点击 **New Project → Import from GitHub**
3. 输入 GitHub 仓库地址
4. Glitch 会自动运行，得到 `https://项目名.glitch.me` 的公网地址

> ⚠️ **注意**：Glitch 免费版每5分钟不活跃会休眠，项目每天运行时长有限制（约1000小时/月）。

---

## 🎮 游戏玩法

| 功能 | 说明 |
|------|------|
| 注册/登录 | 创建账号进入游戏 |
| 放置蛋 | 消耗10金币，随机获得普通/稀有/传说蛋 |
| 孵化宠物 | 等待倒计时结束（2~10分钟）自动孵化 |
| 设置守卫 | 派宠物守护蛋，提高防守能力 |
| 放置陷阱 | 消耗15~35金币设置陷阱，惩罚偷蛋者 |
| 偷蛋 | 选择强攻/潜行/贿赂策略偷取他人的蛋 |
| 每日签到 | 每天签到获得20金币 |
| 每日任务 | 完成偷窃/防御/孵化/签到任务获得奖励 |
| 邻居系统 | 添加邻居快速查看并偷取其蛋 |
| 排行榜 | 查看全服金币排名 |

---

## 📁 项目结构

```
PetSpaPVP/
├── public/          # 前端静态文件
│   ├── index.html
│   ├── game.js
│   ├── render.js
│   └── style.css
├── server/
│   ├── index.js     # Express + WebSocket 服务器
│   └── db.js        # JSON 文件数据层
├── data/            # 运行时数据（自动创建）
├── railway.json     # Railway 部署配置
├── render.yaml      # Render 部署配置
└── package.json
```

---

## ⚙️ 游戏参数速查

| 稀有度 | 孵化时长 | 奖励倍率 |
|--------|---------|---------|
| 普通   | 2 分钟  | ×1      |
| 稀有   | 5 分钟  | ×2.5    |
| 传说   | 10 分钟 | ×5 + 全服公告 |

| 陷阱类型 | 费用 | 效果 |
|----------|------|------|
| 泥坑 Mud   | 15 金 | 成功率 -20% |
| 荆棘 Thorn | 25 金 | 成功率 -30%，失败额外扣 20 金 |
| 睡眠 Sleep | 35 金 | 成功率 -45% |

---

## 🌐 多人测试

在同一局域网内，其他设备访问 `http://<本机IP>:3000` 即可加入。

---

## 💡 游戏策略提示

- 传说蛋孵化时间长（10分钟），放蛋后快去给它加守卫！
- 蛋孵化进度越高，被偷时损失越大（对你），偷到时收益越高（对你）
- 睡眠香陷阱（35🪙）是最强陷阱，对强闯策略克制效果明显
- 绕路策略会无视陷阱，专门对抗高DEF守卫
- 贿赂需要金币，对方守卫越强贿赂费越高