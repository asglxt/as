import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Award, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../api.ts';

function GrowthChart({ history }: { history: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const scores = history.map((item) => Number(item.numeric_score));
    chart.setOption({
      grid: { left: 36, right: 16, top: 24, bottom: 28 },
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} 分` },
      xAxis: { type: 'category', boundaryGap: false, data: history.map((item) => String(item.exam_date).slice(5, 10)), axisLine: { lineStyle: { color: '#dfe6f0' } }, axisLabel: { color: '#7b879a', fontSize: 10 } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: '#7b879a', fontSize: 10 }, splitLine: { lineStyle: { color: '#edf1f6' } } },
      series: [{ type: 'line', smooth: true, symbolSize: 8, data: scores, lineStyle: { width: 3, color: '#2563eb' }, itemStyle: { color: '#2563eb' }, areaStyle: { color: 'rgba(37,99,235,.10)' } }]
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); chart.dispose(); };
  }, [history]);
  return <div ref={ref} style={{ width: '100%', height: 220 }} />;
}

export default function ScoreAnalyticsPanel({ studentId }: { studentId: number }) {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { api<any>(`/api/scores/analytics/student/${studentId}`).then(setData).catch((err) => setMessage(err.message)); }, [studentId]);
  if (!data) return <div className="panel"><p className="subtitle">{message || '正在分析成绩...'}</p></div>;
  const summary = data.summary;
  const trendLabel = summary.trend === 'up' ? '成绩提升' : summary.trend === 'down' ? '成绩下滑' : summary.trend === 'stable' ? '成绩稳定' : '暂无趋势';
  return (
    <div className="score-analytics">
      <div className="cards">
        <div className="stat-card"><b>{summary.latest_score ?? '-'}</b><span>最近成绩</span></div>
        <div className="stat-card"><b className={summary.change > 0 ? 'score-up' : summary.change < 0 ? 'score-down' : ''}>{summary.change > 0 ? '+' : ''}{summary.change}</b><span>{trendLabel}</span></div>
        <div className="stat-card"><b>{summary.class_rank ? `${summary.class_rank}/${summary.class_size}` : '-'}</b><span>班级排名</span></div>
        <div className="stat-card"><b>{summary.institution_rank ? `${summary.institution_rank}/${summary.institution_size}` : '-'}</b><span>同年级机构排名</span></div>
      </div>
      {data.alerts.length > 0 && <div className="score-alert-list">{data.alerts.map((alert: any, index: number) => <div className={`score-alert ${alert.level}`} key={`${alert.type}-${index}`}>{alert.type === 'decline' ? <TrendingDown size={18} /> : alert.type === 'improvement' ? <TrendingUp size={18} /> : <Award size={18} />}<div><b>{alert.title}</b><p>{alert.message}</p></div></div>)}</div>}
      <section className="panel"><div className="panel-header"><h2>成绩成长曲线</h2><span className="subtitle">平均 {summary.average ?? '-'} · 最高 {summary.best_score ?? '-'}</span></div>{data.history.length ? <GrowthChart history={data.history} /> : <p className="subtitle">暂无足够成绩记录</p>}</section>
      <section className="panel"><div className="panel-header"><h2>每次考试表现</h2></div><div className="table-wrap"><table className="table"><thead><tr><th>日期</th><th>项目/考试</th><th>成绩</th><th>较上次</th><th>班级排名</th><th>同年级排名</th><th>班级平均</th></tr></thead><tbody>{[...data.history].reverse().map((item: any) => <tr key={item.id}><td>{String(item.exam_date).slice(0, 10)}</td><td><b>{item.project_name}</b><div className="subtitle">{item.exam_name}</div></td><td><b>{item.numeric_score}</b></td><td className={item.delta > 0 ? 'score-up' : item.delta < 0 ? 'score-down' : ''}>{item.delta === null ? '-' : `${item.delta > 0 ? '+' : ''}${item.delta}`}</td><td>{item.class_rank}/{item.class_size}</td><td>{item.institution_rank}/{item.institution_size}</td><td>{item.class_average}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
