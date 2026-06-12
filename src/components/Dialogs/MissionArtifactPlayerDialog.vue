<template>
  <v-dialog v-model="dialog" fullscreen persistent transition="dialog-bottom-transition">
    <template v-slot:activator="{ on, attrs }">
      <v-btn
        outlined
        :color="buttonColor"
        class="launch-button"
        :disabled="disabled"
        v-bind="attrs"
        v-on="on"
      >
        <v-icon left small>{{ "mdi-rocket-launch-outline" }}</v-icon>
        {{ buttonLabel }}
      </v-btn>
    </template>

    <div class="player-container">
      <div class="player-bar">
        <p class="text-overline missionAccent--text player-title">
          {{ title }}
        </p>
        <p v-if="playerFinished" class="text-overline baseAccent--text finished-hint">
          MISSION PLAYER FINISHED — CONFIRM YOUR COMPLETION BELOW
        </p>
        <v-btn outlined small color="missionAccent" @click="close">
          <v-icon left small>mdi-close</v-icon>
          EXIT
        </v-btn>
      </div>
      <div class="player-stage">
        <MissionArtifactFrame
          v-if="dialog"
          :artifact="artifact"
          @start="$emit('start')"
          @progress="$emit('progress', $event)"
          @complete="onComplete"
        />
      </div>
    </div>
  </v-dialog>
</template>

<script>
import MissionArtifactFrame from "@/components/SolarSystemView/MissionsList/MissionsCard/MissionArtifactFrame.vue";

/**
 * Fullscreen host for an interactive mission artifact. The iframe only
 * mounts while the dialog is open (v-if) so nothing loads until launch and
 * the 3D player is torn down on exit.
 *
 * When the artifact signals gm:mission-complete, the dialog does NOT write
 * anything — it shows a confirmation hint, closes, and emits
 * `artifact-complete` so the host card can prompt the existing completion
 * flow (MARK AS COMPLETED / SUBMIT WORK).
 */
export default {
  name: "MissionArtifactPlayerDialog",
  components: { MissionArtifactFrame },
  props: {
    artifact: { type: Object, required: true },
    title: { type: String, default: "Interactive mission" },
    buttonLabel: { type: String, default: "LAUNCH MISSION" },
    buttonColor: { type: String, default: "missionAccent" },
    disabled: { type: Boolean, default: false },
  },
  data: () => ({
    dialog: false,
    playerFinished: false,
  }),
  watch: {
    dialog(open) {
      if (open) this.playerFinished = false;
    },
  },
  methods: {
    onComplete() {
      if (this.playerFinished) return;
      this.playerFinished = true;
      // Give the learner a beat to read the in-player completion screen,
      // then hand back to the platform's completion flow.
      setTimeout(() => {
        this.close();
        this.$emit("artifact-complete");
      }, 1500);
    },
    close() {
      this.dialog = false;
    },
  },
};
</script>

<style lang="scss" scoped>
.player-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--v-background-base);
}

.player-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--v-missionAccent-base);

  .player-title {
    margin: 0px !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .finished-hint {
    margin: 0px !important;
  }
}

.player-stage {
  flex: 1;
  min-height: 0;
}

.launch-button {
  width: 100%;
}
</style>
