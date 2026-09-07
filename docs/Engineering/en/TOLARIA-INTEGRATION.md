# Shell-Agnostic Integration

> aing is **shell-agnostic**: it does not depend on Tolaria, Obsidian, or any specific note-taking app.
> It works with plain Markdown files + Git + Node.js.

## Integration Model

aing reads and writes Markdown files directly from the filesystem. Any tool that can produce or consume Markdown files can integrate with aing.

```
┌─────────────────────┐      ┌──────────────────────┐
│  Any MD Editor      │      │  aing Node Scripts   │
│  (Tolaria/Obsidian/ │◄────│  (metabolism engine) │
│   VS Code/vim/etc.) │      │                      │
└─────────────────────┘      └──────────────────────┘
         │                            │
         ▼                            ▼
   raw/*.md files            wiki/entities/*.md
   (user writes)             (aing compiles)
```

- **User side**: Write Markdown files in `raw/` directory
- **aing side**: Reads `raw/*.md`, compiles to `wiki/entities/*.md` and `wiki/links/*.md`
- **Shared**: Plain Markdown files on the filesystem

## Supported Shells

| Shell | How to integrate |
|---|---|
| **Plain text editor** | Write `.md` files in `raw/`, run `node src/compile.js` |
| **Tolaria** | Point Tolaria at the same directory; aing reads the MD files |
| **Obsidian** | Point Obsidian vault at the same directory; aing reads the MD files |
| **VS Code** | Edit `.md` files directly; aing reads them |
| **Any Git repo** | aing uses Git for version control (compile.js does `git commit`) |

## What Does NOT Exist

The following integration features are described in older docs but **do not exist in code**:

- **chokidar file watching** — aing does not watch files automatically. Run scripts manually.
- **better-sqlite3 integration** — aing uses sql.js (in-memory SQLite), not better-sqlite3
- **API server** — there is no HTTP API for bidirectional sync
- **Bidirectional sync** — aing writes to `wiki/` but does not sync back to the editor
- **Tolaria-specific integration** — aing treats all MD files the same, regardless of source
- **Git hook integration** — no post-commit hooks are set up
- **Webhook integration** — no webhook endpoints exist

## Pure MD Mode

aing runs entirely on plain Markdown files:

```
my-knowledge-base/
├── raw/              ← User writes raw .md files here
├── wiki/
│   ├── entities/     ← aing compiles entities here
│   ├── links/        ← aing creates links here
│   └── type-index/   ← aing creates type indexes here
├── mustard-seeds/
│   └── compressed/   ← Compressed mustard seeds
├── pruned/
│   └── archive/      ← Pruned entities
├── knowledge.db      ← sql.js SQLite database
└── logs/             ← Log files
```

No special software required. Just Node.js + Git + Markdown files.
