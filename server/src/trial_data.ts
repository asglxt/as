export interface TrialCampusInput {
  id: number;
  name: string;
  code: string | null;
}

export interface TrialDataConfig {
  classesPerCampus: number;
  teachersPerCampus: number;
  studentsPerClass: number;
}

const CAMPUS_ABBR: Record<string, string> = {
  '广场校区': 'GC',
  '华信校区': 'HX',
  '河西校区': 'HEX',
  '东环校区': 'DH'
};

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '肖', '田', '董', '袁', '潘', '于', '蒋', '蔡'];
const GIVEN_NAMES = ['子涵', '浩然', '雨桐', '宇轩', '欣怡', '梓豪', '思远', '若曦', '俊杰', '嘉怡', '一诺', '晨曦', '天佑', '诗涵', '博文', '雅琪', '睿泽', '梦瑶', '晨阳', '嘉豪', '语彤', '宇航', '梓萱', '泽宇', '可欣', '明轩', '雨欣', '俊熙', '依诺', '皓宇', '语嫣', '浩宇', '思妍', '子轩', '佳琪', '瑞泽', '欣妍', '宇辰', '若涵', '俊豪'];
const MALE_NAMES = ['伟', '强', '磊', '军', '洋', '勇', '杰', '峰', '涛', '超', '明', '刚', '平', '辉', '健', '鹏', '斌', '龙', '宇', '昊'];
const FEMALE_NAMES = ['静', '敏', '丽', '艳', '娟', '霞', '燕', '玲', '芳', '婷', '雪', '倩', '晶', '颖', '琳', '娜', '丹', '梅', '欣', '悦'];
const SUBJECTS = ['英语', '数学', '语文', '编程', '英语进阶'];
const LEVELS = ['初级', '初级', '中级', '中级', '高级', '高级', '进阶', '进阶', '冲刺', '精英'];
const TIME_SLOTS = [['09:00', '10:30'], ['10:40', '12:10'], ['14:00', '15:30'], ['15:40', '17:10'], ['18:30', '20:00']];

function campusCode(campus: TrialCampusInput) {
  return campus.code?.trim().toUpperCase() || CAMPUS_ABBR[campus.name] || `XQ${campus.id}`;
}

function personName(globalIndex: number, female = false) {
  const surname = SURNAMES[globalIndex % SURNAMES.length];
  const given = female
    ? FEMALE_NAMES[Math.floor(globalIndex / SURNAMES.length) % FEMALE_NAMES.length]
    : MALE_NAMES[Math.floor(globalIndex / SURNAMES.length) % MALE_NAMES.length];
  return `${surname}${given}`;
}

function studentName(globalIndex: number) {
  return `${SURNAMES[globalIndex % SURNAMES.length]}${GIVEN_NAMES[Math.floor(globalIndex / SURNAMES.length) % GIVEN_NAMES.length]}`;
}

function birthday(globalIndex: number) {
  const year = 2011 + (globalIndex % 7);
  const month = String((globalIndex * 3) % 12 + 1).padStart(2, '0');
  const day = String((globalIndex * 7) % 27 + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildTrialDataPlan(campuses: TrialCampusInput[], config: TrialDataConfig) {
  return campuses.map((campus, campusIndex) => {
    const code = campusCode(campus);
    const teachers = Array.from({ length: config.teachersPerCampus }, (_, index) => {
      const globalIndex = campusIndex * config.teachersPerCampus + index;
      return {
        username: `trial_${code.toLowerCase()}_teacher_${String(index + 1).padStart(2, '0')}`,
        displayName: personName(globalIndex, index % 2 === 1),
        employeeNo: `TRIAL-${code}-${String(index + 1).padStart(2, '0')}`
      };
    });
    const classrooms = Array.from({ length: config.classesPerCampus }, (_, index) => ({
      name: `${String(index + 1).padStart(2, '0')}教室`,
      capacity: 20
    }));
    const lessons = Array.from({ length: config.teachersPerCampus }, (_, index) => ({
      name: `${campus.name}${SUBJECTS[index % SUBJECTS.length]}课程`,
      subject: SUBJECTS[index % SUBJECTS.length]
    }));
    const classes = Array.from({ length: config.classesPerCampus }, (_, classIndex) => {
      const classroom = classrooms[classIndex];
      const level = LEVELS[classIndex % LEVELS.length];
      const lessonIndex = classIndex % lessons.length;
      const timeSlot = (classIndex + Math.floor(classIndex / config.teachersPerCampus)) % TIME_SLOTS.length;
      const students = Array.from({ length: config.studentsPerClass }, (_, studentIndex) => {
        const globalStudentIndex = campusIndex * config.classesPerCampus * config.studentsPerClass
          + classIndex * config.studentsPerClass + studentIndex;
        const phoneSeed = 10000000 + globalStudentIndex;
        return {
          name: studentName(globalStudentIndex),
          gender: globalStudentIndex % 2 === 0 ? '男' : '女',
          birthday: birthday(globalStudentIndex),
          guardianPhone: `138${String(phoneSeed).slice(-8)}`,
          fatherName: personName(globalStudentIndex + 5000),
          motherName: personName(globalStudentIndex + 9000, true),
          marker: `TRIAL_SEED_V1:${campus.id}:${classIndex + 1}:${studentIndex + 1}`
        };
      });
      return {
        name: `${code}-${classroom.name}-${level}`,
        roomName: classroom.name,
        level,
        subject: lessons[lessonIndex].subject,
        grade: level,
        teacherIndex: classIndex % teachers.length,
        lessonIndex,
        timeSlot,
        startTime: TIME_SLOTS[timeSlot][0],
        endTime: TIME_SLOTS[timeSlot][1],
        capacity: 20,
        students
      };
    });
    return { campusId: campus.id, campusName: campus.name, campusCode: code, teachers, classrooms, lessons, classes };
  });
}
