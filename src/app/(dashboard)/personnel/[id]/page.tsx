'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { differenceInDays, parseISO } from 'date-fns'
import { apiFetch, getJSON } from '@/lib/api'
import { toast } from '@/components/toast'

type Cert = {
  id: number; certType: string | null; certNo: string | null
  issueDate: string | null; expiryDate: string | null; issuer: string | null
}
type Attachment = {
  id: number; certId: number | null; fileName: string | null; uploadTime: string
}
type CertHistoryItem = {
  id: number; certId: number; action: string
  certType: string | null; certNo: string | null; issueDate: string | null
  expiryDate: string | null; issuer: string | null; prevExpiry: string | null
  changedBy: string | null; changedAt: string; note: string | null
}
type Person = {
  id: number; name: string; orgName: string | null; manager: string | null
  idCard: string | null; birthYear: number | null; education: string | null
  socialSecurity: string | null; sortOrder: number | null
  certificates: Cert[]
}

function certStatus(expiryDate: string | null) {
  if (!expiryDate) return 'none'
  const days = differenceInDays(parseISO(expiryDate), new Date())
  if (days < 0) return 'expired'
  if (days <= 30) return 'urgent'
  if (days <= 90) return 'warning'
  return 'ok'
}

const statusBadge: Record<string, string> = {
  expired: 'bg-red-50 text-red-600 border-red-200',
  urgent:  'bg-orange-50 text-orange-600 border-orange-200',
  warning: 'bg-amber-50 text-amber-600 border-amber-200',
  ok:      'bg-emerald-50 text-emerald-600 border-emerald-200',
  none:    'bg-slate-50 text-slate-400 border-slate-200',
}
const statusLabel: Record<string, string> = {
  expired: '已过期', urgent: '紧急', warning: '预警', ok: '正常', none: '未填日期',
}

const PERSON_FIELDS = [
  { key: 'name', label: '姓名', required: true },
  { key: 'orgName', label: '归属建制' },
  { key: 'manager', label: '负责人' },
  { key: 'idCard', label: '身份证号' },
  { key: 'birthYear', label: '出生年份' },
  { key: 'education', label: '学历' },
  { key: 'socialSecurity', label: '社保号' },
  { key: 'sortOrder', label: '排序' },
]

const CERT_FIELDS = [
  { key: 'certType', label: '证件类别', required: true },
  { key: 'certNo', label: '证件编号' },
  { key: 'issueDate', label: '发证日期', type: 'date' },
  { key: 'expiryDate', label: '到期日期', type: 'date' },
  { key: 'issuer', label: '发证机构' },
]

