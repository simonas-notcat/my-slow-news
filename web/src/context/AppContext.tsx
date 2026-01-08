import { createContext, useContext, useReducer, useMemo, type ReactNode } from "react";
import type {
  ClaimListItem,
  ClaimDetail,
  UserStance,
} from "../types";

// State shape
export interface AppState {
  // List view
  claims: ClaimListItem[];
  totalClaims: number;
  selectedIndex: number;

  // Detail view
  claimDetail: ClaimDetail | null;

  // UI state
  showFilter: boolean;
  showQuickStance: boolean;
  isLoading: boolean;
  error: string | null;
  toast: string | null;

  // Connection
  isConnected: boolean;
}

// Actions
export type AppAction =
  | { type: "SET_CLAIMS"; claims: ClaimListItem[]; total: number }
  | { type: "SELECT_CLAIM"; index: number }
  | { type: "SET_DETAIL"; detail: ClaimDetail }
  | { type: "TOGGLE_FILTER" }
  | { type: "TOGGLE_QUICK_STANCE" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_CONNECTED"; connected: boolean }
  | { type: "SET_TOAST"; message: string | null }
  | {
      type: "UPDATE_STANCE";
      claimId: string;
      stance: UserStance;
      note?: string;
    }
  | { type: "REMOVE_STANCE"; claimId: string };

export const initialState: AppState = {
  claims: [],
  totalClaims: 0,
  selectedIndex: 0,
  claimDetail: null,
  showFilter: false,
  showQuickStance: false,
  isLoading: false,
  error: null,
  toast: null,
  isConnected: false,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_CLAIMS":
      return {
        ...state,
        claims: action.claims,
        totalClaims: action.total,
        selectedIndex: 0,
        isLoading: false,
      };

    case "SELECT_CLAIM":
      return {
        ...state,
        selectedIndex: Math.max(
          0,
          Math.min(action.index, state.claims.length - 1)
        ),
      };

    case "SET_DETAIL":
      return {
        ...state,
        claimDetail: action.detail,
        isLoading: false,
      };

    case "TOGGLE_FILTER":
      return { ...state, showFilter: !state.showFilter };

    case "TOGGLE_QUICK_STANCE":
      return { ...state, showQuickStance: !state.showQuickStance };

    case "SET_LOADING":
      return { ...state, isLoading: action.loading };

    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };

    case "SET_CONNECTED":
      return { ...state, isConnected: action.connected };

    case "SET_TOAST":
      return { ...state, toast: action.message };

    case "UPDATE_STANCE":
      return {
        ...state,
        claims: state.claims.map((c) =>
          c.id === action.claimId ? { ...c, user_stance: action.stance } : c
        ),
        claimDetail:
          state.claimDetail?.id === action.claimId
            ? {
                ...state.claimDetail,
                user_stance: action.stance,
                user_note: action.note,
              }
            : state.claimDetail,
        showQuickStance: false,
      };

    case "REMOVE_STANCE":
      return {
        ...state,
        claims: state.claims.map((c) =>
          c.id === action.claimId ? { ...c, user_stance: undefined } : c
        ),
        claimDetail:
          state.claimDetail?.id === action.claimId
            ? {
                ...state.claimDetail,
                user_stance: undefined,
                user_note: undefined,
              }
            : state.claimDetail,
        showQuickStance: false,
      };

    default:
      return state;
  }
}

// Context
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}
