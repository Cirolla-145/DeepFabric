import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import axios from 'axios'
import { api } from '../api/client'

// This backend authenticates with an HTTP-only cookie, so no token is saved in localStorage.
export const restoreSessionThunk = createAsyncThunk('user-login/restore-session', async (_, thunkApi) => {
  try {
    const response = await api.get('/auth/me')
    return response.data.user
  } catch {
    return thunkApi.rejectWithValue('No active session')
  }
})

export const userLoginThunk = createAsyncThunk('user-login/login', async (userCredObj: { email: string; password: string }, thunkApi) => {
  try {
    const response = await api.post('/auth/login', userCredObj)
    return response.data.user
  } catch (error) {
    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data?.message ?? 'Unable to sign in.'
      : 'Unable to sign in.'
    return thunkApi.rejectWithValue(errorMessage)
  }
})

export const userSignupThunk = createAsyncThunk('user-login/signup', async (userDetails: { username: string; email: string; password: string }, thunkApi) => {
  try {
    await api.post('/auth/signup', userDetails)
  } catch (error) {
    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data?.message ?? 'Unable to create the account.'
      : 'Unable to create the account.'
    return thunkApi.rejectWithValue(errorMessage)
  }
})

export const userLogoutThunk = createAsyncThunk('user-login/logout', async () => {
  try {
    await api.post('/auth/logout')
  } catch {
    // Clear Redux state even if the cookie has already expired.
  }
})

export const userLoginSlice = createSlice({
  name: 'user-login',
  initialState: {
    isPending: true,
    loginUserStatus: false,
    currentUser: null as { id: string; name: string; email: string } | null,
    errorOccurred: false,
    errMsg: '',
  },
  reducers: {
    resetState: (state) => {
      state.isPending = false
      state.loginUserStatus = false
      state.currentUser = null
      state.errorOccurred = false
      state.errMsg = ''
    },
  },
  extraReducers: (builder) => builder
    .addCase(restoreSessionThunk.pending, (state) => {
      state.isPending = true
    })
    .addCase(restoreSessionThunk.fulfilled, (state, action) => {
      state.isPending = false
      state.currentUser = action.payload
      state.loginUserStatus = true
    })
    .addCase(restoreSessionThunk.rejected, (state) => {
      state.isPending = false
      state.currentUser = null
      state.loginUserStatus = false
    })
    .addCase(userLoginThunk.pending, (state) => {
      state.isPending = true
      state.errorOccurred = false
      state.errMsg = ''
    })
    .addCase(userLoginThunk.fulfilled, (state, action) => {
      state.isPending = false
      state.currentUser = action.payload
      state.loginUserStatus = true
      state.errorOccurred = false
      state.errMsg = ''
    })
    .addCase(userLoginThunk.rejected, (state, action) => {
      state.isPending = false
      state.currentUser = null
      state.loginUserStatus = false
      state.errorOccurred = true
      state.errMsg = action.payload as string
    })
    .addCase(userSignupThunk.pending, (state) => {
      state.isPending = true
      state.errorOccurred = false
      state.errMsg = ''
    })
    .addCase(userSignupThunk.fulfilled, (state) => {
      state.isPending = false
    })
    .addCase(userSignupThunk.rejected, (state, action) => {
      state.isPending = false
      state.errorOccurred = true
      state.errMsg = action.payload as string
    })
    .addCase(userLogoutThunk.pending, (state) => {
      state.isPending = true
    })
    .addCase(userLogoutThunk.fulfilled, (state) => {
      state.isPending = false
      state.currentUser = null
      state.loginUserStatus = false
      state.errorOccurred = false
      state.errMsg = ''
    }),
})

export const { resetState } = userLoginSlice.actions
export default userLoginSlice.reducer
