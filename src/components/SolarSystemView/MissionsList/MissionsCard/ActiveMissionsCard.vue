<template>
  <div class="active-mission-card" :class="{ mobile: isMobile }">
    <MissionArtifactLauncher
      v-if="isArtifactMission"
      :task="task"
      @artifact-complete="onArtifactComplete"
    />
    <div v-else v-html="renderedTaskDescription" class="task-description"></div>
    <v-row class="pb-8">
      <!-- Supporting Materials (video and slides no longer used, but might bring in supporting materials later) -->
      <!-- <div v-if="task.video || task.slides" class="supporting-materials">
        <p class="text-overline missionAccent--text">Supporting Materials</p>
        <a
          v-if="task.video"
          :href="task.video"
          target="_blank"
          class="resource-button text-overline"
          >Video</a
        >
        <a
          v-if="task.slides"
          :href="task.slides"
          target="_blank"
          class="resource-button text-overline"
          >Slides</a
        >
      </div> -->

      <!-- REQUEST HELP -->
      <div class="mission-actions">
        <div class="action-button">
          <p class="text-overline text-uppercase text-center" style="line-height: 1rem">
            REQUEST HELP
          </p>
          <RequestHelpDialog :course="course" :topic="topic" :task="task" :taskId="task.id" />
        </div>

        <!-- MARK AS COMPLETED -->
        <div class="action-button">
          <p
            class="text-overline text-uppercase text-center"
            :class="getSubmitClass"
            style="line-height: 1rem"
          >
            {{ getSubmitTitle }}
          </p>

          <!-- <SubmissionReviewDialog
            v-if="declined"
            :submission="declinedSubmission"
            :requesterPerson="requesterPerson"
            :reviewed="true"
          /> -->
          <MissionCompletedDialog
            ref="missionCompletedDialog"
            :course="course"
            :topic="topic"
            :task="task"
            :active="active"
            :declined="declined"
            @missionSubmittedForReview="$emit('missionSubmittedForReview')"
            @missionCompleted="$emit('missionCompleted')"
          />
        </div>
      </div>
    </v-row>
  </div>
</template>

<script>
import MissionCompletedDialog from "@/components/Dialogs/MissionCompletedDialog.vue";
import RequestHelpDialog from "@/components/Dialogs/RequestHelpDialog.vue";
import SubmissionReviewDialog from "@/components/Dialogs/SubmissionReviewDialog.vue";
import MissionArtifactLauncher from "@/components/SolarSystemView/MissionsList/MissionsCard/MissionArtifactLauncher.vue";
import { resolveMissionContent } from "@/lib/missionArtifact";
import useRootStore from "@/store/index";
import { mapState, mapActions } from "pinia";
import * as smd from "streaming-markdown";

