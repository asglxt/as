export const SCHOOLPAL_STUDENT_HEADERS = [
  '学员姓名', '学员编号', '学员状态', '报读校区', '性别', '生日', '报名时间',
  '就读学校', '年级', '家庭住址', '联系电话', '父亲姓名', '父亲电话', '父亲微信',
  '母亲姓名', '母亲电话', '母亲微信', '其他监护人', '监护人关系', '其他监护人电话',
  '其他监护人微信', '来源', '折扣优惠', '备注'
];

const HEADER_ALIASES: Record<string, string> = {
  name: 'name', '姓名': 'name', '学员姓名': 'name',
  student_no: 'student_no', '学员编号': 'student_no', '编号': 'student_no', '学号': 'student_no',
  status: 'status', '学员状态': 'status',
  campus_name: 'campus_name', '校区': 'campus_name', '报读校区': 'campus_name',
  gender: 'gender', '性别': 'gender', '学员性别': 'gender',
  birthday: 'birthday', '生日': 'birthday', '出生日期': 'birthday',
  enrollment_date: 'enrollment_date', '报名日期': 'enrollment_date', '报名时间': 'enrollment_date',
  school_name: 'school_name', '就读学校': 'school_name', '学校': 'school_name',
  grade: 'grade', '年级': 'grade',
  address: 'address', '家庭住址': 'address', '住址': 'address', '地址': 'address',
  guardian_phone: 'guardian_phone', '联系电话': 'guardian_phone', '联系方式': 'guardian_phone',
  '家长电话': 'guardian_phone', '手机号': 'guardian_phone',
  father_name: 'father_name', '父亲姓名': 'father_name', '父亲': 'father_name',
  father_phone: 'father_phone', '父亲电话': 'father_phone', '父亲手机': 'father_phone',
  father_wechat: 'father_wechat', '父亲微信': 'father_wechat',
  mother_name: 'mother_name', '母亲姓名': 'mother_name', '母亲': 'mother_name',
  mother_phone: 'mother_phone', '母亲电话': 'mother_phone', '母亲手机': 'mother_phone',
  mother_wechat: 'mother_wechat', '母亲微信': 'mother_wechat',
  guardian_name: 'guardian_name', '其他监护人': 'guardian_name', '监护人姓名': 'guardian_name',
  guardian_relation: 'guardian_relation', '监护人关系': 'guardian_relation', '关系': 'guardian_relation',
  guardian_other_phone: 'guardian_other_phone', '其他监护人电话': 'guardian_other_phone',
  guardian_other_wechat: 'guardian_other_wechat', '其他监护人微信': 'guardian_other_wechat',
  source: 'source', '来源': 'source', '折扣优惠': 'discount', '折扣': 'discount', discount: 'discount',
  notes: 'notes', '备注': 'notes'
};

function normalizeDate(value?: string) {
  if (!value?.trim()) return null;
  const match = value.trim().match(/^(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})/);
  if (!match) return value.trim();
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

export function mapSchoolPalStudentRow(row: Record<string, string>) {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    const clean = header.replace(/^\ufeff/, '').trim();
    const key = HEADER_ALIASES[clean] ?? HEADER_ALIASES[clean.toLowerCase()] ?? clean;
    mapped[key] = String(value ?? '').trim();
  }
  mapped.birthday = normalizeDate(mapped.birthday) ?? '';
  mapped.enrollment_date = normalizeDate(mapped.enrollment_date) ?? '';
  if (mapped.status) {
    mapped.status = ({ '在读': 'active', '停课': 'inactive', '结课': 'graduated' } as Record<string, string>)[mapped.status] ?? mapped.status;
  }
  return mapped;
}

export function guardiansFromSchoolPalRow(row: Record<string, string>) {
  const guardians: Array<{ name: string; relation: string; phone: string | null; wechat: string | null; isPrimary: boolean; isEmergency: boolean }> = [];
  if (row.father_name || row.father_phone) {
    guardians.push({ name: row.father_name || '父亲', relation: '父亲', phone: row.father_phone || null, wechat: row.father_wechat || null, isPrimary: true, isEmergency: true });
  }
  if (row.mother_name || row.mother_phone) {
    guardians.push({ name: row.mother_name || '母亲', relation: '母亲', phone: row.mother_phone || null, wechat: row.mother_wechat || null, isPrimary: false, isEmergency: true });
  }
  if (row.guardian_name || row.guardian_other_phone) {
    guardians.push({ name: row.guardian_name || '其他监护人', relation: row.guardian_relation || '其他', phone: row.guardian_other_phone || null, wechat: row.guardian_other_wechat || null, isPrimary: false, isEmergency: false });
  }
  if (!guardians.length && row.guardian_phone) {
    guardians.push({ name: '联系人', relation: '其他', phone: row.guardian_phone, wechat: null, isPrimary: true, isEmergency: false });
  }
  return guardians;
}

export function schoolPalStudentTemplate() {
  return `${SCHOOLPAL_STUDENT_HEADERS.join(',')}\n`;
}
