<template>
  <iframe
    ref="frame"
    class="mission-artifact-frame"
    :srcdoc="srcdoc"
    :src="artifact.kind === 'html-url' ? artifact.url : undefined"
    sandbox="allow-scripts allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"
    allow="fullscreen; autoplay"
    allowfullscreen
    referrerpolicy="no-referrer"
    title="Interactive mission"
  ></iframe>
</template>

<script>
import {
  GM_MISSION_EVENTS,
  ensureGmMissionBridge,
  isGmMissionMessage,
} from "@/lib/missionArtifact";

/**
 * Renders a mission artifact (a complete standalone HTML document) in an
 * isolated, sandboxed iframe. No allow-same-origin: the artifact runs with
 * an opaque origin and cannot touch Firebase auth, cookies, storage or the
 * parent DOM. CDN <script src> libraries (three.js, GSAP) load normally.
 *
 * Listens for the gm-mission postMessage bridge and re-emits as Vue events:
 * start / progress / complete. Messages are validated by source window and
 * envelope shape — never by origin (an opaque origin serializes to "null").
 */
export default {
  name: "MissionArtifactFrame",
  props: {
    // MissionArtifact descriptor from resolveMissionContent()
    artifact: {
      type: Object,
      required: true,
      validator: (a) => ["html-inline", "html-url"].includes(a.kind),
    },
  },
  computed: {
    srcdoc() {
      // legacy artifacts (built before the template emitted bridge events)
      // get the completion shim injected so the host hears #completeBtn
      return this.artifact.kind === "html-inline"
        ? ensureGmMissionBridge(this.artifact.html)
        : undefined;
    },
  },
  mounted() {
    this.onMessage = (event) => {
      if (!this.$refs.frame || event.source !== this.$refs.frame.contentWindow) return;
      if (!isGmMissionMessage(event.data)) return;
      switch (event.data.type) {
        case GM_MISSION_EVENTS.START:
          this.$emit("start");
          break;
        case GM_MISSION_EVENTS.PROGRESS:
          this.$emit("progress", event.data.payload || {});
          break;
        case GM_MISSION_EVENTS.COMPLETE:
          this.$emit("complete");
          break;
      }
    };
    window.addEventListener("message", this.onMessage);
  },
  beforeDestroy() {
    window.removeEventListener("message", this.onMessage);
  },
};
</script>

<style lang="scss" scoped>
.mission-artifact-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background-color: var(--v-background-base);
}
</style>
