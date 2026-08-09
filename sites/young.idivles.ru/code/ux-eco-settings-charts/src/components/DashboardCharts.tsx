'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Ticket, UserPlus, Clock } from 'lucide-react';
import PeriodPicker from '@/components/admin/PeriodPicker';
import { statsRangeQuery, type StatsRange } from '@/lib/stats-period';

type ChartProps = {
  userStats?: { date: string; count: number }[];
  appStats?: { name: string; value: number; color: string }[];
  showCheckInsLink?: boolean;
};

type StatsPayload = {
  periodLabel: string;
  summary: {
    inPeriod: number;
    uniqueGuests: number;
    newUsers: number;
    pendingApps: number;
    pendingBookings: number;
  };
  userStats: { date: string; count: number }[];
  appStats: { name: string; value: number; color: string }[];
};

export default function DashboardCharts({
  userStats: initialUsers = [],
  appStats: initialApps = [],
  showCheckInsLink = true,
}: ChartProps) {
  const [range, setRange] = useState<StatsRange>({ period: 'week' });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StatsPayload | null>(null);

  const load = useCallback(async (r: StatsRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats?${statsRangeQuery(r)}`);
      if (!res.ok) throw new Error('fail');
      setData(await res.json());
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const userStats = data?.userStats ?? initialUsers;
  const appStats = data?.appStats ?? initialApps;
  const summary = data?.summary;

  return (
    <div id="admin-analytics" style={{ scrollMarginTop: 88, marginBottom: '1rem' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Аналитика</h2>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
            {data?.periodLabel || 'За неделю'}
            {loading ? ' · обновление…' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <PeriodPicker value={range} onChange={setRange} compact />
          {showCheckInsLink && (
            <Link
              href={`/admin/stats?${statsRangeQuery(range)}`}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontWeight: 700, fontSize: '0.8rem' }}
              prefetch
            >
              Проходы QR
            </Link>
          )}
        </div>
      </div>

      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div className="admin-card" style={{ padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <UserPlus size={14} /> Новые
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, marginTop: 4 }}>{summary.newUsers}</div>
          </div>
          <div className="admin-card" style={{ padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <Ticket size={14} /> Проходы
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, marginTop: 4 }}>{summary.inPeriod}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>
              гости {summary.uniqueGuests ?? 0}
            </div>
          </div>
          <div className="admin-card" style={{ padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <Clock size={14} /> Ожидают
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, marginTop: 4 }}>
              {summary.pendingApps + summary.pendingBookings}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>
              заявки {summary.pendingApps} · события {summary.pendingBookings}
            </div>
          </div>
        </div>
      )}

      <div
        className="admin-charts-wrap"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: '1rem',
          width: '100%',
          minWidth: 0,
        }}
      >
        <div
          className="admin-chart-card"
          style={{
            backgroundColor: 'white',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            minWidth: 0,
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Новые пользователи</h3>
          <div style={{ height: 220, width: '100%', minWidth: 0, outline: 'none', position: 'relative' }}>
            {!userStats.length || userStats.every((u) => !u.count) ? (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center', padding: '0 1rem' }}>
                Нет регистраций за период
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
                <BarChart data={userStats} margin={{ top: 5, right: 8, left: -8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis width={32} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid rgba(15,23,42,0.08)',
                      boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Регистраций"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                    activeBar={{ fill: '#1d4ed8', stroke: 'none' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div
          className="admin-chart-card"
          style={{
            backgroundColor: 'white',
            padding: '1.1rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            minWidth: 0,
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Статус заявок</h3>
          <div style={{ height: 220, width: '100%', minWidth: 0, outline: 'none', position: 'relative' }}>
            {appStats.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '2rem', textAlign: 'center' }}>
                Нет заявок за период
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
                <PieChart>
                  <Pie
                    data={appStats}
                    cx="50%"
                    cy="46%"
                    innerRadius={44}
                    outerRadius={72}
                    paddingAngle={4}
                    dataKey="value"
                    isAnimationActive={false}
                    stroke="none"
                  >
                    {appStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid rgba(15,23,42,0.08)',
                      boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                    }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
                    layout="horizontal"
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