export default function PersonDetailPage() {
  const params = useParams()
  const router = useRouter()
  const personId = params.id as string

  const [person, setPerson] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingPerson, setEditingPerson] = useState(false)
  const [personForm, setPersonForm] = useState<Record<string, string>>({})
  const [personSaving, setPersonSaving] = useState(false)

  const [showAddCert, setShowAddCert] = useState(false)
  const [certForm, setCertForm] = useState<Record<string, string>>({})
  const [certSaving, setCertSaving] = useState(false)
  const [editingCert, setEditingCert] = useState<Cert | null>(null)
  const [editCertForm, setEditCertForm] = useState<Record<string, string>>({})
  const [confirmDelCert, setConfirmDelCert] = useState<number | null>(null)

  // 附件
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingCertId, setUploadingCertId] = useState<number | null>(null)
  const [confirmDelAtt, setConfirmDelAtt] = useState<number | null>(null)
  const uploadCertId = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 附件预览（应用内，避免在桌面端被转到无登录态的外部浏览器）
  const [preview, setPreview] = useState<{ fileName: string; url: string; kind: 'image' | 'pdf' | 'text' | 'other' } | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null)

  // 证件历史（续期/变更记录）
  const [history, setHistory] = useState<CertHistoryItem[]>([])
  const [historyCertId, setHistoryCertId] = useState<number | null>(null)

  async function loadHistory() {
    try {
      setHistory(await getJSON<CertHistoryItem[]>(`/api/personnel/${personId}/history`))
    } catch {
      setHistory([])
    }
  }

  async function load() {
    setLoading(true)
    try {
      setPerson(await getJSON<Person>(`/api/personnel/${personId}`))
    } catch {
      setPerson(null)
    }
    setLoading(false)
  }

  async function loadAttachments() {
    try {
      const data = await getJSON<Attachment[]>(`/api/personnel/${personId}/attachments`)
      setAttachments(Array.isArray(data) ? data : [])
    } catch {
      setAttachments([])
    }
  }

  useEffect(() => { load(); loadAttachments(); loadHistory() }, [personId])

  function triggerUpload(certId: number) {
    uploadCertId.current = certId
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const certId = uploadCertId.current
    setUploadingCertId(certId)
    const fd = new FormData()
    fd.append('file', file)
    if (certId != null) fd.append('certId', String(certId))
    try {
      await apiFetch(`/api/personnel/${personId}/attachments`, { method: 'POST', body: fd })
      toast('附件已上传', 'success')
      loadAttachments()
    } catch { /* toast 已弹 */ }
    setUploadingCertId(null)
  }

  async function deleteAttachment(attId: number) {
    try {
      await apiFetch(`/api/personnel/${personId}/attachments/${attId}`, { method: 'DELETE' })
      toast('附件已删除', 'success')
      setConfirmDelAtt(null)
      loadAttachments()
    } catch { /* toast 已弹 */ }
  }

  const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']

  async function openPreview(att: Attachment) {
    setPreviewLoadingId(att.id)
    try {
      const res = await fetch(`/api/personnel/${personId}/attachments/${att.id}?inline=1`)
      if (!res.ok) { alert('预览失败'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const ext = (att.fileName || '').split('.').pop()?.toLowerCase() || ''
      const kind = IMG_EXT.includes(ext) ? 'image' : ext === 'pdf' ? 'pdf' : ext === 'txt' ? 'text' : 'other'
      setPreview({ fileName: att.fileName || `附件 ${att.id}`, url, kind })
    } catch {
      alert('预览失败')
    } finally {
      setPreviewLoadingId(null)
    }
  }

  function closePreview() {
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  function startEditPerson() {
    if (!person) return
    setPersonForm({
      name: person.name,
      orgName: person.orgName || '',
      manager: person.manager || '',
      idCard: person.idCard || '',
      birthYear: person.birthYear?.toString() || '',
      education: person.education || '',
      socialSecurity: person.socialSecurity || '',
      sortOrder: person.sortOrder?.toString() || '',
    })
    setEditingPerson(true)
  }

  async function savePerson(e: React.FormEvent) {
    e.preventDefault()
    setPersonSaving(true)
    try {
      await apiFetch(`/api/personnel/${personId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personForm),
      })
      toast('已保存', 'success')
      setEditingPerson(false)
      load()
    } catch { /* toast 已弹 */ }
    setPersonSaving(false)
  }

  async function addCert(e: React.FormEvent) {
    e.preventDefault()
    setCertSaving(true)
    try {
      await apiFetch(`/api/personnel/${personId}/certs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(certForm),
      })
      toast('证件已添加', 'success')
      setShowAddCert(false)
      setCertForm({})
      load(); loadHistory()
    } catch { /* toast 已弹 */ }
    setCertSaving(false)
  }

  async function saveEditCert(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCert) return
    setCertSaving(true)
    try {
      await apiFetch(`/api/personnel/${personId}/certs/${editingCert.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCertForm),
      })
      toast('已保存', 'success')
      setEditingCert(null)
      load(); loadHistory()
    } catch { /* toast 已弹 */ }
    setCertSaving(false)
  }

  async function deleteCert(certId: number) {
    try {
      await apiFetch(`/api/personnel/${personId}/certs/${certId}`, { method: 'DELETE' })
      toast('证件已删除', 'success')
      setConfirmDelCert(null)
      load(); loadHistory()
    } catch { /* toast 已弹 */ }
  }

  if (loading) return <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
  if (!person) return <div className="text-sm text-red-400 py-12 text-center">人员不存在</div>

  return (
    <div>
      <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
      {/* 返回 + 页头 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/personnel')} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="page-header !border-b-0 !pb-0 !mb-0 flex-1">
          <div className="page-header-bar" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{person.name}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{person.orgName || '未分配建制'} · {person.certificates.length} 张证件</p>
          </div>
        </div>
        <button onClick={() => router.push(`/personnel/${personId}/print`)}
          className="btn-secondary self-center !py-2 !px-4 !text-sm">打印档案</button>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* 左：人员信息 */}
        <div className="col-span-2">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">人员信息</span>
              {!editingPerson && (
                <button onClick={startEditPerson} className="text-xs text-amber-500 hover:text-amber-600 font-medium">编辑</button>
              )}
            </div>
            {editingPerson ? (
              <form onSubmit={savePerson} className="p-5 space-y-3">
                {PERSON_FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">{f.label}</label>
                    <input
                      value={personForm[f.key] || ''}
                      onChange={e => setPersonForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="input-refined !py-1.5"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEditingPerson(false)} className="btn-secondary flex-1 !py-1.5">取消</button>
                  <button type="submit" disabled={personSaving} className="btn-primary flex-1 !py-1.5">
                    {personSaving ? '保存中…' : '保存'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-5 space-y-3">
                {PERSON_FIELDS.map(f => (
                  <div key={f.key} className="flex items-start justify-between gap-2">
                    <span className="text-xs text-slate-400 flex-shrink-0 w-16">{f.label}</span>
                    <span className="text-xs text-slate-700 text-right break-all">
                      {(person as any)[f.key] || '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右：证件列表 */}
        <div className="col-span-3">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">证件列表</span>
              <button
                onClick={() => { setShowAddCert(true); setCertForm({}) }}
                className="text-xs text-amber-500 hover:text-amber-600 font-medium"
              >
                + 添加证件
              </button>
            </div>

            {person.certificates.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">暂无证件，点击右上角添加</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {person.certificates.map(c => {
                  const st = certStatus(c.expiryDate)
                  const days = c.expiryDate ? differenceInDays(parseISO(c.expiryDate), new Date()) : null
                  const daysStr = days === null ? '—' : days < 0 ? `超期 ${Math.abs(days)} 天` : `剩 ${days} 天`
                  return (
                    <div key={c.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-medium text-sm text-slate-800">{c.certType || '未知类别'}</span>
                            <span className={`badge ${st === 'expired' ? 'badge-red' : st === 'urgent' ? 'badge-orange' : st === 'warning' ? 'badge-amber' : st === 'ok' ? 'badge-green' : 'badge-slate'}`} style={{ fontSize: '10px' }}>
                              {statusLabel[st]}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                            <span className="text-xs text-slate-400">编号：<span className="text-slate-600 font-mono">{c.certNo || '—'}</span></span>
                            <span className="text-xs text-slate-400">发证：<span className="text-slate-600">{c.issueDate || '—'}</span></span>
                            <span className="text-xs text-slate-400">到期：<span className={`font-medium ${st === 'expired' ? 'text-red-500' : st === 'urgent' ? 'text-orange-500' : 'text-slate-600'}`}>{c.expiryDate || '—'}</span></span>
                            <span className="text-xs text-slate-400">剩余：<span className="text-slate-600">{daysStr}</span></span>
                            {c.issuer && <span className="text-xs text-slate-400 col-span-2">机构：<span className="text-slate-600">{c.issuer}</span></span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setHistoryCertId(c.id)} className="text-xs text-slate-400 hover:text-blue-500">历史</button>
                          <button
                            onClick={() => { setEditingCert(c); setEditCertForm({ certType: c.certType || '', certNo: c.certNo || '', issueDate: c.issueDate || '', expiryDate: c.expiryDate || '', issuer: c.issuer || '' }) }}
                            className="text-xs text-slate-400 hover:text-amber-500"
                          >编辑</button>
                          {confirmDelCert === c.id ? (
                            <>
                              <button onClick={() => deleteCert(c.id)} className="text-xs text-red-500 font-semibold">确认</button>
                              <button onClick={() => setConfirmDelCert(null)} className="text-xs text-slate-400">取消</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDelCert(c.id)} className="text-xs text-slate-400 hover:text-red-500">删除</button>
                          )}
                        </div>
                      </div>

                      {/* 附件 */}
                      {(() => {
                        const certAtts = attachments.filter(a => a.certId === c.id)
                        return (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-slate-400">附件（{certAtts.length}）</span>
                              <button
                                onClick={() => triggerUpload(c.id)}
                                disabled={uploadingCertId === c.id}
                                className="text-xs text-amber-500 hover:text-amber-600 font-medium disabled:opacity-50"
                              >
                                {uploadingCertId === c.id ? '上传中…' : '+ 上传附件'}
                              </button>
                            </div>
                            {certAtts.length === 0 ? (
                              <div className="text-xs text-slate-300">暂无附件</div>
                            ) : (
                              <div className="space-y-1">
                                {certAtts.map(a => (
                                  <div key={a.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                                    <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                                    <a href={`/api/personnel/${personId}/attachments/${a.id}`}
                                       className="flex-1 truncate text-slate-600 hover:text-amber-600 hover:underline" title={a.fileName || ''}>
                                      {a.fileName || `附件 ${a.id}`}
                                    </a>
                                    <button onClick={() => openPreview(a)} disabled={previewLoadingId === a.id}
                                       className="text-slate-400 hover:text-amber-600 flex-shrink-0 disabled:opacity-50">
                                      {previewLoadingId === a.id ? '加载…' : '预览'}
                                    </button>
                                    {confirmDelAtt === a.id ? (
                                      <>
                                        <button onClick={() => deleteAttachment(a.id)} className="text-red-500 font-semibold flex-shrink-0">确认</button>
                                        <button onClick={() => setConfirmDelAtt(null)} className="text-slate-400 flex-shrink-0">取消</button>
                                      </>
                                    ) : (
                                      <button onClick={() => setConfirmDelAtt(a.id)} className="text-slate-400 hover:text-red-500 flex-shrink-0">删除</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 添加证件弹窗 */}
      {showAddCert && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">添加证件</h2>
              <button onClick={() => setShowAddCert(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={addCert} className="space-y-3">
              {CERT_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <input
                    type={f.type || 'text'}
                    value={certForm[f.key] || ''}
                    onChange={e => setCertForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="input-refined"
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddCert(false)} className="btn-secondary flex-1">取消</button>
                <button type="submit" disabled={certSaving} className="btn-primary flex-1">
                  {certSaving ? '添加中…' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑证件弹窗 */}
      {editingCert && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">编辑证件</h2>
              <button onClick={() => setEditingCert(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={saveEditCert} className="space-y-3">
              {CERT_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                  <input
                    type={f.type || 'text'}
                    value={editCertForm[f.key] || ''}
                    onChange={e => setEditCertForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="input-refined"
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingCert(null)} className="btn-secondary flex-1">取消</button>
                <button type="submit" disabled={certSaving} className="btn-primary flex-1">
                  {certSaving ? '保存中…' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 附件预览弹窗 */}
      {preview && (
        <div className="modal-overlay" onClick={closePreview}>
          <div className="modal-card w-full max-w-4xl flex flex-col" style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
              <span className="text-sm font-semibold text-slate-700 truncate" title={preview.fileName}>{preview.fileName}</span>
              <div className="flex items-center gap-4 flex-shrink-0">
                <a href={preview.url} download={preview.fileName} className="text-xs text-amber-500 hover:text-amber-600 font-medium">下载</a>
                <button onClick={closePreview} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-100 flex items-center justify-center overflow-auto p-3">
              {preview.kind === 'image' ? (
                <img src={preview.url} alt={preview.fileName} className="max-w-full max-h-full object-contain" />
              ) : preview.kind === 'pdf' || preview.kind === 'text' ? (
                <iframe src={preview.url} title={preview.fileName} className="w-full h-full bg-white rounded-lg border-0" />
              ) : (
                <div className="text-center">
                  <p className="text-sm text-slate-500">该格式暂不支持在线预览</p>
                  <a href={preview.url} download={preview.fileName} className="btn-primary inline-block mt-3 !text-xs">下载查看</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 证件历史弹窗 */}
      {historyCertId !== null && (() => {
        const items = history.filter(h => h.certId === historyCertId)
        return (
          <div className="modal-overlay" onClick={() => setHistoryCertId(null)}>
            <div className="modal-card max-w-lg w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-800">证件变更历史</span>
                <button onClick={() => setHistoryCertId(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
              </div>
              <div className="p-5 max-h-[70vh] overflow-y-auto">
                {items.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 py-6">暂无历史记录</div>
                ) : (
                  <div className="space-y-3">
                    {items.map(h => {
                      const badge = h.action === '续期' ? 'badge-amber' : h.action === '删除' ? 'badge-red' : h.action === '创建' ? 'badge-green' : 'badge-blue'
                      return (
                        <div key={h.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className={`badge ${badge} whitespace-nowrap`}>{h.action}</span>
                            <div className="flex-1 w-px bg-slate-200 mt-1" />
                          </div>
                          <div className="flex-1 pb-1">
                            <div className="text-xs text-slate-400">{new Date(h.changedAt).toLocaleString('zh-CN')} · {h.changedBy || '系统'}</div>
                            <div className="text-xs text-slate-600 mt-1">
                              {h.action === '续期' && h.prevExpiry
                                ? <>到期日 <span className="font-medium">{h.prevExpiry}</span> → <span className="font-medium text-amber-600">{h.expiryDate || '—'}</span></>
                                : <>到期日：<span className="font-medium">{h.expiryDate || '—'}</span>{h.certNo ? ` · 编号 ${h.certNo}` : ''}</>}
                            </div>
                            {h.note && <div className="text-[11px] text-slate-400 mt-0.5">{h.note}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
