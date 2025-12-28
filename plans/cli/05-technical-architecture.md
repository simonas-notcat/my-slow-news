# Technical Architecture

## Overview

This document covers the implementation details for the Ink-based CLI data explorer.

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | [Ink](https://github.com/vadimdemedes/ink) v5.x | React for CLI |
| React | React 18.x | Component model |
| Database | SurrealDB | Graph database |
| State | React Context + useReducer | Global state |
| Validation | Zod | Runtime type checking |
| Config | Existing config loader | YAML configuration |

## Dependencies

```json
{
  "dependencies": {
    "ink": "^5.0.1",
    "ink-select-input": "^6.0.0",
    "ink-text-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "ink-testing-library": "^4.0.0"
  }
}
```

## Project Structure

```
src/
├── cli/
│   ├── query.ts              # Current (to be replaced)
│   └── explorer/             # New explorer module
│       ├── index.tsx         # Entry point
│       ├── App.tsx           # Root component
│       ├── components/       # Reusable UI components
│       │   ├── Header.tsx
│       │   ├── Footer.tsx
│       │   ├── ClaimsList.tsx
│       │   ├── ClaimItem.tsx
│       │   ├── ClaimDetail.tsx
│       │   ├── FilterPanel.tsx
│       │   ├── StanceSection.tsx
│       │   ├── EmptyState.tsx
│       │   ├── LoadingSpinner.tsx
│       │   ├── Pagination.tsx
│       │   └── HelpOverlay.tsx
│       ├── hooks/            # Custom React hooks
│       │   ├── useDatabase.ts
│       │   ├── useClaims.ts
│       │   ├── useKeyboard.ts
│       │   ├── useFilters.ts
│       │   └── usePagination.ts
│       ├── context/          # React context providers
│       │   ├── AppContext.tsx
│       │   └── DatabaseContext.tsx
│       ├── screens/          # Full-screen components
│       │   ├── ClaimsListScreen.tsx
│       │   ├── ClaimDetailScreen.tsx
│       │   └── FilterScreen.tsx
│       ├── utils/            # Explorer-specific utilities
│       │   ├── formatters.ts
│       │   └── queries.ts
│       └── types.ts          # Explorer-specific types
```

## Entry Point

### `src/cli/explorer/index.tsx`

```typescript
#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './App.js';
import { loadConfig } from '../../config/index.js';

const program = new Command();

program
  .name('query')
  .description('Interactive data explorer for your knowledge base')
  .option('-d, --days <days>', 'Initial time filter in days', '30')
  .action(async (options) => {
    const config = loadConfig();
    const initialDays = parseInt(options.days, 10) || 30;

    const { waitUntilExit } = render(
      <App config={config} initialDays={initialDays} />
    );

    await waitUntilExit();
  });

program.parse();
```

### `package.json` Script Update

```json
{
  "scripts": {
    "query": "bun run src/cli/explorer/index.tsx"
  }
}
```

## Root Component

### `src/cli/explorer/App.tsx`

```typescript
import React, { useReducer, useEffect } from 'react';
import { Box, useApp, useInput } from 'ink';
import { AppContext, appReducer, initialState } from './context/AppContext.js';
import { DatabaseProvider } from './context/DatabaseContext.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { ClaimsListScreen } from './screens/ClaimsListScreen.js';
import { ClaimDetailScreen } from './screens/ClaimDetailScreen.js';
import { FilterScreen } from './screens/FilterScreen.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import type { Config } from '../../types/index.js';

interface AppProps {
  config: Config;
  initialDays: number;
}

export const App: React.FC<AppProps> = ({ config, initialDays }) => {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    filters: { ...initialState.filters, days: initialDays }
  });

  // Global keyboard handler
  useInput((input, key) => {
    if (input === 'q' && !state.showHelp && !state.showFilter) {
      exit();
    }
    if (input === '?') {
      dispatch({ type: 'TOGGLE_HELP' });
    }
  });

  return (
    <DatabaseProvider config={config}>
      <AppContext.Provider value={{ state, dispatch }}>
        <Box flexDirection="column" height="100%">
          <Header />

          {state.currentScreen === 'list' && <ClaimsListScreen />}
          {state.currentScreen === 'detail' && <ClaimDetailScreen />}

          {state.showFilter && <FilterScreen />}
          {state.showHelp && <HelpOverlay />}

          <Footer />
        </Box>
      </AppContext.Provider>
    </DatabaseProvider>
  );
};
```

## State Management

### `src/cli/explorer/context/AppContext.tsx`

```typescript
import React, { createContext, useContext, Dispatch } from 'react';

// State shape
export interface AppState {
  // Navigation
  currentScreen: 'list' | 'detail';

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
  showHelp: boolean;
  showFilter: boolean;
  isLoading: boolean;
  error: string | null;

  // Connection
  isConnected: boolean;
}

export interface FilterState {
  predicate: string | null;
  subject: string | null;
  days: number | null;
  stanceFilter: 'all' | 'unrated' | 'rated' | 'agrees' | 'disagrees' | 'neutral' | 'uncertain';
}

// Actions
export type AppAction =
  | { type: 'SET_CLAIMS'; claims: ClaimListItem[]; total: number }
  | { type: 'SELECT_CLAIM'; index: number }
  | { type: 'VIEW_DETAIL'; claimId: string }
  | { type: 'SET_DETAIL'; detail: ClaimDetail }
  | { type: 'GO_BACK' }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'SET_FILTERS'; filters: Partial<FilterState> }
  | { type: 'RESET_FILTERS' }
  | { type: 'TOGGLE_HELP' }
  | { type: 'TOGGLE_FILTER' }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_CONNECTED'; connected: boolean }
  | { type: 'UPDATE_STANCE'; claimId: string; stance: string; note?: string };

export const initialState: AppState = {
  currentScreen: 'list',
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
    stanceFilter: 'all',
  },
  showHelp: false,
  showFilter: false,
  isLoading: false,
  error: null,
  isConnected: false,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CLAIMS':
      return {
        ...state,
        claims: action.claims,
        totalClaims: action.total,
        selectedIndex: 0,
        isLoading: false,
      };

    case 'SELECT_CLAIM':
      return {
        ...state,
        selectedIndex: Math.max(0, Math.min(action.index, state.claims.length - 1)),
      };

    case 'VIEW_DETAIL':
      return {
        ...state,
        currentScreen: 'detail',
        selectedClaimId: action.claimId,
        isLoading: true,
      };

    case 'SET_DETAIL':
      return {
        ...state,
        claimDetail: action.detail,
        isLoading: false,
      };

    case 'GO_BACK':
      return {
        ...state,
        currentScreen: 'list',
        selectedClaimId: null,
        claimDetail: null,
      };

    case 'SET_PAGE':
      return {
        ...state,
        currentPage: action.page,
        selectedIndex: 0,
        isLoading: true,
      };

    case 'SET_FILTERS':
      return {
        ...state,
        filters: { ...state.filters, ...action.filters },
        currentPage: 1,
        selectedIndex: 0,
        isLoading: true,
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        filters: initialState.filters,
        currentPage: 1,
        selectedIndex: 0,
        isLoading: true,
      };

    case 'TOGGLE_HELP':
      return { ...state, showHelp: !state.showHelp };

    case 'TOGGLE_FILTER':
      return { ...state, showFilter: !state.showFilter };

    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };

    case 'SET_ERROR':
      return { ...state, error: action.error, isLoading: false };

    case 'SET_CONNECTED':
      return { ...state, isConnected: action.connected };

    case 'UPDATE_STANCE':
      return {
        ...state,
        claims: state.claims.map(c =>
          c.id === action.claimId
            ? { ...c, user_stance: action.stance }
            : c
        ),
        claimDetail: state.claimDetail?.id === action.claimId
          ? { ...state.claimDetail, user_stance: action.stance, user_note: action.note }
          : state.claimDetail,
      };

    default:
      return state;
  }
}

// Context
interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppContext.Provider');
  }
  return context;
}
```

## Database Context

### `src/cli/explorer/context/DatabaseContext.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Surreal from 'surrealdb';
import type { Config } from '../../../types/index.js';

interface DatabaseContextValue {
  db: Surreal | null;
  isConnected: boolean;
  error: Error | null;
  reconnect: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

interface DatabaseProviderProps {
  config: Config;
  children: ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ config, children }) => {
  const [db, setDb] = useState<Surreal | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = async () => {
    try {
      setError(null);
      const surreal = new Surreal();
      await surreal.connect(config.database.url);
      await surreal.use({
        namespace: config.database.namespace,
        database: config.database.database,
      });
      setDb(surreal);
      setIsConnected(true);
    } catch (err) {
      setError(err as Error);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    connect();
    return () => {
      db?.close();
    };
  }, []);

  const reconnect = async () => {
    await db?.close();
    await connect();
  };

  return (
    <DatabaseContext.Provider value={{ db, isConnected, error, reconnect }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider');
  }
  return context;
}
```

## Custom Hooks

### `src/cli/explorer/hooks/useClaims.ts`

```typescript
import { useEffect, useCallback } from 'react';
import { useDatabase } from '../context/DatabaseContext.js';
import { useAppContext } from '../context/AppContext.js';
import { buildClaimsQuery, buildCountQuery } from '../utils/queries.js';

export function useClaims() {
  const { db, isConnected } = useDatabase();
  const { state, dispatch } = useAppContext();

  const fetchClaims = useCallback(async () => {
    if (!db || !isConnected) return;

    dispatch({ type: 'SET_LOADING', loading: true });

    try {
      const offset = (state.currentPage - 1) * state.pageSize;
      const query = buildClaimsQuery(state.filters, state.pageSize, offset);
      const countQuery = buildCountQuery(state.filters);

      const [claimsResult, countResult] = await Promise.all([
        db.query(query.sql, query.params),
        db.query(countQuery.sql, countQuery.params),
      ]);

      const claims = claimsResult[0] || [];
      const total = countResult[0]?.[0]?.count || 0;

      dispatch({ type: 'SET_CLAIMS', claims, total });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, [db, isConnected, state.currentPage, state.pageSize, state.filters]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  return { refetch: fetchClaims };
}
```

### `src/cli/explorer/hooks/useKeyboard.ts`

```typescript
import { useInput } from 'ink';
import { useAppContext } from '../context/AppContext.js';

export function useListKeyboard() {
  const { state, dispatch } = useAppContext();

  useInput((input, key) => {
    if (state.showHelp || state.showFilter) return;

    // Navigation
    if (key.upArrow || input === 'k') {
      dispatch({ type: 'SELECT_CLAIM', index: state.selectedIndex - 1 });
    }
    if (key.downArrow || input === 'j') {
      dispatch({ type: 'SELECT_CLAIM', index: state.selectedIndex + 1 });
    }

    // Pagination
    if (key.leftArrow || input === 'h') {
      if (state.currentPage > 1) {
        dispatch({ type: 'SET_PAGE', page: state.currentPage - 1 });
      }
    }
    if (key.rightArrow || input === 'l') {
      const totalPages = Math.ceil(state.totalClaims / state.pageSize);
      if (state.currentPage < totalPages) {
        dispatch({ type: 'SET_PAGE', page: state.currentPage + 1 });
      }
    }

    // Jump to first/last
    if (input === 'g') {
      dispatch({ type: 'SELECT_CLAIM', index: 0 });
    }
    if (input === 'G') {
      dispatch({ type: 'SELECT_CLAIM', index: state.claims.length - 1 });
    }

    // Actions
    if (key.return) {
      const claim = state.claims[state.selectedIndex];
      if (claim) {
        dispatch({ type: 'VIEW_DETAIL', claimId: claim.id });
      }
    }
    if (input === 'f') {
      dispatch({ type: 'TOGGLE_FILTER' });
    }
    if (input === 'r') {
      dispatch({ type: 'RESET_FILTERS' });
    }
  });
}
```

## Database Queries

### `src/cli/explorer/utils/queries.ts`

```typescript
import type { FilterState } from '../context/AppContext.js';

interface QueryResult {
  sql: string;
  params: Record<string, unknown>;
}

export function buildClaimsQuery(
  filters: FilterState,
  limit: number,
  offset: number
): QueryResult {
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  // Time filter
  if (filters.days) {
    conditions.push('extracted_at >= $cutoff');
    params.cutoff = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000).toISOString();
  }

  // Predicate filter
  if (filters.predicate) {
    conditions.push('predicate = $predicate');
    params.predicate = filters.predicate;
  }

  // Subject filter (partial match)
  if (filters.subject) {
    conditions.push('subject CONTAINS $subject');
    params.subject = filters.subject;
  }

  // Stance filter
  const stanceCondition = buildStanceCondition(filters.stanceFilter);
  if (stanceCondition) {
    conditions.push(stanceCondition);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `
    SELECT
      id,
      subject,
      predicate,
      object,
      confidence,
      extracted_at,
      (SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1).user_stance AS user_stance
    FROM claim
    ${whereClause}
    ORDER BY extracted_at DESC
    LIMIT $limit
    START $offset
  `;

  return { sql, params };
}

export function buildCountQuery(filters: FilterState): QueryResult {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.days) {
    conditions.push('extracted_at >= $cutoff');
    params.cutoff = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000).toISOString();
  }

  if (filters.predicate) {
    conditions.push('predicate = $predicate');
    params.predicate = filters.predicate;
  }

  if (filters.subject) {
    conditions.push('subject CONTAINS $subject');
    params.subject = filters.subject;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `SELECT count() AS count FROM claim ${whereClause} GROUP ALL`;

  return { sql, params };
}

function buildStanceCondition(stanceFilter: FilterState['stanceFilter']): string | null {
  switch (stanceFilter) {
    case 'unrated':
      // Check if no stance record exists OR user_stance is null/NONE
      return 'array::len((SELECT id FROM claim_stances WHERE claim = $parent.id AND user_stance != NONE)) = 0';
    case 'rated':
      return 'array::len((SELECT id FROM claim_stances WHERE claim = $parent.id AND user_stance != NONE)) > 0';
    case 'agrees':
    case 'disagrees':
    case 'neutral':
    case 'uncertain':
      return `(SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1).user_stance = '${stanceFilter}'`;
    default:
      return null;
  }
}
```

## Testing Strategy

### Unit Tests

Test components with `ink-testing-library`:

```typescript
// src/cli/explorer/components/ClaimItem.test.tsx
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { ClaimItem } from './ClaimItem.js';

describe('ClaimItem', () => {
  const mockClaim = {
    id: 'claim:1',
    subject: 'Rust',
    predicate: 'is-safer-than',
    object: 'C++',
    confidence: 0.85,
    extracted_at: new Date(),
    user_stance: 'agrees',
  };

  test('renders claim triple', () => {
    const { lastFrame } = render(
      <ClaimItem claim={mockClaim} isSelected={false} />
    );

    expect(lastFrame()).toContain('Rust');
    expect(lastFrame()).toContain('is-safer-than');
    expect(lastFrame()).toContain('C++');
  });

  test('shows stance indicator', () => {
    const { lastFrame } = render(
      <ClaimItem claim={mockClaim} isSelected={false} />
    );

    expect(lastFrame()).toContain('✓'); // agreed indicator
  });

  test('highlights when selected', () => {
    const { lastFrame } = render(
      <ClaimItem claim={mockClaim} isSelected={true} />
    );

    expect(lastFrame()).toContain('>'); // selection cursor
  });
});
```

### Integration Tests

Test database interactions with mock:

```typescript
// src/cli/explorer/hooks/useClaims.test.tsx
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { DatabaseProvider } from '../context/DatabaseContext.js';
import { AppContext, initialState, appReducer } from '../context/AppContext.js';

// Mock SurrealDB
const mockDb = {
  query: mock(() => Promise.resolve([[]])),
  connect: mock(() => Promise.resolve()),
  use: mock(() => Promise.resolve()),
  close: mock(() => Promise.resolve()),
};

// ... test implementation
```

## Performance Considerations

### Pagination

- Default page size: 10 claims
- Fetch only current page from database
- Cache recent pages in state (future optimization)

### Debouncing

- Subject filter input: 300ms debounce
- Prevents excessive database queries while typing

```typescript
import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

### Connection Pooling

- Reuse single database connection
- Reconnect on failure with exponential backoff
- Health check before queries

## Migration Path

### Step 1: Add Dependencies

```bash
bun add ink@5 ink-select-input ink-text-input ink-spinner react@18
bun add -d @types/react ink-testing-library
```

### Step 2: Create Explorer Module

Create the new `src/cli/explorer/` directory structure.

### Step 3: Implement Core Components

1. App.tsx and contexts
2. ClaimsListScreen
3. ClaimDetailScreen
4. Basic keyboard navigation

### Step 4: Replace Entry Point

Update `package.json` to point `query` script to new explorer.

### Step 5: Remove Old Code

Delete `src/cli/query.ts` after verifying new explorer works.

## Open Technical Questions

1. **React version**: Ink 5.x requires React 18. Verify Bun compatibility.
2. **Terminal size**: How to handle very small terminals? Minimum size requirements?
3. **Unicode support**: Some terminals may not render box characters. Fallback ASCII?
4. **Color schemes**: Support for no-color mode (`NO_COLOR` env var)?
