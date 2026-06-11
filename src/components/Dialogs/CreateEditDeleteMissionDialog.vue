<template>
  <v-container class="pa-0">
    <v-row class="text-center" align="center">
      <v-col cols="12">
        <v-dialog v-model="dialog" :width="isMobile ? '100%' : '50%'" light persistent>
          <!-- Loading Overlay -->
          <div v-if="aiGenerating" class="loading-overlay">
            <div class="loading-content">
              <!-- LOADING INDICATOR -->
              <RobotLoadingSpinner size="50" color="galaxyAccent" icon-size="24" />

              <p class="loading-message overline">
                {{ currentLoadingMessage }}
              </p>

              <!-- TOKEN USAGE (if available) -->
              <p v-if="tokenUsage" class="token-usage overline mt-2">
                Total Tokens:
                {{
                  tokenUsage.totalTokens
                    ? tokenUsage.totalTokens.toLocaleString()
                    : tokenUsage.total_tokens?.toLocaleString() || "0"
                }}
              </p>
              <p v-if="tokenUsage" class="token-breakdown overline mt-2">
                Input:
                {{
                  tokenUsage.totalInputTokens
                    ? tokenUsage.totalInputTokens.toLocaleString()
                    : tokenUsage.input_tokens?.toLocaleString() || "0"
                }}
                | Output:
                {{
                  tokenUsage.totalOutputTokens
                    ? tokenUsage.totalOutputTokens.toLocaleString()
                    : tokenUsage.output_tokens?.toLocaleString() || "0"
                }}
              </p>
              <!-- <p v-if="tokenUsage" class="token-breakdown overline mt-2">
                Est. cost: ${{
                  tokenUsage.combinedEstimatedCost
                    ? tokenUsage.combinedEstimatedCost.toFixed(5)
                    : "0.00000"
                }}
              </p> -->
              <!-- Model breakdown -->
              <div
                v-if="tokenUsage && tokenUsage.modelsUsed && tokenUsage.modelsUsed.length > 0"
                class="model-breakdown mt-2"
              >
                <p class="model-breakdown-title overline">Models Used:</p>
                <div v-for="model in tokenUsage.modelsUsed" :key="model.model" class="model-item">
                  <span class="model-name">{{ model.model }}</span>
                  <span class="model-tokens">
                    {{ model.totalTokens.toLocaleString() }} tokens
                  </span>
                  <span class="model-cost">${{ model.estimatedCost.toFixed(5) }}</span>
                </div>
              </div>
            </div>
          </div>
          <!-- CREATE BUTTON -->
          <template v-slot:activator="{ on, attrs }">
            <v-btn
              v-if="edit"
              v-bind="attrs"
              v-on="on"
              class="mission-edit-button mt-4"
              outlined
              :color="taskColor ? taskColor : 'missionAccent'"
              x-small
            >
              <v-icon class="mr-2" x-small> {{ mdiPencil }}</v-icon>
              edit
            </v-btn>

            <v-btn v-else outlined color="missionAccent" v-bind="attrs" v-on="on">
              <v-icon left> {{ mdiPlus }} </v-icon>
              CREATE MISSION
            </v-btn>
          </template>

          <!-- DIALOG (TODO: make as a component)-->
          <div class="create-dialog">
            <!-- HEADER -->
            <div class="dialog-header">
              <p class="dialog-title">
                {{ edit ? "Edit Mission " + task.title : dialogTitle }}
              </p>
              <div class="d-flex align-center">
                <v-icon left color="missionAccent">{{ mdiInformationVariant }}</v-icon>
                <p class="dialog-description">
                  A Mission is a specific task you want the Navigator to complete. <br />Enter the
                  mission details here or link to an external file eg. Youtube video or Google
                  Slide.
                </p>
              </div>
            </div>

            <div class="create-dialog-content">
              <!-- TITLE -->
              <!-- <p class="dialog-description">Mission Title:</p> -->
              <v-text-field
                class="input-field"
                outlined
                :dark="dark"
                :light="!dark"
                color="missionAccent"
                v-model="task.title"
                label="Mission Title"
                required
              ></v-text-field>

              <!-- DESCRIPTION -->
              <!-- <p class="dialog-description">Mission Description:</p> -->
              <!-- <v-textarea
                class="input-field"
                outlined
                :dark="dark"
                :light="!dark"
                color="missionAccent"
                clearable
                rows="6"
                v-model="task.description"
                label="Mission Content"
              ></v-textarea> -->

              <!-- INTERACTIVE HTML ARTIFACT MISSION (read-only content; Quill would mangle it) -->
              <div v-if="isArtifactMission" class="artifact-panel mb-8">
                <p class="text-overline missionAccent--text ma-0">
                  <v-icon small color="missionAccent" class="mr-1">{{ mdiCubeOutline }}</v-icon>
                  INTERACTIVE HTML MISSION (AI-AUTHORED) — {{ artifactSizeKb }} KB
                </p>
                <p class="dialog-description mt-2">
                  This mission is a self-contained interactive player. Its content can't be edited
                  here — rebuild it with the mission builder or replace the HTML file below. Title,
                  duration, submission settings and colour can still be edited.
                </p>
                <MissionArtifactPlayerDialog
                  v-if="artifactForPreview"
                  :artifact="artifactForPreview"
                  :title="task.title"
                  button-label="PREVIEW MISSION"
                />
                <v-file-input
                  class="input-field mt-4"
                  outlined
                  dense
                  :dark="dark"
                  :light="!dark"
                  color="missionAccent"
                  accept=".html,text/html"
                  label="Replace artifact (.html)"
                  :error-messages="artifactFileError"
                  @change="onArtifactFileSelected"
                ></v-file-input>
              </div>

              <div v-else>
                <vue-editor
                  ref="quillEditor"
                  id="editor1"
                  v-model="task.description"
                  useCustomImageHandler
                  @image-added="handleDescriptionImageAdded"
                  class="mb-8 quill"
                  :class="{ 'active-quill': quillFocused }"
                  :editor-toolbar="customToolbar"
                  @focus="quillFocused = true"
                  @blur="quillFocused = false"
                  style="color: white"
                />
              </div>

              <!-- ========== Generate with A.i. Button ========== -->
              <div v-if="!isArtifactMission" class="d-flex justify-end" style="margin-top: -20px">
                <div class="d-flex flex-column justify-end align-end" style="width: 50%">
                  <!-- close button -->
                  <v-btn
                    v-if="aiInput"
                    icon
                    color="galaxyAccent"
                    @click="toggleAiInput()"
                    class="mb-4"
                    x-small
                    dense
                  >
                    <v-icon> {{ mdiClose }} </v-icon>
                  </v-btn>
                  <v-text-field
                    v-if="aiInput"
                    v-model="aiGenerateMissionAssistInput"
                    :dark="dark"
                    :light="!dark"
                    class="input-field"
                    style="margin-top: -10px"
                    outlined
                    color="galaxyAccent"
                    auto-grow
                    clearable
                    :label="
                      task.description && task.description.trim()
                        ? 'What would you like to refine?'
                        : 'How can I help?'
                    "
                    :disabled="aiGenerating"
                    autofocus
                    @keyup.enter="aiGenerateMissionAssist"
                  />
                  <!-- A.I. Assist button -->
                  <v-btn
                    v-if="!aiInput"
                    outlined
                    color="galaxyAccent"
                    @click="toggleAiInput()"
                    class="mb-4"
                    :dark="dark"
                    :light="!dark"
                  >
                    <v-icon left> {{ mdiRobotExcited }} </v-icon>
                    A.I. Assist
                  </v-btn>

                  <v-btn
                    v-if="aiInput"
                    outlined
                    color="galaxyAccent"
                    @click="aiGenerateMissionAssist()"
                    class="mb-4"
                    :loading="aiGenerating"
                    :disabled="aiGenerating"
                    style="margin-top: -10px"
                    ><v-icon left> {{ mdiRobotExcited }} </v-icon>
                    {{
                      task.description && task.description.trim() ? "A.I. Refine" : "A.I. Generate"
                    }}
                  </v-btn>
                </div>
              </div>

              <!-- COLOUR PICKER -->
              <div class="dialog-description">
                Mission colour:
                <v-tooltip right>
                  <template v-slot:activator="{ on, attrs }">
                    <v-icon
                      left
                      color="missionAccent"
                      small
                      class="circle-outline ma-1"
                      v-bind="attrs"
                      v-on="on"
                    >
                      {{ mdiInformationVariant }}</v-icon
                    >
                  </template>
                  <span> Feature requested by @scott_southwood </span>
                </v-tooltip>
                <div>
                  <v-color-picker
                    v-model="task.color"
                    class="ma-2 color-picker"
                    show-swatches
                    hide-canvas
                    hide-inputs
                    hide-sliders
                    mode="hexa"
                    value="#69a1e2"
                    width="90%"
                    :swatches="darkSwatches"
                    style="background-color: rgba(0, 0, 0, 0)"
                  >
                  </v-color-picker>
                </div>
              </div>

              <!-- DURATION -->
              <!-- <p class="dialog-description">Duration:</p> -->
              <!-- <v-text-field
                class="input-field"
                outlined
                :dark="dark"
                :light="!dark"
                color="missionAccent"
                v-model="task.duration"
                required
                label="Estimated time to complete this Mission (in minutes)"
              ></v-text-field> -->

              <!-- VIDEO -->
              <!-- <p class="dialog-description">Video:</p> -->
              <!-- <v-text-field
                class="input-field"
                outlined
                :dark="dark"
                :light="!dark"
                color="missionAccent"
                v-model="task.video"
                label="Link to Video (Optional)"
              ></v-text-field> -->

              <!-- SLIDES -->
              <!-- <p class="dialog-description">Slides:</p> -->
              <!-- <v-text-field
                class="input-field"
                outlined
                :dark="dark"
                :light="!dark"
                color="missionAccent"
                v-model="task.slides"
                label="Link to slides (Optional)"
              ></v-text-field> -->

              <!-- SUBMISSION REQUIRED? -->
              <p class="dialog-description submission-colour">
                Does this Mission require the Navigator to submit any evidence of work?
                <v-tooltip right max-width="300">
                  <template v-slot:activator="{ on, attrs }">
                    <v-icon
                      left
                      color="cohortAccent"
                      class="circle-outline ma-1"
                      v-bind="attrs"
                      v-on="on"
                    >
                      {{ mdiInformationVariant }}</v-icon
                    >
                  </template>
                  <span>
                    With this option checked, Navigators are required to submit some evidence of
                    their work.<br /><br />Once the navigator has submitted evidence, you will be
                    notified to review their submission to check if it is completed.<br /><br />
                    IMPORTANT: The navigator cannot progress onto the next System until you review
                    and approve their submission.
                  </span>
                </v-tooltip>
              </p>
              <v-checkbox
                v-model="task.submissionRequired"
                class="ma-0 pa-0 submission-colour"
                color="cohortAccent"
                :dark="dark"
                :light="!dark"
              >
                <template v-slot:label>
                  <span class="dialog-description submission-colour"
                    >Tick this box to request a submission of evidence for this Mission</span
                  >
                </template>
                <p v-if="task.submissionRequired" class="submission-colour">
                  SUBMISSION REQUIRED FOR THIS MISSION
                </p>
              </v-checkbox>

              <!-- SUBMISSION INSTRUCTIONS -->
              <div v-if="task.submissionRequired">
                <p class="dialog-description submission-colour">
                  Submission Instructions:
                  <v-tooltip right max-width="300">
                    <template v-slot:activator="{ on, attrs }">
                      <v-icon
                        left
                        color="cohortAccent"
                        small
                        class="circle-outline ma-1"
                        v-bind="attrs"
                        v-on="on"
                      >
                        {{ mdiInformationVariant }}</v-icon
                      >
                    </template>
                    <span>
                      Please provide submission instructions. Eg. what type of evidence do you want
                      the student to provide a link to?
                    </span>
                  </v-tooltip>
                </p>
                <vue-editor
                  id="editor2"
                  v-model="task.submissionInstructions"
                  useCustomImageHandler
                  @image-added="handleSubmissionImageAdded"
                  class="mt-2 quill"
                  :class="{
                    'active-submission-quill': submissionQuillFocused,
                  }"
                  :editor-toolbar="customToolbar"
                  @focus="submissionQuillFocused = true"
                  @blur="submissionQuillFocused = false"
                  style="color: var(--v-cohortAccent-base)"
                />
                <!-- <v-textarea
                  v-model="task.submissionInstructions"
                  class="ma-0 pa-0 submission-colour input-field"
                  outlined
                  :dark="dark"
                  :light="!dark"
                  color="cohortAccent"
                ></v-textarea> -->
              </div>

              <!-- ACTION BUTTONS -->
              <div class="action-buttons" :class="{ mobile: isMobile }">
                <v-btn
                  v-if="edit"
                  outlined
                  color="baseAccent"
                  @click="updateTask(task, index)"
                  :loading="loading"
                  v-bind="attrs"
                  v-on="on"
                >
                  <!-- :disabled="disabled" -->
                  <v-icon left> {{ mdiCheck }} </v-icon>
                  UPDATE
                </v-btn>
                <v-btn
                  v-else
                  outlined
                  color="baseAccent"
                  @click="saveTask(task)"
                  :loading="loading"
                  v-bind="attrs"
                  v-on="on"
                >
                  <!-- :disabled="disabled" -->
                  <v-icon left> {{ mdiCheck }} </v-icon>
                  SAVE
                </v-btn>

                <!-- DELETE -->
                <v-btn
                  v-if="edit"
                  outlined
                  :disabled="disabled || loading"
                  color="error"
                  @click="deleteDialog()"
                >
                  <v-icon left> {{ mdiDelete }} </v-icon>
                  DELETE
                </v-btn>

                <v-btn
                  outlined
                  :color="$vuetify.theme.dark ? 'white' : 'f7f7ff'"
                  @click="cancel"
                  :disabled="disabled || loading"
                >
                  <v-icon left> {{ mdiClose }} </v-icon>
                  Cancel
                </v-btn>
              </div>
              <!-- End action-buttons -->
            </div>
            <!-- End create-dialog-content -->

            <!-- SAVE -->
            <!-- <div class="create-field" :style="{ justifyContent: 'center' }">
              <v-btn
                outlined
                color="missionAccent"
                v-bind="attrs"
                v-on="on"
                @click="saveTask(task)"
              >
                <v-icon left>
                  {{mdiCheck}}
                </v-icon>
                SAVE
              </v-btn>
            </div> -->
          </div>
        </v-dialog>

        <!-- CONFIRM DELETE DIALOG -->
        <v-dialog v-model="dialogConfirm" width="40%" light>
          <div class="create-dialog">
            <!-- HEADER -->
            <div class="dialog-header py-10">
              <p class="dialog-title"><strong>Warning!</strong> Delete Mission?</p>
              <div class="d-flex align-start">
                <v-icon left color="missionAccent">{{ mdiInformationVariant }}</v-icon>
                <p class="dialog-description">
                  Are you sure you want to <strong>DELETE</strong> this
                  <span class="mission-text">{{ task.title }} Mission</span>?
                  <br />
                  <br />
                  Deleting is permanent!!!
                  <br />
                  <br />
                  <strong>YOU WILL LOSE ALL </strong>
                  <span class="mission-text">Mission</span> data.
                </p>
              </div>
            </div>

            <!-- ACTION BUTTONS -->
            <div class="action-buttons">
              <!-- DELETE -->
              <v-btn
                outlined
                color="error"
                @click="confirmDeleteTask()"
                class="ml-2"
                :loading="deleting"
              >
                <v-icon left> {{ mdiDelete }} </v-icon>
                DELETE
              </v-btn>

              <v-btn
                v-if="!deleting"
                outlined
                :color="$vuetify.theme.dark ? 'yellow' : 'f7f7ff'"
                class="ml-2"
                @click="cancelDeleteDialog"
                :disabled="disabled || loading"
              >
                <v-icon left> {{ mdiClose }} </v-icon>
                Cancel
              </v-btn>
            </div>
            <!-- End action-buttons -->
          </div>
          <!-- End create-dialog-content -->
        </v-dialog>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import {
  createTaskWithCourseIdTopicId,
  deleteTaskByCourseIdTopicIdTaskId,
  updateTaskByCourseIdTopicIdTaskId,
  generateInstructionsForMission,
} from "@/lib/ff";
import { db, storage, functions } from "@/store/firestoreConfig";
import useRootStore from "@/store/index";
import {
  mdiPencil,
  mdiPlus,
  mdiClose,
  mdiCheck,
  mdiCubeOutline,
  mdiDelete,
  mdiInformationVariant,
  mdiConsoleNetworkOutline,
  mdiRobotExcited,
} from "@mdi/js";
import { VueEditor } from "vue2-editor";
import { mapActions, mapState } from "pinia";
import MissionArtifactPlayerDialog from "@/components/Dialogs/MissionArtifactPlayerDialog.vue";
import RobotLoadingSpinner from "@/components/Reused/RobotLoadingSpinner.vue";
import { getGalaxyMapObjectFromCourse } from "@/lib/ff";
import { isArtifactHtml, resolveMissionContent } from "@/lib/missionArtifact";

