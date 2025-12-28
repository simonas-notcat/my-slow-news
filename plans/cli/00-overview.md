# CLI Data Explorer PRD - Overview

## Executive Summary

Replace the existing `query` CLI command with an interactive, Ink-based data explorer that provides a unified interface for browsing claims, recording stances, and discovering themes in the knowledge base.

## Problem Statement

The current `query` command has significant limitations:

1. **No interactivity** - Each query is a separate command execution
2. **Poor discoverability** - Users must know exact command syntax
3. **No navigation** - Can't drill into claim details or related data
4. **Fragmented experience** - Three separate subcommands (`claims`, `themes`, `my-stances`)
5. **Limited filtering** - Hard-coded limits (10-20 results), no pagination
6. **No inline actions** - Must run separate `stance` command to record opinions

## Goals

### MVP Goals
- Unified interactive explorer replacing all `query` subcommands
- Browse claims with keyboard navigation
- View claim details (source, confidence, community sentiment)
- Record stances inline without leaving the explorer
- Handle empty states gracefully with helpful onboarding

### Future Goals (Post-MVP)
- Theme exploration with drill-down
- Timeline/calendar view
- Search with fuzzy matching
- Bulk stance recording
- Export functionality

## User Personas

### Primary: Knowledge Curator
A user who has been generating digests for weeks/months and wants to:
- Review extracted claims
- Record their opinions systematically
- Find patterns in their knowledge base

### Secondary: New User
Someone who just set up the app and wants to:
- Understand what the tool can do
- See example data or empty state guidance
- Start recording their first stances

## Success Metrics

1. **Engagement**: Time spent in explorer vs. old query commands
2. **Completion**: % of claims that receive user stances
3. **Discoverability**: Reduction in "command not found" errors
4. **Usability**: Successful task completion without documentation

## Technical Approach

