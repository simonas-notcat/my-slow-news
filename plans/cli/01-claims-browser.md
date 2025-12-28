# Claims Browser

## Overview

The claims browser is the primary view of the data explorer. It displays a navigable list of extracted claims from the knowledge base, allowing users to browse, filter, and drill into details.

## User Stories

1. **As a user**, I want to see all my extracted claims so I can review what the system has learned
2. **As a user**, I want to filter claims by predicate type so I can focus on specific relationships
3. **As a user**, I want to filter claims by subject so I can see everything about a topic
4. **As a user**, I want to see claim details so I can understand context and confidence
5. **As a user**, I want to see which claims I've already rated so I can track progress

## Screen: Claims List

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News - Claims Browser                    [?] Help      │
├─────────────────────────────────────────────────────────────────┤
│  Filters: predicate:all  subject:all  days:30      [f] Filter   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > (Rust, is-safer-than, C++)                        ✓ agreed   │
│    (Python, released, 3.13)                          ○ unrated  │
│    (Microsoft, acquired, GitHub)                     ○ unrated  │
│    (Bun, is-faster-than, Node.js)                   ✗ disagreed │
│    (TypeScript, supports, decorators)                ○ unrated  │
│    (React, deprecated, componentWillMount)           ~ neutral  │
│    (Deno, migrated-to, npm compatibility)            ○ unrated  │
│    (Go, lacks, generics)                             ? uncertain│
│    (Rust, announced, async traits)                   ○ unrated  │
│    (Apple, released, M4 chip)                        ○ unrated  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Page 1/5 (47 claims)              ↑↓ navigate  ←→ pages  ⏎ view│
└─────────────────────────────────────────────────────────────────┘
```

### Visual Elements

| Element | Description |
|---------|-------------|
| `>` cursor | Highlights currently selected claim |
| `✓` green | User agreed with claim |
| `✗` red | User disagreed with claim |
| `~` yellow | User marked neutral |
| `?` blue | User marked uncertain |
| `○` dim | No stance recorded yet |

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `k` | Move selection up |
| `↓` / `j` | Move selection down |
| `←` / `h` | Previous page |
| `→` / `l` | Next page |
| `Enter` | Open claim detail view |
| `f` | Open filter panel |
| `s` | Quick stance (opens stance selector) |
| `?` | Toggle help overlay |
| `q` | Quit explorer |
| `g` | Go to first item |
| `G` | Go to last item |

### Data Requirements

```typescript
interface ClaimListItem {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  extracted_at: Date;
  user_stance?: 'agrees' | 'disagrees' | 'neutral' | 'uncertain';
}
```

### Database Query

```sql
SELECT
  id,
  subject,
  predicate,
  object,
  confidence,
  extracted_at,
  (SELECT user_stance FROM claim_stances WHERE claim = $parent.id)[0].user_stance AS user_stance
FROM claim
WHERE extracted_at >= $cutoff
ORDER BY extracted_at DESC
LIMIT $limit
START $offset
```

## Screen: Claim Detail

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                               Claim Detail              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Rust  ──is-safer-than──▶  C++                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Confidence: ████████░░ 85%                                     │
│  Extracted:  2025-01-15 10:30 AM                                │
│  Predicate:  is-safer-than (built-in)                           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Community Sentiment                                            │
│  ─────────────────────────────────────────────────────────────  │
│  Author stance:    agrees                                       │
│  Commenters:       72% agree  18% disagree  10% other           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Your Stance                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  Current:          ✓ agrees                                     │
│  Note:             "Memory safety by default"                   │
│                                                                 │
│  [a] Agree  [d] Disagree  [n] Neutral  [u] Uncertain  [e] Edit  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ⌫/Esc back  a/d/n/u stance  e edit note  ? help                │
└─────────────────────────────────────────────────────────────────┘
```

### Visual Elements

- **Triple visualization**: Subject → Predicate → Object in a box
- **Confidence bar**: Visual progress bar with percentage
- **Community sentiment**: Bar chart or percentages
- **Stance indicators**: Same icons as list view

### Data Requirements

```typescript
interface ClaimDetail {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  extracted_at: Date;

  // Predicate info
  predicate_description?: string;
  predicate_is_builtin: boolean;

  // Stance info
  content_author_stance: string;
  commenter_agree_pct: number;
  commenter_disagree_pct: number;
  user_stance?: string;
  user_note?: string;

  // Source info (future)
  source_post_title?: string;
  source_subreddit?: string;
}
```

