# Empty States & Onboarding

## Overview

Empty states are critical for new users and edge cases. They should guide users toward productive actions rather than showing stark "no data" messages.

## Empty State Scenarios

### 1. No Claims in Database (Fresh Install)

**Trigger**: User runs explorer with zero claims in database

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News - Claims Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                         No claims yet                           │
│                                                                 │
│         Your knowledge base is empty. Generate your first       │
│         digest to start extracting claims from Reddit.          │
│                                                                 │
│                                                                 │
│         ┌─────────────────────────────────────────────┐         │
│         │  Run:  bun run digest                       │         │
│         │                                             │         │
│         │  This will fetch posts from your configured │         │
│         │  subreddits and extract factual claims.     │         │
│         └─────────────────────────────────────────────┘         │
│                                                                 │
│                                                                 │
│         Configured subreddits: r/programming, r/rust,           │
│         r/typescript                                            │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  q quit  ? help                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Show helpful command to generate first digest
- Display configured subreddits from config.yaml
- Link to documentation if applicable

### 2. No Claims Match Filters

**Trigger**: Filters applied but no results

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News - Claims Browser                    [?] Help      │
├─────────────────────────────────────────────────────────────────┤
│  Filters: predicate:deprecated  subject:React  days:7           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                    No claims match your filters                 │
│                                                                 │
│         Try adjusting your filters:                             │
│         • Expand time range (currently: 7 days)                 │
│         • Remove subject filter                                 │
│         • Try a different predicate                             │
│                                                                 │
│                                                                 │
│         ┌─────────────────────────────────────────────┐         │
│         │  [r] Reset all filters                      │         │
│         │  [f] Modify filters                         │         │
│         └─────────────────────────────────────────────┘         │
│                                                                 │
│                                                                 │
│         Tip: There are 47 claims in the last 30 days.           │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  r reset  f filter  q quit                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Suggest specific filter adjustments
- Show total claims available (broaden context)
- Quick reset button

### 3. No User Stances Recorded

**Trigger**: Viewing "my stances" filter with no stances

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News - Claims Browser                    [?] Help      │
├─────────────────────────────────────────────────────────────────┤
│  Filters: stance:rated                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                You haven't recorded any stances yet             │
│                                                                 │
│         Recording your stance on claims helps you:              │
│         • Track your opinions over time                         │
│         • Build a personal knowledge graph                      │
│         • Identify where you agree/disagree with consensus      │
│                                                                 │
│                                                                 │
│         ┌─────────────────────────────────────────────┐         │
│         │  [u] View unrated claims (47 available)     │         │
│         │  [r] Reset filter to see all claims         │         │
│         └─────────────────────────────────────────────┘         │
│                                                                 │
│                                                                 │
│         To record a stance:                                     │
│         1. Select a claim and press Enter                       │
│         2. Press a (agree), d (disagree), n (neutral),          │
│            or u (uncertain)                                     │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  u unrated  r reset  q quit                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Explain value of recording stances
- Quick action to view unrated claims
- Inline tutorial on how to record stances

### 4. Database Connection Failed

**Trigger**: Cannot connect to SurrealDB

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News - Claims Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│              ⚠ Cannot connect to database                       │
│                                                                 │
│         Unable to connect to SurrealDB at:                      │
│         ws://localhost:8000/rpc                                 │
│                                                                 │
│         Error: Connection refused                               │
│                                                                 │
│                                                                 │
│         ┌─────────────────────────────────────────────┐         │
│         │  Troubleshooting:                           │         │
│         │                                             │         │
│         │  1. Start SurrealDB:                        │         │
│         │     docker-compose up surrealdb -d          │         │
│         │                                             │         │
│         │  2. Check if running:                       │         │
│         │     docker ps | grep surrealdb              │         │
│         │                                             │         │
│         │  3. Verify config.yaml database.url         │         │
│         └─────────────────────────────────────────────┘         │
│                                                                 │
│                                                                 │
│         [r] Retry connection                                    │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  r retry  q quit                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Show connection URL from config
- Display actual error message
- Provide troubleshooting steps
- Retry button

### 5. All Claims Rated

**Trigger**: Filtering for unrated, but all claims have stances

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News - Claims Browser                    [?] Help      │
├─────────────────────────────────────────────────────────────────┤
│  Filters: stance:unrated  days:30                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                     All caught up! 🎉                           │
│                                                                 │
│         You've recorded stances on all 47 claims from           │
│         the last 30 days.                                       │
│                                                                 │
│                                                                 │
│         ┌─────────────────────────────────────────────┐         │
│         │  What's next?                               │         │
│         │                                             │         │
│         │  [g] Generate a new digest to get more      │         │
│         │      claims to review                       │         │
│         │                                             │         │
│         │  [a] View all your stances (47 claims)      │         │
│         │                                             │         │
│         │  [t] Explore themes and patterns            │         │
│         └─────────────────────────────────────────────┘         │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  g generate  a all  t themes  q quit                            │
└─────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Celebrate completion
- Suggest generating new digest
- Link to view all stances or explore themes

