import type { TableHTMLAttributes } from 'react'

// A column's meaning, rather than its current position, determines its alignment.
// Both headers and cells use the same rules, including optional checkbox/action columns.
export function columnAlignment(label: string): 'left' | 'center' | 'right' {
  if (/金额|总数|人数|本数|覆盖率|参保率|通过率|净变化/.test(label) || ['新增', '减少', '报名', '待考', '通过', '未通过', '已缴社保', '缴纳社保', 'A', 'B', 'C', '其他', '小计', '大小', '年龄', '剩余', '剩余天数'].includes(label)) return 'right'
  if (/日期|时间|有效期|状态/.test(label) || ['序号', '行', '顺序', '操作', '选择', '角色', '方向', '社保情况', '继续教育', '参加日期', '人员库', '证件'].includes(label)) return 'center'
  return 'left'
}

export function AlignedTable({ columns, className = '', ...props }: TableHTMLAttributes<HTMLTableElement> & { columns: readonly string[] }) {
  const alignment = Object.fromEntries(columns.map((label, index) => [`data-align-${index + 1}`, columnAlignment(label)]))
  return <table className={`aligned-table ${className}`} {...alignment} {...props} />
}
