export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // 兜底：任何未捕获的异常/拒绝都不应让内嵌服务进程退出（否则桌面端会"网络异常"）
  process.on('unhandledRejection', (e) => { console.error('[server] unhandledRejection:', e) })
  process.on('uncaughtException', (e) => { console.error('[server] uncaughtException:', e) })

  try {
    // 先确保现有库有新列/新表（旧库不会自动跑迁移）。这步在服务开始接收请求前完成。
    const { ensureAttachmentColumns, migrateBlobsToDisk } = await import('@/lib/attachments')
    const { ensureSoftDeleteSchema } = await import('@/lib/schema-guard')
    try {
      await ensureAttachmentColumns()
      await ensureSoftDeleteSchema()
    } catch (e) {
      console.error('[startup] 补列/补表失败:', e)
    }

    // 后台维护延后执行，先让界面/登录可用（DB 已用 connection_limit=1 串行化，不会与请求并发冲突）
    setTimeout(() => { migrateBlobsToDisk().catch(e => console.error('[startup] 附件迁移异常:', e)) }, 6000)

    const { startBackupScheduler } = await import('@/lib/backup')
    startBackupScheduler()
  } catch (e) {
    // 启动维护绝不能影响服务正常工作
    console.error('[startup] register 异常:', e)
  }
}
