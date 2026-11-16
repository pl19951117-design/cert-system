'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'

// Fetch inside the application so Electron's login cookies stay in its session.
export function AttachmentPreview({ source, fileName, onClose }: {
  source: string; fileName: string; onClose: () => void
}) {
  const [file, setFile] = useState<{ url: string; type: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let url: string | undefined
    async function load() {
      try {
        const response = await fetch(source, { signal: controller.signal })
        if (!response.ok) throw new Error(`附件读取失败（${response.status}），请关闭后重试`)
        const blob = await response.blob()
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setFile({ url, type: blob.type })
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '附件读取失败')
      }
    }
    void load()
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [source])

  return <Modal title={fileName} onClose={onClose} size="xl" cardClassName="flex flex-col" cardStyle={{ height: '85vh' }}>
    {file && <div className="px-6 py-2 border-b border-slate-100"><a className="record-name" href={file.url} download={fileName}>下载附件</a></div>}
    <div className="flex-1 min-h-0 overflow-auto bg-slate-100 p-3 flex items-center justify-center">
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : !file ? <div role="status" className="flex items-center gap-2"><Spinner size={16} />正在读取附件…</div>
        : /^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type) ? <img src={file.url} alt={fileName} className="max-w-full max-h-full object-contain" />
        : /^(application\/pdf|text\/plain)(;|$)/.test(file.type) ? <iframe src={file.url} title={fileName} className="w-full h-full bg-white border-0" />
        : <div className="text-center text-sm text-slate-500"><p>该格式暂不支持应用内预览，请下载后使用本机软件打开。</p><a className="btn-primary inline-block mt-3" href={file.url} download={fileName}>下载查看</a></div>}
    </div>
  </Modal>
}
