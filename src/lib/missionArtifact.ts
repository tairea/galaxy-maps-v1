/**
 * Mission artifact detection + descriptor types.
 *
 * v2 agent-built missions store a COMPLETE standalone HTML document
 * (its own <!DOCTYPE html>/<head>/<script>, 3D player via CDN libs) in
 * `missionInstructionsHtmlString`. These must be rendered in an isolated
 * document context (sandboxed <iframe srcdoc>), never injected inline
 * with v-html. Legacy missions (Quill HTML fragments or markdown) keep
 * the existing inline rendering path.
 */

export type MissionArtifact =
  | { kind: "html-inline"; html: string } // rendered via <iframe srcdoc>
  | { kind: "html-url"; url: string }; // future: Firebase Storage offload, <iframe src>

export type MissionContent =
  | { mode: "artifact"; artifact: MissionArtifact }
  | { mode: "legacy"; content: string };

// ---------------------------------------------------------------------------
// postMessage bridge protocol (artifact -> host)
// The artifact runs in an opaque-origin sandbox, so it posts with
// targetOrigin "*" and the host validates event.source + envelope shape
// instead of event.origin (which is "null").
// ---------------------------------------------------------------------------

export const GM_MISSION_SOURCE = "gm-mission";
export const GM_MISSION_PROTOCOL_VERSION = 1;

export const GM_MISSION_EVENTS = {
  START: "gm:mission-start",
  PROGRESS: "gm:mission-progress",
  COMPLETE: "gm:mission-complete",
} as const;

export interface GmMissionMessage {
  source: typeof GM_MISSION_SOURCE;
  version: number;
  type: (typeof GM_MISSION_EVENTS)[keyof typeof GM_MISSION_EVENTS];
  payload?: { stepId?: string; stepIndex?: number; totalSteps?: number };
}

/** Type guard for messages arriving from a mission artifact iframe. */
export function isGmMissionMessage(data: unknown): data is GmMissionMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.source === GM_MISSION_SOURCE &&
    typeof msg.version === "number" &&
    typeof msg.type === "string" &&
    Object.values(GM_MISSION_EVENTS).includes(msg.type as never)
  );
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const ARTIFACT_HTML_PATTERN = /^\s*(?:<!doctype\s+html|<html[\s>])/i;

/**
 * True when content is a complete standalone HTML document (an artifact),
 * as opposed to a Quill/markdown fragment. Quill output never starts with
 * a doctype or <html> tag, so legacy content can't match.
 */
export function isArtifactHtml(content: unknown): boolean {
  if (typeof content !== "string" || !content) return false;
  // Strip a UTF-8 BOM if present before sniffing.
  return ARTIFACT_HTML_PATTERN.test(content.replace(/^\uFEFF/, ""));
}

interface TaskLike {
  missionRenderMode?: string | null;
  missionInstructionsHtmlString?: string | null;
  missionArtifactUrl?: string | null;
  description?: string | null;
}

/**
 * Resolve a task's content into either an artifact descriptor (isolated
 * iframe rendering) or the legacy inline string. The explicit
 * `missionRenderMode: "iframe"` field covers courses saved after the flag
 * was persisted; the doctype sniff covers already-published v2 courses.
 */
export function resolveMissionContent(task: TaskLike | null | undefined): MissionContent {
  if (task) {
    if (typeof task.missionArtifactUrl === "string" && task.missionArtifactUrl) {
      return { mode: "artifact", artifact: { kind: "html-url", url: task.missionArtifactUrl } };
    }
    const html = task.missionInstructionsHtmlString;
    if (
      typeof html === "string" &&
      html &&
      (task.missionRenderMode === "iframe" || isArtifactHtml(html))
    ) {
      return { mode: "artifact", artifact: { kind: "html-inline", html } };
    }
  }
  return {
    mode: "legacy",
    content: task?.missionInstructionsHtmlString || task?.description || "",
  };
}
