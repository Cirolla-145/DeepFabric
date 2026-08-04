import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { userLoginThunk } from '../../redux/authSlice'

type LoginValues = { email: string; password: string }

export function Login() {
  
  const authUser = useSelector((state: any) => state.userLogin.currentUser)
  
  const loading = useSelector((state: any) => state.userLogin.isPending)
  
  const dispatch = useDispatch<any>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>()

  if (authUser) return <Navigate replace to="/" />

  const onFormSubmit = async (values: LoginValues) => {
    setError(null)
    try {
      await dispatch(userLoginThunk(values)).unwrap()
      navigate('/')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.')
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
        <Link className="mb-8 flex items-center gap-3 font-bold tracking-tight" to="/">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-lg text-white">D</span>DeepFabric
        </Link>
        <p className="text-sm font-semibold text-indigo-600">WELCOME BACK</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Sign in to continue.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Return to your concepts, questions, and review schedule.</p>
        <form className="mt-7 space-y-4" onSubmit={handleSubmit(onFormSubmit)}>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 
            outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              placeholder="you@example.com"
              type="email"
              {...register('email', { required: 'Email is required.' })} />
          </label>
          {errors.email && <p className="-mt-2 text-xs text-rose-600">{errors.email.message}</p>}
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 
            outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              placeholder="••••••••" type="password"
              {...register('password', { required: 'Password is required.' })} />
          </label>
          {errors.password && <p className="-mt-2 text-xs text-rose-600">{errors.password.message}</p>}
          {error && <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
          <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition 
          hover:bg-indigo-600 disabled:opacity-60"
            disabled={loading} type="submit">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">New here? <Link className="font-semibold text-indigo-600 hover:underline" to="/signup">Create an account</Link></p>
      </section>
    </main>
  )
}
