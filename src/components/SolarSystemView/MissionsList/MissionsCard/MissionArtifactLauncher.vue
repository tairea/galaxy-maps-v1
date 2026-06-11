<template>
  <div class="artifact-launcher" :class="{ disabled: disabled }">
    <p class="text-overline missionAccent--text chip-row">
      <v-icon small color="missionAccent" class="mr-1">mdi-cube-outline</v-icon>
      INTERACTIVE MISSION
    </p>
    <p v-if="synopsis" class="synopsis">{{ synopsis }}</p>
    <p v-if="disabled" class="text-overline locked-label">LOCKED</p>
    <MissionArtifactPlayerDialog
      v-else
      :artifact="artifact"
      :title="task.title"
      :button-label="buttonLabel"
      :disabled="disabled"
      @artifact-complete="$emit('artifact-complete')"
    />
  </div>
</template>

<script>
import MissionArtifactPlayerDialog from "@/components/Dialogs/MissionArtifactPlayerDialog.vue";
import { resolveMissionContent } from "@/lib/missionArtifact";

/**
 * Launch panel shown inside the missions accordion for artifact-type
 * missions. Deliberately static — no live preview — so expanding panels
 * never boots WebGL contexts. The player itself runs in a fullscreen
 * dialog via MissionArtifactPlayerDialog.
 */
export default {
  name: "MissionArtifactLauncher",
  components: { MissionArtifactPlayerDialog },
  props: {
    task: { type: Object, required: true },
    buttonLabel: { type: String, default: "LAUNCH MISSION" },
    disabled: { type: Boolean, default: false },
  },
  computed: {
    artifact() {
      const resolved = resolveMissionContent(this.task);
      return resolved.mode === "artifact" ? resolved.artifact : { kind: "html-inline", html: "" };
    },
    synopsis() {
      // description holds the mission's high-level synopsis for artifact
      // missions (the artifact itself lives in missionInstructionsHtmlString)
      const description = (this.task.description || "").trim();
      return description.startsWith("<") ? "" : description;
    },
  },
};
</script>

<style lang="scss" scoped>
.artifact-launcher {
  border: 1px dashed var(--v-missionAccent-base);
  padding: 20px;
  margin: 10px 20px;
  color: var(--v-missionAccent-base);

  &.disabled {
    opacity: 0.6;
  }

  p {
    margin: 0px 0px 8px 0px !important;
  }

  .chip-row {
    display: flex;
    align-items: center;
  }

  .synopsis {
    font-size: 0.9rem;
  }

  .locked-label {
    opacity: 0.7;
  }
}
</style>
