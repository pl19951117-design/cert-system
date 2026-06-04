import { toast } from '@/components/toast'

// 统一的请求封装：网络错误 / 非 2xx 都会弹 toast 并抛出，调用方可 try/catch
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    toast('网络请求失败，请检查连接后重试', 'error')
    throw new Error('network error')
  }
  if (!res.ok) {
    let msg = `操作失败（${res.status}）`
    try {
      const d = await res.clone().json()
      if (d?.error) msg = d.error
    } catch {
      /* 非 JSON 响应，保留默认文案 */
    }
    toast(msg, 'error')
    throw new Error(msg)
  }
  return res
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await apiFetch(url)
  return res.json() as Promise<T>
}
