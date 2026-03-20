// 全局状态管理 Context
import { createContext, useContext, useReducer } from 'react';

const AppContext = createContext(null);
const AppDispatch = createContext(null);

const initialState = {
  activeResume:  null,   // 当前使用的简历对象
  resumes:       [],
  modelBinding:  null,
  providers:     {},     // { deepseek: { connected, models }, ... }
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ACTIVE_RESUME':
      return { ...state, activeResume: action.payload };
    case 'SET_RESUMES':
      return { ...state, resumes: action.payload };
    case 'SET_MODEL_BINDING':
      return { ...state, modelBinding: action.payload };
    case 'SET_PROVIDER':
      return {
        ...state,
        providers: { ...state.providers, [action.payload.name]: action.payload.data },
      };
    case 'SET_PROVIDERS':
      return { ...state, providers: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={state}>
      <AppDispatch.Provider value={dispatch}>
        {children}
      </AppDispatch.Provider>
    </AppContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppContext);
}

export function useAppDispatch() {
  return useContext(AppDispatch);
}
