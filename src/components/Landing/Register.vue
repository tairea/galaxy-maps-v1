<template>
  <div class="register">
    <div id="register-info">
      <h2 class="register-label">{{ closed ? "aplha" : "register" }}</h2>
      <!-- <h1 class="register-title">Register</h1> -->
      <p v-if="closed" class="register-description mt-4">
        GALAXY MAPS is currently in ALPHA testing.
        <br /><br />
        If you would like early access, please email your request to
        <br /><br />
        <a href="mailto:ian@tairea.io">ian@tairea.io</a>
      </p>

      <v-form v-else ref="form" v-model="valid" lazy-validation class="my-4">
        <v-text-field
          dark
          v-model="person.firstName"
          label="First Name"
          required
          color="missionAccent"
          outlined
          class="custom-input mt-6"
        ></v-text-field>
        <v-text-field
          v-model="person.lastName"
          label="Last Name"
          required
          color="missionAccent"
          outlined
          class="custom-input"
        ></v-text-field>
        <!-- <v-text-field
          v-model="person.discord"
          label="Discord Handle (optional)"
          color="missionAccent"
          outlined
          class="custom-input"
        ></v-text-field> -->
        <v-text-field
          type="email"
          v-model="person.email"
          label="E-mail"
          :rules="emailRules"
          required
          color="missionAccent"
          outlined
          class="custom-input"
        ></v-text-field>
        <v-text-field
          v-model="person.password"
          label="Password"
          required
          color="missionAccent"
          outlined
          class="custom-input"
          :append-icon="hide ? mdiEye : mdiEyeOff"
          @click:append="() => (hide = !hide)"
          :type="hide ? 'password' : 'text'"
        ></v-text-field>
        <!-- Photo -->
        <div>
          <p class="caption overline missionAccent--text">Upload profile photo</p>
          <div class="avatars-container d-flex flex-column">
            <div class="upload-avatar-container">
              <v-progress-circular
                v-if="uploading"
                :rotate="360"
                :size="60"
                :width="2"
                :value="uploadPercentage"
                color="baseAccent"
              >
                {{ uploadPercentage + "%" }}
              </v-progress-circular>
              <!-- <v-hover v-else v-slot="{ hover }"> -->
              <v-avatar
                v-else
                color="secondary"
                @mouseenter="onhover = true"
                @mouseleave="onhover = false"
                size="100"
                class="mb-4"
              >
                <img
                  v-if="person.image.url"
                  :src="person.image.url"
                  :alt="person.firstName"
                  style="object-fit: cover"
                />
                <!-- <v-icon v-if="hover">{{mdiPencil}}</v-icon> -->
                <v-icon :dark="dark" :light="!dark" v-else>{{ mdiAccount }}</v-icon>
                <v-fade-transition>
                  <v-overlay v-if="onhover" absolute color="baseAccent">
                    <v-icon small @click="onButtonClick">{{ mdiPencil }}</v-icon>
                  </v-overlay>
                </v-fade-transition>
                <input
                  ref="uploader"
                  class="d-none"
                  type="file"
                  accept="image/*"
                  @change="onFileChanged"
                />
              </v-avatar>
            </div>
            <div class="navigators-avatar-container d-flex flex-wrap pl-1">
              <v-avatar
                v-for="image in navigatorImages"
                :key="image.name"
                size="30"
                class="navigators-avatar mr-2 mb-2"
                :class="{ 'selected-navigator': person.image.url === image.url }"
                @click="selectNavigator(image)"
              >
                <img :src="image.url" :alt="image.name" style="object-fit: cover" />
              </v-avatar>
            </div>
          </div>
          <!-- </v-hover> -->
        </div>
        <v-btn
          :disabled="!valid"
          color="missionAccent"
          class="mt-4"
          @click="register"
          outlined
          width="100%"
          :loading="loading"
        >
          Register
        </v-btn>
      </v-form>
    </div>
    <!-- back button -->
    <div class="backButton">
      <BackButton :toPath="'/login'" />
    </div>
  </div>
</template>

