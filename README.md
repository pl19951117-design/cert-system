# 证件管理系统

面向建筑施工企业「三类人员」（A/B/C 类安全生产管理人员）的证件与社保管理桌面应用。
基于 Next.js + Electron 打包为 Windows 桌面程序，数据本地 SQLite 存储，支持多账套。

## 主要功能

- **人员证件管理**：人员/证件增删改查，按「归属建制 → 负责人」就近排序，Excel 批量导入/导出
- **到期预警**：证件到期状态（正常 / 预警 / 紧急 / 过期）自动计算与提醒
- **社保管理**：批量比对社保清单、按证件类型统计参保率
- **变动流水**：人员/证件的转入转出自动记录，可按月筛选统计
- **考试报名**：报名记录与「考试通过 → 自动生成/续期证件」闭环
- **总览看板**：KPI、证件 × 社保统计、每月新增/减少柱状图
- **一键数据报告**：按月份统计三类人员证件总数、社保覆盖率、转入/转出，支持导出 Excel
- **多账套**：账套切换、排序，数据相互隔离
- **回收站 / 操作审计 / 数据备份**

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16（App Router）· React 19 · Tailwind CSS v4 |
| 后端 | Next.js Route Handlers · zod 校验 · 分层 service 架构 |
| 数据 | Prisma 5 · SQLite（多租户 `accountId` 作用域 + 软删除） |
| 鉴权 | JWT（jose）· 角色权限（viewer / editor / super_admin） |
| 桌面 | Electron 42 · electron-builder（NSIS 安装包） |
| 测试 | Vitest |

## 本地开发

```bash
npm install            # 安装依赖
npm run dev            # 启动开发服务器 http://localhost:3000
npm test               # 运行单元测试
npx tsc --noEmit       # 类型检查
```

首次登录会自动创建默认管理员：**用户名 `admin` / 密码 `admin123`**（请尽快修改，生产环境务必设置 `JWT_SECRET`）。

## 打包桌面程序

```bash
npm run dist           # 生成 Windows 安装包到 release/
```

产物：`release/证件管理系统 Setup x.x.x.exe`（NSIS 安装包）。

## 环境变量

复制 `.env.example` 为 `.env`：

```
DATABASE_URL="file:./dev.db"   # SQLite 数据库路径
JWT_SECRET="请改成一段随机字符串"  # 生产环境必填
```

## 数据安全说明

- 本仓库**不包含任何真实数据**：所有 `*.db`、`/backups/` 已在 `.gitignore` 中排除。
- 数据库含个人信息（姓名 / 身份证号），切勿提交到公开仓库。
- 桌面版的数据库存放在用户数据目录（`%APPDATA%\cert-system\`），与源码仓库无关。

## 许可证

私有项目，保留所有权利。
