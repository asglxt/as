import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

function Chart({ option, height = 280 }: { option: any; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} style={{ width: '100%', height }} />;
}

const TABS = [
  ['overview', '经营总览'], ['students', '招生与学员'], ['teaching', '教务'],
  ['finance', '财务'], ['employees', '员工']
] as const;

const RANGES = [
  ['today', '今日'], ['week', '本周'], ['month', '本月'], ['lastMonth', '上月'], ['year', '今年']
] as const;

function rangeOf(key: string) {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (key === 'today') return { start: fmt(now), end: fmt(now) };
  if (key === 'week') return { start: fmt(startOfWeek), end: fmt(now) };
  if (key === 'month') return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(now) };
  if (key === 'lastMonth') {
    return {
      start: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: fmt(new Date(now.getFullYear(), now.getMonth(), 0))
    };
  }
  return { start: fmt(new Date(now.getFullYear(), 0, 1)), end: fmt(now) };
}

export default function ReportsPage() {
  const [tab, setTab] = useState<string>('overview');
  const [campuses, setCampuses] = useState<any[]>([]);
  const [campusIds, setCampusIds] = useState<number[]>([]);
  const [rangeKey, setRangeKey] = useState('month');
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState<any>(null);
  const [drill, setDrill] = useState<{ metric: string; rows: any[] } | null>(null);
  const [message, setMessage] = useState('');

  const range = useMemo(() => rangeOf(rangeKey), [rangeKey]);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (campusIds.length) params.set('campusIds', campusIds.join(','));
    params.set('start', range.start);
    params.set('end', range.end);
    params.set('granularity', granularity);
    return params.toString();
  }, [campusIds, range, granularity]);

  useEffect(() => {
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  useEffect(() => {
    const path = tab === 'overview' ? 'overview' : tab;
    api<any>(`/api/reports/${path}?${query}`).then(setData).catch((err) => setMessage(err.message));
  }, [tab, query]);

  async function openDrill(metric: string) {
    try {
      const res = await api<any>(`/api/reports/drilldown?metric=${metric}&${query}`);
      setDrill({ metric, rows: res.rows });
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  function exportDrillCsv() {
    if (!drill) return;
    const keys = Object.keys(drill.rows[0] ?? {});
    const header = keys.join(',');
    const lines = drill.rows.map((row) => keys.map((k) => String(row[k] ?? '').replace(/,/g, ' ')).join(','));
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${drill.metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleCampus(id: number) {
    setCampusIds(campusIds.includes(id) ? campusIds.filter((c) => c !== id) : [...campusIds, id]);
  }

  return (
    <Shell>
      <h1 className="page-title">报表</h1>
      <div className="form-row">
        <span className="label">校区：</span>
        {campuses.map((campus) => (
          <label key={campus.id}>
            <input type="checkbox" checked={campusIds.includes(campus.id)} onChange={() => toggleCampus(campus.id)} /> {campus.name}
          </label>
        ))}
      </div>
      <div className="form-row">
        <label>时间范围<select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
          {RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>粒度<select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
          <option value="day">按日</option>
          <option value="week">按周</option>
          <option value="month">按月</option>
        </select></label>
        <span className="subtitle">{range.start} ~ {range.end}</span>
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn primary' : 'btn'} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {message && <p className="subtitle">{message}</p>}

      {tab === 'overview' && data && (
        <>
          <div className="cards">
            <div className="stat-card" onClick={() => openDrill('newStudents')}><b>{data.newStudents}</b>新增报名</div>
            <div className="stat-card"><b>{data.activeStudents}</b>在读学员</div>
            <div className="stat-card"><b>{data.receivable}</b>应收（元）</div>
            <div className="stat-card">
              <b>{data.received}</b>实收（元）
              {data.compare?.receivedGrowthPercent !== null && (
                <span className="subtitle">环比 {data.compare?.receivedGrowthPercent}%</span>
              )}
            </div>
            <div className="stat-card" onClick={() => openDrill('arrears')}><b>{data.arrears}</b>欠费（元）</div>
            <div className="stat-card" onClick={() => openDrill('refunds')}><b>{data.refunded}</b>退费（元）</div>
            <div className="stat-card" onClick={() => openDrill('hoursConsumed')}><b>{data.hoursConsumed}</b>课时消耗</div>
            <div className="stat-card"><b>{data.teachingLogs}</b>上课记录</div>
          </div>
          <p className="subtitle">点击「新增报名 / 欠费 / 退费 / 课时消耗」可查看明细</p>
        </>
      )}

      {tab === 'students' && data && (
        <>
          <div className="panel">
            <h2>新增学员趋势</h2>
            <Chart option={{
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'category', data: data.trend.map((t: any) => t.bucket) },
              yAxis: { type: 'value' },
              series: [{ type: 'line', smooth: true, data: data.trend.map((t: any) => t.count), areaStyle: {} }]
            }} />
          </div>
          <div className="panel">
            <h2>校区对比</h2>
            <Chart option={{
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'category', data: data.campusComparison.map((c: any) => c.campusName) },
              yAxis: { type: 'value' },
              series: [{ type: 'bar', data: data.campusComparison.map((c: any) => c.count), barMaxWidth: 48 }]
            }} />
          </div>
          <div className="panel">
            <h2>学员状态分布</h2>
            <Chart option={{
              tooltip: { trigger: 'item' },
              series: [{
                type: 'pie', radius: '60%',
                data: data.statusDistribution.map((s: any) => ({ name: s.status, value: s.count }))
              }]
            }} />
          </div>
        </>
      )}

      {tab === 'teaching' && data && (
        <>
          <div className="cards">
            <div className="stat-card"><b>{data.scheduleCount}</b>排课数</div>
            <div className="stat-card"><b>{data.teachingLogCount}</b>上课记录</div>
            <div className="stat-card"><b>{data.hoursConsumed}</b>课时消耗</div>
            <div className="stat-card"><b>{data.attendanceRate ?? '-'}%</b>出勤率</div>
          </div>
          <div className="panel">
            <h2>出勤状态</h2>
            <Chart option={{
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'category', data: ['到课', '缺课', '请假', '补课'] },
              yAxis: { type: 'value' },
              series: [{ type: 'bar', barMaxWidth: 48, data: [data.attendance.present, data.attendance.absent, data.attendance.leave, data.attendance.makeup] }]
            }} />
          </div>
        </>
      )}

      {tab === 'finance' && data && (
        <>
          <div className="cards">
            <div className="stat-card"><b>{data.receivable}</b>应收（元）</div>
            <div className="stat-card"><b>{data.received}</b>实收（元）</div>
            <div className="stat-card"><b>{data.arrears}</b>欠费（元）</div>
            <div className="stat-card"><b>{data.refunded}</b>退费（元）</div>
            <div className="stat-card"><b>{data.recharged}</b>充值（元）</div>
            <div className="stat-card"><b>{data.balance}</b>学员余额（元）</div>
          </div>
          <div className="panel">
            <h2>校区对比</h2>
            <Chart option={{
              tooltip: { trigger: 'axis' },
              legend: { data: ['应收', '实收'] },
              xAxis: { type: 'category', data: data.campusComparison.map((c: any) => c.campusName) },
              yAxis: { type: 'value' },
              series: [
                { name: '应收', type: 'bar', barMaxWidth: 32, data: data.campusComparison.map((c: any) => c.receivable) },
                { name: '实收', type: 'bar', barMaxWidth: 32, data: data.campusComparison.map((c: any) => c.received) }
              ]
            }} />
          </div>
          <div className="panel">
            <h2>订单类型分布</h2>
            <Chart option={{
              tooltip: { trigger: 'item' },
              series: [{
                type: 'pie', radius: '60%',
                data: data.orderTypeDistribution.map((o: any) => ({ name: o.type, value: o.amount }))
              }]
            }} />
          </div>
        </>
      )}

      {tab === 'employees' && data && (
        <>
          <div className="cards">
            <div className="stat-card"><b>{data.employeeCount}</b>员工数</div>
            <div className="stat-card"><b>{data.teacherCount}</b>教师数</div>
            <div className="stat-card"><b>{data.classCount}</b>班级数</div>
          </div>
          <div className="panel">
            <h2>教师带班数</h2>
            <Chart option={{
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'category', data: data.classByTeacher.map((t: any) => t.teacherName) },
              yAxis: { type: 'value' },
              series: [{ type: 'bar', barMaxWidth: 32, data: data.classByTeacher.map((t: any) => t.count) }]
            }} />
          </div>
        </>
      )}

      {drill && (
        <div className="panel">
          <h2>明细：{drill.metric}</h2>
          <table className="table">
            <thead>
              <tr>{Object.keys(drill.rows[0] ?? {}).map((key) => <th key={key}>{key}</th>)}</tr>
            </thead>
            <tbody>
              {drill.rows.map((row, index) => (
                <tr key={index}>
                  {Object.keys(drill.rows[0] ?? {}).map((key) => <td key={key}>{String(row[key] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn primary" onClick={exportDrillCsv}>导出 CSV</button>
          <button className="btn" onClick={() => setDrill(null)}>关闭</button>
        </div>
      )}
    </Shell>
  );
}