export default {
  name: "CreateEditDeleteMissionDialog",
  props: [
    "course",
    "topic",
    "taskId",
    "taskToEdit",
    "index",
    "on",
    "attrs",
    "edit",
    "taskColor",
    "tasks",
  ],
  components: {
    VueEditor,
    MissionArtifactPlayerDialog,
    RobotLoadingSpinner,
  },
  data: () => ({
    mdiPencil,
    mdiPlus,
    mdiClose,
    mdiCubeOutline,
    mdiDelete,
    mdiCheck,
    mdiInformationVariant,
    mdiRobotExcited,
    replacementArtifactHtml: null,
    artifactFileError: "",
    dialog: false,
    dialogConfirm: false,
    dialogTitle: "Create a new Mission",
    dialogDescription: "",
    task: {
      title: "",
      description: "",
      duration: "",
      video: "",
      slides: "",
      submissionRequired: "",
      submissionInstructions: "",
      color: "#69a1e2",
    },
    loading: false,
    disabled: false,
    deleting: false,
    quillFocused: false,
    submissionQuillFocused: false,
    // AI functionality variables
    aiInput: false,
    aiGenerateMissionAssistInput: "",
    aiGenerating: false,
    tokenUsage: null,
    currentLoadingMessage: "",
    loadingMessageInterval: null,
    // Quirky loading messages
    loadingMessages: [
      "Exploring the cosmos for knowledge...",
      "Charting new learning pathways...",
      "Mapping distant galaxies of consciousness...",
      "Calculating interstellar alignments...",
      "Assembling galactic sources of creation...",
      "Searching the stars for enlightenment...",
      "Gathering cosmic learning resources...",
      "Preparing your journey through the stars...",
      "Creating your learning universe...",
      "Calibrating educational coordinates...",
    ],
    // missionGenerationMessages: [
    //   "Crafting mission objectives...",
    //   "Designing learning pathways...",
    //   "Creating step-by-step instructions...",
    //   "Defining success criteria...",
    //   "Mapping skill progression...",
    //   "Building knowledge scaffolds...",
    //   "Structuring learning activities...",
    //   "Developing assessment strategies...",
    //   "Integrating learning resources...",
    //   "Finalizing mission parameters...",
    // ],
    customToolbar: [
      [{ header: [false, 3, 4, 5] }],
      ["bold", "italic", "underline", "strike"], // toggled buttons
      [{ align: "" }, { align: "center" }, { align: "right" }, { align: "justify" }],
      ["blockquote", "code-block"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ indent: "-1" }, { indent: "+1" }], // outdent/indent
      ["link", "image", "video"],
      // ["clean"] // remove formatting button
    ],
    darkSwatches: [["#69A1E2"], ["#E269CF"], ["#00E676"], ["#FAF200"]], //https://coolors.co/69a1e2-e269cf-73fbd3-f3c969-54428e
  }),
  watch: {
    dialog(newVal) {
      if (newVal && this.taskToEdit) {
        Object.assign(this.task, this.taskToEdit);
        this.replacementArtifactHtml = null;
        this.artifactFileError = "";
        // Artifact missions never go through Quill — shown as a preview panel instead
        if (this.isArtifactMission) return;
        // If there's existing HTML content, set it in the Quill editor
        // Prioritize missionInstructionsHtmlString over description for consistency with other components
        const contentToDisplay = this.task.missionInstructionsHtmlString || this.task.description;
        if (contentToDisplay && contentToDisplay.trim()) {
          this.$nextTick(() => {
            // Clean the HTML before setting it to prevent empty paragraphs
            const cleanedHtml = this.sanitizeHtmlEdges(contentToDisplay);
            this.setQuillContent(cleanedHtml);
          });
        }
      }
    },
  },
  // mounted() {
  //   if (this.taskToEdit) {
  //     console.log("editing task");
  //     // this.task = this.taskToEdit;
  //     Object.assign(this.taskToEdit, this.task)
  //   }
  // },
  computed: {
    ...mapState(useRootStore, ["person"]),
    /**
     * Artifact missions (complete standalone HTML players) must never be
     * loaded into Quill — it mangles them. Detected from the original task.
     */
    isArtifactMission() {
      return resolveMissionContent(this.taskToEdit).mode === "artifact";
    },
    artifactHtml() {
      return (
        this.replacementArtifactHtml ||
        (this.taskToEdit && this.taskToEdit.missionInstructionsHtmlString) ||
        ""
      );
    },
    artifactForPreview() {
      return this.artifactHtml ? { kind: "html-inline", html: this.artifactHtml } : null;
    },
    artifactSizeKb() {
      return Math.round(new Blob([this.artifactHtml]).size / 1024);
    },
    dark() {
      return this.$vuetify.theme.isDark;
    },
    isMobile() {
      return this.$vuetify.breakpoint.smAndDown;
    },
  },
  methods: {
    ...mapActions(useRootStore, ["getCourseTasks"]),
    /**
     * Build a safe payload for Firestore (strip undefined fields)
     */
    buildTaskPayload(task) {
      const allowedKeys = [
        "title",
        "description",
        "missionInstructionsHtmlString",
        "duration",
        "video",
        "slides",
        "submissionRequired",
        "submissionInstructions",
        "color",
        "orderIndex",
        "missionRenderMode",
      ];
      const payload = {};
      allowedKeys.forEach((key) => {
        // only copy keys that are not undefined (Firestore rejects undefined)
        if (typeof task[key] !== "undefined") {
          payload[key] = task[key];
        }
      });
      return payload;
    },
    async saveTask(task) {
      this.loading = true;
      this.disabled = true;

      if (this.isArtifactMission) {
        this.applyArtifactFields(task);
      } else {
        // Pull fresh HTML directly from Quill, upload embedded images, and sanitize it
        try {
          let htmlFromEditor = this.getQuillHtml();
          htmlFromEditor = await this.replaceBase64ImagesWithStorageUrls(htmlFromEditor);
          const sanitizedHtml = this.sanitizeHtmlEdges(htmlFromEditor);
          task.description = sanitizedHtml;
          task.missionInstructionsHtmlString = sanitizedHtml;
          this.task.description = sanitizedHtml;
          this.task.missionInstructionsHtmlString = sanitizedHtml;
        } catch (e) {
          // ignore and keep current description
        }
      }

      // format video & slides url with "http://"
      if (task.video) {
        if (!/^https?:\/\//i.test(task.video)) {
          task.video = "http://" + task.video;
        }
      }
      if (task.slides) {
        if (!/^https?:\/\//i.test(task.slides)) {
          task.slides = "http://" + task.slides;
        }
      }
      task.orderIndex = this.tasks.length ? this.tasks.length++ : 0;
      const safeTask = this.buildTaskPayload(task);
      const createdTask = await createTaskWithCourseIdTopicId(
        this.course.id,
        this.topic.id,
        safeTask,
      );

      this.$emit("taskCreated", createdTask);
      console.log("createdTask", createdTask);

      this.loading = false;
      this.disabled = false;
      this.dialog = false;

      this.task = {
        title: "",
        description: "",
        duration: "",
        video: "",
        slides: "",
        submissionRequired: "",
        submissionInstructions: "",
        color: "#69a1e2",
      };
    },
    async updateTask(task, index) {
      this.loading = true;
      this.disabled = true;

      if (this.isArtifactMission) {
        this.applyArtifactFields(task);
      } else {
        // Pull fresh HTML directly from Quill, upload embedded images, and sanitize it
        try {
          let htmlFromEditor = this.getQuillHtml();
          htmlFromEditor = await this.replaceBase64ImagesWithStorageUrls(htmlFromEditor);
          const sanitizedHtml = this.sanitizeHtmlEdges(htmlFromEditor);
          task.description = sanitizedHtml;
          task.missionInstructionsHtmlString = sanitizedHtml;
          this.task.description = sanitizedHtml;
          this.task.missionInstructionsHtmlString = sanitizedHtml;
        } catch (e) {
          // ignore and keep current description
        }
      }

      // format video & slides url with "http://"
      if (task.video) {
        if (!/^https?:\/\//i.test(task.video)) {
          task.video = "http://" + task.video;
        }
      }
      if (task.slides) {
        if (!/^https?:\/\//i.test(task.slides)) {
          task.slides = "http://" + task.slides;
        }
      }

      // remove taskCreatedTimestamp so it does not update original (there was a change in format when this was happening)
      delete task.taskCreatedTimestamp;

      const safeTask = this.buildTaskPayload(task);
      const updatedTask = await updateTaskByCourseIdTopicIdTaskId(
        this.course.id,
        this.topic.id,
        this.taskId,
        safeTask,
      );

      this.$emit("taskUpdated", updatedTask);

      this.loading = false;
      this.disabled = false;
      this.dialog = false;
    },
    cancel() {
      this.dialog = false;
    },
    /**
     * Keep the artifact intact on save: never overwrite the standalone HTML
     * player with Quill output. Applies a replacement file if one was loaded.
     */
    applyArtifactFields(task) {
      const html = this.artifactHtml;
      task.missionInstructionsHtmlString = html;
      task.missionRenderMode = "iframe";
      this.task.missionInstructionsHtmlString = html;
      this.task.missionRenderMode = "iframe";
    },
    async onArtifactFileSelected(file) {
      this.artifactFileError = "";
      if (!file) {
        this.replacementArtifactHtml = null;
        return;
      }
      const text = await file.text();
      if (!isArtifactHtml(text)) {
        this.artifactFileError = "Not a complete HTML document (must start with <!DOCTYPE html>)";
        this.replacementArtifactHtml = null;
        return;
      }
      if (new Blob([text]).size > 900 * 1024) {
        this.artifactFileError = "Artifact exceeds 900KB (Firestore document limit)";
        this.replacementArtifactHtml = null;
        return;
      }
      this.replacementArtifactHtml = text;
    },
    // delete task
    deleteDialog() {
      (this.dialog = false), (this.dialogConfirm = true);
    },
    cancelDeleteDialog() {
      this.dialogConfirm = false;
      this.dialog = true;
    },
    async confirmDeleteTask() {
      this.deleting = true;
      const deletedTask = await deleteTaskByCourseIdTopicIdTaskId(
        this.course.id,
        this.topic.id,
        this.taskId,
      );

      this.$emit("taskDeleted", deletedTask);

      // close dialog
      this.deleting = false;
      this.dialogConfirm = false;
    },
    handleDescriptionImageAdded(file, Editor, cursorLocation) {
      console.log("image file", file);
      // ceate a storage ref
      const storageRef = storage.ref(
        "missionDescription-images/teacher-" + this.person.id + this.task.id + "-" + file.name,
      );

      // upload a file
      const uploadTask = storageRef.put(file);

      // update progress bar
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // show progress on uploader bar
          console.log("image upload: ", snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        },
        // upload error
        (err) => {
          console.log(err);
        },
        // upload complete
        () => {
          // get image url
          uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
            // add image url to course obj
            Editor.insertEmbed(cursorLocation, "image", downloadURL);
          });
        },
      );
    },
    handleSubmissionImageAdded(file, Editor, cursorLocation) {
      console.log("image file", file);
      // ceate a storage ref
      const storageRef = storage.ref(
        "missionSubmission-images/teacher-" +
          this.person.id +
          "-task-" +
          this.task.id +
          "-" +
          file.name,
      );

      // upload a file
      const uploadTask = storageRef.put(file);

      // update progress bar
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // show progress on uploader bar
          console.log("image upload: ", snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        },
        // upload error
        (err) => {
          console.log(err);
        },
        // upload complete
        () => {
          // get image url
          uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
            // add image url to course obj
            Editor.insertEmbed(cursorLocation, "image", downloadURL);
          });
        },
      );
    },
    /**
     * Formats structured mission instructions into HTML
     * @param missionInstructions - The structured mission instructions object
     * @returns HTML string
     */
    formatMissionInstructionsToHtml(missionInstructions) {
      if (!missionInstructions) return "";

      try {
        let html = "";

        // Add description
        if (missionInstructions.description) {
          html += `<p>${missionInstructions.description}</p>`;
        }

        // Add instructions section
        if (missionInstructions.instructions && missionInstructions.instructions.length > 0) {
          html += `<h2>Instructions</h2>`;

          // Loop through each instruction step
          missionInstructions.instructions.forEach((step) => {
            // Add step title
            if (step.title) {
              html += `<h3>${step.title}</h3>`;
            }

            // Add tasks as unordered list
            if (step.tasks && step.tasks.length > 0) {
              html += `<ul>`;
              step.tasks.forEach((task) => {
                if (task.taskContent) {
                  // Convert **bold text** to <strong>bold text</strong>
                  const formattedContent = task.taskContent.replace(
                    /\*\*(.*?)\*\*/g,
                    "<strong>$1</strong>",
                  );
                  html += `<li>${formattedContent}</li>`;
                }
              });
              html += `</ul>`;
            }
          });
        }

        // Add summary
        if (missionInstructions.summary) {
          html += `<p>${missionInstructions.summary}</p>`;
        }

        console.log("🔄 Formatted mission instructions to HTML:", html);
        return html;
      } catch (error) {
        console.error("❌ Error formatting mission instructions to HTML:", error);
        return ""; // Fallback to empty string
      }
    },

    /**
     * Properly sets HTML content in the Quill editor
     * @param htmlContent - The HTML content to set
     */
    setQuillContent(htmlContent) {
      this.$nextTick(() => {
        const quillEditor = this.$refs.quillEditor;
        if (quillEditor && quillEditor.quill) {
          try {
            // Replace content atomically without pre-clearing to avoid stray <p>
            const quill = quillEditor.quill;
            const delta = quill.clipboard.convert(htmlContent || "");
            quill.setContents(delta, "silent");
            // Sync v-model with rendered HTML and ensure no empty paragraphs
            const renderedHtml = quill.root.innerHTML;
            this.task.description = this.sanitizeHtmlEdges(renderedHtml);
            console.log("🔄 Quill content set successfully (atomic replace)");
          } catch (error) {
            console.error("❌ Error setting Quill content:", error);
            // Fallback: dangerouslyPasteHTML
            try {
              quillEditor.quill.clipboard.dangerouslyPasteHTML(0, htmlContent || "", "silent");
              const renderedHtml = quillEditor.quill.root.innerHTML;
              this.task.description = this.sanitizeHtmlEdges(renderedHtml);
              console.log("🔄 Quill content set using dangerouslyPasteHTML fallback");
            } catch (fallbackError) {
              console.error("❌ Fallback also failed:", fallbackError);
              // Last resort: set as plain text
              quillEditor.quill.setText(htmlContent || "");
              const renderedHtml = quillEditor.quill.root.innerHTML;
              this.task.description = this.sanitizeHtmlEdges(renderedHtml);
            }
          }
        } else {
          console.warn("⚠️ Quill editor not found");
        }
      });
    },

    /**
     * Returns current HTML from the Quill editor
     */
    getQuillHtml() {
      const quill = this.$refs.quillEditor && this.$refs.quillEditor.quill;
      return quill ? quill.root.innerHTML : this.task.description || "";
    },

    /**
     * Removes leading/trailing empty paragraphs and any completely empty content
     */
    sanitizeHtmlEdges(html) {
      if (!html) return "";
      let sanitized = html;

      // Remove completely empty content
      if (sanitized.trim() === "" || sanitized === "<p><br></p>" || sanitized === "<p></p>") {
        return "";
      }

      // Trim leading empty paragraphs
      sanitized = sanitized.replace(/^(\s*<p>(?:\s|&nbsp;|<br\s*\/?\s*>)*<\/p>\s*)+/i, "");
      // Trim trailing empty paragraphs
      sanitized = sanitized.replace(/(\s*<p>(?:\s|&nbsp;|<br\s*\/?\s*>)*<\/p>\s*)+$/i, "");

      // Remove any remaining standalone empty paragraphs
      sanitized = sanitized.replace(/<p>\s*<\/p>/gi, "");
      sanitized = sanitized.replace(/<p><br><\/p>/gi, "");

      return sanitized;
    },

    /**
     * Replace embedded base64 <img> sources with Firebase Storage URLs
     */
    async replaceBase64ImagesWithStorageUrls(originalHtml) {
      let html = originalHtml || "";
      const imgTagRegex =
        /<img[^>]+src=["'](data:image\/[a-zA-Z0-9+.-]+;base64,[^"']+)["'][^>]*>/gi;
      const dataUrls = new Set();

      let match;
      while ((match = imgTagRegex.exec(html)) !== null) {
        const dataUrl = match[1];
        if (dataUrl && dataUrl.startsWith("data:image/")) {
          dataUrls.add(dataUrl);
        }
      }

      if (dataUrls.size === 0) return html;

      let index = 0;
      for (const dataUrl of dataUrls) {
        try {
          const extMatch = /^data:image\/(\w+);/i.exec(dataUrl);
          const ext = (extMatch && extMatch[1]) || "png";
          const storagePath = `missionDescription-images/teacher-${this.person.id}-task-${
            this.taskId || "new"
          }-${Date.now()}-${index}.${ext}`;
          const ref = storage.ref(storagePath);
          const snapshot = await ref.putString(dataUrl, "data_url");
          const downloadURL = await snapshot.ref.getDownloadURL();
          html = html.split(dataUrl).join(downloadURL);
          index++;
        } catch (e) {
          console.error("❌ Failed to upload embedded image:", e);
        }
      }

      return html;
    },

    // AI functionality methods
    toggleAiInput() {
      this.aiInput = !this.aiInput;
      if (!this.aiInput) {
        this.aiGenerateMissionAssistInput = "";
      }
    },
    async aiGenerateMissionAssist() {
      this.aiGenerating = true;
      this.loading = true;
      this.startLoadingMessages();

      try {
        console.log("🚀 Starting AI mission instructions generation...");

        // check if we have a galaxy map object on the course already
        if (this.course.galaxyMapAsObject) {
          this.galaxyMapContext = this.course.galaxyMapAsObject;
          console.log("🔄 Galaxy map object found on course. Continuing with a galaxyMapContet");
        } else {
          console.log("🔄 No galaxy map object found on course, fetching from server...");
          const galaxyMapObject = await getGalaxyMapObjectFromCourse(this.course.id);
          console.log("🔄 Galaxy map object generated from server:", galaxyMapObject);
          this.galaxyMapContext = galaxyMapObject;
        }

        // Call the imported function to generate mission instructions
        const response = await generateInstructionsForMission(
          this.task.title, // missionContext (title)
          this.galaxyMapContext, // galaxyMapContext
          undefined, // originResponseId
          // refinement
          {
            currentInstructions:
              this.task.description && this.task.description.trim()
                ? this.task.description
                : undefined,
            userFeedback:
              this.aiGenerateMissionAssistInput && this.aiGenerateMissionAssistInput.trim()
                ? this.aiGenerateMissionAssistInput
                : undefined,
          },
        );

        if (response.success && response.missionInstructions) {
          console.log(
            "🔄 AI mission instructions generated successfully",
            response.missionInstructions,
          );

          // Format the structured mission instructions to HTML
          const formattedHtml = this.formatMissionInstructionsToHtml(response.missionInstructions);

          // Update the task description with the formatted HTML content
          this.task.description = formattedHtml;

          // Use the new method to properly set content in Quill
          this.setQuillContent(formattedHtml);

          // Store token usage for display
          this.tokenUsage = response.tokenUsage;

          console.log("✅ AI mission instructions generated and parsed successfully");
          console.log("Token usage:", response.tokenUsage);

          // Clear the input and close AI panel
          this.aiGenerateMissionAssistInput = "";
          this.aiInput = false;
        } else {
          throw new Error("Failed to generate mission instructions");
        }
      } catch (error) {
        console.error("❌ Error generating mission instructions:", error);

        // Show error message to user
        this.$emit("error", {
          message: "Failed to generate mission instructions. Please try again.",
          error: error.message,
        });
      } finally {
        this.aiGenerating = false;
        this.loading = false;
        this.stopLoadingMessages();
      }
    },

    // Loading message management
    startLoadingMessages() {
      const messages = this.loadingMessages;
      this.currentLoadingMessage = messages[0];
      this.loadingMessageInterval = setInterval(() => {
        const currentIndex = messages.indexOf(this.currentLoadingMessage);
        const nextIndex = (currentIndex + 1) % messages.length;
        this.currentLoadingMessage = messages[nextIndex];
      }, 3000);
    },
    stopLoadingMessages() {
      if (this.loadingMessageInterval) {
        clearInterval(this.loadingMessageInterval);
        this.loadingMessageInterval = null;
      }
      this.currentLoadingMessage = "";
    },
  },
};
</script>

