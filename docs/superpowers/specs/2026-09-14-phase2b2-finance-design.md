# 二期 2B-2 设计：订单与财务

日期：2026-09-14
状态：设计已确认（按用户授权采用推荐方案，待实施计划）
调研依据：`docs/superpowers/research/2026-09-14-schoolpal-system-analysis.md` 第 10.20 节（办理中心订单列表实测）

## 1. 背景与目标

2A 已完成报读与课时账户（`enrollments` + `hour_transactions`），2B-1 完成了成绩、点评与作业。

2B-2 目标：把「钱」这条线补齐——订单、收款、退费、充值、教材杂费，并让课时与金额真正联动，形成「报名收费 → 上课扣课时 → 按课时扣学费 → 退费结算」的闭环。

## 2. 范围

### 2B-2 包含

- 订单：报名/续费/充值/转课/退费/教材，订单明细（课程课时、教材杂费），应收/实收/欠费/账户变动，经办校区与经办人，到款状态。
- 收款：现金、微信、支付宝、银行卡 POS、学员余额抵扣；支持一笔订单分次收款。
- 退费：系统建议金额（剩余课时 × 单价）+ 人工调整 + 必填原因；退费记录与流水。
- 学员账户：余额、积分与账户流水（充值、抵扣、退费、调整）。
- 课时 × 金额联动：记上课扣课时时，按课时单价同步扣减 `enrollments.used_fee / remaining_fee`。
- 教材杂费：杂费项字典（名称、金额、适用课程、启用），订单中带出。
- 订单收据：浏览器打印。

### 2B-2 不包含

- 报表中心与财务分析（2B-3）。
- 电子合同与签署（后续）。
- 分期付款计划、欠费账龄与自动催收（后续）。
- 发票与税务对接。
- 微信/支付宝在线支付网关对接（先记录支付方式与金额，不做支付回调）。

## 3. 数据模型

    orders(
      id, order_no UNIQUE, student_id, order_type, campus_id, operator_id,
      status,                 -- draft / confirmed / cancelled
      receivable NUMERIC,     -- 应收
      received NUMERIC,       -- 实收
      account_change NUMERIC, -- 学员账户变动
      arrears NUMERIC,        -- 欠费
      points NUMERIC,         -- 积分
      payment_status,         -- unpaid / partial / paid
      internal_note, external_note,
      created_at
    )

    order_items(
      id, order_id, item_type,   -- course / material / transfer / recharge
      lesson_id, class_id, name,
      quantity NUMERIC, unit_price NUMERIC, amount NUMERIC,
      created_at
    )

    payments(
      id, order_id, method,      -- cash / wechat / alipay / bank / balance
      amount NUMERIC, operator_id, paid_at, note
    )

    refunds(
      id, order_id, student_id,
      suggested_amount NUMERIC, actual_amount NUMERIC,
      reason TEXT NOT NULL, method, operator_id, refunded_at
    )

    student_accounts(
      id, student_id UNIQUE, balance NUMERIC DEFAULT 0, points NUMERIC DEFAULT 0, updated_at
    )

    account_transactions(
      id, student_id, type,      -- recharge / consume / refund / adjust
      amount NUMERIC, balance_after NUMERIC,
      order_id, remark, created_by, created_at
    )

    fee_items(
      id, name, amount NUMERIC, lesson_id, enabled, created_at
    )

订单类型 order_type：enroll（报名）、renew（续费）、recharge（充值）、transfer（转课）、refund（退费）、material（教材）。

## 4. 页面与功能

### 4.1 订单

- 订单列表：订单号、学员、联系方式、订单类型、交易内容摘要、应收、实收、账户变动、欠费、积分、销售员/经办人、订单标签、经办校区、经办日期、到款状态；按学员/经办日期/订单类型/订单状态/经办校区筛选。
- 新建订单：选择学员与订单类型；添加明细（课程课时：课程/班级/课时数/单价；教材杂费：从 `fee_items` 选择或手工填写）；系统自动计算应收。
- 收款：对未结清订单登记收款（多方式、可分次），自动更新实收、欠费与到款状态。
- 打印：订单收据（浏览器打印）。
- 取消：未收款的订单可作废（写审计日志）。

