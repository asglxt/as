export function summarizeStudentScores(rows: any[], studentId: number) {
  const normalized = rows.map((row) => ({ ...row, numeric_score: Number(row.score) })).filter((row) => Number.isFinite(row.numeric_score));
  const groups = new Map<string, any[]>();
  for (const row of normalized) {
    const key = `${row.project_id}:${row.exam_id}:${String(row.exam_date).slice(0, 10)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const history: any[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => b.numeric_score - a.numeric_score || Number(a.student_id) - Number(b.student_id));
    const average = sorted.reduce((sum, item) => sum + item.numeric_score, 0) / sorted.length;
    for (const item of sorted) {
      item.institution_rank = 1 + sorted.filter((other) => other.numeric_score > item.numeric_score).length;
      item.institution_size = sorted.length;
      item.class_average = Math.round(average * 10) / 10;
    }
    const byClass = new Map<number, any[]>();
    for (const item of sorted) {
      const classId = Number(item.class_id);
      if (!byClass.has(classId)) byClass.set(classId, []);
      byClass.get(classId)!.push(item);
    }
    for (const classRows of byClass.values()) {
      for (const item of classRows) item.class_rank = 1 + classRows.filter((other) => other.numeric_score > item.numeric_score).length;
      for (const item of classRows) item.class_size = classRows.length;
    }
    history.push(...sorted.filter((item) => Number(item.student_id) === Number(studentId)));
  }
  history.sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date)) || Number(a.id) - Number(b.id));
  for (let index = 0; index < history.length; index += 1) {
    const previous = history[index - 1];
    history[index].delta = previous ? Math.round((history[index].numeric_score - previous.numeric_score) * 10) / 10 : null;
    history[index].rank_change = previous ? previous.class_rank - history[index].class_rank : null;
  }

  const latest = history.at(-1) ?? null;
  const previous = history.at(-2) ?? null;
  const change = latest && previous ? Math.round((latest.numeric_score - previous.numeric_score) * 10) / 10 : 0;
  const trend = !latest || !previous ? 'none' : change >= 3 ? 'up' : change <= -3 ? 'down' : 'stable';
  const alerts: any[] = [];
  if (latest && previous) {
    if (change >= 5) alerts.push({ type: 'improvement', level: 'success', title: '成绩明显提升', message: `最近一次提升 ${change} 分，建议继续保持。` });
    if (change <= -5) alerts.push({ type: 'decline', level: change <= -10 ? 'danger' : 'warning', title: '成绩下滑预警', message: `最近一次下降 ${Math.abs(change)} 分，建议及时关注薄弱知识点。` });
    if (latest.class_rank - previous.class_rank >= 3) alerts.push({ type: 'rank_down', level: 'warning', title: '班级排名下降', message: `班级排名由第 ${previous.class_rank} 名下降到第 ${latest.class_rank} 名。` });
    if (previous.class_rank - latest.class_rank >= 3) alerts.push({ type: 'rank_up', level: 'success', title: '班级排名提升', message: `班级排名由第 ${previous.class_rank} 名提升到第 ${latest.class_rank} 名。` });
  }
  if (latest && latest.numeric_score < latest.class_average - 5) alerts.push({ type: 'below_average', level: 'warning', title: '低于班级平均分', message: `当前比班级平均分低 ${Math.round((latest.class_average - latest.numeric_score) * 10) / 10} 分。` });
  if (!latest) alerts.push({ type: 'no_data', level: 'info', title: '暂无成绩数据', message: '录入成绩后会自动生成成长趋势和排名。' });

  return {
    history,
    summary: {
      score_count: history.length,
      latest_score: latest?.numeric_score ?? null,
      previous_score: previous?.numeric_score ?? null,
      change,
      average: history.length ? Math.round(history.reduce((sum, item) => sum + item.numeric_score, 0) / history.length * 10) / 10 : null,
      best_score: history.length ? Math.max(...history.map((item) => item.numeric_score)) : null,
      trend,
      class_rank: latest?.class_rank ?? null,
      class_size: latest?.class_size ?? null,
      institution_rank: latest?.institution_rank ?? null,
      institution_size: latest?.institution_size ?? null,
      grade: latest?.grade ?? null
    },
    alerts
  };
}