<style scoped lang="scss">
::v-deep .ql-tooltip {
  left: unset !important;
}
.artifact-panel {
  border: 1px dashed var(--v-missionAccent-base);
  padding: 16px;
}
.create-dialog {
  background-color: var(--v-background-base);
  border: 1px solid var(--v-missionAccent-base);
  // background: lightGrey;
  display: flex;
  // flex-direction: column;
  flex-wrap: wrap;
  overflow-x: hidden;
  overflow-y: auto;
  position: relative;

  &.mobile {
    width: 100%;
  }

  .dialog-header {
    width: 100%;
    padding: 20px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--v-missionAccent-base);
  }

  .dialog-description {
    color: var(--v-missionAccent-base);
    text-transform: uppercase;
    font-size: 0.7rem;
    margin: 0;
    font-style: italic;
  }

  .left-side {
    width: 50%;
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    transition: all 0.3s;
  }

  .right-side {
    width: 50%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    transition: all 0.3s;
    // flex-direction: column;
    // border-left: 1px solid var(--v-missionAccent-base);

    // galaxy info
    #galaxy-info {
      width: calc(100% - 40px);
      // min-height: 100%;
      border: 1px solid var(--v-galaxyAccent-base);
      margin-top: 30px;
      padding: 20px;
      // background: var(--v-baseAccent-base);
      position: relative;
      z-index: 3;

      .galaxy-label {
        font-size: 0.8rem;
        font-weight: 400;
        text-transform: uppercase;
        // ribbon label
        position: absolute;
        top: -1px;
        left: -1px;
        background-color: var(--v-galaxyAccent-base);
        color: var(--v-background-base);
        padding: 0px 15px 0px 5px;
        clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
      }

      .galaxy-title {
        font-size: 1.2rem;
        color: var(--v-galaxyAccent-base);
        font-weight: 600;
        text-transform: uppercase;
        margin: 20px 0px 5px 0px;
      }

      .galaxy-description {
        margin-top: 10px;
        color: var(--v-galaxyAccent-base);
        // font-size: 0.9rem;
      }
    }
  }

  .action-buttons {
    width: 100%;
    padding: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;

    &.mobile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;

      .v-btn {
        width: 100%;
      }
    }
  }
}