### 4.2 退费

- 选择学员的报读记录 → 系统按「剩余课时 × 单价」计算建议退费金额（单价 = 总学费 / 购买课时）。
- 允许人工调整实际退费金额，必须填写原因。
- 保存后：生成退费单、登记退款方式、扣减学员课时与账户余额、写账户流水。

### 4.3 学员账户

- 余额与积分展示；账户流水（充值、抵扣、退费、调整）。
- 充值：创建充值订单 → 收款 → 余额增加 + 流水。
- 余额抵扣：订单收款时可选择余额抵扣（金额不超过可用余额）。

### 4.4 教材与杂费

- 杂费项字典：名称、金额、适用课程、启用状态。
- 订单明细中可直接选择杂费项，带出金额。

## 5. 关键流程

### 5.1 报名/续费

1. 选择学员与课程 → 添加课时明细（课时数 × 单价）。
2. 系统计算应收，创建订单（状态 confirmed）。
3. 登记收款（可多种方式/分次）。
4. 收款完成后：增加/更新 `enrollments`（购买课时与总学费累加），写 `hour_transactions`（purchase）与账户流水。
5. 订单到款状态按「实收 vs 应收」更新为 unpaid / partial / paid。

### 5.2 充值

1. 创建充值订单（金额）。
2. 登记收款 → 更新 `student_accounts.balance` 并写账户流水。

### 5.3 退费

1. 选择报读记录，系统计算建议金额。
2. 人工调整 + 填写原因 → 生成退费单。
3. 登记退款方式 → 扣减剩余课时与账户余额，写 `hour_transactions`（refund）与账户流水。

### 5.4 课时 × 金额联动

- 2A 的记上课扣课时逻辑扩展：每扣 1 课时，同步按单价扣减 `used_fee`、更新 `remaining_fee = total_fee - used_fee`。
- 单价 = `total_fee / purchased_hours`（购买课时为 0 时不联动金额）。

## 6. 权限

- 新增权限模块 `finance`；财务、机构主管、校区主管拥有；教师不默认拥有。
- 订单创建/收款/退费/杂费设置需要 `finance` 模块权限；学员可查看自己的订单与账户流水（家长端）。

## 7. 兼容与迁移

- `enrollments` 增加 `unit_price` 字段（由 `total_fee / purchased_hours` 计算并回填）。
- 2A 的 `hour_transactions` 增加可选的 `order_id` 关联。
- 家长端新增「我的订单 / 我的账户」页面。
- 现有记上课逻辑扩展金额联动，不改变课时扣减规则。

## 8. 验收标准

1. 能创建报名/续费订单（含课时明细），收款后生成课时账户与购买流水。
2. 支持现金/微信/支付宝/银行卡/余额抵扣，且一笔订单可分次收款；订单正确显示应收、实收、欠费、到款状态。
3. 充值订单增加学员余额并写账户流水；余额可用于订单抵扣。
4. 退费页给出建议金额，可人工调整并必填原因；退费后课时与余额同步扣减。
5. 杂费项可配置并在订单明细中带出。
6. 记上课扣课时时金额联动（used_fee/remaining_fee 正确）。
7. 订单收据可打印。
8. 一期、2A、2B-1 功能不回归。

## 9. 假设与边界

- 不做在线支付网关对接，收款为人工登记（与校宝前台登记一致）。
- 退费单价按「总学费 / 购买课时」平均计算，不做阶梯价与课时包差异。
- 积分只做记录与展示，不做兑换（积分商城属增值服务）。
- 订单标签先支持文本，标签字典留后续。

## 10. 风险与对策

- 风险：金额与课时双向联动易出现对不上。对策：所有金额变动必须写流水（`account_transactions` / `hour_transactions`），并提供对账视图。
- 风险：分次收款与欠费状态计算错误。对策：到款状态统一由「实收合计 vs 应收」推导，不手工设置。
- 风险：退费修改余额与课时可能破坏历史。对策：退费单只追加不修改历史订单，写审计日志。