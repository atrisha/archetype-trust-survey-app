# Trust Survey Set-Based Message Assignment System

## Overview

This system implements intelligent set-based message assignment for survey sessions. When a user arrives, they are automatically assigned specific `set_quant` and `set_qual` values based on a balancing algorithm, and then receive messages specifically filtered for those sets.

## Implementation Details

### 1. Database Schema Changes

#### Survey Sessions Table Updates
```sql
ALTER TABLE survey_sessions ADD COLUMN set_quant INTEGER;
ALTER TABLE survey_sessions ADD COLUMN set_qual INTEGER;
CREATE INDEX idx_survey_sessions_set_quant ON survey_sessions(set_quant);
CREATE INDEX idx_survey_sessions_set_qual ON survey_sessions(set_qual);
```

### 2. Set Assignment Logic

The assignment follows this priority order:

#### For `set_quant`:
1. **Priority 1**: Find sets with exactly 1 session (to balance out incomplete pairs)
2. **Priority 2**: If none found, select randomly from sets with minimum session count
3. **Priority 3**: If no sessions exist yet, randomly select from available sets in messages

#### For `set_qual`:
- Same logic as `set_quant` but applied independently

### 3. Database Functions

#### `assign_set_quant()` → INTEGER
Returns the optimal `set_quant` value for a new session based on current distribution.

#### `assign_set_qual()` → INTEGER  
Returns the optimal `set_qual` value for a new session based on current distribution.

#### `get_messages_for_session(session_set_quant, session_set_qual)` → TABLE
Returns messages for a session with two categories:
- **Quantitative messages**: WHERE `set_quant = session_set_quant`
- **Qualitative messages**: WHERE `set_qual = session_set_qual`

### 4. API Endpoints

#### POST `/api/sessions`
**Purpose**: Creates a new session with automatic set assignment

**Request**:
```json
{
  "participantId": "optional_participant_id"
}
```

**Response**:
```json
{
  "id": "uuid",
  "participant_id": "optional_participant_id",
  "set_quant": 4,
  "set_qual": 11,
  "status": "in_progress",
  "session_start": "timestamp",
  "created_at": "timestamp"
}
```

#### GET `/api/sessions/:sessionId/messages`
**Purpose**: Retrieves messages for a specific session based on its assigned sets

**Response**:
```json
{
  "sessionId": "uuid",
  "setQuant": 4,
  "setQual": 11,
  "quantitativeMessages": [
    {
      "id": "msg_123",
      "message": "Message text...",
      "generated": 0,
      "in": 1,
      "roll": 0,
      "setQuant": 4,
      "setQual": 11,
      "dbId": 123
    }
  ],
  "qualitativeMessages": [...],
  "totalMessages": 15
}
```

### 5. Message Selection Logic

For each session:
1. **Session Creation**: Automatically assigns `set_quant` and `set_qual` using balancing functions
2. **Message Retrieval**: Queries messages table with:
   - **Quantitative portion**: `messages WHERE set_quant = session.set_quant`
   - **Qualitative portion**: `messages WHERE set_qual = session.set_qual`

### 6. Current Dataset

**Total Messages**: 133
- Human-written: 40
- AI-generated: 93

**Available Sets**:
- **set_quant**: 9 unique values (0-8) plus NULL
- **set_qual**: 22 unique values (0-21) plus NULL
- **Unique combinations**: 26 different set pairs

## Usage Examples

### Creating a Session
```javascript
// POST /api/sessions
const response = await fetch('/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ participantId: 'user123' })
});
const session = await response.json();
// session.set_quant and session.set_qual are automatically assigned
```

### Getting Messages for a Session
```javascript
// GET /api/sessions/:sessionId/messages
const response = await fetch(`/api/sessions/${sessionId}/messages`);
const data = await response.json();

console.log(`Quantitative messages: ${data.quantitativeMessages.length}`);
console.log(`Qualitative messages: ${data.qualitativeMessages.length}`);
```

### Managing and Analyzing Sessions
```bash
# Analyze current session distribution
node scripts/analyze-sessions.js analyze

# Check what the next assignment would be
node scripts/analyze-sessions.js next

# View messages from a specific set combination  
node scripts/manage-sets.js get 4 11 10
```

## Benefits

1. **Balanced Distribution**: Ensures even distribution of participants across different message sets
2. **Automatic Assignment**: No manual set selection required
3. **Flexible Querying**: Separate quantitative and qualitative message retrieval
4. **Scalable**: Handles any number of sets and participants
5. **Auditable**: Full tracking of session assignments and distributions

## Files Modified/Created

### Database Schema
- `server/database/schema.sql` - Updated with new columns and functions

### Server Endpoints  
- `server/server.js` - Updated session creation and added message retrieval endpoint

### Management Utilities
- `server/scripts/analyze-sessions.js` - New utility for analyzing session distribution
- `server/scripts/manage-sets.js` - Updated for new two-column set structure
- `server/scripts/import-csv.js` - Updated for new column structure

## Testing

All functionality has been tested including:
- ✅ Set assignment logic (priority-based balancing)
- ✅ Message retrieval by set combination  
- ✅ API endpoint responses
- ✅ Database function performance
- ✅ Multi-session distribution balancing

The system is ready for production use with the merged dataset containing 133 messages across 26 different set combinations.
