import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { restoreSessionThunk } from './redux/authSlice'
import { HomePage } from './pages/HomePage'
import { Login } from './pages/auth/Login'
import { Signup } from './pages/auth/Signup'

function App() {
  // The app intentionally uses direct Redux hooks rather than typed helper hooks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>()

  useEffect(() => {
    void dispatch(restoreSessionThunk())
  }, [dispatch])

  return <BrowserRouter>
    <Routes>
      <Route element={<HomePage />} path="/" />
      <Route element={<Login />} path="/login" />
      <Route element={<Signup />} path="/signup" />
    </Routes>
  </BrowserRouter>
}

export default App
