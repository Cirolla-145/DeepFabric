import { configureStore } from '@reduxjs/toolkit'
import userLoginReducer from './authSlice'
import contentReducer from './contentSlice'

export const store = configureStore({
  reducer: {
    userLogin: userLoginReducer,
    content: contentReducer,
  },
})
