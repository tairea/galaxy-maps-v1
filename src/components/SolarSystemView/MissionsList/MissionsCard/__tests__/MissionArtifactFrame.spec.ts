import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import MissionArtifactFrame from "../MissionArtifactFrame.vue";

import type { MissionArtifact } from "@/lib/missionArtifact";

const ARTIFACT: MissionArtifact = {
  kind: "html-inline",
  html: "<!DOCTYPE html><html><body>hi</body></html>",
};

function mountFrame(artifact: MissionArtifact = ARTIFACT) {
  return mount(MissionArtifactFrame, { propsData: { artifact } });
}

/** Dispatch a window message as if it came from the iframe's content window. */
function postFromFrame(wrapper: ReturnType<typeof mount>, data: unknown, source?: unknown) {
  const iframe = wrapper.find("iframe").element as HTMLIFrameElement;
  const event = new MessageEvent("message", { data });
  // MessageEvent.source is read-only; override for the test.
  Object.defineProperty(event, "source", {
    value: source === undefined ? iframe.contentWindow : source,
  });
  window.dispatchEvent(event);
}

let wrapper: ReturnType<typeof mount> | null = null;
afterEach(() => {
  wrapper?.destroy();
  wrapper = null;
});

describe("MissionArtifactFrame", () => {
  it("renders a sandboxed iframe with srcdoc and no allow-same-origin", () => {
    wrapper = mountFrame();
    const iframe = wrapper.find("iframe");
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes("srcdoc")).toBe(ARTIFACT.html);
    const sandbox = iframe.attributes("sandbox") || "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(iframe.attributes("allow")).toContain("fullscreen");
    expect(iframe.attributes("referrerpolicy")).toBe("no-referrer");
  });

  it("uses src instead of srcdoc for html-url artifacts", () => {
    wrapper = mountFrame({ kind: "html-url", url: "https://example.com/m.html" });
    const iframe = wrapper.find("iframe");
    expect(iframe.attributes("src")).toBe("https://example.com/m.html");
    expect(iframe.attributes("srcdoc")).toBeUndefined();
  });

  it("emits complete for a valid gm-mission message from the frame", () => {
    wrapper = mountFrame();
    postFromFrame(wrapper, { source: "gm-mission", version: 1, type: "gm:mission-complete" });
    expect(wrapper.emitted("complete")).toHaveLength(1);
  });

  it("emits start and progress events with payload", () => {
    wrapper = mountFrame();
    postFromFrame(wrapper, { source: "gm-mission", version: 1, type: "gm:mission-start" });
    postFromFrame(wrapper, {
      source: "gm-mission",
      version: 1,
      type: "gm:mission-progress",
      payload: { stepIndex: 2, totalSteps: 7 },
    });
    expect(wrapper.emitted("start")).toHaveLength(1);
    expect(wrapper.emitted("progress")?.[0][0]).toEqual({ stepIndex: 2, totalSteps: 7 });
  });

  it("ignores messages from other windows", () => {
    wrapper = mountFrame();
    postFromFrame(
      wrapper,
      { source: "gm-mission", version: 1, type: "gm:mission-complete" },
      window, // wrong source window
    );
    expect(wrapper.emitted("complete")).toBeUndefined();
  });

  it("ignores malformed envelopes", () => {
    wrapper = mountFrame();
    postFromFrame(wrapper, { source: "evil", version: 1, type: "gm:mission-complete" });
    postFromFrame(wrapper, "gm:mission-complete");
    postFromFrame(wrapper, { source: "gm-mission", version: 1, type: "gm:other" });
    expect(wrapper.emitted("complete")).toBeUndefined();
  });

  it("removes the message listener on destroy", () => {
    wrapper = mountFrame();
    const iframe = wrapper.find("iframe").element as HTMLIFrameElement;
    const contentWindow = iframe.contentWindow;
    wrapper.destroy();
    const event = new MessageEvent("message", {
      data: { source: "gm-mission", version: 1, type: "gm:mission-complete" },
    });
    Object.defineProperty(event, "source", { value: contentWindow });
    window.dispatchEvent(event);
    expect(wrapper.emitted("complete")).toBeUndefined();
    wrapper = null;
  });
});