## Component: EmptyState

```typescript
interface EmptyStateProps {
  type: 'no-data' | 'no-results' | 'no-stances' | 'all-rated' | 'connection-error';
  title: string;
  description: string;
  actions: EmptyStateAction[];
  tips?: string[];
  errorDetails?: string;
}

interface EmptyStateAction {
  key: string;
  label: string;
  onSelect: () => void;
  primary?: boolean;
}

const EmptyState: FC<EmptyStateProps> = ({
  type,
  title,
  description,
  actions,
  tips,
  errorDetails
}) => {
  return (
    <Box flexDirection="column" alignItems="center" paddingY={2}>
      <Text bold>{getIcon(type)} {title}</Text>
      <Box marginY={1}>
        <Text>{description}</Text>
      </Box>

      {tips && (
        <Box flexDirection="column" marginY={1}>
          {tips.map((tip, i) => (
            <Text key={i} dimColor>• {tip}</Text>
          ))}
        </Box>
      )}

      {errorDetails && (
        <Box borderStyle="single" paddingX={2} marginY={1}>
          <Text color="red">{errorDetails}</Text>
        </Box>
      )}

      <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
        {actions.map(action => (
          <Text key={action.key}>
            <Text color="cyan">[{action.key}]</Text> {action.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
};

function getIcon(type: EmptyStateProps['type']): string {
  switch (type) {
    case 'no-data': return '📭';
    case 'no-results': return '🔍';
    case 'no-stances': return '📝';
    case 'all-rated': return '✨';
    case 'connection-error': return '⚠';
  }
}
```

## Detection Logic

```typescript
async function determineEmptyState(
  db: Surreal | null,
  connectionError: Error | null,
  claims: ClaimListItem[],
  filters: FilterState,
  totalClaims: number,
  totalStances: number
): Promise<EmptyStateType | null> {

  // Priority 1: Connection error
  if (connectionError || !db) {
    return {
      type: 'connection-error',
      error: connectionError?.message || 'Not connected'
    };
  }

  // Priority 2: No data at all
  if (totalClaims === 0) {
    return { type: 'no-data' };
  }

  // Priority 3: Filters return no results
  if (claims.length === 0) {
    // Check if filtering for stances specifically
    if (filters.stanceFilter === 'unrated' && totalClaims > 0 && totalClaims === totalStances) {
      return { type: 'all-rated', totalStances };
    }

    if (filters.stanceFilter === 'rated' && totalStances === 0) {
      return { type: 'no-stances', totalClaims };
    }

    return {
      type: 'no-results',
      filters,
      suggestions: generateFilterSuggestions(filters, totalClaims)
    };
  }

  // No empty state - show normal view
  return null;
}
```

## Onboarding Flow (First Run)

For first-time users, consider a brief onboarding:

```
┌─────────────────────────────────────────────────────────────────┐
│  Welcome to My Slow News                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  This explorer helps you browse and annotate claims             │
│  extracted from your daily news digests.                        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Quick Start                                                    │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  1. Browse claims with ↑↓ arrow keys                            │
│  2. Press Enter to see claim details                            │
│  3. Record your stance with a/d/n/u                             │
│  4. Filter with f, search themes with t                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Enter] Start exploring    [?] Show full help                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Press Enter to continue                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Trigger**: First time running explorer (check flag in config or local storage)

**Persistence**: Set `~/.myslownews/onboarding_complete` flag after dismissal

## Help Overlay

Accessible from any screen with `?`:

```
┌─────────────────────────────────────────────────────────────────┐
│  Keyboard Shortcuts                                   [?] Close │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Navigation                    Actions                          │
│  ──────────────                ───────────                      │
│  ↑/k     Move up               Enter   View details             │
│  ↓/j     Move down             s       Quick stance             │
│  ←/h     Previous page         f       Open filters             │
│  →/l     Next page             r       Reset filters            │
│  g       Go to first           q       Quit                     │
│  G       Go to last                                             │
│                                                                 │
│  Stance Recording              In Detail View                   │
│  ────────────────              ──────────────                   │
│  a       Agree                 Backspace  Go back               │
│  d       Disagree              e          Edit note             │
│  n       Neutral               x          Remove stance         │
│  u       Uncertain                                              │
│                                                                 │
│  Press ? or Esc to close                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Status Indicators

