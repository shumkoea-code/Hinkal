import { requireAdminPage } from '@/lib/acl';
import AdminPendingUsersClient from '@/components/admin/AdminPendingUsersClient';

export default async function AdminPendingUsersPage() {
  await requireAdminPage();
  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>
            Заявки на регистрацию
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.95rem' }}>
            Пользователи, которые ещё не подтвердили email. Если почта недоступна — активируйте вручную;
            вход будет с паролем из формы регистрации.
          </p>
        </div>
      </div>
      <AdminPendingUsersClient />
    </div>
  );
}
