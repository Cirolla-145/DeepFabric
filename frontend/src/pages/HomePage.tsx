import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { DashboardPage } from './DashboardPage'

const highlights = ['Turn notes into concepts', 'Practice with focused quizzes', 'Know exactly what to review']

export function HomePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authUser = useSelector((state: any) => state.userLogin.currentUser)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadingSession = useSelector((state: any) => state.userLogin.isPending)

  if (loadingSession) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm font-medium text-slate-500">Loading your workspace…</main>
  }

  if (authUser) return <DashboardPage />

  return <main className="min-h-screen overflow-hidden bg-[#f8fafc] text-slate-950">
    <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-12">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-indigo-200/55 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-cyan-200/50 blur-3xl" />
      <header className="relative z-10 flex items-center gap-3 font-bold tracking-tight">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-lg text-white">D</span>
        <span>DeepFabric</span>
      </header>
      <section className="relative z-10 grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <p className="mb-5 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold tracking-[0.14em] text-indigo-700">
            YOUR INTELLIGENT STUDY SPACE
          </p>
          <h1 className="max-w-2xl text-5xl font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl">
            Learn with clarity.
            <span className="text-indigo-600">
              Remember
            </span>
            with confidence.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">DeepFabric turns your study material into an organized, adaptive system built around how you learn.</p>
          <div className="mt-9 space-y-3">
            {highlights.map((item, index) => <div className="flex items-center gap-3 text-sm font-medium text-slate-700" key={item}>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                {index + 1}
              </span>
              {item}
            </div>
            )}
          </div>
        </div>
        <section className="w-full rounded-3xl border border-white bg-white/85 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur sm:p-10">
          <p className="text-sm font-semibold text-indigo-600">START HERE</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">A calmer way to study.</h2>
          <p className="mt-4 leading-7 text-slate-600">Create a workspace for your subject, add notes, then turn them into concepts and practice.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link className="rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-600" to="/signup">Create account</Link>
            <Link className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50" to="/login">Sign in</Link>
          </div>
        </section>
      </section>
    </div>
  </main>
}
