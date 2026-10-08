'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/components/toast'
import type { LanStatus } from '@/types/desktop'

export function LanSharing() {
  const [status, setStatus] = useState<LanStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!window.desktop) { setLoading(false); return }
    try { setStatus(await window.desktop.lanGetStatus()) } catch { /* 忽略 */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggle(next: boolean) {
    if (!window.desktop) return
    setBusy(true)
    try {
      await window.desktop.lanSetEnabled(next)
      await load()
      toast(next ? '已开启，重启后生效' : '已关闭，重启后生效', 'success')
    } catch {
      toast('设置失败', 'error')
    }
    setBusy(false)
  }

  async function addFirewall() {
    if (!window.desktop) return
    setBusy(true)
    const r = await window.desktop.lanAddFirewallRule()
    setBusy(false)
    if (r.ok) toast('防火墙已放行', 'success')
    else toast(r.error || '未能添加防火墙规则', 'error')
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text)
      .then(() => toast('已复制：' + text, 'success'))
      .catch(() => toast('复制失败，请手动记录', 'error'))
  }

  // 局域网访问（浏览器）时没有 window.desktop —— 该功能只在主机的桌面程序里配置
  if (!loading && !status) {
    return (
      <div className="card-elevated p-8 text-center">
        <div className="text-sm font-semibold text-slate-600">此设置仅在主机的桌面程序中可用</div>
        <p className="text-xs text-slate-400 mt-1.5">
          你正在通过浏览器访问。请到运行本系统的那台电脑上，打开桌面程序进行设置。
        </p>
      </div>
    )
  }
  if (loading || !status) return <div className="text-sm text-slate-400 py-10 text-center">加载中…</div>

  const needsRestart = status.enabled !== status.activeEnabled
  const urls = status.addresses.map(a => ({ ...a, url: `http://${a.address}:${status.port}` }))

  return (
    <div className="max-w-3xl space-y-5">
      {/* 开关 */}
      <div className="card-elevated p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-bold text-slate-800">局域网共享</div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              开启后，<span className="font-semibold text-slate-700">同一局域网内</span>的同事无需安装，
              用浏览器打开下方地址即可登录使用，数据与本机实时同步。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={status.enabled}
            disabled={busy}
            onClick={() => toggle(!status.enabled)}
            className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
              status.enabled ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
              status.enabled ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>

        {needsRestart && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <span className="text-xs font-semibold text-amber-700">
              设置已保存，需重启程序后生效
            </span>
            <button onClick={() => window.desktop!.relaunch()} className="btn-primary !py-1.5 !px-3 !text-xs whitespace-nowrap">
              立即重启
            </button>
          </div>
        )}
      </div>

      {/* 已开启：地址 + 防火墙 */}
      {status.enabled && (
        <>
          <div className="card-elevated p-5">
            <div className="section-label">
              <div className="section-label-bar" />
              <span className="section-label-text">同事访问地址</span>
            </div>
            {urls.length === 0 ? (
              <p className="text-xs text-slate-400">未检测到局域网地址，请确认本机已连接公司网络。</p>
            ) : (
              <>
                <div className="space-y-2">
                  {urls.map(u => (
                    <div key={u.address} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <code className="flex-1 font-mono text-sm text-slate-800">{u.url}</code>
                      <span className="text-[11px] text-slate-400 truncate max-w-[140px]" title={u.name}>{u.name}</span>
                      <button onClick={() => copy(u.url)} className="text-xs text-navy-600 hover:text-navy-800 font-semibold whitespace-nowrap">
                        复制
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2.5">
                  有多个地址时，通常选 192.168 或 10. 开头的那个。把它发到工作群即可。
                </p>
              </>
            )}
          </div>

          <div className="card-elevated p-5">
            <div className="section-label">
              <div className="section-label-bar" />
              <span className="section-label-text">连不上？按顺序检查</span>
            </div>
            <ol className="text-xs text-slate-600 space-y-2.5 list-decimal ml-4">
              <li>
                <span className="font-semibold">放行 Windows 防火墙</span>（首次必做，会弹出管理员授权）
                <div className="mt-1.5">
                  <button onClick={addFirewall} disabled={busy} className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-50">
                    {busy ? '处理中…' : `一键放行端口 ${status.port}`}
                  </button>
                </div>
              </li>
              <li>确认同事和本机<span className="font-semibold">在同一个网络</span>（同一 WiFi / 同一办公网，手机流量不行）</li>
              <li>本机<span className="font-semibold">不能休眠或关机</span>，否则同事会断开</li>
              <li>同事需要用你在「用户管理」里给他建的账号登录</li>
            </ol>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
            <div className="text-xs font-bold text-amber-800 mb-1">安全提示</div>
            <ul className="text-[11px] text-amber-700 space-y-1 list-disc ml-4">
              <li>局域网内为 <span className="font-semibold">HTTP 明文传输</span>，请仅在可信的公司内网使用，不要把本机暴露到公网。</li>
              <li>务必给每位同事建<span className="font-semibold">独立账号</span>并分配合适角色，不要共用管理员账号。</li>
              <li>本机 IP 可能因路由器重新分配而变化；如需长期稳定，建议设置固定 IP。</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