<script>
import BackButton from "@/components/Reused/BackButton.vue";
import { db, storage } from "@/store/firestoreConfig";
import useRootStore from "@/store/index";
import firebase from "firebase/compat/app";
import { mapActions } from "pinia";
import { mdiEye, mdiEyeOff, mdiPencil, mdiAccount } from "@mdi/js";
import { navigatorImages, getFriendlyErrorMessage } from "@/lib/utils";
import { resendVerificationEmail } from "@/lib/ff";

export default {
  name: "Register",
  components: {
    BackButton,
  },
  data: () => ({
    mdiEye,
    mdiEyeOff,
    mdiPencil,
    mdiAccount,
    navigatorImages,
    closed: false,
    valid: true,
    person: {
      firstName: "",
      lastName: "",
      discord: "",
      email: "",
      password: "",
      id: "",
      image: {
        url: "",
        name: "",
      },
    },
    selectedFile: {},
    uploading: false,
    uploadPercentage: 0,
    onhover: false,
    emailRules: [
      (v) => !!v || "E-mail is required",
      (v) => /.+@.+\..+/.test(v) || "E-mail must be valid",
    ],
    loading: false,
    hide: String,
  }),
  computed: {
    dark() {
      return this.$vuetify.theme.isDark;
    },
  },
  mounted() {
    // hack to make active select white
    if (this.$vuetify.theme.isDark) {
      this.$vuetify.theme.themes.dark.primary = "#ffffff"; // white
    } else {
      this.$vuetify.theme.themes.dark.primary = "#000000"; // black
    }
  },
  methods: {
    ...mapActions(useRootStore, ["setSnackbar"]),
    onButtonClick() {
      this.$refs.uploader?.click();
    },
    async onFileChanged(e) {
      this.selectedFile = e.target.files[0];
      await this.storeImage();
    },
    storeImage() {
      this.uploading = true;
      // create a storage ref with safe fallback (id may not exist yet during register)
      const namePart = (this.person.firstName || "") + (this.person.lastName || "");
      const fallback = this.person?.id ? `${this.person.id}-${Date.now()}` : `${Date.now()}`;
      const safePrefix = namePart || fallback;
      const storageRef = storage.ref(`avatar-images/${safePrefix}-${this.selectedFile.name}`);

      // upload a file
      const uploadTask = storageRef.put(this.selectedFile);

      // update progress bar
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // show progress on uploader bar
          this.uploadPercentage = Math.floor(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          );
        },
        // upload error
        (err) => {
          console.log(err);
        },
        // upload complete
        () => {
          // get image url
          uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
            // add image url to person obj
            this.uploading = false;
            this.person.image.url = downloadURL;
            this.person.image.name = this.selectedFile.name;
          });
        },
      );
    },
    register() {
      this.loading = true;
      // add user the auth
      firebase
        .auth()
        .createUserWithEmailAndPassword(this.person.email, this.person.password)
        .then((userRef) => {
          console.log(userRef.user.uid);
          // get new user id
          this.person.id = userRef.user.uid;
          console.log("user created with id: ", this.person.id);
          // remove password so its not saved to database
          delete this.person.password;
          // add time registered
          this.person["registered"] = new Date();
          // profile image is already in person object if uploaded
          // add user to people database
          db.collection("people")
            .doc(this.person.id)
            .set(this.person)
            .catch((error) => {
              console.error("Error writing document: ", error);
            });
        })
        .then(() => {
          const actionCodeSettings = {
            // TODO: Update to galaxymaps.io on deployment
            url: window.location.origin + "/login",
            handleCodeInApp: true,
          };
          firebase.auth().currentUser.sendEmailVerification(actionCodeSettings);
        })
        .then(() => {
          this.loading = false;
          // route to verify email
          this.$router.push("/verify");
          // this.$emit("verify");
        })
        .catch((error) => {
          // Most common dead-end: the email is already registered. Usually this is
          // someone who registered before but never verified (or their link expired)
          // and is now trying again. Turn it into a recovery path instead of an error.
          if (error.code === "auth/email-already-in-use") {
            return this.handleExistingAccount();
          }
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage(error.code),
            color: "pink",
          });
          this.loading = false;
        });
    },
    async handleExistingAccount() {
      const email = this.person.email;
      const password = this.person.password;
      // First try to sign in with the credentials they just entered. If it's the same
      // person re-registering, this works and we can resend a fresh verification link.
      try {
        const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
        if (cred.user && !cred.user.emailVerified) {
          const actionCodeSettings = {
            url: window.location.origin + "/login",
            handleCodeInApp: true,
          };
          await cred.user.sendEmailVerification(actionCodeSettings);
          this.loading = false;
          this.setSnackbar({
            show: true,
            text: "Looks like you already registered but haven't verified your email yet. We've sent you a fresh verification link — please check your inbox.",
            color: "baseAccent",
          });
          this.$router.push("/verify");
          return;
        }
        // Account exists and is already verified — just send them to log in.
        this.loading = false;
        this.setSnackbar({
          show: true,
          text: "You already have a verified account. Please log in.",
          color: "baseAccent",
        });
        this.$router.push("/login");
      } catch (signInErr) {
        // Couldn't sign in (e.g. they used a different/forgotten password). Fall back to
        // the public resend-verification function, which works without the password.
        this.loading = false;
        try {
          const res = await resendVerificationEmail(email);
          if (res.status === "alreadyVerified") {
            this.setSnackbar({
              show: true,
              text: "This email already has a verified account. Please log in, or reset your password if you've forgotten it.",
              color: "baseAccent",
            });
            this.$router.push("/login");
          } else {
            this.setSnackbar({
              show: true,
              text: "This email is already registered. If it wasn't verified yet, we've just emailed you a fresh verification link. Otherwise, please log in.",
              color: "baseAccent",
            });
            this.$router.push("/verify");
          }
        } catch (resendErr) {
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage("auth/email-already-in-use"),
            color: "pink",
          });
        }
      }
    },
    validate() {
      this.$refs.form.validate();
    },
    selectNavigator(image) {
      console.log("Selecting navigator:", image);
      this.person.image.url = image.url;
      this.person.image.name = image.name;
      console.log("Updated person.image:", this.person.image);
    },
  },
};
</script>