### Connection Status

Always show connection status in header:

```
│  My Slow News - Claims Browser          ● Connected  [?] Help  │
│  My Slow News - Claims Browser          ○ Connecting...        │
│  My Slow News - Claims Browser          ✗ Disconnected         │
```

### Loading States

Show spinner while loading:

```
│                                                                 │
│                         ◐ Loading claims...                     │
│                                                                 │
```

```typescript
const LoadingSpinner: FC<{ message: string }> = ({ message }) => {
  return (
    <Box>
      <Spinner type="dots" />
      <Text> {message}</Text>
    </Box>
  );
};
```

## Error Recovery

### Auto-Retry Logic

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

async function fetchWithRetry<T>(
  operation: () => Promise<T>,
  onRetry?: (attempt: number) => void
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      onRetry?.(attempt + 1);
      await sleep(RETRY_DELAYS[attempt]);
    }
  }

  throw lastError!;
}
```

### Graceful Degradation

If claims load but stances fail:
- Show claims without stance indicators
- Display warning banner: "Stance data unavailable"
- Disable stance recording buttons

## Comprehensive Error Recovery Strategy

### Error Categories and Handling

| Category | Examples | Recovery Strategy |
|----------|----------|-------------------|
| **Connection** | Network timeout, DB unreachable | Auto-retry with backoff, show reconnect button |
| **Query** | Invalid filter, syntax error | Show user-friendly message, offer filter reset |
| **Write** | Stance save failed, constraint violation | Optimistic rollback, offer retry |
| **Auth** | Token expired, permission denied | Re-authenticate, escalate to user |

### Connection Recovery Flow

```
┌─────────────────┐
│   Connected     │
└────────┬────────┘
         │ connection lost
         ▼
┌─────────────────┐
│  Reconnecting   │──────────────────┐
│  (attempt 1/3)  │                  │ success
└────────┬────────┘                  ▼
         │ fail               ┌─────────────────┐
         ▼                    │   Connected     │
┌─────────────────┐           │ (show toast)    │
│  Reconnecting   │           └─────────────────┘
│  (attempt 2/3)  │
└────────┬────────┘
         │ fail
         ▼
┌─────────────────┐
│  Reconnecting   │
│  (attempt 3/3)  │
└────────┬────────┘
         │ fail
         ▼
┌─────────────────┐
│  Disconnected   │
│ [r] Retry       │
│ [q] Quit        │
└─────────────────┘
```

### Error State Component

```typescript
interface ErrorBannerProps {
  type: 'warning' | 'error';
  message: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  dismissable?: boolean;
}

const ErrorBanner: FC<ErrorBannerProps> = ({ type, message, action, dismissable }) => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const color = type === 'error' ? 'red' : 'yellow';
  const icon = type === 'error' ? '✗' : '⚠';

  return (
    <Box borderStyle="single" borderColor={color} paddingX={1}>
      <Text color={color}>{icon} {message}</Text>
      {action && (
        <Text> [{action.label[0]}] {action.label}</Text>
      )}
      {dismissable && (
        <Text dimColor> [Esc] Dismiss</Text>
      )}
    </Box>
  );
};
```

### Pending Operations Queue

For offline-resilient stance recording:

```typescript
interface PendingOperation {
  id: string;
  type: 'save_stance' | 'remove_stance';
  claimId: string;
  data: { stance?: Stance; note?: string };
  timestamp: Date;
  retryCount: number;
}

class OperationQueue {
  private queue: PendingOperation[] = [];
  private isProcessing = false;

  add(op: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>) {
    this.queue.push({
      ...op,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      retryCount: 0,
    });
    this.process();
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const op = this.queue[0];
      try {
        await this.execute(op);
        this.queue.shift(); // Remove on success
      } catch (error) {
        op.retryCount++;
        if (op.retryCount >= 3) {
          this.queue.shift(); // Give up after 3 retries
          this.onOperationFailed(op, error);
        } else {
          await sleep(1000 * op.retryCount); // Backoff
        }
      }
    }

    this.isProcessing = false;
  }
}
```

### User Feedback for Errors

| Scenario | UI Feedback |
|----------|-------------|
| Save in progress | Show spinner next to stance buttons |
| Save succeeded | Brief green toast "✓ Saved" |
| Save failed, retrying | Yellow toast "Retrying..." |
| Save failed permanently | Red inline error with retry button |
| Connection lost | Header status changes to "Disconnected" |
| Connection restored | Green toast "Reconnected", process queue |