## Screen: Filter Panel

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Filter Claims                                        [x] Close │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Predicate:  [ All predicates           ▼ ]                     │
│              ┌────────────────────────────┐                     │
│              │ ● All predicates           │                     │
│              │   is-safer-than (12)       │                     │
│              │   released (38)            │                     │
│              │   announced (25)           │                     │
│              │   is-better-than (42)      │                     │
│              │   acquired (8)             │                     │
│              └────────────────────────────┘                     │
│                                                                 │
│  Subject:    [ _________________________ ]  (type to filter)    │
│                                                                 │
│  Time range: [ Last 30 days             ▼ ]                     │
│              ┌────────────────────────────┐                     │
│              │   Last 7 days              │                     │
│              │ ● Last 30 days             │                     │
│              │   Last 90 days             │                     │
│              │   All time                 │                     │
│              └────────────────────────────┘                     │
│                                                                 │
│  Stance:     [ All claims               ▼ ]                     │
│              ┌────────────────────────────┐                     │
│              │ ● All claims               │                     │
│              │   Unrated only             │                     │
│              │   Rated only               │                     │
│              │   Agreed                   │                     │
│              │   Disagreed                │                     │
│              └────────────────────────────┘                     │
│                                                                 │
│                              [Apply]  [Reset]                   │
├─────────────────────────────────────────────────────────────────┤
│  Tab: next field  Enter: select/apply  Esc: cancel              │
└─────────────────────────────────────────────────────────────────┘
```

### Filter Options

| Filter | Type | Options |
|--------|------|---------|
| Predicate | Select | All, or specific predicate (with counts) |
| Subject | Text input | Free text, filters as you type |
| Time range | Select | 7 days, 30 days, 90 days, All time |
| Stance | Select | All, Unrated, Rated, Agreed, Disagreed, Neutral, Uncertain |

### Filter State

```typescript
interface FilterState {
  predicate: string | null;  // null = all
  subject: string | null;    // null = all, or partial match
  days: 7 | 30 | 90 | null;  // null = all time
  stanceFilter: 'all' | 'unrated' | 'rated' | 'agrees' | 'disagrees' | 'neutral' | 'uncertain';
}
```

## Component Hierarchy

```
<App>
  <ConnectionStatus />
  <Router>
    <ClaimsListScreen>
      <Header title="Claims Browser" />
      <FilterBar filters={filters} onFilterPress={openFilterPanel} />
      <ClaimsList
        claims={claims}
        selectedIndex={selectedIndex}
        onSelect={viewClaimDetail}
      />
      <Pagination page={page} total={totalPages} />
      <Footer shortcuts={listShortcuts} />
    </ClaimsListScreen>

    <ClaimDetailScreen claimId={selectedId}>
      <BackButton />
      <ClaimTriple subject={} predicate={} object={} />
      <ConfidenceBar value={confidence} />
      <MetadataSection extracted_at={} predicate_info={} />
      <CommunitySentiment author={} commenters={} />
      <UserStanceSection stance={} note={} onStanceChange={} />
      <Footer shortcuts={detailShortcuts} />
    </ClaimDetailScreen>

    <FilterPanel>
      <PredicateSelect options={predicates} />
      <SubjectInput value={subject} onChange={} />
      <TimeRangeSelect options={timeRanges} />
      <StanceFilterSelect options={stanceFilters} />
      <ActionButtons onApply={} onReset={} />
    </FilterPanel>
  </Router>
</App>
```

## State Management

```typescript
// Global app state
interface AppState {
  // Connection
  isConnected: boolean;
  connectionError: string | null;

  // Current view
  currentScreen: 'list' | 'detail' | 'filter';

  // Claims list
  claims: ClaimListItem[];
  totalClaims: number;
  currentPage: number;
  pageSize: number;
  selectedIndex: number;

  // Filters
  filters: FilterState;

  // Detail view
  selectedClaimId: string | null;
  claimDetail: ClaimDetail | null;

  // Loading states
  isLoading: boolean;
  isSaving: boolean;
}
```

## Performance Considerations

1. **Pagination**: Load 10 claims per page, fetch on demand
2. **Caching**: Cache claim details after first load
3. **Debounce**: Debounce subject filter input (300ms)
4. **Optimistic updates**: Update stance UI immediately, sync in background

## Accessibility

1. **Screen reader support**: Use Ink's built-in a11y features
2. **High contrast**: Ensure stance colors meet contrast requirements
3. **Keyboard-only**: Full functionality without mouse
4. **Clear focus indicators**: Always show which element is selected

## Error Handling

| Error | User Message | Recovery |
|-------|--------------|----------|
| DB connection lost | "Connection lost. Retrying..." | Auto-retry with backoff |
| Query timeout | "Query taking too long. Try narrowing filters." | Show retry button |
| No results | "No claims match your filters." | Show reset filters button |
| Stance save failed | "Couldn't save stance. Try again?" | Show retry option |
