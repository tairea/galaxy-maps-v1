<template>
  <div>
    <!-- ===== EXPANSION HEADER ===== -->
    <v-expansion-panel-header
      class="py-0"
      @click="teacher && hasLongDescription ? toggleDescription() : null"
      :class="{ mobile: isMobile, student: isStudent }"
    >
      <!-- Active ribbon -->
      <div v-if="active" class="active-mission-ribbon">
        <!-- <v-icon color="background" small>{{ mdiTarget }}</v-icon> -->
        Active Mission
      </div>
      <!-- ===== MISSION CARD ===== -->
      <div
        class="mission-card"
        :class="{ lockedOpacity: task.taskStatus == 'locked', mobile: isMobile }"
        :style="task.color ? 'border: 1px dashed ' + task.color + ' !important' : '#69a1e2'"
      >
        <!-- ===== MISSION NUMBER SECTION ===== -->
        <div class="mission-section mission-number-section" :class="{ mobile: isMobile }">
          <!-- Mission number -->
          <p
            class="text-overline text-uppercase"
            :style="task.color ? 'color:' + task.color + ' !important' : '#69a1e2'"
          >
            Mission
          </p>
          <p
            class="mission-number"
            :style="task.color ? 'color:' + task.color + ' !important' : '#69a1e2'"
          >
            {{ index + 1 }}
          </p>
          <!-- EDIT BUTTON -->
          <div v-if="teacher">
            <CreateEditDeleteMissionDialog
              :edit="true"
              :course="course"
              :topic="topic"
              :taskId="task.id"
              :taskToEdit="task"
              :index="index"
              :taskColor="task.color"
              @taskUpdated="$emit('taskUpdated', $event)"
              @taskDeleted="$emit('taskDeleted', $event)"
            />
          </div>
        </div>

        <!-- ===== MISSION TITLE & DESCRIPTION SECTION ===== -->
        <div
          class="mission-middle-section mission-main-section"
          :style="task.color ? 'border-left: 1px dashed ' + task.color + ' !important' : ''"
        >
          <!-- TITLE -->
          <h1
            class="mission-title pa-4"
            :style="task.color ? 'color:' + task.color + ' !important' : ''"
          >
            {{ task.title }}
          </h1>
          <!-- DESCRIPTION -->
          <div
            v-if="teacher"
            class="task-description-container"
            :style="task.color ? 'color:' + task.color + ' !important' : ''"
          >
            <MissionArtifactLauncher
              v-if="isArtifactMission"
              :task="task"
              button-label="PREVIEW MISSION"
            />
            <div
              v-else
              v-html="renderedTaskDescription"
              class="task-description"
              :class="{ 'task-description-collapsed': !descriptionExpanded }"
            ></div>
            <div v-if="hasLongDescription" class="description-toggle">
              <v-btn
                text
                small
                @click.stop="toggleDescription"
                :style="task.color ? 'color:' + task.color + ' !important' : ''"
              >
                <v-icon small>{{ descriptionExpanded ? mdiChevronUp : mdiChevronDown }}</v-icon>
                {{ descriptionExpanded ? "Show Less" : "Show More" }}
              </v-btn>
            </div>
          </div>
        </div>

        <!-- <div class="mission-section mission-section-overUnder">
      
      <div class="section-overUnder">
        <a
          v-if="task.video"
          :href="task.video"
          target="_blank"
          class="text-overline text-uppercase"
          >Video</a
        >
        <p v-else class="text-overline text-uppercase" style="color: #707070">
          Video
        </p>
      </div>
      
      <div class="section-overUnder">
        <a
          v-if="task.slides"
          :href="task.slides"
          target="_blank"
          class="text-overline text-uppercase"
          >Slides</a
        >
        <p v-else class="text-overline text-uppercase" style="color: #707070">
          Slides
        </p>
      </div>
    </div> -->

        <!-- ===== MISSION DURATION & SUBMISSION SECTION ===== -->
        <div
          v-if="!teacher && !isMobile && (task.duration || task.submissionRequired)"
          class="mission-section mission-section-overUnder"
        >
          <!--  DURATION -->
          <div v-if="task.duration" class="section-overUnder d-flex justify-center flex-column">
            <v-tooltip v-if="isMobile" bottom>
              <template v-slot:activator="{ on, attrs }">
                <v-icon v-if="isMobile" color="missionAccent" small>{{ mdiTimer }}</v-icon>
              </template>
              <span>This mission is estimated to take {{ task.duration }} minutes</span>
            </v-tooltip>
            <p
              v-else
              class="text-overline text-uppercase text-center"
              :style="task.color ? 'color:' + task.color + ' !important' : ''"
            >
              Estimated Duration:
            </p>
            <p class="text-center" :style="task.color ? 'color:' + task.color + ' !important' : ''">
              {{ task.duration }} MINS
            </p>
          </div>
          <!--  SUBMISSION REQUIRED -->
          <div
            v-if="task.submissionRequired"
            class="section-overUnder d-flex justify-center flex-column"
            style="line-height: 2"
          >
            <v-tooltip v-if="isMobile" bottom>
              <template v-slot:activator="{ on, attrs }">
                <v-icon color="missionAccent" small v-bind="attrs" v-on="on">{{ mdiFlag }}</v-icon>
              </template>
              <span>This mission requires you to submit some evidence</span>
            </v-tooltip>
            <p
              v-else
              class="text-overline text-uppercase text-center"
              :style="task.color ? 'color:' + task.color + ' !important' : ''"
              style="line-height: 2"
            >
              SUBMISSION REQUIRED:
            </p>
            <p
              :style="[
                task.submissionRequired
                  ? { color: '#FAF200' }
                  : task.color
                  ? { color: task.color + ' !important' }
                  : '',
              ]"
            >
              {{ task.submissionRequired ? "YES" : "NO" }}
            </p>
          </div>
        </div>

        <!-- ===== MISSION STATUS SECTION ===== -->
        <div
          v-if="!teacher"
          class="mission-section d-flex justify-center align-center flex-column"
          style="width: 20%"
          :class="{
            'topic-in-review': inreview,
            'topic-completed': completed,
            'topic-active declined': declined,
            'topic-active': active,
            'topic-unlocked': unlocked,
          }"
        >
          <p class="text-overline text-uppercase text-center">
            {{
              completed
                ? "COMPLETED"
                : inreview
                ? "IN REVIEW"
                : unlocked
                ? "START MISSION"
                : active
                ? "ACTIVE MISSION"
                : declined
                ? "RETRY MISSION"
                : "LOCKED"
            }}
          </p>

          <div v-if="unlocked" class="d-flex justify-center">
            <!-- Start Mission button -->
            <StartMissionDialogV2
              :course="course"
              :topic="topic"
              :task="task"
              :topicActive="topicActive"
              @missionStarted="$emit('missionStarted', task.id)"
            />
          </div>
          <div v-else-if="active" class="d-flex justify-center">
            <v-icon color="galaxyAccent" large>{{ mdiTarget }}</v-icon>
          </div>
          <div v-else-if="declined" class="d-flex justify-center">
            <v-icon color="cohortAccent" large>{{ mdiAlertOutline }}</v-icon>
          </div>
          <div v-else-if="completed || inreview" class="d-flex justify-center">
            <v-icon :color="completed || declined ? 'baseAccent' : 'cohortAccent'" large>{{
              mdiCheck
            }}</v-icon>
          </div>
          <div v-else class="d-flex justify-center align-center">
            <v-btn color="missionAccent" icon large>
              <v-icon large>{{ mdiLockOutline }}</v-icon>
            </v-btn>
          </div>
        </div>

        <!-- ===== TEACHER VIEW (for type teacher) ===== -->
        <div
          v-else-if="task.submissionRequired && teacher"
          class="three-vertical-section"
          :style="task.color ? 'border-left: 1px dashed ' + task.color + ' !important' : ''"
        >
          <div class="three-vertical-section-overUnder">
            <!-- duration -->
            <div
              v-if="task.duration"
              class="d-flex justify-center flex-column three-vertical pa-4 duration"
              :class="taskColorClass"
            >
              <p
                class="text-overline text-uppercase text-center"
                :style="task.color ? 'color:' + task.color + ' !important' : ''"
              >
                Est. Duration:
              </p>
              <p
                class="text-center"
                :style="task.color ? 'color:' + task.color + ' !important' : ''"
              >
                {{ task.duration }} MINUTES
              </p>
            </div>
            <!-- end duration -->
            <!-- submission req -->
            <div
              class="d-flex justify-center flex-column three-vertical pa-4 submission"
              :class="taskColorClass"
            >
              <v-tooltip v-if="isMobile" bottom>
                <template v-slot:activator="{ on, attrs }">
                  <v-icon color="missionAccent" small v-bind="attrs" v-on="on">{{
                    mdiFlag
                  }}</v-icon>
                </template>
                <span>This mission requires you to submit some evidence</span>
              </v-tooltip>
              <p
                v-else
                class="text-overline text-uppercase text-center"
                :style="task.color ? 'color:' + task.color + ' !important' : ''"
              >
                SUBMISSION REQ:
              </p>
              <p class="text-center" :style="[task.submissionRequired ? { color: '#FAF200' } : '']">
                {{ task.submissionRequired ? "YES" : "NO" }}
              </p>
              <div
                v-if="task.submissionInstructions"
                v-html="renderedSubmissionInstructions"
                class="submissions-instructions"
              ></div>
            </div>
            <!-- end submission req -->
            <!-- mission links -->
            <!-- <div class="three-vertical">
              <p class="text-overline text-uppercase text-center">
                Mission Links:
              </p>
              <div class="d-flex justify-center flex-column mt-2">
                <v-btn
                  color="missionAccent"
                  outlined
                  x-small
                  :disabled="!task.video || !task.video.length"
                >
                  LINK TO VIDEO
                </v-btn>
                <v-btn
                  color="missionAccent"
                  outlined
                  class="mt-2"
                  x-small
                  :disabled="!task.slides || !task.slides.length"
                >
                  LINK TO SLIDES
                </v-btn>
              </div>
            </div> -->
            <!-- end mission links -->
          </div>
        </div>
      </div>
    </v-expansion-panel-header>

    <!-- Mobible Start Mission button -->
    <!-- <StartMissionDialogV2
      v-if="unlocked && isMobile"
      :course="course"
      :topic="topic"
      :task="task"
      :topicActive="topicActive"
      @missionStarted="$emit('missionStarted', task.id)"
    /> -->

    <!-- ===== ACTIVE MISSION CONTENT ===== -->
    <v-expansion-panel-content :class="{ mobile: isMobile }">
      <!-- expansion content -->
      <ActiveMissionsCard
        v-if="active || declined"
        :course="course"
        :topic="topic"
        :task="task"
        :active="active"
        :declined="declined"
        @missionSubmittedForReview="$emit('missionSubmittedForReview', task.id)"
        @missionCompleted="$emit('missionCompleted', task.id)"
      />
      <SelectedMissionsCard v-else :task="task" :completed="completed" :inreview="inreview" />
    </v-expansion-panel-content>
  </div>