export default {
  name: "ActiveMissionsCard",
  components: {
    MissionArtifactLauncher,
    MissionCompletedDialog,
    RequestHelpDialog,
    SubmissionReviewDialog,
  },
  data: () => ({
    declinedSubmission: null,
  }),
  async mounted() {
    if (this.declined) {
      this.declinedSubmission = await this.getSubmissionByCourseIdPersonIdTaskId({
        courseId: this.course.id,
        personId: this.person.id,
        taskId: this.task.id,
      });
    }
    this.setStartMissionLoading(false);
  },
  props: ["course", "topic", "task", "active", "declined", "inreview", "completed"],
  computed: {
    isArtifactMission() {
      return resolveMissionContent(this.task).mode === "artifact";
    },
    taskMissionInstructionsHtml() {
      if (!this.task) return "";
      return this.task.missionInstructionsHtmlString || this.task.description || "";
    },
    ...mapState(useRootStore, ["courseSubmissions", "person"]),
    getSubmitTitle() {
      if (this.active && this.task.submissionRequired == true) {
        return "SUBMIT WORK";
      } else if (this.declined && this.task.submissionRequired == true) {
        return "RESUBMIT WORK";
      } else if (
        this.active &&
        (this.task.submissionRequired == false || !this.task.submissionRequired)
      ) {
        return "MARK AS COMPLETED";
      } else {
        return;
      }
    },
    getSubmitClass() {
      if (this.active && this.task.submissionRequired == true) {
        return "cohortAccent--text";
      } else if (this.declined && this.task.submissionRequired == true) {
        return "cohortAccent--text";
      } else if (
        this.active &&
        (this.task.submissionRequired == false || !this.task.submissionRequired)
      ) {
        return "missionAccent--text";
      } else {
        return;
      }
    },

    /**
     * Renders markdown for task description using streaming-markdown library
     */
    renderedTaskDescription() {
      if (!this.task || !this.taskMissionInstructionsHtml) return "";

      try {
        // Check if content is HTML or markdown
        if (this.isHtmlContent(this.taskMissionInstructionsHtml)) {
          // If it's HTML, return as-is
          return this.taskMissionInstructionsHtml;
        } else {
          // If it's markdown, convert it
          return this.renderMarkdownWithStreaming(this.taskMissionInstructionsHtml);
        }
      } catch (error) {
        console.error("Error rendering task description markdown:", error);
        // Fallback to plain text with HTML escaping
        return this.taskMissionInstructionsHtml
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }
    },
    isMobile() {
      return this.$vuetify.breakpoint.smAndDown;
    },
  },
  methods: {
    ...mapActions(useRootStore, [
      "getSubmissionByCourseIdPersonIdTaskId",
      "setStartMissionLoading",
    ]),

    /**
     * The interactive mission player signalled completion. Never write
     * completion directly from iframe content — prompt the existing
     * confirmation flow (XP / unlock / xAPI side effects stay gated).
     */
    onArtifactComplete() {
      this.$refs.missionCompletedDialog?.open();
    },

    /**
     * Detects if content is HTML or markdown
     * @param content - The content to analyze
     * @returns boolean - true if HTML, false if markdown
     */
    isHtmlContent(content) {
      if (!content) return false;

      // Check for common HTML patterns
      const htmlPatterns = [
        /<[^>]+>/g, // HTML tags
        /&[a-zA-Z]+;/g, // HTML entities like &nbsp;
        /<iframe/i, // iframe tags specifically
        /<div/i, // div tags
        /<p>/i, // p tags
        /<br/i, // br tags
        /<img/i, // img tags
        /<a\s+href/i, // anchor tags with href
      ];

      // If any HTML patterns are found, consider it HTML
      for (const pattern of htmlPatterns) {
        if (pattern.test(content)) {
          return true;
        }
      }

      // Check for markdown patterns
      const markdownPatterns = [
        /^#{1,6}\s+/m, // Headers
        /\*\*[^*]+\*\*/, // Bold
        /\*[^*]+\*/, // Italic
        /\[[^\]]+\]\([^)]+\)/, // Links
        /^[-*+]\s+/m, // Unordered lists
        /^\d+\.\s+/m, // Ordered lists
        /`[^`]+`/, // Inline code
        /```[\s\S]*?```/, // Code blocks
      ];

      // If markdown patterns are found and no HTML patterns, consider it markdown
      const hasMarkdown = markdownPatterns.some((pattern) => pattern.test(content));
      const hasHtml = htmlPatterns.some((pattern) => pattern.test(content));

      // If it has both HTML and markdown, prefer HTML (don't convert)
      if (hasHtml) return true;

      // If it has markdown and no HTML, convert it
      return !hasMarkdown;
    },

    /**
     * Renders markdown using streaming-markdown library
     * @param markdown - The markdown text to convert
     * @returns HTML string
     */
    renderMarkdownWithStreaming(markdown) {
      if (!markdown) return "";

      try {
        // Create a temporary div element to render into
        const tempDiv = document.createElement("div");

        // Create renderer and parser
        const renderer = smd.default_renderer(tempDiv);
        const parser = smd.parser(renderer);

        // Write the markdown content
        smd.parser_write(parser, markdown);

        // End the stream
        smd.parser_end(parser);

        // Get the HTML content
        const html = tempDiv.innerHTML;

        return html;
      } catch (error) {
        console.error("Error rendering markdown with streaming-markdown:", error);
        return markdown; // Fallback to plain text
      }
    },
  },
};
</script>

<style lang="scss" scoped>
p {
  margin: 0px !important;
}

a {
  color: var(--v-missionAccent-base) !important;
}

.active-mission-card {
  border: 1px solid var(--v-galaxyAccent-base);
  margin: -21px 10px 0px 10px;
  display: flex;
  flex-direction: column;
  // min-height: 300px;
  z-index: 200;
  background-color: var(--v-background-base);

  &.mobile {
    margin: 0px;
  }

  .task-description {
    color: var(--v-missionAccent-base);
    padding: 20px;
  }

  .supporting-materials {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;

    .resource-button {
      text-transform: uppercase;
      border: 1px solid var(--v-missionAccent-base);
      margin-bottom: 10px;
      width: 25%;
      text-align: center;
      text-decoration: none;
    }
  }

  .mission-actions {
    display: flex;
    width: 100%;
    color: var(--v-missionAccent-base);
    margin-top: 20px;

    .action-button {
      width: 50%;
    }
  }

  // background-image: repeating-linear-gradient(
  //   45deg,
  //   var(--v-baseAccent-base) 10px,
  //   var(--v-baseAccent-base) 12px,
  //   transparent 12px,
  //   transparent 20px
  // );
}

// .mission-card {
//   border: 1px solid var(--v-missionAccent-base);
//   margin: 50px;
//   display: flex;
//   width: 100%;
//   height: auto;
//   background-color: var(--v-background-base);

//   .mission-section {
//     margin: 0px;
//     color: var(--v-missionAccent-base);
//     font-size: 0.9rem;
//     border-left: 1px solid var(--v-missionAccent-base);
//     padding: 10px;
//     flex-grow: 1;
//   }
//   .mission-section:first-child {
//     margin: 0px;
//     color: var(--v-missionAccent-base);
//     font-size: 0.9rem;
//     border-left: none;
//     padding: 20px;
//     flex-grow: 1;
//   }

//   .mission-section-overUnder {
//     padding: 0px !important;
//     display: flex;
//     flex-direction: column;
//     justify-content: center;
//     align-items: center;

//     .section-overUnder {
//       display: flex;
//       justify-content: center;
//       align-items: center;
//       width: 100%;
//       height: 100%;
//       padding: 10px;
//     }

//     .section-overUnder:first-child {
//       border-bottom: 1px solid var(--v-missionAccent-base);
//     }
//   }
// }
</style>
