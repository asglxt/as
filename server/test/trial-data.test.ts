import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrialDataPlan, buildTrialScoreSeries, TRIAL_SCORE_DEFINITIONS } from '../src/trial_data.ts';

test('trial plan creates campus classes with pinyin abbreviation and Chinese names', () => {
  const plan = buildTrialDataPlan([
    { id: 1, name: '广场校区', code: null },
    { id: 2, name: '河西校区', code: null }
  ], { classesPerCampus: 2, teachersPerCampus: 2, studentsPerClass: 3 });

  assert.equal(plan.length, 2);
  assert.equal(plan[0].campusCode, 'GC');
  assert.equal(plan[1].campusCode, 'HEX');
  assert.equal(plan[0].classes.length, 2);
  assert.equal(plan[1].classes.length, 2);
  assert.equal(plan[0].teachers.length, 2);
  assert.equal(plan[0].teachers[0].username, 'teacher1');
  assert.equal(plan[0].teachers[1].username, 'teacher2');
  assert.equal(plan[0].classes[0].name, 'GC-01教室-初级');
  assert.match(plan[1].classes[1].name, /^HEX-\d{2}教室-/);

  for (const campus of plan) {
    assert.equal(campus.classrooms.length, 2);
    assert.equal(campus.lessons.length, 2);
    for (const teacher of campus.teachers) assert.match(teacher.displayName, /^[\u4e00-\u9fff]{2,4}$/);
    for (const classroom of campus.classrooms) {
      assert.equal(classroom.capacity, 20);
      assert.match(classroom.name, /^\d{2}教室$/);
    }
    for (const classItem of campus.classes) {
      assert.equal(classItem.capacity, 20);
      assert.equal(classItem.students.length, 3);
      assert.match(classItem.name, /^[A-Z]+-\d{2}教室-[\u4e00-\u9fff]+$/);
      assert.match(classItem.startTime, /^\d{2}:\d{2}$/);
      assert.ok(classItem.timeSlot >= 0 && classItem.timeSlot < 5);
      for (const student of classItem.students) {
        assert.match(student.name, /^[\u4e00-\u9fff]{2,4}$/);
        assert.match(student.guardianPhone, /^1\d{10}$/);
      }
    }
  }
});

test('trial score plan covers institution, school and Trinity assessments for one year', () => {
  const institutionSources = TRIAL_SCORE_DEFINITIONS
    .filter((item) => item.sourceParent === 'institution')
    .map((item) => item.sourceName);
  const schoolSources = TRIAL_SCORE_DEFINITIONS
    .filter((item) => item.sourceParent === 'school')
    .map((item) => item.sourceName);
  const thirdPartySources = TRIAL_SCORE_DEFINITIONS
    .filter((item) => item.sourceParent === 'third_party')
    .map((item) => item.sourceName);

  assert.deepEqual(institutionSources, ['入学测', '月考', '单元测', '期中考试', '期末考试']);
  assert.deepEqual(schoolSources, ['单元测', '月考', '期中考试', '期末考试']);
  assert.deepEqual(thirdPartySources, ['圣三一等级']);
  assert.equal(new Set(TRIAL_SCORE_DEFINITIONS.map((item) => item.examDate)).size, 10);
  assert.ok(Math.min(...TRIAL_SCORE_DEFINITIONS.map((item) => Number(item.examDate.slice(0, 4) + item.examDate.slice(5, 7)))) < 202601);
  assert.ok(Math.max(...TRIAL_SCORE_DEFINITIONS.map((item) => Number(item.examDate.slice(0, 4) + item.examDate.slice(5, 7)))) >= 202606);
});

test('trial score series has ten unique and varied scores', () => {
  const scores = buildTrialScoreSeries({ studentSeed: 42, subjectSeed: 2, classSeed: 3 });

  assert.equal(scores.length, 10);
  assert.equal(new Set(scores).size, scores.length);
  assert.ok(scores.every((score) => score >= 50 && score <= 100));
  assert.ok(Math.max(...scores) - Math.min(...scores) >= 8);
});
