# Themes Explorer

> **Note**: This is a Phase 2 feature, not part of MVP. Documented here for future reference.

## Overview

The themes explorer provides aggregate views of the knowledge base, helping users discover patterns, trending topics, and relationships across claims.

## User Stories

1. **As a user**, I want to see which predicates are most common to understand what types of claims are being extracted
2. **As a user**, I want to see which subjects appear most frequently to identify trending topics
3. **As a user**, I want to drill from a theme into related claims
4. **As a user**, I want to compare themes across different time periods

## Screen: Themes Overview

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News - Themes                            [?] Help      │
├─────────────────────────────────────────────────────────────────┤
│  Time range: Last 30 days                         [t] Change    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Top Predicates                     Top Subjects                │
│  ─────────────────────────────      ────────────────────────    │
│  > released          38 ████████    Rust              15 ████   │
│    is-better-than    42 █████████   Python            12 ███    │
│    announced         25 █████       TypeScript        10 ███    │
│    is-safer-than     18 ████        Go                 8 ██     │
│    deprecated        12 ███         React              7 ██     │
│    acquired           8 ██          Microsoft          6 ██     │
│    supports          15 ███         Google             5 █      │
│    migrated-to        6 █           Apple              5 █      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ↑↓ navigate  ←→ switch column  Enter drill into  t time range │
└─────────────────────────────────────────────────────────────────┘
```

### Visual Elements

- **Bar charts**: Inline ASCII bars proportional to count
- **Two-column layout**: Predicates and Subjects side by side
- **Selection**: `>` cursor shows current selection
- **Tab navigation**: Switch between columns with `←→`

## Screen: Theme Drill-Down

When selecting a predicate or subject, show related claims:

### Predicate Drill-Down

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                     Predicate: is-better-than           │
├─────────────────────────────────────────────────────────────────┤
│  42 claims using this predicate (last 30 days)                  │
│                                                                 │
│  Description: Comparison indicating superiority                 │
│  Type: built-in                                                 │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Claims                                                         │
│  ─────────────────────────────────────────────────────────────  │
│  > (Rust, is-better-than, C++)                       ✓ agreed   │
│    (Bun, is-better-than, Node.js)                   ✗ disagreed │
│    (TypeScript, is-better-than, JavaScript)          ○ unrated  │
│    (Vim, is-better-than, Emacs)                      ~ neutral  │
│    (PostgreSQL, is-better-than, MySQL)               ○ unrated  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ⌫ back  ↑↓ navigate  Enter view detail  s quick stance         │
└─────────────────────────────────────────────────────────────────┘
```

### Subject Drill-Down

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                          Subject: Rust                  │
├─────────────────────────────────────────────────────────────────┤
│  15 claims about this subject (last 30 days)                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  By Predicate                                                   │
│  ─────────────────────────────────────────────────────────────  │
│    is-safer-than     5 █████                                    │
│    is-better-than    4 ████                                     │
│    released          3 ███                                      │
│    announced         2 ██                                       │
│    supports          1 █                                        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  All Claims                                                     │
│  ─────────────────────────────────────────────────────────────  │
│  > (Rust, is-safer-than, C++)                        ✓ agreed   │
│    (Rust, is-better-than, C++)                       ○ unrated  │
│    (Rust, released, 1.75)                            ○ unrated  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ⌫ back  ↑↓ navigate  Enter view detail  s quick stance         │
└─────────────────────────────────────────────────────────────────┘
```

## Navigation Flow

```
┌─────────────────┐
│ Themes Overview │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│Predicate│ │Subject │
│Drill-   │ │Drill-  │
│Down     │ │Down    │
└────┬────┘ └────┬───┘
     │           │
     ▼           ▼
┌─────────────────────┐
│    Claim Detail     │
│  (same as browser)  │
└─────────────────────┘
```

## Data Requirements

### Themes Overview Query

```sql
-- Top predicates
SELECT predicate, count() as count
FROM claim
WHERE extracted_at >= $cutoff
GROUP BY predicate
ORDER BY count DESC
LIMIT 10;

-- Top subjects
SELECT subject, count() as count
FROM claim
WHERE extracted_at >= $cutoff
GROUP BY subject
ORDER BY count DESC
LIMIT 10;
```

### Predicate Drill-Down Query

```sql
-- Get predicate metadata
LET $pred_info = (SELECT description, is_builtin FROM predicate WHERE name = $predicate LIMIT 1);

