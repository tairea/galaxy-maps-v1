<template>
  <v-container>
    <v-row class="text-center" align="center">
      <v-col cols="12">
        <v-dialog v-model="dialog" :width="isMobile ? '90%' : '40%'" light persistent>
          <!-- CREATE BUTTON -->
          <template v-slot:activator="{ on, attrs }">
            <!-- ASSIGN COHORT -->
            <v-btn
              v-if="assignCohorts"
              outlined
              color="baseAccent"
              v-bind="attrs"
              v-on="on"
              class="assignButton d-inline-flex text-truncate"
            >
              <v-icon small> {{ mdiAccountMultiplePlus }} </v-icon>
            </v-btn>
            <!-- ASSIGN GALAXY -->
            <v-btn
              v-else-if="assignCourses"
              outlined
              color="baseAccent"
              v-bind="attrs"
              v-on="on"
              class="assignButton d-inline-flex text-truncate"
            >
              <v-icon left> {{ mdiChartTimelineVariantShimmer }} </v-icon>
              ASSIGN GALAXY
            </v-btn>
          </template>

          <!-- ===== ASSIGN COHORT TO COURSE (EG. FROM COURSE VIEW) ===== -->
          <div v-if="assignCohorts" class="create-dialog">
            <v-tabs
              v-model="tab"
              fixed-tabs
              background-color="transparent"
              dark
              slider-color="baseAccent"
              class="mt-4"
            >
              <v-tab>
                <p class="baseAccent--text tab">Individual</p>
              </v-tab>
              <v-tab v-if="teachersCohorts.length">
                <p class="baseAccent--text tab">Squads</p>
              </v-tab>
              <!-- <v-tab><p class="baseAccent--text tab">Organisation</p></v-tab> -->
            </v-tabs>

            <v-tabs-items v-model="tab">
              <!-- Individual -->
              <v-tab-item>
                <!-- HEADER -->
                <div class="dialog-header">
                  <p class="dialog-title">Assign to a Navigator</p>
                  <div class="d-flex align-center">
                    <v-icon left color="missionAccent">{{ mdiInformationVariant }}</v-icon>
                    <p class="dialog-description">
                      Assign this Galaxy Map to a Navigator using their e-mail address
                    </p>
                  </div>
                </div>
                <div class="create-dialog-content">
                  <!-- TITLE -->
                  <!-- <p class="dialog-description">Person's E-mail address:</p> -->
                  <v-text-field
                    class="input-field"
                    outlined
                    dark
                    color="missionAccent"
                    v-model="profile.email"
                    label="Person's email address"
                    light
                  ></v-text-field>
                  <div>
                    <p class="dialog-description">Assign this Navigator to a squad</p>
                    <div class="d-flex align-center">
                      <v-icon left color="missionAccent">{{ mdiInformationVariant }}</v-icon>
                      <p class="dialog-description py-2">
                        Navigator progression is tracked at the Squad level
                      </p>
                    </div>
                    <v-select
                      v-if="currentCourse != null"
                      v-model="cohort"
                      :items="cohortOptions"
                      outlined
                      single-line
                      :disabled="!cohortOptions.length"
                      class="cohort-select"
                    >
                      <template v-slot:selection="{ item }">
                        <v-list-item-avatar tile>
                          <img v-if="item.image && item.image.url" :src="item.image.url" />
                          <v-icon v-else>{{ mdiStarThreePoints }}</v-icon>
                        </v-list-item-avatar>
                        <v-list-item-content
                          ><p class="cohortAccent--text">{{ item.name }}</p>
                        </v-list-item-content>
                      </template>
                      <template v-slot:item="{ item }">
                        <v-list-item-avatar tile>
                          <img v-if="item.image && item.image.url" :src="item.image.url" />
                          <v-icon v-else>{{ mdiStarThreePoints }}</v-icon>
                        </v-list-item-avatar>
                        <v-list-item-content>
                          <p class="cohortAccent--text">{{ item.name }}</p>
                        </v-list-item-content>
                      </template>
                    </v-select>
                  </div>
                </div>

                <!-- End create-dialog-content -->
                <!-- ACTION BUTTONS -->
                <div class="action-buttons">
                  <v-btn
                    v-if="assignCohorts"
                    :disabled="!profile.email"
                    outlined
                    color="baseAccent"
                    @click="assignCourseToPerson(profile)"
                    :loading="loading"
                  >
                    <v-icon left> {{ mdiCheck }} </v-icon>
                    ASSIGN PERSON
                  </v-btn>

                  <v-btn
                    outlined
                    :color="$vuetify.theme.dark ? 'white' : 'f7f7ff'"
                    class="ml-2"
                    @click="close"
                    :disabled="loading"
                  >
                    <v-icon left> {{ mdiClose }} </v-icon>
                    Cancel
                  </v-btn>
                </div>
                <!-- End action-buttons -->
              </v-tab-item>
              <!-- Cohorts -->
              <v-tab-item>
                <!-- HEADER -->
                <div class="dialog-header">
                  <p class="dialog-title">Assign to a Squad</p>
                  <div class="d-flex align-center">
                    <v-icon left color="missionAccent">{{ mdiInformationVariant }}</v-icon>
                    <p class="dialog-description">
                      Assign this Galaxy Map to an entire
                      <span class="cohortAccent--text">Squad</span> of Navigators
                    </p>
                  </div>
                </div>
                <div class="create-dialog-content">
                  <!-- TITLE -->
                  <p class="dialog-description">Squads:</p>
                  <v-select v-if="assignCohorts" v-model="selectedCohort" :items="teachersCohorts">
                    <template v-slot:selection="{ item }">
                      <v-list-item-avatar tile>
                        <img v-if="item.image && item.image.url" :src="item.image.url" />
                        <v-icon v-else>{{ mdiStarThreePoints }}</v-icon>
                      </v-list-item-avatar>
                      <v-list-item-content
                        ><p class="cohortAccent--text">{{ item.name }}</p>
                      </v-list-item-content>
                    </template>
                    <template v-slot:item="{ item }">
                      <v-list-item-avatar tile>
                        <img v-if="item.image && item.image.url" :src="item.image.url" />
                        <v-icon v-else>{{ mdiStarThreePoints }}</v-icon>
                      </v-list-item-avatar>
                      <v-list-item-content>
                        <p class="cohortAccent--text">{{ item.name }}</p>
                      </v-list-item-content>
                    </template>
                  </v-select>
                </div>
                <!-- ACTION BUTTONS -->
                <div class="action-buttons d-flex">
                  <div class="d-flex flex-column">
                    <v-btn
                      v-if="assignCohorts"
                      outlined
                      color="baseAccent"
                      @click="assignCourseToCohort(selectedCohort)"
                      :loading="loading"
                    >
                      <v-icon left> {{ mdiCheck }} </v-icon>
                      ASSIGN TO SQUAD
                    </v-btn>
                  </div>

                  <v-btn
                    outlined
                    :color="$vuetify.theme.dark ? 'white' : 'f7f7ff'"
                    class="ml-2"
                    @click="close"
                    :disabled="loading"
                  >
                    <v-icon left> {{ mdiClose }} </v-icon>
                    Cancel
                  </v-btn>
                </div>
                <span v-if="loading && statusMessage" class="status-message baseAccent--text ma-2">
                  {{ statusMessage }}
                </span>
                <!-- End action-buttons -->
              </v-tab-item>
            </v-tabs-items>
          </div>

          <!-- ===== ASSIGN COURSE TO COHORT (EG. FROM COHORT VIEW) ===== -->
          <div v-else-if="assignCourses" class="create-dialog">
            <!-- HEADER -->
            <div class="dialog-header">
              <p class="dialog-title">
                Add another Galaxy Map to Squad:
                <span class="cohortAccent--text">{{ inThisCohort.name }}</span>
              </p>
              <div class="d-flex align-center">
                <p class="dialog-description">Track this Squad through another Galaxy Map</p>
              </div>
            </div>

            <div class="create-dialog-content">
              <p class="dialog-description">Galaxy Maps:</p>
              <v-select v-if="assignCourses" v-model="course" :items="courses" dark>
                <template v-slot:selection="{ item }">
                  <v-list-item-avatar tile>
                    <img v-if="item.image.url" :src="item.image.url" />
                    <v-icon v-else> mdiStarThreePoints </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-content>
                    <v-list-item-title v-html="item.title"></v-list-item-title>
                  </v-list-item-content>
                </template>
                <template v-slot:item="{ item }">
                  <v-list-item-avatar tile>
                    <img v-if="item.image.url" :src="item.image.url" />
                    <v-icon v-else> {{ mdiStarThreePoints }} </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-content>
                    <v-list-item-title v-html="item.title"></v-list-item-title>
                  </v-list-item-content>
                </template>
              </v-select>
            </div>

            <!-- ACTION BUTTONS -->
            <div class="action-buttons d-flex">
              <div class="d-flex flex-column">
                <v-btn
                  v-if="assignCourses"
                  outlined
                  color="baseAccent"
                  @click="assignCourseToCohort(null, course)"
                  :loading="loading"
                >
                  <v-icon left> {{ mdiCheck }} </v-icon>
                  ASSIGN GALAXY MAP
                </v-btn>
                <span v-if="loading && statusMessage" class="status-message baseAccent--text">
                  {{ statusMessage }}
                </span>
              </div>

              <v-btn
                outlined
                :color="$vuetify.theme.dark ? 'white' : 'f7f7ff'"
                class="ml-2"
                @click="close"
                :disabled="loading"
              >
                <v-icon left> {{ mdiClose }} </v-icon>
                Cancel
              </v-btn>
            </div>
          </div>
          <!-- End Assign Courses create-dialog -->
        </v-dialog>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { mapActions, mapState } from "pinia";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  fetchPersonByPersonId,
  fetchCohortByCohortId,
  fetchCourses,
  fetchCourseByCourseId,
  fetchPersonByEmail,
  createPerson,
  addPersonToCohort,
  assignCourseToPerson,
} from "@/lib/ff";
import { db, functions } from "@/store/firestoreConfig";
import useRootStore from "@/store/index";
import {
  mdiClose,
  mdiCheck,
  mdiStarThreePoints,
  mdiInformationVariant,
  mdiAccountMultiplePlus,
  mdiChartTimelineVariantShimmer,
} from "@mdi/js";
import firebase from "firebase/compat/app";
import { doc, updateDoc } from "firebase/firestore";

