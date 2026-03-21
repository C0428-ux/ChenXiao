# 职途先见

这是基于 MiniMax 的可上线前后端分离版本，主打职业趋势、岗位风险与城市机会判断。

## 项目结构

- `public/`：前端静态页面
- `server.js`：后端服务，负责安全调用 MiniMax
- `.env.example`：环境变量示例
- `vercel.json`：Vercel 部署配置（可选）

## 本地启动

1. 安装依赖：`npm install`
2. 复制环境变量：把 `.env.example` 改成 `.env`
3. 填入 `MINIMAX_API_KEY`
4. 启动项目：`npm run dev`

## 更省事的启动方式

直接双击 [start.bat](C:\Users\xiaoxiao\Documents\New project\start.bat) 也可以：

- 如果没有 `node_modules`，会先自动安装依赖
- 如果没有 `.env`，会先自动从 `.env.example` 创建
- 然后自动打开浏览器并启动服务

启动后访问：

- [http://localhost:3000](http://localhost:3000)

## 环境变量

- `MINIMAX_API_KEY`：必填
- `MINIMAX_MODEL`：可选，默认 `MiniMax-M2.5`
- `PORT`：可选，默认 `3000`

## 部署

可以直接部署到 Railway、Render、Vercel 或自己的 Node.js 服务器。

### Railway

- 使用 GitHub 仓库导入项目
- Railway 会自动识别 `package.json` 并执行 `npm start`
- 在 Variables 里配置 `MINIMAX_API_KEY`
- 可选配置 `MINIMAX_MODEL`

### Vercel

- 导入项目
- 在环境变量里配置 `MINIMAX_API_KEY`
- 可选配置 `MINIMAX_MODEL`

### 普通服务器

- `npm install`
- 配置 `.env`
- `npm start`