.create-dialog-content {
  // width: 33.33%;
  min-height: 400px;
  display: flex;
  justify-content: space-around;
  align-items: space-around;
  flex-direction: column;
  padding: 20px;
  width: 100%;
  // font-size: 0.6rem;
  // border: 1px solid var(--v-missionAccent-base);

  .dialog-title {
    color: var(--v-missionAccent-base);
    text-transform: uppercase;
  }

  .input-field {
    width: 100%;
    text-align: center;
    flex: none;
    font-size: 0.8rem;
    color: var(--v-missionAccent-base);
  }
}

.dialog-description {
  color: var(--v-missionAccent-base);
  text-transform: uppercase;
  font-size: 0.7rem;
  margin: 0;
  font-style: italic;

  .galaxy-text {
    color: var(--v-galaxyAccent-base);
    text-transform: uppercase;
    font-weight: 700;
  }

  .mission-text {
    color: var(--v-missionAccent-base);
    text-transform: uppercase;
    font-weight: 700;
  }
}

.circle-outline {
  // border: 1px solid var(--v-cohortAccent-base);
  border-radius: 50%;
}

.submission-colour {
  color: var(--v-cohortAccent-base) !important;
}

.quill ::v-deep .ql-toolbar {
  border: 1px solid #ffffff45;
}

