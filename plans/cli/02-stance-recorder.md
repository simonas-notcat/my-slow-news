# Stance Recorder

## Overview

The stance recorder allows users to record their opinions on claims directly within the explorer interface, without needing to run separate commands.

## User Stories

1. **As a user**, I want to quickly record my stance on a claim while browsing
2. **As a user**, I want to add notes explaining my reasoning
3. **As a user**, I want to change my stance if my opinion evolves
4. **As a user**, I want visual feedback that my stance was saved
5. **As a user**, I want to batch-rate multiple unrated claims efficiently (future)

## Entry Points

### 1. Quick Stance from List View

Press `s` on any claim in the list to open an inline stance selector:

```
┌─────────────────────────────────────────────────────────────────┐
│  > (Rust, is-safer-than, C++)                                   │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │  Your stance:  [a] Agree  [d] Disagree  [n] Neutral  [u] │ │
│    │                                                Uncertain │ │
│    │  Press key or Esc to cancel                              │ │
│    └──────────────────────────────────────────────────────────┘ │
│    (Python, released, 3.13)                          ○ unrated  │
```

### 2. Full Stance from Detail View

In the claim detail view, users see their current stance and can modify it:

```
│  ─────────────────────────────────────────────────────────────  │
│  Your Stance                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  Current:          ○ No stance recorded                         │
│                                                                 │
│  [a] Agree  [d] Disagree  [n] Neutral  [u] Uncertain            │
```

After selecting a stance, prompt for optional note:

```
│  ─────────────────────────────────────────────────────────────  │
│  Your Stance                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  Current:          ✓ agrees                                     │
│                                                                 │
│  Add a note (optional):                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Memory safety prevents entire classes of bugs_              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [Enter] Save  [Esc] Skip note                                  │
```

### 3. Edit Existing Stance

When a claim already has a stance, show edit option:

```
│  ─────────────────────────────────────────────────────────────  │
│  Your Stance                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  Current:          ✓ agrees                                     │
│  Note:             "Memory safety by default"                   │
│                                                                 │
│  [a] Agree  [d] Disagree  [n] Neutral  [u] Uncertain  [e] Edit  │
│  [x] Remove stance                                              │
```

## Stance Flow Diagram

```
                    ┌─────────────┐
                    │  List View  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │ press 's'  │ press Enter│
              ▼            │            ▼
    ┌─────────────────┐    │    ┌─────────────────┐
    │ Quick Stance    │    │    │  Detail View    │
    │ Popup           │    │    │                 │
    └────────┬────────┘    │    └────────┬────────┘
             │             │             │
             │ select      │             │ press a/d/n/u
             │ a/d/n/u     │             │
             ▼             │             ▼
    ┌─────────────────┐    │    ┌─────────────────┐
    │ Save Stance     │◄───┘    │ Note Prompt     │
    │ (no note)       │         │ (optional)      │
    └────────┬────────┘         └────────┬────────┘
             │                           │
             │                           │ Enter/Esc
             │                           ▼
             │                  ┌─────────────────┐
             │                  │ Save Stance     │
             │                  │ (with note)     │
             │                  └────────┬────────┘
             │                           │
             ▼                           ▼
    ┌─────────────────────────────────────────────┐
    │              Show Success Toast              │
    │         "Stance saved: agrees"              │
    └─────────────────────────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────────────────┐
    │         Return to Previous View             │
    │    (list updates stance indicator)          │
    └─────────────────────────────────────────────┘
```

## Component: QuickStancePopup

```typescript
interface QuickStancePopupProps {
  claim: ClaimListItem;
  onSelect: (stance: Stance) => void;
  onCancel: () => void;
}

// Renders inline below selected claim
const QuickStancePopup: FC<QuickStancePopupProps> = ({ claim, onSelect, onCancel }) => {
  useInput((input, key) => {
    if (input === 'a') onSelect('agrees');
    if (input === 'd') onSelect('disagrees');
    if (input === 'n') onSelect('neutral');
    if (input === 'u') onSelect('uncertain');
    if (key.escape) onCancel();
  });

  return (
    <Box borderStyle="round" paddingX={1}>
      <Text>Your stance: </Text>
      <Text color="green">[a] Agree</Text>
      <Text> </Text>
      <Text color="red">[d] Disagree</Text>
      <Text> </Text>
      <Text color="yellow">[n] Neutral</Text>
      <Text> </Text>
      <Text color="blue">[u] Uncertain</Text>
    </Box>
  );
};
```

## Component: StanceSection

```typescript
interface StanceSectionProps {
  currentStance?: Stance;
  currentNote?: string;
  onStanceChange: (stance: Stance, note?: string) => Promise<void>;
  onRemoveStance: () => Promise<void>;
}

const StanceSection: FC<StanceSectionProps> = (props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [pendingStance, setPendingStance] = useState<Stance | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ... implementation
};
```

## Component: NoteInput

