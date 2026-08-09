import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { isModuleEnabled, type ModuleFlagKey } from '@/lib/module-flags';

/** Server-page guard: redirect to /unavailable when module is off (TECH bypasses). */
export async function requireModulePage(key: ModuleFlagKey) {
  const session = await getServerSession(authOptions);
  if (!(await isModuleEnabled(key, session?.user?.role))) {
    redirect(`/unavailable?m=${encodeURIComponent(key)}`);
  }
}
