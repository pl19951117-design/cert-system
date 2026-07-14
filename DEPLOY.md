# 服务器部署指南（腾讯云）

把「证件管理系统」从单机桌面版部署成**浏览器访问、多人共用、数据实时同步**的在线系统。
架构：`浏览器 → Caddy(自动 HTTPS) → Next 应用容器 → SQLite(数据卷)`。

> ⚠️ **上线前必读**
> - 系统含**身份证号等敏感个人信息**。放到公网即受《个人信息保护法》约束，你是数据责任人。**务必用域名 + HTTPS，不要用纯 IP 明文 HTTP。**
> - **第一件事就是改掉默认密码 admin/admin123**，并给每人建独立账号（系统管理 → 用户管理）。
> - 数据库和附件都在 Docker 数据卷 `cert-data` 里，**定期把它备份到别处**（见文末）。

---

## 0. 你需要准备
- 一台腾讯云 **CVM 云服务器**：2 核 2G 起步，系统选 **Ubuntu 22.04**，按量或包月均可。
- （强烈建议）一个**域名**，并完成腾讯云 **ICP 备案**（国内服务器绑域名必须备案，约 1~2 周；备案期间可先用 IP 跑通，备案好再切域名 HTTPS）。

## 1. 服务器安全组放行端口
腾讯云控制台 → 该实例 → 安全组，入站放行：**22（SSH）、80（HTTP）、443（HTTPS）**。

## 2. SSH 登录并安装 Docker
```bash
# 登录（把 IP 换成你的服务器公网 IP）
ssh ubuntu@你的服务器IP

# 安装 Docker（官方一键脚本）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 重新登录一次使权限生效
exit
ssh ubuntu@你的服务器IP
docker version    # 能看到版本即成功
```

## 3. 获取代码
```bash
git clone https://github.com/pl19951117-design/cert-system.git
cd cert-system/deploy
```

## 4. 配置密钥与站点地址
```bash
cp .env.example .env
# 生成一段随机会话密钥
openssl rand -base64 48
# 编辑 .env，把上面生成的值填到 JWT_SECRET；SITE_ADDRESS 填你的域名（如 cert.example.com）
nano .env
```
`.env` 示例：
```
JWT_SECRET=上一步生成的随机串
SITE_ADDRESS=cert.example.com
```
> 还没备案好域名？先填 `SITE_ADDRESS=:80` 用 IP + HTTP 跑通，**但别录入真实身份证数据**，等域名 HTTPS 好了再正式用。

## 5. 一键启动
```bash
docker compose up -d --build
```
首次会构建镜像（几分钟）。完成后：
- 有域名：浏览器访问 `https://cert.example.com`（Caddy 自动申请证书，第一次访问稍等十几秒）
- 仅 IP：访问 `http://你的服务器IP`

> **域名解析**：在你的域名服务商处，把 `cert.example.com` 的 A 记录指向服务器公网 IP。

## 6. 初始化（非常重要）
1. 用 `admin / admin123` 登录。
2. **立刻**点左下角钥匙图标 → 修改密码，改成强密码。
3. 进 **系统管理 → 用户管理**，给每位同事建独立账号、分配角色（查看员/编辑员/超级管理员）。
4. 进 **系统管理 → 账套管理**，按需建账套。

---

## 从桌面版迁移已有数据（可选）
如果你桌面版里已经录了数据，想搬到服务器：
1. 桌面电脑上找到数据库文件：`%APPDATA%\cert-system\cert-system.db`（连同 `attachments` 文件夹）。
2. 上传到服务器，导入数据卷：
```bash
# 停应用
docker compose stop app
# 找到数据卷挂载点
docker volume inspect deploy_cert-data      # 看 Mountpoint
# 把 cert-system.db 复制进去（覆盖），attachments 同理放到该目录下的 attachments/
sudo cp cert-system.db  <Mountpoint>/cert-system.db
sudo cp -r attachments  <Mountpoint>/attachments
docker compose start app
```
应用启动时会自动为老库补齐新版本的表/列。

## 日常维护
```bash
# 查看日志
docker compose logs -f app
# 升级到新版本
git pull && docker compose up -d --build
# 备份数据（把整个数据卷打成 tar，定期下载到本地/对象存储）
docker run --rm -v deploy_cert-data:/data -v $PWD:/backup alpine \
  tar czf /backup/cert-backup-$(date +%Y%m%d).tar.gz -C /data .
```

## 常见问题
- **访问不了**：检查安全组是否放行 80/443；域名 A 记录是否指向本机 IP。
- **HTTPS 证书没下来**：确认域名已解析到本机、已备案、80 端口可从公网访问（Let's Encrypt 要回访）。
- **登录报错“系统繁忙”**：`docker compose logs app` 看报错；多为 `JWT_SECRET` 没设置（生产环境必须设置）。