.quill ::v-deep .ql-container {
  border: 1px solid #ffffff45;

  .ql-editor {
    font-size: 0.9rem;
    color: white;

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0.5em 0;
      font-weight: bold;
      color: white;
    }

    h1 {
      font-size: 1.5em;
    }
    h2 {
      font-size: 1.3em;
    }
    h3 {
      font-size: 1.1em;
    }
    h4 {
      font-size: 1em;
    }

    p {
      margin: 0.5em 0;
      color: white;
    }

    ul,
    ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
      color: white;

      li {
        margin: 0.25em 0;
        color: white;

        ul,
        ol {
          margin: 0.25em 0;
          padding-left: 1.5em;
        }
      }
    }

    strong {
      font-weight: bold;
      color: white;
    }

    em {
      font-style: italic;
      color: white;
    }

    code {
      background-color: rgba(255, 255, 255, 0.1);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: monospace;
      color: white;
    }

    pre {
      background-color: rgba(255, 255, 255, 0.05);
      padding: 1em;
      border-radius: 5px;
      overflow-x: auto;
      color: white;
    }

    pre code {
      background-color: transparent;
      padding: 0;
      color: white;
    }
  }
}

.active-quill ::v-deep .ql-toolbar {
  border: 1px solid var(--v-missionAccent-base);
}