```typescript
interface NoteInputProps {
  initialValue?: string;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}

const NoteInput: FC<NoteInputProps> = ({ initialValue = '', onSubmit, onCancel }) => {
  const [value, setValue] = useState(initialValue);

  return (
    <Box flexDirection="column">
      <Text>Add a note (optional):</Text>
      <Box borderStyle="single">
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={() => onSubmit(value)}
        />
      </Box>
      <Text dimColor>[Enter] Save  [Esc] Skip note</Text>
    </Box>
  );
};
```

## Component: SuccessToast

Brief feedback after saving:

```typescript
interface SuccessToastProps {
  message: string;
  duration?: number; // ms, default 1500
}

const SuccessToast: FC<SuccessToastProps> = ({ message, duration = 1500 }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <Box position="absolute" bottom={2} right={2}>
      <Text color="green">✓ {message}</Text>
    </Box>
  );
};
```

## Database Operations

### Save New Stance

```typescript
async function saveStance(
  db: Surreal,
  claimId: string,
  stance: Stance,
  note?: string
): Promise<void> {
  // Check if stance record exists
  const existing = await db.query<ClaimStancesRecord[][]>(
    `SELECT * FROM claim_stances WHERE claim = $claim`,
    { claim: claimId }
  );

  if (existing[0]?.length > 0) {
    // Update existing
    await db.query(
      `UPDATE claim_stances SET
        user_stance = $stance,
        user_note = $note
      WHERE claim = $claim`,
      { claim: claimId, stance, note: note || null }
    );
  } else {
    // Create new
    await db.query(
      `CREATE claim_stances SET
        claim = $claim,
        content_author_stance = 'not-stated',
        commenter_agree_pct = 0,
        commenter_disagree_pct = 0,
        user_stance = $stance,
        user_note = $note`,
      { claim: claimId, stance, note: note || null }
    );
  }
}
```

### Remove Stance

```typescript
async function removeStance(db: Surreal, claimId: string): Promise<void> {
  await db.query(
    `UPDATE claim_stances SET
      user_stance = NONE,
      user_note = NONE
    WHERE claim = $claim`,
    { claim: claimId }
  );
}
```

## Keyboard Shortcuts Summary

| Context | Key | Action |
|---------|-----|--------|
| List view | `s` | Open quick stance popup |
| Quick popup | `a` | Set stance to "agrees" |
| Quick popup | `d` | Set stance to "disagrees" |
| Quick popup | `n` | Set stance to "neutral" |
| Quick popup | `u` | Set stance to "uncertain" |
| Quick popup | `Esc` | Cancel |
| Detail view | `a` | Set stance to "agrees" |
| Detail view | `d` | Set stance to "disagrees" |
| Detail view | `n` | Set stance to "neutral" |
| Detail view | `u` | Set stance to "uncertain" |
| Detail view | `e` | Edit note |
| Detail view | `x` | Remove stance |
| Note input | `Enter` | Save note |
| Note input | `Esc` | Skip note |

## Optimistic Updates

For a responsive feel, update UI immediately:

```typescript
const handleStanceSelect = async (stance: Stance) => {
  // Capture previous state for rollback
  const previousStance = localStance;

  // Optimistic update
  setLocalStance(stance);
  setShowSaveIndicator(true);

  try {
    await saveStance(db, claimId, stance, note);
    showToast('Stance saved');
  } catch (error) {
    // Rollback on failure
    setLocalStance(previousStance);
    showError('Failed to save stance');
  } finally {
    setShowSaveIndicator(false);
  }
};
```

> **Note**: Always capture `previousStance` before updating to enable proper rollback on error.

## Future: Batch Rating Mode

A focused mode for rating multiple unrated claims:

```
┌─────────────────────────────────────────────────────────────────┐
│  Batch Rating Mode                              12/47 unrated   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  TypeScript  ──supports──▶  decorators                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Confidence: ████████░░ 78%                                     │
│  Source: r/typescript - "Stage 3 decorators are here!"         │
│                                                                 │
│  [a] Agree  [d] Disagree  [n] Neutral  [u] Uncertain  [→] Skip │
│                                                                 │
│  Progress: ████████████████░░░░░░░░░░░░░░░░ 35/47               │
├─────────────────────────────────────────────────────────────────┤
│  q quit  ←→ navigate  a/d/n/u rate  → skip                      │
└─────────────────────────────────────────────────────────────────┘
```

This is out of scope for MVP but included for future reference.

## Error States

### Save Failed

```
│  ─────────────────────────────────────────────────────────────  │
│  Your Stance                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  ⚠ Failed to save stance. [r] Retry  [Esc] Cancel               │
```

### Connection Lost During Save

```
│  ─────────────────────────────────────────────────────────────  │
│  Your Stance                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  ⚠ Connection lost. Stance will be saved when reconnected.     │
│    Pending: agrees                                              │
```

## Validation

- Stance must be one of: `agrees`, `disagrees`, `neutral`, `uncertain`
- Note is optional, max 500 characters
- Note is trimmed of leading/trailing whitespace
- Empty note after trim is treated as no note