- **Framework**: [Ink](https://github.com/vadimdemedes/ink) (React for CLI)
- **Entry point**: `bun run query` (replaces existing command)
- **Database**: Always-connected to SurrealDB
- **State management**: React hooks + context for global state

## Document Index

| Document | Description |
|----------|-------------|
| [01-claims-browser.md](./01-claims-browser.md) | Claims browser feature - MVP core |
| [02-stance-recorder.md](./02-stance-recorder.md) | Inline stance recording flow |
| [03-themes-explorer.md](./03-themes-explorer.md) | Theme exploration (future) |
| [04-empty-states.md](./04-empty-states.md) | Empty state handling & onboarding |
| [05-technical-architecture.md](./05-technical-architecture.md) | Technical implementation details |

## MVP Scope

### In Scope
- Claims list with keyboard navigation
- Claim detail view
- Inline stance recording
- Filter by predicate, subject, date range
- Empty state handling
- Basic help/keyboard shortcuts display

### Out of Scope (Future Phases)
- Theme explorer (Phase 2)
- Full-text search (Phase 2)
- Bulk operations (Phase 3)
- Data export (Phase 3)
- Custom color themes (Phase 3)

## Dependencies

```json
{
  "ink": "^5.0.1",
  "ink-select-input": "^6.0.0",
  "ink-text-input": "^6.0.0",
  "ink-spinner": "^5.0.0",
  "react": "^18.0.0"
}
```

## Timeline Considerations

Implementation phases (no time estimates - user decides scheduling):

1. **Phase 1 (MVP)**: Claims browser + stance recording
2. **Phase 2**: Theme explorer + search
3. **Phase 3**: Bulk operations + export

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ink learning curve | Medium | Start with simple components, iterate |
| Terminal compatibility | Low | Test on common terminals (iTerm, Terminal.app, Windows Terminal) |
| Performance with large datasets | Medium | Implement pagination, lazy loading |
| SurrealDB connection issues | Medium | Connection status indicator, retry logic |

## Open Questions

1. ~~Should we support vim-style keybindings (j/k) in addition to arrow keys?~~ **Yes, both supported**
2. How many claims to show per page? (Proposal: 10, configurable)
3. Should filters persist across sessions?

## Implementation Checklist

### Phase 1: MVP - Claims Browser + Stance Recording

#### Setup
- [ ] Add Ink dependencies (`ink`, `ink-select-input`, `ink-text-input`, `ink-spinner`, `react`)
- [ ] Add database index: `DEFINE INDEX idx_claim_extracted_at ON claim FIELDS extracted_at`
- [ ] Create `src/cli/explorer/` directory structure

#### Core Components
- [ ] `App.tsx` - Root component with context providers
- [ ] `DatabaseContext.tsx` - SurrealDB connection management
- [ ] `AppContext.tsx` - Global state with useReducer
- [ ] `Header.tsx` - Title + connection status indicator
- [ ] `Footer.tsx` - Keyboard shortcuts hint

#### Claims List Screen
- [ ] `ClaimsListScreen.tsx` - Main list view container
- [ ] `ClaimsList.tsx` - Scrollable claims list
- [ ] `ClaimItem.tsx` - Single claim row with stance indicator
- [ ] `FilterBar.tsx` - Current filter display
- [ ] `Pagination.tsx` - Page navigation
- [ ] `useListKeyboard.ts` - Arrow/vim navigation hook
- [ ] `useClaims.ts` - Fetch claims with filters

#### Claim Detail Screen
- [ ] `ClaimDetailScreen.tsx` - Detail view container
- [ ] `ClaimTriple.tsx` - Subject → Predicate → Object display
- [ ] `ConfidenceBar.tsx` - Visual confidence meter
- [ ] `CommunitySentiment.tsx` - Author + commenter stats
- [ ] `StanceSection.tsx` - User stance display + actions

#### Stance Recording
- [ ] `QuickStancePopup.tsx` - Inline stance selector
- [ ] `NoteInput.tsx` - Optional note text input
- [ ] `SuccessToast.tsx` - Save confirmation feedback
- [ ] `saveStance()` utility function
- [ ] Optimistic update logic in reducer

#### Filter Panel
- [ ] `FilterPanel.tsx` - Modal filter editor
- [ ] `PredicateSelect.tsx` - Predicate dropdown with counts
- [ ] `SubjectInput.tsx` - Text input with debounce
- [ ] `TimeRangeSelect.tsx` - 7/30/90/all days
- [ ] `StanceFilterSelect.tsx` - All/Unrated/Rated/etc.

#### Empty States & Errors
- [ ] `EmptyState.tsx` - Configurable empty state component
- [ ] `LoadingSpinner.tsx` - Loading indicator
- [ ] `ErrorBanner.tsx` - Error display with retry
- [ ] `HelpOverlay.tsx` - Keyboard shortcuts modal
- [ ] Connection recovery with retry logic

#### Testing
- [ ] Unit tests for components using `ink-testing-library`
- [ ] Integration tests for database hooks
- [ ] Manual testing on macOS Terminal, iTerm2

#### Migration
- [ ] Update `package.json` scripts
- [ ] Remove old `src/cli/query.ts`
- [ ] Update CLAUDE.md with new command documentation

### Phase 2: Theme Explorer (Future)
- [ ] `ThemesScreen.tsx`
- [ ] `ThemeColumn.tsx`
- [ ] `PredicateDrillDown.tsx`
- [ ] `SubjectDrillDown.tsx`

### Phase 3: Advanced Features (Future)
- [ ] Batch rating mode
- [ ] Data export (JSON/CSV)
- [ ] Fuzzy search

## Migration Strategy

### From Legacy Query Command

The migration preserves CLI behavior while adding interactivity:

| Old Command | New Behavior |
|-------------|--------------|
| `bun run query claims` | Opens explorer in claims list view |
| `bun run query claims -s Rust` | Opens explorer with subject filter pre-applied |
| `bun run query themes programming` | Opens explorer → themes view (Phase 2) |
| `bun run query my-stances` | Opens explorer with stance filter = "rated" |

### Backward Compatibility Options

```typescript
// src/cli/explorer/index.tsx
program
  .name('query')
  .description('Interactive data explorer')
  .option('-d, --days <days>', 'Initial time filter', '30')
  .option('-s, --subject <subject>', 'Pre-filter by subject')
  .option('-p, --predicate <predicate>', 'Pre-filter by predicate')
  .option('--non-interactive', 'Output results and exit (legacy mode)')
  .action(async (options) => {
    if (options.nonInteractive) {
      // Legacy mode: run query and exit
      return legacyQueryMode(options);
    }
    // Interactive mode
    render(<App config={config} initialFilters={options} />);
  });
```

### Deprecation Timeline

1. **Immediate**: New explorer is default for `bun run query`
2. **v1.1**: Add deprecation warning when using `--non-interactive`
3. **v2.0**: Remove `--non-interactive` flag entirely

### CLAUDE.md Updates Required

After implementation, update these sections in CLAUDE.md:

```markdown
## Development Commands

# Replace query section with:
# Interactive data explorer
bun run query                    # Launch explorer
bun run query -d 7              # Start with 7-day filter
bun run query -s Rust           # Pre-filter by subject
```

### Rollback Plan

If issues arise post-deployment:

1. Keep `src/cli/query.ts` in repository (renamed to `query.legacy.ts`)
2. Add `--legacy` flag to switch back: `bun run query --legacy claims`
3. Monitor for user reports via GitHub issues
