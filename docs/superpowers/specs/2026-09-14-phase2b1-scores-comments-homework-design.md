# 二期 2B-1 设计：成绩 + 课堂点评 + 作业

日期：2026-09-14
状态：设计已通过用户确认（待写实施计划）
调研依据：`docs/superpowers/research/2026-09-14-schoolpal-system-analysis.md` 第 10.11-10.17 节（校宝学员成绩、项目设置、考试设置、课堂点评、作业、成长记录实测）

## 1. 背景与目标

一期实现了「一场考试一个分数」的简易成绩模型，2A 补齐了课程、班级、分班、排课、报读与课时闭环。

2B-1 目标：
- 把成绩模型升级为校宝实测的三层结构：项目字典 + 考试字典 + 学员成绩。
- 补齐课堂点评：按学员逐个点评（评分/评语/小红花）+ 批量套用模板 + 家长已读回写。
- 补齐作业闭环：布置 → 家长/学生提交 → 教师批改 → 提交率与未读统计。

## 2. 范围

### 2B-1 包含

- 成绩：项目设置、考试设置、成绩录入（按班级批量）、成绩查询（多条件）、CSV 导入（校验报告）、家长/学生端查看。
- 点评：点评模板、逐学员点评、批量套用模板、家长端查看与已读回写、班级维度点评率/阅读率/小红花统计。
- 作业：作业列表与草稿箱、布置作业、家长/学生端提交、教师批改、提交率/未读统计。
- 权限：新增 scores、comments、homework 三个模块，纳入角色权限体系。

### 2B-1 不包含（留给 2B-2 / 2B-3）

- 订单、收款、退费、充值、教材杂费（2B-2）。
- 报表中心、数据大屏、AI 分析（2B-3）。
- 通知公告、成长记录、招生营销。
- 短信/微信推送（先在页面内展示，推送能力后续接入）。

## 3. 数据模型

### 3.1 成绩（替换一期旧表）

删除一期的 `exams`、`scores`（仅有测试数据），新建：

    exam_projects(
      id, name, sort, enabled, created_at
    )

    exams(
      id, name, sort, enabled, created_at
    )

    student_scores(
      id,
      student_id,          -- 学员
      project_id,          -- 项目字典
      exam_id,             -- 考试字典
      class_id,            -- 班级（可空）
      score,               -- 成绩值（分数或等级文本）
      source,              -- 来源：teacher / import / registration
      exam_date,           -- 考试日期
      remark,
      created_by,
      created_at,
      UNIQUE (student_id, project_id, exam_id, exam_date)
    )

### 3.2 课堂点评

    comment_templates(
      id, name, content, default_rating, default_flowers, lesson_id, created_at
    )

    teaching_comments(
      id,
      teaching_log_id,     -- 关联 2A 的上课记录
      student_id,
      rating,              -- 评分（如 1-5 或等级）
      content,             -- 评语
      flowers,             -- 小红花数量
      read_at,             -- 家长已读时间
      created_by,
      created_at,
      UNIQUE (teaching_log_id, student_id)
    )

### 3.3 作业

    homework(
      id,
      class_id,
      teacher_id,
      title,
      content,
      attachments JSONB,
      status,              -- draft / published / closed
      assigned_at,
      due_at,
      created_at
    )

    homework_records(
      id,
      homework_id,
      student_id,
      status,              -- not_submitted / submitted / reviewed
      content,
      attachments JSONB,
      score,
      comment,
      submitted_at,
      reviewed_at,
      read_at,
      created_at,
      UNIQUE (homework_id, student_id)
    )

### 3.4 权限模块

新增权限 key：`scores`、`comments`、`homework`。
预置角色权限调整：
- 机构主管、校区主管、教务：scores + comments + homework
- 教师：scores（录入自己班级）+ comments + homework
## 4. 页面与功能

### 4.1 成绩

- 项目设置：项目列表 + 新增/编辑/启用，字段：名称、排序。
- 考试设置：考试列表 + 新增/编辑/启用，字段：名称、排序。
- 成绩录入：选择班级 → 选择考试/项目/考试日期/来源 → 列出班级学员 → 批量录入成绩与备注 → 保存（重复录入按唯一键更新）。
- 成绩查询：按学员姓名、项目、考试、班级、日期范围筛选；列表显示学员、项目、成绩、来源、考试日期、考试、班级、备注；支持导出 CSV。
- CSV 导入：模板列 `student_name,class_name,project_name,exam_name,exam_date,score,source,remark`；逐行校验，错误精确到行与列；生成导入任务记录。
- 家长/学生端「我的成绩」：按项目/考试分组展示成绩、日期、班级、备注。

