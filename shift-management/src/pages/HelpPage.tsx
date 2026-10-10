import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { BookOpen, GraduationCap, Info, Play, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { HELP, type HelpBlock, type HelpSection } from '../help/content'
import { TOURS, TOUR_ORDER, stepsFor } from '../help/tours'
import { useTour } from '../help/TourProvider'

/** Bỏ dấu, chữ thường — để tìm không dấu vẫn ra. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

/** **đậm** và `mã` trong chữ của nội dung hướng dẫn. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

function sectionText(s: HelpSection): string {
  const blocks = s.blocks.map((b) => {
    switch (b.type) {
      case 'p':
      case 'note':
        return b.text
      case 'list':
      case 'steps':
        return b.items.join(' ')
      case 'table':
        return [...b.head, ...b.rows.flat()].join(' ')
    }
  })
  return fold([s.title, s.summary, ...blocks].join(' '))
}

/**
 * Trang Hướng dẫn: tài liệu dùng web cho nhân viên, kèm các bài từng bước
 * (wizard) chỉ tận tay vào phần cần bấm. Nội dung ở help/content.ts, kịch
 * bản wizard ở help/tours.ts.
 */
export function HelpPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { start } = useTour()
  const [query, setQuery] = useState('')

  const sections = useMemo(
    () =>
      HELP[lang].filter((s) => !s.adminOnly || user?.role === 'admin'),
    [lang, user?.role],
  )
  const shown = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean)
    if (!tokens.length) return sections
    return sections.filter((s) => {
      const hay = sectionText(s)
      return tokens.every((tok) => hay.includes(tok))
    })
  }, [sections, query])

  function jump(id: string) {
    document
      .getElementById(`help-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <BookOpen className="h-5 w-5 shrink-0 text-slate-400" />
          {t('help.title')}
        </h1>
        <p className="text-sm text-slate-500">{t('help.subtitle')}</p>
      </div>

      {/* ---- các bài từng bước ---- */}
      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <GraduationCap className="h-4 w-4 text-indigo-500" />
          {t('help.tours')}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{t('help.toursHint')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TOUR_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => start(id)}
              className="group flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-left ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:ring-indigo-200"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white">
                <Play className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {TOURS[id].title[lang]}
                </span>
                <span className="block text-xs text-slate-500">
                  {t('help.stepCount', { count: stepsFor(id).length })}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="lg:grid lg:grid-cols-[14rem_1fr] lg:gap-6">
        {/* ---- mục lục ---- */}
        <aside className="mb-4 lg:mb-0">
          <div className="lg:sticky lg:top-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('help.search')}
                aria-label={t('help.search')}
                className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-1.5 pr-2.5 pl-8 text-base text-slate-900 shadow-xs outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 sm:min-h-0 sm:text-sm"
              />
            </label>
            <p className="mt-3 mb-1 hidden px-2 text-xs font-semibold text-slate-400 lg:block">
              {t('help.contents')}
            </p>
            {/* Mobile: dải chip cuộn ngang. Từ lg: danh sách dọc dính bên trái. */}
            <nav className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mt-0 lg:flex-col lg:gap-0.5 lg:overflow-visible">
              {shown.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-900 lg:rounded-md lg:px-2 lg:py-1 lg:text-left lg:ring-0"
                >
                  {s.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* ---- nội dung ---- */}
        <div className="min-w-0 space-y-4">
          {shown.length === 0 && (
            <p className="rounded-xl bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-900/5">
              {t('help.noResults')}
            </p>
          )}
          {shown.map((s) => (
            <article
              key={s.id}
              id={`help-${s.id}`}
              className="scroll-mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-5"
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-slate-900">
                    {s.title}
                    {s.adminOnly && (
                      <span className="ml-2 rounded-full bg-violet-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200 ring-inset">
                        Admin
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-slate-500">{s.summary}</p>
                </div>
                {s.tour && (
                  <button
                    type="button"
                    onClick={() => start(s.tour!)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 sm:min-h-0 sm:py-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {t('help.startTour')}
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
                {s.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function Block({ block }: { block: HelpBlock }): ReactNode {
  switch (block.type) {
    case 'p':
      return (
        <p>
          <Rich text={block.text} />
        </p>
      )
    case 'list':
      return (
        <ul className="list-disc space-y-1.5 pl-5 marker:text-slate-300">
          {block.items.map((item, i) => (
            <li key={i}>
              <Rich text={item} />
            </li>
          ))}
        </ul>
      )
    case 'steps':
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                {i + 1}
              </span>
              <span className="pt-0.5">
                <Rich text={item} />
              </span>
            </li>
          ))}
        </ol>
      )
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{block.head[0]}</th>
                <th className="px-3 py-2 font-semibold">{block.head[1]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {block.rows.map(([a, b], i) => (
                <tr key={i}>
                  <td className="px-3 py-2 align-top whitespace-nowrap sm:w-1/3 sm:whitespace-normal">
                    <Rich text={a} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Rich text={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'note':
      return (
        <p className="flex gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sky-900 ring-1 ring-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <span>
            <Rich text={block.text} />
          </span>
        </p>
      )
  }
}
