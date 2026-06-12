import { describe, expect, it } from "vitest";

import {
  GM_MISSION_EVENTS,
  GM_MISSION_SOURCE,
  ensureGmMissionBridge,
  isArtifactHtml,
  isGmMissionMessage,
  resolveMissionContent,
} from "../missionArtifact";

const FULL_DOC = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Mission 1.1</title></head>
<body><canvas></canvas><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script></body>
</html>`;

const QUILL_FRAGMENT =
  '<p>Watch this 👇</p><iframe class="ql-video" frameborder="0" allowfullscreen="true" src="https://www.youtube.com/embed/-zJSem5yl8I?showinfo=0"></iframe>';

describe("isArtifactHtml", () => {
  it("detects a full doctype document", () => {
    expect(isArtifactHtml(FULL_DOC)).toBe(true);
  });

  it("detects a document starting with <html>", () => {
    expect(isArtifactHtml('<html lang="en"><body>hi</body></html>')).toBe(true);
    expect(isArtifactHtml("<html>\n<body></body></html>")).toBe(true);
  });

  it("tolerates leading whitespace and BOM", () => {
    expect(isArtifactHtml("\n\n  " + FULL_DOC)).toBe(true);
    expect(isArtifactHtml("﻿" + FULL_DOC)).toBe(true);
  });

  it("rejects Quill HTML fragments", () => {
    expect(isArtifactHtml(QUILL_FRAGMENT)).toBe(false);
  });

  it("rejects markdown, plain text, empty and non-strings", () => {
    expect(isArtifactHtml("# Mission 1\n\nDo the thing")).toBe(false);
    expect(isArtifactHtml("just text")).toBe(false);
    expect(isArtifactHtml("")).toBe(false);
    expect(isArtifactHtml(null)).toBe(false);
    expect(isArtifactHtml(undefined)).toBe(false);
  });

  it("does not treat <htmlish> words as a document", () => {
    expect(isArtifactHtml("<htmlentity>nope</htmlentity>")).toBe(false);
  });
});

describe("resolveMissionContent", () => {
  it("resolves full-document missionInstructionsHtmlString as artifact (sniff fallback)", () => {
    const result = resolveMissionContent({ missionInstructionsHtmlString: FULL_DOC });
    expect(result.mode).toBe("artifact");
    if (result.mode === "artifact") {
      expect(result.artifact).toEqual({ kind: "html-inline", html: FULL_DOC });
    }
  });

  it("respects explicit missionRenderMode=iframe even without doctype", () => {
    const html = "<div id='app'>custom player</div>";
    const result = resolveMissionContent({
      missionRenderMode: "iframe",
      missionInstructionsHtmlString: html,
    });
    expect(result.mode).toBe("artifact");
  });

  it("prefers missionArtifactUrl when present", () => {
    const result = resolveMissionContent({
      missionArtifactUrl: "https://example.com/mission.html",
      missionInstructionsHtmlString: FULL_DOC,
    });
    expect(result).toEqual({
      mode: "artifact",
      artifact: { kind: "html-url", url: "https://example.com/mission.html" },
    });
  });

  it("falls back to legacy for Quill fragments", () => {
    const result = resolveMissionContent({ missionInstructionsHtmlString: QUILL_FRAGMENT });
    expect(result).toEqual({ mode: "legacy", content: QUILL_FRAGMENT });
  });

  it("falls back to legacy description when no html string", () => {
    expect(resolveMissionContent({ description: "## markdown" })).toEqual({
      mode: "legacy",
      content: "## markdown",
    });
  });

  it("handles null/empty tasks", () => {
    expect(resolveMissionContent(null)).toEqual({ mode: "legacy", content: "" });
    expect(resolveMissionContent({})).toEqual({ mode: "legacy", content: "" });
  });

  it("ignores missionRenderMode=iframe when there is no html content", () => {
    expect(resolveMissionContent({ missionRenderMode: "iframe", description: "text" })).toEqual({
      mode: "legacy",
      content: "text",
    });
  });
});

describe("ensureGmMissionBridge", () => {
  const LEGACY_DOC = `<!DOCTYPE html>
<html><head><title>Legacy</title></head>
<body><button id="completeBtn">✓ Mark Mission as Complete</button>
<script>document.getElementById('completeBtn').addEventListener('click', (e)=>{ e.target.disabled=true; });</script>
</body></html>`;

  it("injects the shim before </body> for legacy artifacts", () => {
    const result = ensureGmMissionBridge(LEGACY_DOC);
    expect(result).toContain(GM_MISSION_EVENTS.COMPLETE);
    expect(result).toContain(GM_MISSION_EVENTS.START);
    expect(result).toContain(GM_MISSION_SOURCE);
    expect(result.indexOf("__gmMissionBridgeShim")).toBeLessThan(result.indexOf("</body>"));
    // original content preserved
    expect(result).toContain('id="completeBtn"');
  });

  it("appends the shim when there is no </body> tag", () => {
    const result = ensureGmMissionBridge("<html><button id='completeBtn'>done</button></html>");
    expect(result).toContain("__gmMissionBridgeShim");
  });

  it("passes through artifacts that already ship the bridge", () => {
    const withBridge = `<!DOCTYPE html><html><body><script>window.parent.postMessage({source:'gm-mission',version:1,type:'gm:mission-complete'},'*');</script></body></html>`;
    expect(ensureGmMissionBridge(withBridge)).toBe(withBridge);
  });

  it("is idempotent", () => {
    const once = ensureGmMissionBridge(LEGACY_DOC);
    expect(ensureGmMissionBridge(once)).toBe(once);
  });

  it("passes through empty strings", () => {
    expect(ensureGmMissionBridge("")).toBe("");
  });
});

describe("isGmMissionMessage", () => {
  it("accepts valid envelopes", () => {
    expect(
      isGmMissionMessage({
        source: GM_MISSION_SOURCE,
        version: 1,
        type: GM_MISSION_EVENTS.COMPLETE,
      }),
    ).toBe(true);
    expect(
      isGmMissionMessage({
        source: GM_MISSION_SOURCE,
        version: 1,
        type: GM_MISSION_EVENTS.PROGRESS,
        payload: { stepIndex: 2, totalSteps: 7 },
      }),
    ).toBe(true);
  });

  it("rejects wrong source, unknown types, and junk", () => {
    expect(isGmMissionMessage({ source: "evil", version: 1, type: "gm:mission-complete" })).toBe(
      false,
    );
    expect(isGmMissionMessage({ source: GM_MISSION_SOURCE, version: 1, type: "gm:hack" })).toBe(
      false,
    );
    expect(isGmMissionMessage(null)).toBe(false);
    expect(isGmMissionMessage("gm:mission-complete")).toBe(false);
    expect(isGmMissionMessage({})).toBe(false);
  });
});
