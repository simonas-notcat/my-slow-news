import { createContext, useContext, useReducer, type ReactNode } from "react";
import type {
  ClaimListItem,
  ClaimDetail,
  FilterState,
  Screen,
  UserStance,
} from "../types";

// State shape
export interface AppState {
  // Navigation
  currentScreen: Screen;

  // List view
  claims: ClaimListItem[];
  totalClaims: number;
  selectedIndex: number;
  currentPage: number;
  pageSize: number;

  // Detail view
  selectedClaimId: string | null;
  claimDetail: ClaimDetail | null;

  // Filters
  filters: FilterState;

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
  | { type: "VIEW_DETAIL"; claimId: string }
  | { type: "SET_DETAIL"; detail: ClaimDetail }
  | { type: "GO_BACK" }
  | { type: "SET_PAGE"; page: number }
  | { type: "SET_FILTERS"; filters: Partial<FilterState> }
  | { type: "RESET_FILTERS" }
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
    };

export const initialState: AppState = {
  currentScreen: "list",
  claims: [],
  totalClaims: 0,
  selectedIndex: 0,
  currentPage: 1,
  pageSize: 10,
  selectedClaimId: null,
  claimDetail: null,
  filters: {
    predicate: null,
    subject: null,
    days: 30,
    stanceFilter: "all",
  },
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

    case "VIEW_DETAIL":
      return {
        ...state,
        currentScreen: "detail",
        selectedClaimId: action.claimId,
        isLoading: true,
      };

    case "SET_DETAIL":
      return {
        ...state,
        claimDetail: action.detail,
        isLoading: false,
      };

    case "GO_BACK":
      return {
        ...state,
        currentScreen: "list",
        selectedClaimId: null,
        claimDetail: null,
        showQuickStance: false,
      };

    case "SET_PAGE":
      return {
        ...state,
        currentPage: action.page,
        selectedIndex: 0,
        isLoading: true,
      };

    case "SET_FILTERS":
      return {
        ...state,
        filters: { ...state.filters, ...action.filters },
        currentPage: 1,
        selectedIndex: 0,
        isLoading: true,
        showFilter: false,
      };

    case "RESET_FILTERS":
      return {
        ...state,
        filters: initialState.filters,
        currentPage: 1,
        selectedIndex: 0,
        isLoading: true,
        showFilter: false,
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

  return (
    <AppContext.Provider value={{ state, dispatch }}>
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