-- Get claims with user stance using proper subquery syntax
SELECT
  id, subject, predicate, object, confidence, extracted_at,
  (SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1).user_stance AS user_stance
FROM claim
WHERE predicate = $predicate AND extracted_at >= $cutoff
ORDER BY extracted_at DESC
LIMIT 50;
```

### Subject Drill-Down Query

```sql
-- Breakdown by predicate
SELECT predicate, count() as count
FROM claim
WHERE subject = $subject AND extracted_at >= $cutoff
GROUP BY predicate
ORDER BY count DESC;

-- All claims with user stance
SELECT
  id, subject, predicate, object, confidence, extracted_at,
  (SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1).user_stance AS user_stance
FROM claim
WHERE subject = $subject AND extracted_at >= $cutoff
ORDER BY extracted_at DESC
LIMIT 50;
```

> **Note**: The subquery `(SELECT ... LIMIT 1).user_stance` returns null if no stance exists,
> which the UI should display as "unrated".

## Component Hierarchy

```
<ThemesScreen>
  <Header title="Themes" />
  <TimeRangeSelector value={days} onChange={setDays} />
  <TwoColumnLayout>
    <ThemeColumn
      title="Top Predicates"
      items={predicates}
      selected={selectedPredicate}
      onSelect={drillIntoPredicate}
      active={activeColumn === 'predicates'}
    />
    <ThemeColumn
      title="Top Subjects"
      items={subjects}
      selected={selectedSubject}
      onSelect={drillIntoSubject}
      active={activeColumn === 'subjects'}
    />
  </TwoColumnLayout>
  <Footer shortcuts={themeShortcuts} />
</ThemesScreen>

<PredicateDrillDown predicateName={name}>
  <BackButton />
  <PredicateInfo name={} description={} isBuiltin={} />
  <ClaimsList claims={claims} />
</PredicateDrillDown>

<SubjectDrillDown subjectName={name}>
  <BackButton />
  <PredicateBreakdown predicates={predicateCounts} />
  <ClaimsList claims={claims} />
</SubjectDrillDown>
```

## State

```typescript
interface ThemesState {
  // Time filter
  days: 7 | 30 | 90 | null;

  // Overview data
  topPredicates: PredicateCount[];
  topSubjects: SubjectCount[];

  // Navigation
  activeColumn: 'predicates' | 'subjects';
  selectedIndex: number;

  // Drill-down
  drillDownType: 'predicate' | 'subject' | null;
  drillDownValue: string | null;
  drillDownClaims: ClaimListItem[];
  drillDownPredicateBreakdown?: PredicateCount[]; // for subject drill-down
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `k` | Move selection up |
| `↓` / `j` | Move selection down |
| `←` / `h` | Switch to predicates column |
| `→` / `l` | Switch to subjects column |
| `Enter` | Drill into selected theme |
| `t` | Change time range |
| `Backspace` / `Esc` | Go back |
| `?` | Toggle help |
| `q` | Quit to main menu |

## Future Enhancements

### Trend Analysis

Show how themes change over time:

```
│  Rust - Last 30 Days                                            │
│                                                                 │
│  Claims per week:                                               │
│                                                                 │
│     8 │       ██                                                │
│     6 │    ██ ██ ██                                             │
│     4 │ ██ ██ ██ ██                                             │
│     2 │ ██ ██ ██ ██                                             │
│       └─────────────                                            │
│         W1 W2 W3 W4                                             │
```

### Related Subjects

When drilling into a subject, show related subjects:

```
│  Related Subjects (co-occur in claims)                          │
│  ─────────────────────────────────────                          │
│    C++        8 claims together                                 │
│    Memory     5 claims together                                 │
│    LLVM       3 claims together                                 │
```

### Predicate Network

Visualize which predicates connect which subjects:

```
Rust ──is-safer-than──▶ C++
     ──is-faster-than──▶ Python
     ──uses──────────▶ LLVM
```

## Integration with Claims Browser

The themes explorer should integrate with the claims browser:

1. **From themes to claims**: Drill-down shows filtered claims list
2. **From claims to themes**: Filter bar links to relevant themes
3. **Shared stance recording**: Same UX for recording stances in both views
4. **Consistent navigation**: Same shortcuts work across views
