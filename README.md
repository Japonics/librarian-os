# Librarian OS

A reader and a set of tools for Markdown knowledge repositories. Point it at any repository that has a `librarian-os.json` file and it renders the notes with adjustable type and themes, shows a graph of the relations between notes, searches the full text and turns notes into practice questions, with optional help from Anthropic, OpenAI or Google Gemini models.

Made by [Japonics](https://japonics.io).

## What it does

- **Reads Markdown comfortably.** Five themes (system, light, dark, sepia, high contrast), text size, body and heading fonts from Google Fonts, line height, column width and accent color. Settings stay in the browser.
- **Understands relations.** Optional `.md.json` sidecars give each note an id, typed relations, sources, key terms and questions. The reader shows backlinks, a force graph and a radial mind map that can be copied as Mermaid text.
- **Works with many repositories.** Add a local directory or clone a Git URL. The list is saved on the server, and the top bar switches between repositories.
- **Stays up to date.** The **Refresh** button reloads the open repository from disk and runs `git pull --ff-only` first when it is a git working copy. Switching to a repository that was cloned from a URL pulls it automatically.
- **Searches and tests you.** Full text search on `Ctrl+K`, and a practice mode with Leitner boxes.
- **Generates questions.** Choose a provider (Anthropic, OpenAI, Gemini) and a model on the Settings page. Proposals are saved to the note's sidecar only after you accept them.
- **Checks the repository.** `npm run check` validates the configuration, the sidecars, links, anchors and, when switched on, the table of contents and a dash rule.

## Requirements

Node.js 20 or newer (developed on Node 23) and npm. A modern browser. Git, if you want to add repositories by URL.

## Run it

```bash
npm install
npm run dev -- --repo /absolute/path/to/a/repository
```

Open http://127.0.0.1:5173. Without `--repo`, add a repository from the Settings page. For a production build:

```bash
npm run build
npm start
```

Preparing a repository takes a `librarian-os.json` file and a README in each entry point. See [INSTRUCTIONS.md](INSTRUCTIONS.md).

## Commands

The repository path is the last argument. Without it, the directory where npm was started is used.

| Command | What it does |
| --- | --- |
| `npm run dev [-- --repo PATH_OR_URL]` | Server plus Vite with live reload. `--repo` registers a repository at start. |
| `npm run build` | Type check and production build into `dist/`. |
| `npm start` | Serve the production build. |
| `npm run check -- PATH` | Validate a repository. Exit code 1 on errors. |
| `npm run scaffold -- PATH` | Create the missing sidecars (`--dry` previews). |
| `npm run toc -- PATH` | Write the table of contents file of the repository. |
| `npm run index -- PATH` | Write the library index to `.cache/library-index.json`. |
| `npm test` | Run the unit tests. |

## Configuration of the tool

`librarian-os.config.json` holds the settings of the server. To change a value without editing the tracked file, create `librarian-os.config.local.json` (ignored by git); it is merged over the main file, key by key.

| Key | Meaning |
| --- | --- |
| `port`, `host` | Where the server listens. The default host is `127.0.0.1`. The `PORT` environment variable overrides the port. |
| `dataDir` | Where cloned repositories and `repos.json` (the repository list) are kept. Default `data`. |
| `git.pullOnSwitch` | Pull a repository that was cloned from a URL when you switch to it. Default `true`. |
| `git.pullCooldownSeconds` | Minimum time between automatic pulls of the same repository. Default `60`. The Refresh button ignores it. |
| `ai.enabled` | Master switch for the question generator. |
| `ai.default` | Provider and model used until you choose another one on the Settings page. |
| `ai.maxQuestions` | Upper limit for one request. |
| `ai.providers.<id>` | `label`, `apiKeyEnv` (name of the environment variable that holds the key) and `models` (a list of `id` and optional `label`). The provider ids with an implementation are `anthropic`, `openai` and `gemini`. |

The default model lists were taken from the providers' documentation on 2026-10-27 and will age. Edit them freely: any model id that the provider's API accepts works.

## AI providers

```bash
export ANTHROPIC_API_KEY=<API_KEY>
export OPENAI_API_KEY=<API_KEY>
export GEMINI_API_KEY=<API_KEY>
npm run dev
```

Set the variables of the providers you use. The Settings page shows each provider, whether its key was found, the configured models and which one is in use. Keys are read by the server and never sent to the browser. The server sends the text of one note to the chosen provider when you press "Generate questions", and nothing else.

## Security model

The server is built for one person on one machine and has no login. It binds to the loopback address by default. Several rules limit what it can do:

- The only write to a repository is replacing the `questions` list of one sidecar, after validation against the schema.
- Write requests need an `X-Librarian` header, which a page on another site cannot send.
- Files under `/content/` are limited to images and PDFs inside a registered repository.
- A pull is always `--ff-only`: it never merges, never rewrites local commits and fails instead of touching a diverged copy. Automatic pulls apply only to clones that Librarian OS made itself. A local directory is pulled only when you press Refresh or "Pull and refresh".
- Git URLs are limited to `https://` and `ssh` forms, and git runs without a shell and without prompts.
- A repository added by local path is read in place, so add only directories you trust to be shown.

If you change `host` to expose the server on a network, add authentication first.

## Layout

```text
librarian-os.config.json   settings of the server and the AI providers
schema/                    JSON Schemas for librarian-os.json and the sidecars
src/shared/                types and pure Markdown helpers, used by every part
src/core/                  reading repositories, checks, scaffold, ToC, registry, git
src/cli/                   command line entry point
src/server/                HTTP server, content access, AI providers
src/app/                   the browser application (TypeScript and SCSS)
tests/                     unit tests
```

## License

MIT, see [LICENSE](LICENSE). Copyright (c) 2026 Japonics.

## Limits

- Obsidian-style `[[wikilinks]]` are not supported. Notes use relative Markdown links, and typed relations live in the sidecars.
- The graph is drawn with SVG and is comfortable up to a few hundred notes.
- Search runs in the browser over the whole text of the repository.
- The Gemini and OpenAI providers were written against the SDK typings and have not been run with real keys in this project's tests.
