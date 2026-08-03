import { createSlice } from "@reduxjs/toolkit";
import type { Module, Subject, Workspace } from "../api/contentApi";

export const contentSlice = createSlice({
  name: "content",
  initialState: {
    workspaces: [] as Workspace[],
    subjects: [] as Subject[],
    modules: [] as Module[],
    errorOccurred: false,
    errMsg: "",
  },
  reducers: {
    setWorkspaces: (state, action) => {
      state.workspaces = action.payload;
    },
    setSubjects: (state, action) => {
      state.subjects = action.payload;
    },
    setModules: (state, action) => {
      state.modules = action.payload;
    },
    clearSubjects: (state) => {
      state.subjects = [];
      state.modules = [];
    },
    clearModules: (state) => {
      state.modules = [];
    },
    setContentError: (state, action) => {
      state.errorOccurred = true;
      state.errMsg = action.payload;
    },
    clearContentError: (state) => {
      state.errorOccurred = false;
      state.errMsg = "";
    },
  },
});

export const {
  setWorkspaces,
  setSubjects,
  setModules,
  clearSubjects,
  clearModules,
  setContentError,
  clearContentError,
} = contentSlice.actions;
export default contentSlice.reducer;
