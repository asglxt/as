import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

const TYPE_LABEL: Record<string, string> = {
  enroll: '报名', renew: '续费', recharge: '充值', transfer: '转课', refund: '退费', material: '教材'
};
const STATUS_LABEL: Record<string, string> = { unpaid: '未收款', partial: '部分收款', paid: '已结清' };

export default function MyOrdersPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{ orders: any[]; account: any }>({ orders: [], account: { balance: 0, points: 0, transactions: [] } });

  useEffect(() => {
    api<any>('/api/me/orders').then(setData).catch(() => {});
  }, []);

  return (
    <Shell>
      <h1 className="page-title">{user?.role === 'parent' ? '孩子订单' : '我的订单'}</h1>
      <div className="cards">
        <div className="stat-card"><b>{data.account.balance}</b>账户余额（元）</div>
        <div className="stat-card"><b>{data.account.points}</b>积分</div>
      </div>
      <div className="panel">
        <h2>订单记录</h2>
        <table className="table">
          <thead><tr><th>订单号</th><th>学员</th><th>类型</th><th>应收</th><th>实收</th><th>欠费</th><th>状态</th><th>日期</th></tr></thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.id}>
                <td>{o.order_no}</td><td>{o.student_name}</td>
                <td>{TYPE_LABEL[o.order_type] ?? o.order_type}</td>
                <td>{Number(o.receivable)}</td><td>{Number(o.received)}</td><td>{Number(o.arrears)}</td>
                <td>{STATUS_LABEL[o.payment_status] ?? o.payment_status}</td>
                <td>{String(o.created_at).slice(0, 10)}</td>
              </tr>
            ))}
            {data.orders.length === 0 && <tr><td colSpan={8}>暂无订单</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>账户流水</h2>
        <table className="table">
          <thead><tr><th>类型</th><th>金额</th><th>变动后余额</th><th>备注</th><th>时间</th></tr></thead>
          <tbody>
            {data.account.transactions.map((t: any) => (
              <tr key={t.id}>
                <td>{t.type}</td><td>{Number(t.amount)}</td><td>{Number(t.balance_after)}</td>
                <td>{t.remark ?? '-'}</td><td>{String(t.created_at).slice(0, 19).replace('T', ' ')}</td>
              </tr>
            ))}
            {data.account.transactions.length === 0 && <tr><td colSpan={5}>暂无流水</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}