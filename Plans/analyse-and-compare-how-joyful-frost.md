# HTML Artifact Mission Rendering — Implementation Plan

## Context

The gm-agent pipeline (v2, Feb 2026+) now authors missions as **complete single-file interactive HTML documents** — step-gated 3D "mission players" (~15–35KB each) with inline CSS, three.js r128 + GSAP 3.12.5 via cdnjs CDN, fullscreen start/exit, and Next/Back navigation. Example repo: `~/galaxy-maps/your-island-runner-may2026/missions/star_N/MISSION_N_M.html` (33 missions). The orchestrator embeds each file in `missionInstructionsHtmlString` and saves via the galaxy-maps MCP → `saveGalaxyMap` callable → `courses/{courseId}/topics/{topicId}/tasks/{taskId}`.

**Verified live in Firestore** (project `galaxy-maps-ac367`):
- v2 course "Your Island Runner" (`2UJFAJinrrTKiwD7Ibhm`): tasks carry full `<!DOCTYPE html>` docs (14–18KB) in `missionInstructionsHtmlString`.
- Legacy course "ISLAND PLACE WEBSITE" (`8fxsjdWMRMNsk8nusZI3`): tasks carry Quill HTML fragments (`<p>`, `ql-video` YouTube iframes) in `description`.

**The bug:** all three render components resolve `missionInstructionsHtmlString || description` and inject via `v-html`. A full HTML document injected this way is dead — `v-html` never executes `<script>` tags (3D player won't run), and its `<style>` block leaks into the app globally. The orchestrator sends `missionRenderMode: "iframe"` but `saveGalaxyMap`'s `planetData` (functions/src/courseManagement.ts:2551–2561) drops it.

**Decisions made (with Ian):**
1. **Renderer:** plain sandboxed `<iframe srcdoc>` now, behind an engine seam (normalized artifact descriptor) so a Sandpack/CodeSandbox-style engine can slot in later if artifacts go multi-file/npm. No new dependencies; CDN scripts work fine in a sandboxed iframe.
2. **Completion:** player's Complete → postMessage → host **prompts** the existing MissionCompletedDialog (no auto Firestore writes from iframe content; XP/unlock/xAPI flow unchanged).
3. **Scope:** Phases 1 + 2. Storage offload (Firestore 1MiB limit) deferred — largest artifact today is ~32KB.

Legacy missions must render byte-for-byte as they do today.

---

## Phase 1 — Render artifacts + persist the flag

### New: `src/lib/missionArtifact.ts`

```ts
export type MissionArtifact =
  | { kind: "html-inline"; html: string }   // now: srcdoc
  | { kind: "html-url"; url: string };      // future: Storage offload
  // future: { kind: "sandpack"; files: Record<string,string> }

export function isArtifactHtml(content: string): boolean
// /^\s*(?:<!doctype\s+html|<html[\s>])/i — trim BOM/whitespace first

export function resolveMissionContent(task):
  | { mode: "artifact"; artifact: MissionArtifact }
  | { mode: "legacy"; content: string }
// artifact iff task.missionRenderMode === "iframe"
//          OR isArtifactHtml(task.missionInstructionsHtmlString)
// legacy content = task.missionInstructionsHtmlString || task.description || "" (unchanged)
```

Also export the postMessage envelope constants here (`GM_MISSION_SOURCE = "gm-mission"`, message type strings) so Phase 2 has a stable contract. Sniff fallback covers already-published v2 courses lacking the explicit field; Quill/markdown content never starts with `<!doctype html`/`<html`, so legacy is unreachable from the artifact path.

### New: `src/components/SolarSystemView/MissionsList/MissionsCard/MissionArtifactFrame.vue`

The engine. Props: `artifact: MissionArtifact`. Renders:

```html
<iframe
  :srcdoc="artifact.html"
  sandbox="allow-scripts allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"
  allow="fullscreen; autoplay"
  allowfullscreen
  referrerpolicy="no-referrer"
  title="Interactive mission"
/>
```

- **No `allow-same-origin`** → opaque origin: artifact can't touch Firebase auth/cookies/localStorage/parent DOM. cdnjs scripts + Google Fonts still load (classic scripts aren't CORS-gated; both CDNs serve `ACAO: *`).
- Owns the `window message` listener (add on mount, remove on destroy). Validate `event.source === iframeEl.contentWindow` + envelope shape — never trust `event.origin` (it's `"null"` from opaque origin). Emits `start` / `progress` / `complete`.
- Switches on `artifact.kind` (`html-inline` → `:srcdoc`; `html-url` → `:src` later).

### New: `src/components/SolarSystemView/MissionsList/MissionsCard/MissionArtifactLauncher.vue`

Static launch panel rendered inside the accordion: "INTERACTIVE MISSION" chip + mission synopsis (`task.description` when it isn't itself the artifact) + LAUNCH MISSION button, `disabled` prop for locked missions. Follow existing card idiom (`missionAccent` borders, `text-overline`). **No inline live preview** — avoids booting a WebGL/three.js context per expanded panel; the player is designed for full viewport.

### New: `src/components/Dialogs/MissionArtifactPlayerDialog.vue`

`v-dialog fullscreen` (Dialogs/ convention): host top bar (mission title + EXIT button) + `<MissionArtifactFrame v-if="dialog">` so the iframe mounts only while open and tears down on close. The artifact's own in-frame `requestFullscreen` works (user gesture inside the iframe + `allow="fullscreen"`); if blocked/Esc'd, the fullscreen dialog already fills the viewport — graceful degradation. Relays `complete` upward.

### Modified files

| File | Change |
|------|--------|
| `src/components/SolarSystemView/MissionsList/MissionsCard/ActiveMissionsCard.vue` (v-html line 3, resolver 94–97) | Branch on `resolveMissionContent(task)`: artifact → `<MissionArtifactLauncher>` replacing the v-html div; REQUEST HELP + MARK AS COMPLETED row stays exactly as-is. Legacy path untouched. |
| `src/components/SolarSystemView/MissionsList/MissionsCard/SelectedMissionsCard.vue` (resolver line 69) | Artifact → launcher: replayable when completed/inreview, disabled placeholder when locked. Legacy untouched. |
| `src/components/SolarSystemView/MissionsList/MissionsCard.vue` (teacher v-html line ~70, resolver 438) | Teacher description block → launcher (PREVIEW label) when artifact. Submission-instructions v-html (line 284) untouched. |
| `functions/src/courseManagement.ts` (planet type ~2490, `planetData` ~2551) | Add `missionRenderMode?: string` to the planet type; persist whitelisted value: `missionRenderMode: planet.missionRenderMode === "iframe" ? "iframe" : null`. MCP server (`~/code/galaxy-maps-mcp/`) passes planets through verbatim — no change there. Deploy via `/deploy-functions`. |
| `src/components/Dialogs/CreateEditDeleteMissionDialog.vue` (edit-init 618–619, AI-refine 682–685) | Guard both mangle paths: when task resolves to artifact, do NOT load HTML into Quill — show "INTERACTIVE HTML MISSION (AI-authored)" badge + size + PREVIEW button (reuse MissionArtifactPlayerDialog) + optional replace-file `v-file-input` (`.html`, validate with `isArtifactHtml`, <900KB). AI-refine must not overwrite `missionInstructionsHtmlString` on artifact missions. Title/duration/submissionRequired/color/delete keep working. |

### Tests (Vitest + jsdom + @vue/test-utils@1, already in devDeps; no unit tests exist yet — vitest config excludes only `e2e/*`)

- `src/lib/__tests__/missionArtifact.spec.ts` — sniffer: full doctype doc / `<html lang>` / leading whitespace+BOM → artifact; Quill fragment with ql-video / markdown / empty → legacy; explicit `missionRenderMode: "iframe"` precedence.
- `MissionArtifactFrame.spec.ts` — exact sandbox string present, no `allow-same-origin`; srcdoc set; message listener ignores wrong-source/wrong-envelope events; emits `complete` on valid synthetic `MessageEvent`.

---

## Phase 2 — Completion bridge

**Protocol** (artifact → host, `targetOrigin "*"` — opaque origin can't do better; host never sends secrets in):

```ts
{ source: "gm-mission", version: 1, type: "gm:mission-start" }
{ source: "gm-mission", version: 1, type: "gm:mission-progress",
  payload: { stepId, stepIndex, totalSteps } }
{ source: "gm-mission", version: 1, type: "gm:mission-complete" }
```

1. **Template update** — `~/.claude/skills/gm-agent-06-mission-builder/templates/mission_player_template.html` (completeBtn handler ~line 420, startBtn handler): add `try { window.parent.postMessage({source:'gm-mission',version:1,type:'gm:mission-complete'}, '*'); } catch(e){}` (and `gm:mission-start`). Add skill gotchas: no localStorage (opaque origin throws), postMessage target `"*"`.
2. **Host behavior** — `MissionArtifactPlayerDialog.vue` + `ActiveMissionsCard.vue`: on `complete`, show "Mission player finished — confirm your completion" state, close the dialog, auto-open/pulse the existing `MissionCompletedDialog`. **No automatic Firestore writes.** Already-published artifacts (no postMessage) still complete via the always-present host button.
3. Optional: log `gm:mission-progress` to xAPI via `src/lib/veracityLRS.ts` later (no-op log is fine in this phase).

## Phase 3 (deferred, documented for later)

`saveGalaxyMap` writes artifacts >700KB to Storage `mission-artifacts/{courseId}/{topicId}/{taskId}.html`, persists `missionArtifactUrl`, nulls the inline string. Frontend already handles it via the `html-url` descriptor kind + `:src` branch. `src`-based iframes also escape parent-CSP inheritance (no CSP configured today; if one is added, srcdoc frames need `script-src https://cdnjs.cloudflare.com`).

---

## Verification

1. `npm run test:unit` — new specs pass.
2. **Live artifact course** ("Your Island Runner" `2UJFAJinrrTKiwD7Ibhm`, as enrolled student): mission panels show launch panel (no raw doctype text, no leaked styles); LAUNCH → fullscreen dialog, three.js scene animates, in-frame Start fullscreen works, Next/Back steps work; EXIT closes; MARK AS COMPLETED still awards XP + unlocks next mission. DevTools: iframe origin `null`, no cdnjs CORS errors. Verify visually with **Interceptor** (`interceptor open <url>`), per PAI rules.
3. **Legacy regression** (`8fxsjdWMRMNsk8nusZI3`): ql-video YouTube embed renders identically; markdown missions still convert via streaming-markdown; submit-for-review flow unchanged.
4. **Teacher**: edit dialog on artifact mission → badge shown, Quill NOT populated with artifact HTML; saving title/duration leaves `missionInstructionsHtmlString` intact (check Firestore). Legacy editing unchanged.
5. **Persistence**: `save_galaxy_map` against the emulator with `missionRenderMode: "iframe"` planets → field on task docs.
6. **Phase 2**: rebuild one mission from the updated template → finishing the player prompts MissionCompletedDialog; an old artifact still completes via the host button.

## Key references

- Render sites: `ActiveMissionsCard.vue:3,94–97,169–212`; `MissionsCard.vue:70,284,438,540`; `SelectedMissionsCard.vue:69`
- Persist fix: `functions/src/courseManagement.ts:2490,2551–2561`
- Quill-mangle guards: `CreateEditDeleteMissionDialog.vue:618–619,682–685`
- Completion side effects (unchanged): `MissionCompletedDialog.vue` markAsCompleted/submitWorkForReview
- Template to update (Phase 2): `~/.claude/skills/gm-agent-06-mission-builder/templates/mission_player_template.html:~420`
- MCP server (no change needed): `~/code/galaxy-maps-mcp/src/{server,validate,firebase}.ts`
