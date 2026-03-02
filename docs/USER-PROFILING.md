# User Preference Profiling

CozoDB Memory includes Mem0-style user preference profiling for personalized memory retrieval.

## Overview

The system maintains a persistent profile of the user (preferences, dislikes, work style) via the specialized entity `global_user_profile`.

**Benefits:**
- Personalization without manual search ("I know you prefer TypeScript")
- Automatic 50% search boost for user-related results
- Persistent across sessions
- Supports both implicit and explicit preference management

**Mechanism:**
- All observations assigned to `global_user_profile` receive a significant boost in search and context queries
- User profile is automatically included in context when relevant
- Profile is automatically created on first start

## Manual Profile Editing

You can directly edit the user profile using the `edit_user_profile` MCP tool:

### View Current Profile

```json
{}
```

### Update Metadata

```json
{
  "metadata": {
    "timezone": "Europe/Berlin",
    "language": "de",
    "work_hours": "9-17"
  }
}
```

### Add Preferences

```json
{
  "observations": [
    { "text": "Prefers TypeScript over JavaScript" },
    { "text": "Likes concise documentation" },
    { "text": "Prefers functional programming style" }
  ]
}
```

### Clear and Reset Preferences

```json
{
  "clear_observations": true,
  "observations": [
    { "text": "New preference after reset" }
  ]
}
```

### Update Name and Type

```json
{
  "name": "Developer Profile",
  "type": "UserProfile"
}
```

## Implicit Preference Management

You can also use the implicit method via `mutate_memory`:

```json
{
  "action": "add_observation",
  "entity_id": "global_user_profile",
  "text": "Prefers dark mode for code editors"
}
```

## How Search Boost Works

### Automatic Boosting

When searching, results linked to `global_user_profile` receive a 50% score boost:

```typescript
// Example: User has preference "Prefers TypeScript"
// Search query: "programming languages"

// Without boost:
// 1. Python (score: 0.85)
// 2. TypeScript (score: 0.80)
// 3. JavaScript (score: 0.75)

// With boost (TypeScript linked to user profile):
// 1. TypeScript (score: 0.80 * 1.5 = 1.20) ← Boosted!
// 2. Python (score: 0.85)
// 3. JavaScript (score: 0.75)
```

### Context Inclusion

The `context` action automatically includes user profile when relevant:

```json
{
  "action": "context",
  "query": "What should I use for the new project?"
}
```

Returns context including user preferences, enabling personalized recommendations.

## Use Cases

### Developer Preferences

```json
{
  "observations": [
    { "text": "Prefers TypeScript over JavaScript" },
    { "text": "Uses VS Code as primary editor" },
    { "text": "Follows functional programming principles" },
    { "text": "Prefers Jest for testing" },
    { "text": "Uses ESLint with strict rules" }
  ]
}
```

### Work Style

```json
{
  "observations": [
    { "text": "Works best in morning hours" },
    { "text": "Prefers async communication" },
    { "text": "Likes detailed documentation" },
    { "text": "Prefers pair programming for complex tasks" }
  ]
}
```

### Project Context

```json
{
  "observations": [
    { "text": "Currently working on authentication system" },
    { "text": "Main focus: backend development" },
    { "text": "Team: 5 developers" },
    { "text": "Tech stack: Node.js, PostgreSQL, Redis" }
  ]
}
```

### Learning Preferences

```json
{
  "observations": [
    { "text": "Learns best through examples" },
    { "text": "Prefers video tutorials over text" },
    { "text": "Likes hands-on practice" },
    { "text": "Prefers incremental learning" }
  ]
}
```

## Testing User Profiling

Test scripts for user preference profiling:

```bash
# Test user preference profiling and search boost
npx ts-node test-user-pref.ts

# Test manual user profile editing
npx ts-node src/test-user-profile.ts

# Test context retrieval with user profile
npx ts-node src/test-context.ts
```

## Advanced: Profile Metadata

The user profile supports rich metadata for advanced personalization:

```json
{
  "metadata": {
    "timezone": "Europe/Berlin",
    "language": "de",
    "work_hours": "9-17",
    "notification_preferences": {
      "email": true,
      "slack": false
    },
    "skill_level": {
      "typescript": "expert",
      "python": "intermediate",
      "rust": "beginner"
    },
    "project_context": {
      "current_project": "auth-system",
      "role": "backend-lead"
    }
  }
}
```

## Integration with Other Features

### Session Management

User profile is automatically boosted in session context:

```json
{
  "action": "context",
  "query": "What should I work on next?",
  "session_id": "current-session"
}
```

Returns context combining session history with user preferences.

### Proactive Suggestions

Proactive suggestions consider user profile:

```typescript
// User preference: "Prefers TypeScript"
// Suggestion: "Consider using TypeScript for new project"
// Confidence: HIGH (based on user profile)
```

### Adaptive Query Fusion

Query fusion adapts to user preferences:

```typescript
// User preference: "Prefers detailed explanations"
// Query: "How does authentication work?"
// → Automatically selects EXPLAINER intent
// → Uses weights optimized for detailed explanations
```

## Privacy & Data Control

### Local-First

- All user profile data is stored locally in CozoDB
- No external services or cloud sync
- Complete data ownership

### Export User Profile

```json
{
  "action": "export_memory",
  "format": "json",
  "entityTypes": ["User"]
}
```

### Clear User Profile

```json
{
  "action": "delete_entity",
  "entity_id": "global_user_profile"
}
```

Note: Profile will be recreated automatically on next start.

### Backup User Profile

```json
{
  "action": "snapshot_create",
  "metadata": { "label": "user_profile_backup" }
}
```

## See Also

- [API Reference](API.md) - Complete API documentation
- [Features](FEATURES.md) - Detailed feature documentation
- [Architecture](ARCHITECTURE.md) - System architecture
