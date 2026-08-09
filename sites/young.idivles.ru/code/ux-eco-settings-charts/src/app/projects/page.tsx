import { requireModulePage } from '@/lib/require-module-page';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { ArrowRight } from 'lucide-react';
import { Metadata } from 'next';
import EntityCoverImage from '@/components/EntityCoverImage';
import FilterBar from '@/components/FilterBar';
import ProjectTabs from '@/components/ProjectTabs';
import CatalogPagination from '@/components/CatalogPagination';
import { decodeRouteParam, encodeRouteParam } from '@/lib/route-id';
import { projectCover, sectionCover } from '@/lib/theme-covers';
import { CATALOG_PAGE_SIZE, catalogSlice, totalPages } from '@/lib/pagination';

export async function generateMetadata(): Promise<Metadata> {
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  return brandedMetadata('Проекты', {
    description: 'Молодёжные проекты Центра развития молодежи Сочи — от КВН до форумов и фестивалей.',
  });
}

function stripHtml(html: string | null | undefined) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; tab?: string; page?: string }>;
}) {
  await requireModulePage('projects');

  const resolvedParams = await searchParams;
  const query = resolvedParams.q || '';
  const statusFilter = resolvedParams.status || 'ALL';
  const tab = decodeRouteParam(resolvedParams.tab || '');
  const page = tab ? 1 : catalogSlice(resolvedParams.page).page;
  const listQuery = { q: query || undefined, status: statusFilter !== 'ALL' ? statusFilter : undefined };

  let tabProjects: Array<{ id: string; title: string }> = [];
  let projects: Array<{
    id: string;
    title: string;
    description: string | null;
    image: string | null;
    status: string;
    _count: { applications: number };
  }> = [];
  let total = 0;

  try {
    const whereClause: any = {
      status: { not: 'INACTIVE' },
      ...(query ? { title: { contains: query } } : {}),
      ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
    };

    tabProjects = await prisma.project.findMany({
      where: whereClause,
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    });

    if (tab) {
      const activeRow = await prisma.project.findFirst({
        where: { ...whereClause, id: tab },
        select: {
          id: true,
          title: true,
          description: true,
          image: true,
          status: true,
          _count: { select: { applications: true } },
        },
      });
      projects = activeRow ? [activeRow] : [];
      total = activeRow ? 1 : 0;
    } else {
      total = await prisma.project.count({ where: whereClause });
      const { skip, take } = catalogSlice(page);
      projects = await prisma.project.findMany({
        where: whereClause,
        orderBy: { title: 'asc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          description: true,
          image: true,
          status: true,
          _count: { select: { applications: true } },
        },
      });
    }
  } catch (error) {
    console.error('Ошибка загрузки проектов из БД:', error);
  }

  const active = tab ? projects.find((p) => p.id === tab) : null;
  const list = active ? [active] : projects;
  const pages = tab ? 1 : totalPages(total, CATALOG_PAGE_SIZE);

  return (
    <div className="container" style={{ padding: '1.5rem 1rem', minHeight: 'auto' }}>
      <div className="catalog-page-header">
        <div className="catalog-page-header__intro">
          <h1 className="text-gradient page-hero-title">Молодёжные проекты</h1>
        </div>
        <div className="catalog-page-header__search">
          <FilterBar placeholder="Поиск проектов..." hideStatus />
        </div>
      </div>

      <ProjectTabs projects={tabProjects} activeId={active?.id || null} />

      {list.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: 'white',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--muted)',
            border: '1px solid rgba(15,23,42,0.06)',
          }}
        >
          <h3 style={{ color: 'var(--foreground)', marginBottom: '0.5rem' }}>Проектов пока нет</h3>
          <p style={{ maxWidth: 420, margin: '0 auto' }}>
            Скоро здесь появятся молодёжные проекты Сочи.
          </p>
        </div>
      ) : active ? (
        <article
          style={{
            background: '#fff',
            borderRadius: 20,
            border: '1px solid rgba(15,23,42,0.08)',
            overflow: 'hidden',
            boxShadow: '0 12px 36px rgba(15,23,42,0.06)',
          }}
        >
          <div style={{ position: 'relative', width: '100%', aspectRatio: '21 / 9', background: '#e2e8f0' }}>
            <EntityCoverImage
              src={projectCover(active, 0)}
              alt={active.title}
              fallback={sectionCover('projects')}
              sizes="100vw"
            />
          </div>
          <div style={{ padding: '1.5rem 1.35rem 1.75rem' }}>
            <div
              style={{
                display: 'inline-block',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.65rem',
                borderRadius: 999,
                background: active.status === 'COMPLETED' ? 'rgba(100,116,139,0.12)' : 'rgba(37,99,235,0.12)',
                color: active.status === 'COMPLETED' ? '#475569' : '#1d4ed8',
                marginBottom: '0.75rem',
              }}
            >
              {active.status === 'COMPLETED' ? 'Завершён' : 'Активный'}
            </div>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.55rem', fontWeight: 800 }}>
              {active.title.replace(/^Проект:\s*/i, '')}
            </h2>
            <div
              className="prose"
              style={{ color: '#334155', lineHeight: 1.7, fontSize: '1.02rem' }}
              dangerouslySetInnerHTML={{
                __html: active.description || '<p>Описание появится скоро.</p>',
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: '1.35rem' }}>
              <Link href={`/projects/${encodeRouteParam(active.id)}`} className="btn btn-primary">
                Подробнее и заявка <ArrowRight size={16} style={{ marginLeft: 6 }} />
              </Link>
            </div>
          </div>
        </article>
      ) : (
        <>
          <div className="grid-cards">
            {list.map((project, projectIdx) => (
              <Link key={project.id} href={`/projects?tab=${encodeURIComponent(project.id)}`} className="catalog-card">
                <div className={`catalog-badge${project.status === 'COMPLETED' ? ' status-completed' : ''}`}>
                  {project.status === 'COMPLETED' ? 'Завершен' : 'Активный'}
                </div>
                <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                  <EntityCoverImage
                    src={projectCover(project, projectIdx)}
                    alt={project.title}
                    fallback={sectionCover('projects')}
                    className="catalog-img"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div
                  style={{
                    padding: '1.25rem 1.25rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    flexGrow: 1,
                    gap: '0.75rem',
                  }}
                >
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.3, color: 'var(--foreground)' }}>
                    {project.title.replace(/^Проект:\s*/i, '')}
                  </h3>
                  <p className="line-clamp-3" style={{ color: 'var(--muted)', fontSize: '0.95rem', flexGrow: 1, lineHeight: 1.6 }}>
                    {stripHtml(project.description)}
                  </p>
                  <div className="catalog-card-meta">
                    <span style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 500 }}>Открыт для заявок</span>
                    <span
                      style={{
                        color: 'var(--primary)',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.95rem',
                      }}
                    >
                      Подробнее <ArrowRight size={16} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <CatalogPagination page={page} totalPages={pages} basePath="/projects" query={listQuery} />
        </>
      )}
    </div>
  );
}
