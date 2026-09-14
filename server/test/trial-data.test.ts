import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrialDataPlan } from '../src/trial_data.ts';

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
      for (const student of classItem.students) {
        assert.match(student.name, /^[\u4e00-\u9fff]{2,4}$/);
        assert.match(student.guardianPhone, /^1\d{10}$/);
      }
    }
  }
});
