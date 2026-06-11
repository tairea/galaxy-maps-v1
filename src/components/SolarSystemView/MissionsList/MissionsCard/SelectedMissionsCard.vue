<template>
  <div class="selected-mission-card" :class="{ mobile: isMobile }">
    <MissionArtifactLauncher
      v-if="isArtifactMission"
      :task="task"
      :disabled="!completed && !inreview"
      :button-label="completed || inreview ? 'REPLAY MISSION' : 'LAUNCH MISSION'"
      class="py-2"
    />
    <div v-else v-html="renderedTaskDescription" class="task-description py-2"></div>
    <v-row class="pb-8">
      <div v-if="task.video || task.slides" class="supporting-materials">
        <p class="text-overline missionAccent--text">Supporting Materials</p>
        <!-- VIDEO -->
        <a
          v-if="task.video"
          :href="task.video"
          target="_blank"
          class="resource-button text-overline"
          >Video</a
        >
        <!-- SLIDES -->
        <a
          v-if="task.slides"
          :href="task.slides"
          target="_blank"
          class="resource-button text-overline"
          >Slides</a
        >
      </div>

      <!-- REQUEST HELP -->
      <div class="completedContainer">
        <!-- COMPLETED -->

        <div class="text-center completed">
          <p
            class="text-overline text-uppercase"
            :class="{
              'mission-in-review': inreview,
              'mission-completed': completed,
            }"
          >
            {{ completed ? "MISSION COMPLETED" : inreview ? "SUBMISSION IN REVIEW" : "LOCKED" }}
          </p>
          <p class="text-overline text-uppercase">
            {{ getStatusAndTimestamp }}
          </p>
          <p v-if="task.taskReviewedFeedback" class="text-overline text-uppercase">
            With Feedback from Captain:
            <br />
            <span class="galaxyAccent--text">"{{ task.taskReviewedFeedback }}"</span>
          </p>
          <p
            v-else-if="task.submissionRequired && !task.taskReviewedFeedback"
            class="text-overline text-uppercase"
          >
            With No feedback
          </p>
        </div>
      </div>
    </v-row>
  </div>
</template>

<script>
import { DateTime } from "luxon";
import * as smd from "streaming-markdown";

import MissionArtifactLauncher from "@/components/SolarSystemView/MissionsList/MissionsCard/MissionArtifactLauncher.vue";
import { resolveMissionContent } from "@/lib/missionArtifact";

export default {
  name: "SelectedMissionsCard",
  components: { MissionArtifactLauncher },
  props: ["task", "inreview", "completed"],
  computed: {
    isArtifactMission() {
      return resolveMissionContent(this.task).mode === "artifact";
    },
    taskMissionInstructionsHtml() {
      if (!this.task) return "";
      return this.task.missionInstructionsHtmlString || this.task.description || "";
    },

    getStatusAndTimestamp() {
      if (this.completed && this.task.submissionRequired) {
        return "MARKED COMPLETED: " + this.humanDate(this.task.taskReviewedAndCompletedTimestamp);
      } else if (this.completed && !this.task.submissionRequired) {
        return "COMPLETED: " + this.humanDate(this.task.taskCompletedTimestamp);
      } else if (this.inreview) {
        return "SUBMITTED: " + this.humanDate(this.task.taskSubmittedForReviewTimestamp);
      } else {
        return "LOCKED";
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
    humanDate(timestamp) {
      return DateTime.fromSeconds(
        timestamp.seconds ? timestamp.seconds : timestamp._seconds,
      ).toFormat("HH:mm ccc dd LLL yyyy");
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

.selected-mission-card {
  border: 1px solid var(--v-missionAccent-base);
  margin: -21px 10px 0px 10px;
  display: flex;
  flex-direction: column;
  z-index: 200;
  background-color: var(--v-background-base);

  &.mobile {
    margin: 0px;

    // mobile - task description
    .task-description {
      margin: 0px;
    }
  }

  .task-description {
    color: var(--v-missionAccent-base);
    padding: 40px 20px;
  }

  .supporting-materials {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    margin-bottom: 20px;

    .resource-button {
      text-transform: uppercase;
      border: 1px solid var(--v-missionAccent-base);
      margin-bottom: 10px;
      width: 25%;
      text-align: center;
      text-decoration: none;
    }
  }

  .completedContainer {
    display: flex;
    width: 100%;
    color: var(--v-missionAccent-base);
    justify-content: center;
    align-items: center;

    .completed {
      padding: 20px;
      width: 50%;
      border: 1px solid var(--v-missionAccent-base);
    }
  }
}

// .mission-card {
//   border: 1px solid var(--v-missionAccent-base);
//   margin: 50px;
//   display: flex;
//   width: 100%;
//   height: auto;

//   .mission-section {
//     margin: 0px;
//     color: var(--v-missionAccent-base);
//     font-size: 0.9rem;
//     border-left: 1px solid var(--v-missionAccent-base);
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
//     // align-items: center;

//     .section-overUnder {
//       display: flex;
//       flex-direction: column;
//       justify-content: center;
//       align-items: center;
//       width: 100%;
//       height: 50%;
//       padding: 10px;
//     }

//     .section-overUnder:first-child {
//       border-bottom: 1px solid var(--v-missionAccent-base);
//     }
//   }
// }

.mission-in-review {
  color: var(--v-cohortAccent-base);
}
.mission-completed {
  color: var(--v-baseAccent-base);
}
</style>