export default {
  name: "AssignCohortDialog",
  props: ["assignCohorts", "assignCourses", "teachersCohorts", "inThisCohort"],
  data: () => ({
    //icons
    mdiClose,
    mdiCheck,
    mdiStarThreePoints,
    mdiInformationVariant,
    mdiAccountMultiplePlus,
    mdiChartTimelineVariantShimmer,
    tab: null,
    dialog: false,
    loading: false,
    statusMessage: "", // Add status message for tracking assignment progress

    profile: {
      id: "",
      email: "",
    },
    cohort: null,
    course: null,
    courses: [],
    currentCourse: null,
    courseDefaultCohort: null,
    selectedCohort: null,
  }),
  async mounted() {
    if (this.assignCourses) {
      this.courses = await fetchCourses();
    }

    if (this.currentCourseId) {
      this.currentCourse = await fetchCourseByCourseId(this.currentCourseId);
      // the course's default Squad (courseCohort: true) is filtered out of
      // teachersCohorts upstream, so it has to be fetched directly
      if (this.currentCourse?.cohort) {
        this.courseDefaultCohort = await fetchCohortByCohortId(this.currentCourse.cohort);
        if (this.courseDefaultCohort && !this.cohort) {
          this.cohort = this.courseDefaultCohort;
        }
      }
    }
  },
  watch: {
    dialog(newVal) {
      if (newVal && !this.cohort && this.teachersCohorts)
        this.cohort = this.teachersCohorts.find((cohort) => cohort.id == this.currentCohortId);
    },
  },
  computed: {
    ...mapState(useRootStore, ["currentCourseId", "currentCohortId", "person"]),
    cohortOptions() {
      // the course's default Squad first, then the teacher's own squads
      const teacherOptions = this.teachersCohorts || [];
      if (this.courseDefaultCohort) {
        return [
          this.courseDefaultCohort,
          ...teacherOptions.filter((cohort) => cohort.id !== this.courseDefaultCohort.id),
        ];
      }
      return teacherOptions;
    },
    isMobile() {
      return this.$vuetify.breakpoint.smAndDown;
    },
  },
  methods: {
    ...mapActions(useRootStore, ["setSnackbar"]),
    close() {
      this.dialog = false;
      this.loading = false;
      this.statusMessage = "";
      this.profile = {
        id: "",
        email: "",
      };
      // this.cohort = null;
      this.course = null;
    },
    async assignCourseToPerson(profile) {
      this.loading = true;

      // Validate that currentCourse exists
      if (!this.currentCourse) {
        this.setSnackbar({
          show: true,
          text: "No Galaxy Map selected",
          color: "pink",
        });
        this.loading = false;
        return;
      }

      // If we dont already have the students Id, check if they already have an account using their email
      const personExists = await fetchPersonByEmail(profile.email);
      const inviter = this.person.firstName + " " + this.person.lastName;
      if (personExists) {
        personExists.inviter = inviter;
        await this.handleAssignment(personExists, this.currentCourse);
      } else {
        //create the persons account
        profile.inviter = inviter;

        const person = await createPerson(profile);
        await this.handleAssignment(person, this.currentCourse);
      }
    },

    async handleAssignment(person, course) {
      console.log({ person });
      try {
        // Validate course exists
        if (!course || !course.id) {
          throw new Error("No Galaxy Map selected.");
        }

        // Use selected cohort or default to course.cohort
        let cohortToUse = this.cohort;
        if (!cohortToUse && course.cohort) {
          // Fetch the default cohort if not already loaded
          cohortToUse = await fetchCohortByCohortId(course.cohort);
        }

        if (!cohortToUse || !cohortToUse.id) {
          throw new Error("No Squad available for assignment.");
        }

        await assignCourseToPerson(person.id, course.id);
        await addPersonToCohort(person.id, cohortToUse.id);
        if (cohortToUse.courses && cohortToUse.courses.length) {
          // Possible optimize to make this concurrent instead of sequential
          for (const courseId of cohortToUse.courses) {
            // dont need to assign current course again
            if (courseId === course.id) continue;
            await assignCourseToPerson(person.id, courseId);
          }
        }

        this.setSnackbar({
          show: true,
          text: `${
            person.firstName || person.email
          } assigned to ${course.title.toUpperCase()} Galaxy`,
          color: "baseAccent",
        });
        this.sendNewGalaxyEmail(person, course);
        this.$emit("newAssignment", person);
        this.close();
      } catch (error) {
        console.error("Error writing document: ", error);
        // snackbar message
        this.setSnackbar({
          show: true,
          text: getFriendlyErrorMessage(error.code),
          color: "pink",
        });
        this.close();
      }
    },
    sendNewGalaxyEmail(profile, course) {
      const person = {
        ...profile,
        course: course.title,
        inviter: profile.inviter || "Galaxy Maps Admin",
      };
      const sendNewGalaxyEmail = functions.httpsCallable("sendNewGalaxyEmail");
      return sendNewGalaxyEmail(person);
    },
    async assignCourseToCohort(cohort, course) {
      if (!cohort) {
        cohort = await fetchCohortByCohortId(this.currentCohortId);
      }
      if (!course) course = this.currentCourse;
      this.loading = true;
      this.statusMessage = "";

      console.log("assigning course to cohort", cohort, course);

      try {
        // Add a course to a cohort
        await updateDoc(doc(db, "cohorts", cohort.id), {
          courses: firebase.firestore.FieldValue.arrayUnion(course.id),
        });
        // add courses as assignedCourse to each student in the cohort
        if (cohort.students?.length) {
          for (let i = 0; i < cohort.students.length; i++) {
            const studentId = cohort.students[i];
            // Fetch student details to show in status message
            const student = await fetchPersonByPersonId(studentId, cohort.id);
            if (student) {
              this.statusMessage = `Assigning Galaxy Map to Navigator ${
                student.firstName || "Unknown"
              } ${student.lastName || "Navigator"} (${i + 1}/${cohort.students.length})`;
            } else {
              this.statusMessage = `Assigning Galaxy Map to Navigator ${i + 1}/${
                cohort.students.length
              }`;
            }
            await assignCourseToPerson(studentId, course.id);
          }
        }

        this.setSnackbar({
          show: true,
          text: "Squad assigned to Galaxy Map: " + course.title,
          color: "baseAccent",
        });
        this.close();
      } catch (error) {
        console.error("Error writing document: ", error);
        this.setSnackbar({
          show: true,
          text: getFriendlyErrorMessage(error.code),
          color: "pink",
        });
      } finally {
        this.loading = false;
        this.statusMessage = "";
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.cohort-select ::v-deep .v-list-item__content {
  min-width: 250px;
}

/* Dialog */
.assignCohortDialog {
  color: black;
  background: lightGrey;
  display: flex;
  flex-wrap: wrap;
}

.tile {
  width: 100%;
  min-height: 200px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  color: black;
  padding: 20px;
  text-transform: uppercase;
  font-size: 0.6rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.v-input .v-label {
  font-size: 0.8em;
}

.saveButton {
  width: 100%;
  justify-content: center;
}

// new dialog ui
.create-dialog {
  color: var(--v-missionAccent-base);
  background-color: var(--v-background-base);
  border: 1px solid var(--v-missionAccent-base);
  // background: lightGrey;
  display: flex;
  // flex-direction: column;
  flex-wrap: wrap;
  overflow-x: hidden;

  .dialog-header {
    width: 100%;
    padding: 20px;
    text-transform: uppercase;
    // border-bottom: 1px solid var(--v-missionAccent-base);
    background-color: var(--v-background-base);
  }

  .action-buttons {
    width: 100%;
    padding: 20px;
    background-color: var(--v-background-base);
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

      // Row layout (when using d-flex)
      &.d-flex {
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

.create-dialog-content {
  background-color: var(--v-background-base);
  // width: 33.33%;
  // min-height: 400px;
  display: flex;
  // justify-content: space-around;
  // align-items: space-around;
  flex-direction: column;
  color: var(--v-missionAccent-base);
  padding: 20px;
  text-transform: uppercase;
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
    color: var(--v-missionAccent-base) !important;
    text-transform: none;
  }

  .v-application .primary--text {
    color: var(--v-missionAccent-base) !important;
    caret-color: var(--v-missionAccent-base) !important;
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

.assignButton {
  max-width: 100%;
}

.status-message {
  color: var(--v-missionAccent-base);
  font-size: 0.8rem;
  font-style: italic;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
