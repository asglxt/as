import { useState } from 'react';
import * as XLSX from 'xlsx';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function ImportPage() {
  const [kind, setKind] = useState('students');
  const [result, setResult] = useState<any>(null);

  async function handleFile(file: File) {
    let text: string;
    if (file.name.endsWith('.csv')) {
      text = await file.text();
    } else {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      text = XLSX.utils.sheet_to_csv(sheet);
    }
    const data = await api(`/api/imports/${kind}`, { method: 'POST', body: JSON.stringify({ csv: text }) });
    setResult(data);
  }

  return (
    <Shell>
      <h1 className="page-title">数据导入</h1>
      <div className="form-row">
        <label>导入类型<select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="students">学员</option>
          <option value="classes">班级</option>
          <option value="scores">成绩</option>
        </select></label>
        <input type="file" accept=".csv,.xlsx" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {result && (
        <div className="panel">
          <h2>导入结果</h2>
          <p>共 {result.total_rows} 行，成功 {result.imported_rows} 行，错误 {result.error_rows} 行。</p>
          {result.errors?.length > 0 && (
            <ul>{result.errors.map((err: any, i: number) => <li key={i}>第 {err.row} 行 {err.column}: {err.message}</li>)}</ul>
          )}
        </div>
      )}
    </Shell>
  );
}
