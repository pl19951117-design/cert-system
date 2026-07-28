'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UserManagement } from './_components/UserManagement'
import { LanSharing } from './_components/LanSharing'

type Account = { id: string; displayName: string | null; createdAt: string }
type CertType = { id: number; name: string; description: string | null; isActive: boolean; sortOrder: number }
type CertReq = { id: number; orgName: string | null; certType: string }

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'accounts' | 'users' | 'lan' | 'certtypes' | 'reqs'>('accounts')
  const [currentUserId, setCurrentUserId] = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [certTypes, setCertTypes] = useState<CertType[]>([])
  const [reqs, setReqs] = useState<CertReq[]>([])
  const [newReqOrg, setNewReqOrg] = useState('')
  const [newReqType, setNewReqType] = useState('')
  const [reqErr, setReqErr] = useState('')
  const [reqSaving, setReqSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Account form
  const [newAccountId, setNewAccountId] = useState('')
  const [newAccountName, setNewAccountName] = useState('')
  const [accountErr, setAccountErr] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)

  // CertType form
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeDesc, setNewTypeDesc] = useState('')
  const [typeErr, setTypeErr] = useState('')
  const [typeSaving, setTypeSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    const [accs, types, rqs, me] = await Promise.all([
      fetch('/api/admin/accounts').then(r => r.json()),
      fetch('/api/admin/cert-types').then(r => r.json()),
      fetch('/api/admin/cert-requirements').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()).catch(() => ({})),
    ])
    setAccounts(Array.isArray(accs) ? accs : [])
    setCertTypes(Array.isArray(types) ? types : [])
    setReqs(Array.isArray(rqs) ? rqs : [])
    if (me?.userId) setCurrentUserId(me.userId)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    setAccountErr('')
    setAccountSaving(true)
    const res = await fetch('/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newAccountId, displayName: newAccountName }),
    })
    const data = await res.json()
    setAccountSaving(false)
    if (!res.ok) { setAccountErr(data.error || '创建失败'); return }
    setNewAccountId(''); setNewAccountName('')
    loadData()
    // 同步侧边栏：layout 是服务端组件，accounts 列表通过它注入，必须 refresh 才能看到新账套
    router.refresh()
  }

  async function deleteAccount(id: string) {
    await fetch(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
    setConfirmDelete(null)
    loadData()
    router.refresh()
  }

  // 上/下移：把指定下标和其前/后一项交换，再发起重排请求
  // 用「乐观更新」立即调换前端显示，再异步同步到后端，体感更顺
  async function moveAccount(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= accounts.length) return
    const reordered = [...accounts]
    ;[reordered[index], reordered[j]] = [reordered[j], reordered[index]]
    setAccounts(reordered)
    await fetch('/api/admin/accounts/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(a => a.id) }),
    })
    router.refresh()  // 同步侧边栏顺序
  }

  async function createCertType(e: React.FormEvent) {
    e.preventDefault()
    setTypeErr('')
    setTypeSaving(true)
    const res = await fetch('/api/admin/cert-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTypeName, description: newTypeDesc }),
    })
    const data = await res.json()
    setTypeSaving(false)
    if (!res.ok) { setTypeErr(data.error || '创建失败'); return }
    setNewTypeName(''); setNewTypeDesc('')
    loadData()
  }

  async function toggleCertType(id: number, isActive: boolean) {
    await fetch(`/api/admin/cert-types/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    loadData()
  }

  async function deleteCertType(id: number) {
    await fetch(`/api/admin/cert-types/${id}`, { method: 'DELETE' })
    loadData()
  }

  async function createReq(e: React.FormEvent) {
    e.preventDefault()
    setReqErr('')
    if (!newReqType.trim()) { setReqErr('请选择证件类别'); return }
    setReqSaving(true)
    const res = await fetch('/api/admin/cert-requirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName: newReqOrg, certType: newReqType }),
    })
    const data = await res.json()
    setReqSaving(false)
    if (!res.ok) { setReqErr(data.error || '添加失败'); return }
    setNewReqOrg(''); setNewReqType('')
    loadData()
  }

  async function deleteReq(id: number) {
    await fetch(`/api/admin/cert-requirements/${id}`, { method: 'DELETE' })
    loadData()
  }

  const tabs = [
    { key: 'accounts', label: '账套管理' },
    { key: 'users', label: '用户管理' },
    { key: 'lan', label: '局域网共享' },
    { key: 'certtypes', label: '证件类型' },
    { key: 'reqs', label: '证件要求' },
  ] as const

  return (
    <div>
      {/* 页头 */}
      <div className="page-header">
        <div className="page-header-bar" />
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">系统管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">仅超级管理员可见</p>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="filter-bar !p-1 w-fit !mb-6 flex gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-[10px] text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">加载中…</div>
      ) : tab === 'users' ? (
        <UserManagement currentUserId={currentUserId} />
      ) : tab === 'lan' ? (
        <LanSharing />
      ) : tab === 'accounts' ? (
        <div className="grid grid-cols-5 gap-6">
          {/* 左：账套列表 */}
          <div className="col-span-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">现有账套</div>
            {accounts.length === 0 ? (
              <div className="card-elevated p-8 text-center text-sm text-slate-400">
                暂无账套，请在右侧创建
              </div>
            ) : (
              <div className="card-elevated overflow-hidden">
                <table className="w-full table-premium">
                  <thead>
                    <tr>
                      {['顺序', '账套ID', '显示名称', '创建时间', '操作'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a, idx) => (
                      <tr key={a.id}>
                        <td>
                          <div className="inline-flex items-center gap-1">
                            <span className="text-xs text-slate-500 tabular-nums w-5 text-center">{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => moveAccount(idx, -1)}
                              disabled={idx === 0}
                              aria-label="上移"
                              title="上移"
                              className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => moveAccount(idx, 1)}
                              disabled={idx === accounts.length - 1}
                              aria-label="下移"
                              title="下移"
                              className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="font-mono text-xs font-semibold text-slate-700">{a.id}</td>
                        <td>{a.displayName || '—'}</td>
                        <td className="text-xs">{a.createdAt.slice(0, 10)}</td>
                        <td>
                          {confirmDelete === a.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-500">确认删除？</span>
                              <button onClick={() => deleteAccount(a.id)} className="text-xs text-red-600 font-semibold hover:underline">删除</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 hover:underline">取消</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(a.id)}
                              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                            >
                              删除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 右：创建表单 */}
          <div className="col-span-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">创建账套</div>
            <form onSubmit={createAccount} className="card-elevated p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">账套ID <span className="text-red-400">*</span></label>
                <input
                  value={newAccountId}
                  onChange={e => setNewAccountId(e.target.value)}
                  placeholder="如：2024、甲方项目"
                  className="input-refined"
                />
                <p className="text-[11px] text-slate-400 mt-1">账套ID创建后不可更改</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">显示名称</label>
                <input
                  value={newAccountName}
                  onChange={e => setNewAccountName(e.target.value)}
                  placeholder="如：2024年度账套（可选）"
                  className="input-refined"
                />
              </div>
              {accountErr && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{accountErr}</div>
              )}
              <button
                type="submit"
                disabled={accountSaving}
                className="btn-primary w-full"
              >
                {accountSaving ? '创建中…' : '创建账套'}
              </button>
            </form>
          </div>
        </div>
      ) : tab === 'certtypes' ? (
        <div className="grid grid-cols-5 gap-6">
          {/* 左：证件类型列表 */}
          <div className="col-span-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">证件类型列表</div>
            {certTypes.length === 0 ? (
              <div className="card-elevated p-8 text-center text-sm text-slate-400">
                暂无证件类型，请在右侧添加
              </div>
            ) : (
              <div className="card-elevated overflow-hidden">
                <table className="w-full table-premium">
                  <thead>
                    <tr>
                      {['证件类型', '说明', '状态', '操作'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {certTypes.map(t => (
                      <tr key={t.id}>
                        <td className="font-medium text-slate-800">{t.name}</td>
                        <td className="text-xs">{t.description || '—'}</td>
                        <td>
                          <button
                            onClick={() => toggleCertType(t.id, t.isActive)}
                            className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors ${
                              t.isActive
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t.isActive ? '启用' : '停用'}
                          </button>
                        </td>
                        <td>
                          <button
                            onClick={() => deleteCertType(t.id)}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 右：添加表单 */}
          <div className="col-span-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">添加证件类型</div>
            <form onSubmit={createCertType} className="card-elevated p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">类型名称 <span className="text-red-400">*</span></label>
                <input
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  placeholder="如：安全员证、特种作业证"
                  className="input-refined"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">说明</label>
                <input
                  value={newTypeDesc}
                  onChange={e => setNewTypeDesc(e.target.value)}
                  placeholder="可选备注"
                  className="input-refined"
                />
              </div>
              {typeErr && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{typeErr}</div>
              )}
              <button
                type="submit"
                disabled={typeSaving}
                className="btn-primary w-full"
              >
                {typeSaving ? '添加中…' : '添加证件类型'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          {/* 左：要求列表 */}
          <div className="col-span-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">证件要求（用于合规报表）</div>
            {reqs.length === 0 ? (
              <div className="card-elevated p-8 text-center text-sm text-slate-400">
                暂无要求。设定「某建制/全账套 必须持有 某证件」后，合规报表会自动算出谁缺证/过期。
              </div>
            ) : (
              <div className="card-elevated overflow-hidden">
                <table className="w-full table-premium">
                  <thead>
                    <tr>{['适用范围', '必备证件类别', '操作'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {reqs.map(r => (
                      <tr key={r.id}>
                        <td>{r.orgName ? r.orgName : <span className="badge badge-blue">全账套</span>}</td>
                        <td className="font-medium text-slate-800">{r.certType}</td>
                        <td>
                          <button onClick={() => deleteReq(r.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 右：添加要求 */}
          <div className="col-span-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">添加要求</div>
            <form onSubmit={createReq} className="card-elevated p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">适用建制</label>
                <input value={newReqOrg} onChange={e => setNewReqOrg(e.target.value)}
                  placeholder="留空 = 适用全账套所有人" className="input-refined" />
                <p className="text-[11px] text-slate-400 mt-1">填某建制名则只对该建制人员生效</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">必备证件类别 <span className="text-red-400">*</span></label>
                {certTypes.length > 0 ? (
                  <select value={newReqType} onChange={e => setNewReqType(e.target.value)} className="input-refined">
                    <option value="">请选择…</option>
                    {certTypes.filter(t => t.isActive).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                ) : (
                  <input value={newReqType} onChange={e => setNewReqType(e.target.value)}
                    placeholder="如：C1（建议先在“证件类型”里维护）" className="input-refined" />
                )}
              </div>
              {reqErr && <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{reqErr}</div>}
              <button type="submit" disabled={reqSaving} className="btn-primary w-full">
                {reqSaving ? '添加中…' : '添加要求'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
