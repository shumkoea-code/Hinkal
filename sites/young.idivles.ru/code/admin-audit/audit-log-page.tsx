import Link from 'next/link';
import { requireAdminPage } from '@/lib/acl';
import { prisma } from '@/lib/prisma';

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const q = (sp.q || '').trim();
  const take = 40;
  const skip = (page - 1) * take;

  const where: any = {};
  if (q) {
    where.OR = [
      { actorEmail: { contains: q, mode: 'insensitive' } },
      { targetEmail: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
      { actorId: { contains: q } },
      { targetId: { contains: q } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / take));

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>
            Журнал действий админов
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.95rem' }}>
            Всего записей: {total}. Пароли в лог не сохраняются.
          </p>
        </div>
        <Link href="/admin/users" className="btn btn-secondary">
          К пользователям
        </Link>
      </div>

      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="email / action / id"
          style={{
            flex: '1 1 220px',
            padding: '0.55rem 0.7rem',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            font: 'inherit',
          }}
        />
        <button type="submit" className="btn btn-primary">
          Найти
        </button>
      </form>

      <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '0.65rem 0.75rem' }}>Когда</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Админ</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Действие</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Цель</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>IP</th>
              <th style={{ padding: '0.65rem 0.75rem' }}>Детали</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  Пока пусто
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
                  {new Date(r.createdAt).toLocaleString('ru-RU')}
                </td>
                <td style={{ padding: '0.55rem 0.75rem' }}>
                  <div>{r.actorEmail || r.actorId}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{r.actorRole}</div>
                </td>
                <td style={{ padding: '0.55rem 0.75rem', fontWeight: 700 }}>{r.action}</td>
                <td style={{ padding: '0.55rem 0.75rem', wordBreak: 'break-all' }}>
                  <div>{r.targetEmail || '—'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                    {r.targetType}
                    {r.targetId ? ` · ${r.targetId.slice(0, 10)}…` : ''}
                  </div>
                </td>
                <td style={{ padding: '0.55rem 0.75rem', color: 'var(--muted)' }}>{r.ip || '—'}</td>
                <td style={{ padding: '0.55rem 0.75rem', maxWidth: 280, wordBreak: 'break-word' }}>
                  <code style={{ fontSize: '0.72rem', color: '#475569' }}>{r.detail || '—'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
          {page > 1 ? (
            <Link
              className="btn btn-secondary"
              href={`/admin/audit-log?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            >
              ← Назад
            </Link>
          ) : null}
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              className="btn btn-secondary"
              href={`/admin/audit-log?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            >
              Вперёд →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
