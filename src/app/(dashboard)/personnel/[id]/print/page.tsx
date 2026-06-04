'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { differenceInDays, parseISO } from 'date-fns'
import { getJSON } from '@/lib/api'

type Cert = {
  id: number; certType: string | null; certNo: string | null
  issueDate: string | null; expiryDate: string | null; issuer: string | null
}
type Person = {
  id: number; name: string; orgName: string | null; manager: string | null
  idCard: string | null; birthYear: number | null; education: string | null
  socialSecurity: string | null; certificates: Cert[]
}

function getAge(idCard: string | null, birthYear: number | null): string {
  if (idCard && idCard.length === 18) {
    const y = parseInt(idCard.substring(6, 10))
    if (y > 1900 && y <= new Date().getFullYear()) return String(new Date().getFullYear() - y)
  }
  if (birthYear && birthYear > 1900) return String(new Date().getFullYear() - birthYear)
  return '—'
}

function statusText(expiry: string | null): { label: string; color: string } {
  if (!expiry) return { label: '无日期', color: '#94a3b8' }
  const d = differenceInDays(parseISO(expiry), new Date())
  if (d < 0) return { label: '已过期', color: '#dc2626' }
  if (d <= 30) return { label: '紧急', color: '#ea580c' }
  if (d <= 90) return { label: '预警', color: '#d97706' }
  return { label: '正常', color: '#16a34a' }
}

export default function PersonPrintPage() {
  const { id } = useParams()
  const router = useRouter()
  const [person, setPerson] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try { setPerson(await getJSON<Person>(`/api/personnel/${id}`)) } catch { /* toast 已弹 */ }
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
  if (!person) return <div className="text-sm text-red-400 py-12 text-center">人员不存在</div>

  const info: [string, string][] = [
    ['姓名', person.name],
    ['归属建制', person.orgName || '—'],
    ['负责人', person.manager || '—'],
    ['身份证号', person.idCard || '—'],
    ['年龄', getAge(person.idCard, person.birthYear)],
    ['学历', person.education || '—'],
    ['社保情况', person.socialSecurity || '—'],
    ['证件数量', String(person.certificates.length)],
  ]

  return (
    <div>
      {/* 操作栏（打印时隐藏） */}
      <div className="no-print flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="btn-secondary !py-2 !px-4 !text-sm">返回</button>
        <button onClick={() => window.print()} className="btn-primary !py-2 !px-4 !text-sm">打印 / 导出 PDF</button>
        <span className="text-xs text-slate-400">在打印对话框中可选择「另存为 PDF」</span>
      </div>

      {/* 档案纸张 */}
      <div className="print-sheet card-elevated mx-auto bg-white" style={{ maxWidth: 800, padding: '36px 40px' }}>
        <div className="text-center border-b-2 border-slate-800 pb-3 mb-5">
          <h1 className="text-2xl font-bold text-slate-900 tracking-wide">人员证件档案</h1>
          <p className="text-xs text-slate-400 mt-1">导出时间：{new Date().toLocaleString('zh-CN')}</p>
        </div>

        <h2 className="text-sm font-bold text-slate-700 mb-2">基本信息</h2>
        <table className="w-full mb-6 text-sm" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {[0, 2, 4, 6].map(r => (
              <tr key={r}>
                <td className="font-semibold text-slate-500" style={{ border: '1px solid #e2e8f0', padding: '7px 10px', width: '15%', background: '#f8fafc' }}>{info[r][0]}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: '7px 10px', width: '35%' }}>{info[r][1]}</td>
                <td className="font-semibold text-slate-500" style={{ border: '1px solid #e2e8f0', padding: '7px 10px', width: '15%', background: '#f8fafc' }}>{info[r + 1][0]}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: '7px 10px', width: '35%' }}>{info[r + 1][1]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-sm font-bold text-slate-700 mb-2">持有证件（{person.certificates.length}）</h2>
        {person.certificates.length === 0 ? (
          <div className="text-sm text-slate-400 py-4 text-center" style={{ border: '1px solid #e2e8f0' }}>暂无证件</div>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['序号', '证件类别', '证件编号', '发证日期', '到期日期', '发证机构', '状态'].map(h => (
                  <th key={h} style={{ border: '1px solid #e2e8f0', padding: '7px 8px', fontSize: 12, textAlign: 'left', color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {person.certificates.map((c, i) => {
                const st = statusText(c.expiryDate)
                return (
                  <tr key={c.id}>
                    <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px' }}>{c.certType || '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{c.certNo || '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px' }}>{c.issueDate || '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px' }}>{c.expiryDate || '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px' }}>{c.issuer || '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', color: st.color, fontWeight: 600 }}>{st.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="mt-10 flex justify-between text-xs text-slate-400">
          <span>制表人：____________</span>
          <span>审核人：____________</span>
          <span>日期：____________</span>
        </div>
      </div>
    </div>
  )
}