.active-quill ::v-deep .ql-container {
  border: 1px solid var(--v-missionAccent-base);
}

.active-submission-quill ::v-deep .ql-toolbar {
  border: 1px solid var(--v-cohortAccent-base);
}

.active-submission-quill ::v-deep .ql-container {
  border: 1px solid var(--v-cohortAccent-base);
}

// Loading overlay styles
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--v-background-base);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0.95;
  overflow-y: auto;
  padding: 2rem;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0;
  overflow-y: visible;
  width: 100%;
  margin: 0 auto;
}

.loading-message {
  color: var(--v-missionAccent-base);
  margin-top: 1rem;
  text-transform: uppercase;
  letter-spacing: 2px;
  animation: fadeInOut 3s ease-in-out infinite;
}

.token-usage {
  color: var(--v-galaxyAccent-base);
  margin-top: 0.5rem;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: normal !important;
  margin: 5px !important;
}

.token-breakdown {
  color: var(--v-missionAccent-base);
  margin-top: 0.25rem;
  font-size: 0.7rem;
  opacity: 0.8;
  line-height: normal !important;
  margin: 5px !important;
}

.model-breakdown {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: rgba(var(--v-background-base), 0.1);
  border-radius: 4px;
  border: 1px solid rgba(var(--v-missionAccent-base), 0.2);
}

.model-breakdown-title {
  color: var(--v-galaxyAccent-base);
  font-size: 0.7rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0.125rem 0;
  font-size: 0.65rem;
  color: var(--v-missionAccent-base);
  opacity: 0.9;
}

.model-name {
  font-weight: 600;
  color: var(--v-galaxyAccent-base);
}

.model-tokens {
  opacity: 0.7;
}

.model-cost {
  font-weight: 600;
  color: var(--v-missionAccent-base);
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

// Medium screens (768px - 960px)
@media (min-width: 769px) and (max-width: 960px) {
  .create-dialog {
    .action-buttons {
      margin: 0 auto;
      padding: 20px;
      display: flex;
      gap: 20px;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 600px;

      // Row layout
      &:not(.mobile) {
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;

        .v-btn {
          flex: 0 0 auto;
          min-width: 120px;
        }
      }
    }
  }
}
</style>
