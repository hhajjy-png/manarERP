# Codex VS Code — Helper Usage Guide

Codex is the local IDE assistant. It is available inside VS Code and provides
inline assistance during active development. It is NOT a reviewer or a gate-keeper.

---

## What to Use Codex For

| Use Case | Example |
|----------|---------|
| Explain a file or function | "What does `BaseRepository.ts` do?" |
| Quick code question | "What's the Prisma syntax for a left join?" |
| Small local edits | "Rename this variable across this file" |
| Debugging help | "Why might this TypeScript error occur?" |
| Code navigation | "Where is `requirePermission` called?" |
| Review selected snippet | "Does this Zod schema handle empty strings?" |
| Inline autocomplete | Standard IDE completion |

---

## What NOT to Use Codex For

| Do NOT use Codex for | Reason |
|----------------------|--------|
| Final architecture review | Use Gemini Web |
| Security review | Use Gemini Web |
| Approving a merge | Use Gemini Web |
| Writing production migrations | Use Claude Code with explicit approval |
| Deciding on feature scope | Use ChatGPT |
| Full implementation of a multi-file feature | Use Claude Code |

---

## Suggested Codex Prompts

### Explain a file
```
Explain what this file does and how it fits into the manarERP backend module pattern.
Focus on: what it exports, what it depends on, and any non-obvious behavior.
```

### Review a snippet
```
Review this code snippet for correctness and adherence to the manarERP conventions:
- Module pattern: routes → controller → service → schema
- Zod validation at request boundary
- successResponse / errorResponse helpers
- Permission keys in format <module>.<action>
```

### Debug a TypeScript error
```
I'm seeing this TypeScript error in manarERP:
<paste error>

The relevant file is: <path>
<paste relevant code>

What is the likely cause and how should I fix it?
```

### Quick Prisma question
```
In Prisma 5 with SQLite, what is the correct syntax to:
<describe the query need>

The relevant model is:
<paste model definition>
```

---

## Notes

- Codex has no awareness of the full project state unless you paste context into the prompt.
- For cross-file analysis or architectural questions, Claude Code has full repo access and is better suited.
- Never treat a Codex answer as a replacement for Claude Code's full implementation or Gemini Web's review.