<style lang="scss" scoped>
.register {
  width: 100vw;
  height: 100%;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-direction: column;
  background-color: #393e46;
  background-size: cover;
  box-shadow: inset 0 0 0 2000px rgba(20, 30, 48, 0.9);
  // padding-top: 50px;
  padding-bottom: 50px;
  overflow-y: auto;

  p {
    font-size: 0.9rem;
  }

  .custom-input {
    color: var(--v-missionAccent-base);
  }

  #register-info {
    width: 300px;
    // height: 400px;
    border: 1px solid var(--v-missionAccent-base);
    margin-top: 30px;
    padding: 20px;
    // background: var(--v-baseAccent-base);
    position: relative;
    backdrop-filter: blur(2px);
    z-index: 3;

    .register-label {
      font-size: 0.8rem;
      font-weight: 400;
      text-transform: uppercase;
      // ribbon label
      position: absolute;
      top: 0;
      left: -1px;
      background-color: var(--v-missionAccent-base);
      color: var(--v-background-base);
      padding: 0px 15px 0px 5px;
      clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
    }

    .register-title {
      font-size: 1.2rem;
      color: var(--v-missionAccent-base) !important;
      font-weight: 600;
      text-transform: uppercase;
      margin: 20px 0px 5px 0px;
      color: white;
    }

    .register-image {
      width: 100%;
    }

    .register-description {
      margin-top: 10px;
      color: var(--v-missionAccent-base);
      // font-size: 0.9rem;
    }

    .caption {
      text-align: center;
    }

    .avatars-container {
      width: 100%;

      .upload-avatar-container {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .navigators-avatar-container {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;

        .navigators-avatar {
          pointer-events: auto;
          cursor: pointer;
          transition: transform 0.2s ease;

          &:hover {
            transform: scale(1.1);
          }

          &.selected-navigator {
            border: 2px solid var(--v-missionAccent-base);
            transform: scale(1.1);
          }

          img {
            pointer-events: none;
          }
        }
      }
    }
  }

  .backButton {
    margin-top: 15px;
    width: calc(100% - 30px);
    z-index: 999;
  }
}
</style>
