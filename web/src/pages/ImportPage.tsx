import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Play, Upload } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api, getToken } from '../api.ts';

interface PreviewResult {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  errors: Array<{ row: number; column: string; message: string }>;
  mapped_headers: string[];
  preview: Array<Record<string, string>>;
}

export default function ImportPage() {
  const [kind, setKind] = useState('students');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function loadJobs() {
    setJobs(await api<any[]>('/api/imports'));
  }

  useEffect(() => { loadJobs().catch(() => {}); }, []);

  async function handleFile(file: File) {
    let text: string;
    if (file.name.toLowerCase().endsWith('.csv')) {
      text = await file.text();
    } else {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      text = XLSX.utils.sheet_to_csv(sheet);
    }
    setCsvText(text);
    setFileName(file.name);
    setResult(null);
    setMessage('');
    if (kind === 'students') setPreview(await api<PreviewResult>('/api/imports/students/preview', { method: 'POST', body: JSON.stringify({ csv: text }) }));
    else setPreview(null);
  }

  async function runImport() {
    if (!csvText) { setMessage('请先选择文件'); return; }
    const data = await api(`/api/imports/${kind}`, { method: 'POST', body: JSON.stringify({ csv: csvText }) });
    setResult(data);
    setMessage(`导入完成：成功 ${data.imported_rows} 行，错误 ${data.error_rows} 行`);
    await loadJobs();
  }

  async function downloadTemplate() {
    const response = await fetch('/api/imports/students/template', { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schoolpal-students-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }


  return (
    <Shell>
      <div className="panel-header">
        <div><h1 className="page-title">数据导入</h1><p className="page-subtitle">支持校宝导出的 CSV / Excel 学员表，自动识别中文表头并生成家长联系人。</p></div>
        <button className="btn icon-text" onClick={downloadTemplate}><Download size={15} />下载校宝兼容模板</button>
      </div>

      <section className="panel">
        <div className="form-row">
          <label>导入类型<select value={kind} onChange={(e) => { setKind(e.target.value); setPreview(null); setResult(null); setCsvText(''); }}>
            <option value="students">学员</option>
            <option value="classes">班级</option>
            <option value="scores">成绩</option>
          </select></label>
          <label className="btn icon-text" style={{ cursor: 'pointer' }}><Upload size={15} />选择文件<input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} /></label>
          {fileName && <span className="badge blue"><FileSpreadsheet size={13} /> {fileName}</span>}
          <button className="btn primary icon-text" disabled={!csvText} onClick={runImport}><Play size={15} />开始导入</button>
        </div>
        {kind === 'students' && <div className="summary-strip"><span>可识别字段：学员姓名、学员编号、报读校区、性别、生日、就读学校、年级、家庭住址、联系电话、父母姓名/电话/微信等。</span></div>}
        {message && <div className="summary-strip"><span>{message}</span></div>}
      </section>

      {preview && (
        <section className="panel">
          <div className="panel-header"><h2>导入预览</h2><span className="subtitle">共 {preview.total_rows} 行，可导入 {preview.valid_rows} 行，异常 {preview.error_rows} 行</span></div>
          {preview.errors.length > 0 && <div className="panel" style={{ background: '#fff8f0' }}><b>需要处理的问题</b><ul>{preview.errors.slice(0, 20).map((error, index) => <li key={index}>第 {error.row} 行 {error.column}：{error.message}</li>)}</ul></div>}
          <div className="table-wrap"><table className="table"><thead><tr><th>学员姓名</th><th>学员编号</th><th>报读校区</th><th>就读学校</th><th>年级</th><th>家庭住址</th><th>联系电话</th></tr></thead><tbody>
            {preview.preview.map((row, index) => <tr key={index}><td>{row.name ?? '-'}</td><td>{row.student_no ?? '-'}</td><td>{row.campus_name ?? '-'}</td><td>{row.school_name ?? '-'}</td><td>{row.grade ?? '-'}</td><td>{row.address ?? '-'}</td><td>{row.guardian_phone ?? '-'}</td></tr>)}
          </tbody></table></div>
        </section>
      )}

      {result && (
        <section className="panel">
          <div className="panel-header"><h2>导入结果</h2></div>
          <p>共 {result.total_rows} 行，成功 {result.imported_rows} 行，错误 {result.error_rows} 行。</p>
          {result.errors?.length > 0 && <ul>{result.errors.map((err: any, i: number) => <li key={i}>第 {err.row} 行 {err.column}: {err.message}</li>)}</ul>}
        </section>
      )}

      <section className="panel">
        <div className="panel-header"><h2>最近导入</h2><button className="btn" onClick={loadJobs}>刷新</button></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>类型</th><th>状态</th><th>总行数</th><th>错误行</th><th>导入时间</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td>{job.kind}</td><td><span className={job.status === 'done' ? 'badge green' : 'badge orange'}>{job.status}</span></td><td>{job.total_rows}</td><td>{job.error_rows}</td><td>{String(job.created_at).slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table></div>
      </section>
    </Shell>
  );
}