### 4.2 课堂点评

- 点评列表：按班级/日期/班主任筛选；统计列：上课记录数、点评记录数、点评率、阅读率、到课人数、小红花数。
- 逐学员点评：选一节课 → 列出学员 → 逐人填写评分、评语、小红花 → 保存；支持一键对全部学员套用模板（模板内容 + 默认评分/小红花），再个别调整。
- 点评模板：名称、内容、默认评分、默认小红花、适用课程。
- 家长端「我的点评」：按日期展示评语、评分、小红花，进入详情后回写 `read_at`。

### 4.3 作业

- 作业列表：按班级/教师/状态/布置时间筛选；列：标题、班级、布置教师、状态、点评进度、未提交数、已批改数、布置时间、截止时间。
- 布置作业：选择班级、标题、内容、附件（先支持文本与文件名列表，文件上传后续接对象存储）、截止时间；支持保存草稿。
- 家长/学生端「我的作业」：列表 + 详情，支持填写提交内容（文本）并标记提交。
- 教师批改：查看提交内容 → 填写评分与评语 → 标记已批改。
- 统计：提交率、未读（家长未读）、已批改比例。

## 5. 关键流程

### 5.1 成绩录入

1. 教务/教师选择班级、考试、项目、考试日期、来源。
2. 系统列出班级在读学员（`class_students.left_at IS NULL`）。
3. 录入成绩并保存；按 `(student_id, project_id, exam_id, exam_date)` 唯一键更新已有记录。
4. 写审计日志；家长/学生端立即可见。

### 5.2 课堂点评

1. 教师在「课堂点评」选择一节课（来自 2A 的 `schedules`/`teaching_logs`）。
2. 系统列出该班学员；教师逐人填写评分/评语/小红花，或先套用模板。
3. 保存写入 `teaching_comments`；未填写学员不产生记录。
4. 家长端查看后回写 `read_at`，用于阅读率统计。

### 5.3 作业

1. 教师布置作业（可存草稿），发布后为班级在读学员生成 `homework_records`（状态 not_submitted）。
2. 家长/学生提交后状态变为 submitted，记录提交时间与内容。
3. 教师批改后状态变为 reviewed，记录评分、评语与批改时间。
4. 列表统计提交率、未读、已批改比例。

## 6. 兼容与迁移

- 删除一期 `exams`、`scores` 表（确认无真实数据）；同步移除/替换一期成绩接口与前端成绩页。
- 2A 的 `schedules`、`teaching_logs`、`attendance_records` 保持不变，点评通过 `teaching_log_id` 关联。
- 家长/学生端登录与报表接口按新模型重写（`getStudentReport` 改为返回新成绩结构）。
- 权限模块清单从 11 个扩展到 14 个（新增 scores、comments、homework）。

## 7. 验收标准

1. 管理员能维护项目字典与考试字典（新增/编辑/启用）。
2. 教师能按班级批量录入成绩并修改，重复录入为更新而非报错。
3. 成绩查询支持学员/班级/项目/考试/日期筛选，并能导出 CSV。
4. CSV 导入有逐行校验报告，错误定位到行与列。
5. 家长/学生端能看到自己的成绩（按项目/考试分组）。
6. 点评：选一节课为学员逐个点评（评分/评语/小红花），支持批量套用模板；家长端可见并回写已读，点评率与阅读率统计正确。
7. 作业：布置后学员记录自动生成；家长/学生提交、教师批改后状态正确；提交率/未读统计正确。
8. 一期与 2A 功能不回归（学员、班级、报读、排课、记上课、课时流水）。

## 8. 假设与边界

- 成绩值统一按文本存储（分数、等级、评语都可），不做加权总分计算；后续如需总分可加视图或计算字段。
- 作业附件先记录文件名与链接（JSONB），文件上传与对象存储留到后续。
- 点评评分先支持 1-5 分与文本评语；等级制点评留后续。
- 推送能力（短信/微信）不在 2B-1，家长端为网页查看。
- 小红花只做发放与统计，不做积分兑换（积分商城属增值服务）。

## 9. 风险与对策

- 风险：删除旧成绩表影响一期接口。对策：同一任务内替换接口与前端页面，跑全量回归测试。
- 风险：成绩唯一键过严（同一学员同项目同考试同日期只能一条）。对策：明确业务含义；如需多次录入，扩展键增加 `created_at` 或引入「成绩批次」。
- 风险：作业提交与批改状态机混乱。对策：固定三态 not_submitted → submitted → reviewed，禁止跳变，单元测试覆盖。
- 风险：点评与上课记录耦合。对策：点评必须依赖 `teaching_log_id`，无上课记录不能点评。