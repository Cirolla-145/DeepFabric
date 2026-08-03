import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { userSignupThunk } from '../../redux/authSlice'

type SignupValues = { username: string; email: string; password: string }

export function Signup() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loading = useSelector((state: any) => state.userLogin.isPending)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<SignupValues>()

  const onFormSubmit = async (values: SignupValues) => {
    setError(null)
    try {
      await dispatch(userSignupThunk(values)).unwrap()
      navigate('/login', { state: { success: 'Account created. Please sign in.' } })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create the account.')
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
        <Link className="mb-8 flex items-center gap-3 font-bold tracking-tight" to="/"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-lg text-white">D</span>DeepFabric</Link>
        <p className="text-sm font-semibold text-indigo-600">GET STARTED</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Build your study system.</h1>
        <form className="mt-7 space-y-4" onSubmit={handleSubmit(onFormSubmit)}>
          <label className="block text-sm font-medium text-slate-700">Name<input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="Your name" {...register('username', { required: 'Name is required.' })} /></label>
          {errors.username && <p className="-mt-2 text-xs text-rose-600">{errors.username.message}</p>}
          <label className="block text-sm font-medium text-slate-700">Email<input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="you@example.com" type="email" {...register('email', { required: 'Email is required.' })} /></label>
          {errors.email && <p className="-mt-2 text-xs text-rose-600">{errors.email.message}</p>}
          <label className="block text-sm font-medium text-slate-700">Password<input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="At least 6 characters" type="password" {...register('password', { minLength: { value: 6, message: 'Use at least 6 characters.' }, required: 'Password is required.' })} /></label>
          {errors.password && <p className="-mt-2 text-xs text-rose-600">{errors.password.message}</p>}
          {error && <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
          <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-60" disabled={loading} type="submit">{loading ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">Already have an account? <Link className="font-semibold text-indigo-600 hover:underline" to="/login">Sign in</Link></p>
      </section>
    </main>
  )
}