</template>

<script>
import CreateEditDeleteMissionDialog from "@/components/Dialogs/CreateEditDeleteMissionDialog.vue";
import StartMissionDialogV2 from "@/components/Dialogs/StartMissionDialogV2.vue";
import ActiveMissionsCard from "@/components/SolarSystemView/MissionsList/MissionsCard/ActiveMissionsCard.vue";
import MissionArtifactLauncher from "@/components/SolarSystemView/MissionsList/MissionsCard/MissionArtifactLauncher.vue";
import SelectedMissionsCard from "@/components/SolarSystemView/MissionsList/MissionsCard/SelectedMissionsCard.vue";
import { resolveMissionContent } from "@/lib/missionArtifact";
import useRootStore from "@/store/index";
import {
  mdiCheck,
  mdiLockOutline,
  mdiTarget,
  mdiAlertOutline,
  mdiChevronUp,
  mdiChevronDown,
  mdiTimer,
  mdiFlag,
} from "@mdi/js";
import { mapState } from "pinia";
import * as smd from "streaming-markdown";

export default {
  name: "MissionsCard",
  components: {
    CreateEditDeleteMissionDialog,
    StartMissionDialogV2,
    ActiveMissionsCard,
    MissionArtifactLauncher,
    SelectedMissionsCard,
  },
  props: ["course", "topic", "task", "index", "teacher", "topicActive"],
  data() {
    return {
      mdiCheck,
      mdiLockOutline,
      mdiTarget,
      mdiAlertOutline,
      mdiChevronUp,
      mdiChevronDown,
      mdiTimer,
      mdiFlag,
      editing: false,
      activeTask: false,
      panel: [],
      taskSlides: false,
      taskVideo: false,
      descriptionExpanded: false,
    };
  },
  watch: {
    task: {
      deep: true,
      handler(newVal, oldVal) {
        if (oldVal.taskStatus == "unlocked" && newVal.taskStatus == "active") {
          this.$emit("missionActivated", newVal.id);
        }
      },
    },
  },
  computed: {
    ...mapState(useRootStore, ["personsTopics", "person"]),
    active() {
      return this.task.taskStatus == "active";
    },
    declined() {
      return this.task.taskStatus == "declined";
    },
    completed() {
      return this.task.taskStatus == "completed";
    },
    inreview() {
      return this.task.taskStatus == "inreview";
    },
    unlocked() {
      return this.task.taskStatus == "unlocked";
    },
    taskColorClass() {
      switch (this.task.color) {
        case "#69A1E2FF":
          return "border-top-missionAccent";
        case "#E269CFFF":
          return "border-top-galaxyAccent";
        case "#00E676FF":
          return "border-top-baseAccent";
        case "#FAF200FF":
          return "border-top-cohortAccent";
        default:
          return "";
      }
    },

    isArtifactMission() {
      return resolveMissionContent(this.task).mode === "artifact";
    },

    taskMissionInstructionsHtml() {
      if (!this.task) return "";
      return this.task.missionInstructionsHtmlString || this.task.description || "";
    },

    /**
     * Checks if the task description is long enough to warrant collapsing
     */
    hasLongDescription() {
      if (!this.task || !this.taskMissionInstructionsHtml) return false;
      // Artifact missions show a launch panel, not collapsible prose
      if (this.isArtifactMission) return false;

      // Check for HTML content that would make it visually long
      if (this.isHtmlContent(this.taskMissionInstructionsHtml)) {
        // For HTML content, check for multiple elements or media
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = this.taskMissionInstructionsHtml;

        // Count various elements that contribute to visual length
        const hasMultipleParagraphs = tempDiv.querySelectorAll("p").length > 1;
        const hasImages = tempDiv.querySelectorAll("img").length > 0;
        const hasVideos = tempDiv.querySelectorAll("video, iframe").length > 0;
        const hasLists = tempDiv.querySelectorAll("ul, ol").length > 0;
        const hasCodeBlocks = tempDiv.querySelectorAll("pre, code").length > 0;
        const hasHeaders = tempDiv.querySelectorAll("h1, h2, h3, h4, h5, h6").length > 0;

        // Consider it long if it has multiple content types or multiple paragraphs
        return (
          hasMultipleParagraphs || hasImages || hasVideos || hasLists || hasCodeBlocks || hasHeaders
        );
      } else {
        // For plain text/markdown, use the existing logic
        return (
          this.taskMissionInstructionsHtml.length > 200 ||
          this.taskMissionInstructionsHtml.includes("\n\n")
        );
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

    /**
     * Renders markdown for submission instructions using streaming-markdown library
     */
    renderedSubmissionInstructions() {
      if (!this.task || !this.task.submissionInstructions) return "";

      try {
        // Check if content is HTML or markdown
        if (this.isHtmlContent(this.task.submissionInstructions)) {
          // If it's HTML, return as-is
          return this.task.submissionInstructions;
        } else {
          // If it's markdown, convert it
          return this.renderMarkdownWithStreaming(this.task.submissionInstructions);
        }
      } catch (error) {
        console.error("Error rendering submission instructions markdown:", error);
        // Fallback to plain text with HTML escaping
        return this.task.submissionInstructions
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
    isStudent() {
      return !this.teacher;
    },
  },
  methods: {
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

    /**
     * Toggles the description expanded/collapsed state
     */
    toggleDescription() {
      this.descriptionExpanded = !this.descriptionExpanded;
    },
  },
};
</script>

<style lang="scss">
pre {
  background-color: #23241f;
  color: #f8f8f2;
  overflow: visible;
  padding: 10px;
}

li,
pre {
  margin-bottom: 16px;
}
.v-expansion-panel-header {
  &.mobile {
    padding: 0px;
    margin: 15px 0px;
    border: none;
    // width: calc(var(--vw, 1vw) * 100);

    &.student {
      border: 1px solid var(--v-missionAccent-base);
    }
  }
}

.v-expansion-panel-content {
  &.mobile {
    margin-top: -15px;
    .v-expansion-panel-content__wrap {
      padding: 0px !important;
      margin: 0px;
      border: none;
    }
  }
}

.task-description > p,
.task-description > ol > li,
.task-description > ul > li {
  line-height: 20px !important;
}
.task-description-container {
  width: 100%;
  position: relative;
}

.task-description {
  width: 100%;
  transition: max-height 0.3s ease-in-out;
  overflow: hidden;
}

.task-description-collapsed {
  max-height: 120px;
  position: relative;
}

.task-description-collapsed::after {
  content: "...";
  position: absolute;
  bottom: 0;
  right: 10px;
  background: linear-gradient(transparent, var(--v-background-base));
  padding-left: 20px;
  font-size: 1.2em;
  font-weight: bold;
}

.description-toggle {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
.task-description a {
  color: var(--v-galaxyAccent-base) !important;
}

.task-description > h2 {
  padding: 20px 0px;
}
.task-description > h3 {
  padding: 10px 0px;
}

.task-description > p > img {
  width: 100%;
}

iframe.ql-video {
  width: 100% !important;
  height: 300px !important;
}

.submissions-instructions > p > img {
  width: 100%;
}

.theme--dark.v-expansion-panels .v-expansion-panel:not(:first-child)::after {
  border: none !important;
}

.v-expansion-panel::before {
  box-shadow: none !important;
}
</style>

<style lang="scss" scoped>
p {
  margin: 0px !important;
}

.lockedOpacity {
  opacity: 0.4;
}

.active-mission-ribbon {
  position: absolute;
  top: 0px;
  left: 0px;
  background-color: var(--v-galaxyAccent-base);
  color: var(--v-background-base);
  padding: 4px 12px 4px 6px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  clip-path: polygon(0 0, 100% 0, 90% 100%, 0% 100%);
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.mission-card {
  border: 1px dashed var(--v-missionAccent-base);
  margin: 20px 10px;
  display: flex;
  height: auto;

  &.mobile {
    border: none;
    margin: 0px;
    width: 100%;
    box-sizing: border-box;
  }

  .mission-section {
    margin: 0px;
    color: var(--v-missionAccent-base);
    font-size: 0.9rem;
    border-left: 1px dashed var(--v-missionAccent-base);
    padding: 20px;
    flex-grow: 1;
  }

  .mission-middle-section {
    margin: 0px;
    color: var(--v-missionAccent-base);
    font-size: 0.9rem;
    border-left: 1px dashed var(--v-missionAccent-base);
    flex-grow: 1;

    .task-description {
      padding: 0px 16px 16px 16px;
    }
  }

  .mission-number-section {
    border-left: none;
    position: relative;

    &.mobile {
      padding: 10px;
    }

    .mission-number {
      font-size: 50px;
      height: 50px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }

  @keyframes borderAnimation {
    0% {
      // border-width: 1px;
      opacity: 0.5;
    }
    50% {
      // border-width: 5px;
      opacity: 1;
    }
    100% {
      // border-width: 1px;
      opacity: 0.5;
    }
  }

  .topic-unlocked {
    border: 1px solid var(--v-galaxyAccent-base);
    animation: borderAnimation 2s infinite;
    color: var(--v-galaxyAccent-base);
  }

  .topic-in-review {
    border: 1px solid var(--v-cohortAccent-base);
    color: var(--v-cohortAccent-base);
  }

  .topic-declined {
    border: 1px solid var(--v-cohortAccent-base);
    color: var(--v-cohortAccent-base);
  }

  .topic-completed {
    border: 1px solid var(--v-baseAccent-base);
    color: var(--v-baseAccent-base);
  }

  .topic-active {
    border-top: 1px solid var(--v-galaxyAccent-base);
    border-right: 1px solid var(--v-galaxyAccent-base);
    border-left: 1px solid var(--v-galaxyAccent-base);
    border-bottom: 3px solid var(--v-background-base);
    color: var(--v-galaxyAccent-base);
    // z-index: 101;
  }

  .declined {
    color: var(--v-cohortAccent-base);
  }

  .mission-main-section {
    // flex-grow: 4 !important;
    width: 40%;
    position: relative;
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    flex-direction: column;
    /* Allow flex item to shrink so long titles don't force card to grow */
    min-width: 0;

    .mission-edit-button {
      // position: absolute;
      // bottom: 10px;
      // left: 10px;
      font-size: 0.7rem;
    }
  }

  .mission-title {
    font-size: 1.2rem;
    color: var(--v-missionAccent-base);
    font-weight: 600;
    text-transform: uppercase;
    margin: 5px 0px;
    /* Ensure long titles wrap within the card */
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .mission-number-section {
    flex-grow: 0 !important;
    flex-shrink: 1 !important;
  }

  .mission-section-overUnder {
    padding: 0px !important;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    .section-overUnder {
      display: flex;
      justify-content: center;
      align-items: center;

      width: 100%;
      height: 100%;
      padding: 10px;
    }
  }

  .three-vertical-section {
    margin: 0px;
    color: var(--v-missionAccent-base);
    font-size: 0.9rem;
    border-left: 1px dashed var(--v-missionAccent-base);

    width: 30%;

    .three-vertical-section-overUnder {
      padding: 0px !important;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100%;

      .three-vertical {
        width: 100%;
        // height: 50%;
        display: flex;
        // flex-direction: column;
        justify-content: center;
        align-items: center;
      }

      .duration {
        height: 30%;
      }

      .three-vertical:not(:first-child) {
        border-top: 1px dashed var(--v-missionAccent-base);
      }

      .border-top-missionAccent {
        border-top: 1px dashed var(--v-missionAccent-base) !important;
      }
      .border-top-galaxyAccent {
        border-top: 1px dashed var(--v-galaxytAccent-base) !important;
      }
      .border-top-baseAccent {
        border-top: 1px dashed var(--v-baseAccent-base) !important;
      }

      .border-top-cohortAccent {
        border-top: 1px dashed var(--v-cohortAccent-base) !important;
      }
    }
  }
}

.submissions-instructions {
  color: var(--v-cohortAccent-base);
  font-size: 0.8rem;
  font-style: italic;
  margin: 20px 0px;
  padding: 10px;
  padding-top: 26px;
  border: 1px solid var(--v-cohortAccent-base);
  border-radius: 5px;
  // display: flex;
  // justify-content: center;
  // align-items: center;
  // flex-direction: column;
}

.v-application p {
  margin-bottom: 0px !important;
}
</style>
