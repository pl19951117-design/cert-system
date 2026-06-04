// 人员/证件表单的字段配置 — Add 和 Edit modal 共用，避免漂移

export type FormField = {
  key: string
  label: string
  required?: boolean
  col?: number
  placeholder?: string
  type?: string
}

export const PERSON_FIELDS: readonly FormField[] = [
  { key: 'name',           label: '姓名',     required: true, col: 2 },
  { key: 'orgName',        label: '归属建制' },
  { key: 'manager',        label: '负责人' },
  { key: 'idCard',         label: '身份证号' },
  { key: 'education',      label: '学历',      placeholder: '大专' },
  { key: 'socialSecurity', label: '社保情况',  placeholder: '已参保 / 未参保 / …' },
  { key: 'sortOrder',      label: '排序',      placeholder: '1' },
]

export const CERT_FIELDS_ADD: readonly FormField[] = [
  { key: 'certType',   label: '证件类别' },
  { key: 'certNo',     label: '证件编号' },
  { key: 'issueDate',  label: '发证日期', type: 'date' },
  { key: 'expiryDate', label: '到期日期', type: 'date' },
  { key: 'issuer',     label: '发证机构' },
]
