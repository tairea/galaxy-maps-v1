<template>
  <div class="login">
    <p class="gm-title" :style="{ fontSize: isMobile ? '10vw' : '5vw' }">GALAXY MAPS</p>
    <SetInitialPasswordDialog
      ref="initialPassDialog"
      v-if="showInitialPasswordDialog"
      :dialog="showInitialPasswordDialog"
      :userEmail="initialEmail"
      :userId="initialUserId"
      :token="initialSetupToken"
      @passwordSet="onInitialPasswordSet"
    />
    <EmailSignIn v-if="showEmailSignin" />
    <NewPassword
      v-else-if="isResetPassword"
      :actionCode="actionCode"
      :email="accountEmail"
      @close="isResetPassword = false"
    />
    <div v-else-if="isVerifyEmail" id="galaxy-info">
      <h2 class="galaxy-label">EMAIL VERIFIED</h2>
      <v-btn color="baseAccent" class="mr-4 my-4" @click="redirect" outlined width="100%">
        continue to login
      </v-btn>
    </div>
    <div v-else id="galaxy-info">
      <h2 class="galaxy-label">LOGIN</h2>
      <!-- <h1 class="galaxy-title">Login</h1> -->
      <!-- <div class="d-flex justify-center align-center"> -->
      <!-- <v-img class="galaxy-image" :src=""></v-img> -->
      <!-- </div> -->
      <v-form
        ref="form"
        v-model="valid"
        lazy-validation
        class="my-6"
        @keyup.native.enter="valid && login($event)"
      >
        <v-text-field
          type="email"
          v-model="email"
          label="E-mail"
          :rules="emailRules"
          required
          color="baseAccent"
          outlined
          class="custom-input"
        ></v-text-field>
        <v-text-field
          v-model="password"
          label="Password"
          required
          color="baseAccent"
          outlined
          class="custom-input"
          :append-icon="hide ? mdiEye : mdiEyeOff"
          @click:append="() => (hide = !hide)"
          :type="hide ? 'password' : 'text'"
        ></v-text-field>
        <v-btn
          :disabled="!valid"
          color="baseAccent"
          class="mr-4"
          @click="login"
          outlined
          width="100%"
          :loading="loading"
        >
          Sign-in
        </v-btn>
        <v-btn
          color="baseAccent"
          class="mr-4 mt-6"
          @click="googleSignIn"
          outlined
          width="100%"
          :loading="loadingGoogle"
        >
          <v-icon left class="mr-2">{{ mdiGoogle }}</v-icon>
          Sign in with Google
        </v-btn>
      </v-form>

      <router-link to="/register" class="overline mt-4" color="baseAccent--text"
        >Create an Account</router-link
      >
      <br />
      <router-link to="/reset" class="overline mt-4" color="baseAccent--text"
        >Reset Password</router-link
      >
    </div>
  </div>
</template>

<script>
import NewPassword from "@/components/Reused/NewPassword.vue";
import EmailSignIn from "@/components/Reused/EmailSignIn.vue";
import SetInitialPasswordDialog from "@/components/Dialogs/SetInitialPasswordDialog.vue";
import useRootStore from "@/store/index";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { mapActions, mapState } from "pinia";
import { mdiEye, mdiEyeOff, mdiGoogle } from "@mdi/js";
import { getFriendlyErrorMessage, ensureGooglePersonDocument } from "@/lib/utils";
import { db } from "@/store/firestoreConfig";

export default {
  name: "Login",
  components: {
    NewPassword,
    EmailSignIn,
    SetInitialPasswordDialog,
  },
  data: () => ({
    mdiEye,
    mdiEyeOff,
    mdiGoogle,
    valid: true,
    email: "",
    password: "",
    emailRules: [
      (v) => !!v || "E-mail is required",
      (v) => /.+@.+\..+/.test(v) || "E-mail must be valid",
    ],
    loading: false,
    loadingGoogle: false,
    isResetPassword: false,
    accountEmail: "",
    actionCode: "",
    isVerifyEmail: false,
    showEmailSignin: false,
    showInitialPasswordDialog: false,
    initialEmail: "",
    initialUserId: "",
    initialSetupToken: "",
    hide: String,
    // Track verification state to prevent duplicate calls
    verificationInProgress: false,
    processedActionCodes: new Set(),
  }),
  mounted() {
    this.initFromQuery();
  },
  watch: {
    "$route.query.mode"(newMode, oldMode) {
      // Only re-init if mode actually changed and we have an action code
      if (newMode !== oldMode && this.$route.query.oobCode) {
        console.log("Route query mode changed:", oldMode, "->", newMode);
        this.initFromQuery();
      }
    },
    "$route.query.oobCode"(newCode, oldCode) {
      // Re-init if action code changed
      if (newCode !== oldCode && this.$route.query.mode === "verifyEmail") {
        console.log("Route query oobCode changed");
        this.initFromQuery();
      }
    },
  },
  computed: {
    ...mapState(useRootStore, ["person", "user"]),
    isMobile() {
      return this.$vuetify.breakpoint.mobile;
    },
  },
  methods: {
    ...mapActions(useRootStore, ["setSnackbar"]),
    initFromQuery() {
      const mode = this.$route.query.mode || null;
      const actionCode = this.$route.query.oobCode;
      const auth = firebase.auth();
      // console logs for debugging
      console.log(
        "Login initFromQuery mode:",
        mode,
        "actionCode:",
        actionCode ? "present" : "missing",
      );

      // Prevent processing the same action code multiple times
      if (actionCode && this.processedActionCodes.has(actionCode)) {
        console.log(
          "Action code already processed, skipping:",
          actionCode.substring(0, 20) + "...",
        );
        return;
      }

      switch (mode) {
        case "resetPassword":
          this.handleResetPassword(auth, actionCode);
          break;
        case "recoverEmail":
          this.handleRecoverEmail(auth, actionCode);
          break;
        case "verifyEmail":
          if (actionCode) {
            this.processedActionCodes.add(actionCode);
          }
          this.handleVerifyEmail(auth, actionCode);
          break;
        case "signIn":
          if (this.$route.fullPath.includes("email_signin")) {
            this.showEmailSignin = true;
          }
          break;
        case "initialPassword":
          this.initialEmail = this.$route.query.email || "";
          this.initialUserId = this.$route.query.userId || "";
          this.initialSetupToken = this.$route.query.token || "";
          this.showInitialPasswordDialog = Boolean(this.initialEmail && this.initialUserId);
          this.$nextTick(() => {
            // force-open fallback
            const ref = this.$refs.initialPassDialog;
            if (ref && this.showInitialPasswordDialog) {
              try {
                // if child guards prop, it may still open since v-dialog binds to prop
                // this is a fallback if needed
                // eslint-disable-next-line no-prototype-builtins
                if (
                  ref &&
                  ref.$props &&
                  ref.$props.hasOwnProperty("dialog") &&
                  !ref.$props.dialog
                ) {
                  ref.$props.dialog = true; // best-effort
                }
              } catch (e) {}
            }
          });
          break;
        default:
          break;
      }
    },
    onInitialPasswordSet() {
      this.showInitialPasswordDialog = false;
      this.setSnackbar({
        show: true,
        text: "Password set successfully! You can now log in.",
        color: "baseAccent",
      });
    },
    async googleSignIn() {
      try {
        this.loadingGoogle = true;
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const result = await firebase.auth().signInWithPopup(provider);
        const user = result.user;

        // Ensure person document exists for Google user
        if (user) {
          await ensureGooglePersonDocument(user, db);
        }

        this.proceed();
      } catch (error) {
        if (error && error.code === "auth/popup-blocked") {
          const provider = new firebase.auth.GoogleAuthProvider();
          await firebase.auth().signInWithRedirect(provider);
          return;
        }
        this.setSnackbar({
          show: true,
          text: getFriendlyErrorMessage(error.code || "auth/error"),
          color: "pink",
        });
      } finally {
        this.loadingGoogle = false;
      }
    },
    redirect() {
      this.isVerifyEmail = false;
      firebase.auth().signOut();
      this.$router.push("login");
    },
    handleResetPassword(auth, actionCode) {
      auth
        .verifyPasswordResetCode(actionCode)
        .then((email) => {
          this.isResetPassword = true;
          this.accountEmail = email;
          this.actionCode = actionCode;
        })
        .catch((error) => {
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage(error.code),
            color: "pink",
          });
        });
    },
    handleRecoverEmail(auth, actionCode) {
      console.log("handle recover email");
      let restoredEmail = null;
      auth
        .checkActionCode(actionCode)
        .then((info) => {
          restoredEmail = info["data"]["email"];
          return auth.applyActionCode(actionCode);
        })
        .then(() => {
          auth
            .sendPasswordResetEmail(restoredEmail)
            .then(() => {
              this.setSnackbar({
                show: true,
                text: "Email successfully reverted. Password reset email sent",
                color: "baseAccent",
              });
            })
            .catch((error) => {
              this.setSnackbar({
                show: true,
                text: getFriendlyErrorMessage(error.message || error.code),
                color: "pink",
              });
            });
        })
        .catch((error) => {
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage(error.code),
            color: "pink",
          });
        });
    },
    /**
     * Handles email verification with improved error handling and duplicate call prevention.
     *
     * Debugging approach:
     * 1. Check browser console for detailed logs at each step
     * 2. Look for "handle verify email", "Checking action code validity", "Applying action code" messages
     * 3. If error occurs, check "Error in handleVerifyEmail" log for error code and message
     * 4. Check "After error, checked user emailVerified status" to see if verification actually succeeded
     * 5. Use debugVerificationState() method from browser console to inspect current state
     *
     * Common issues:
     * - "invalid-action-code": Code already used or invalid (single-use codes)
     * - "expired-action-code": Code expired (usually after 3 days)
     * - Race condition: Multiple calls prevented by verificationInProgress flag and processedActionCodes Set
     */
    async handleVerifyEmail(auth, actionCode) {
      // Prevent duplicate calls
      if (this.verificationInProgress) {
        console.log("Verification already in progress, skipping duplicate call");
        return;
      }

      if (!actionCode) {
        console.error("handleVerifyEmail called without actionCode");
        this.setSnackbar({
          show: true,
          text: "Invalid verification link. Please request a new verification email.",
          color: "pink",
        });
        this.$router.push("/verify");
        return;
      }

      console.log("handle verify email - actionCode:", actionCode.substring(0, 20) + "...");
      this.verificationInProgress = true;
      this.isVerifyEmail = true;

      try {
        // First, check if the action code is valid and get email info
        console.log("Checking action code validity...");
        const actionCodeInfo = await auth.checkActionCode(actionCode);
        const email = actionCodeInfo.data.email;
        console.log("Action code is valid for email:", email);

        // Check if user is already verified
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.email === email && currentUser.emailVerified) {
          console.log("Email is already verified");
          this.setSnackbar({
            show: true,
            text: "Your email is already verified. You can now log in.",
            color: "baseAccent",
          });
          this.verificationInProgress = false;
          return;
        }

        // Apply the action code
        console.log("Applying action code...");
        await auth.applyActionCode(actionCode);
        console.log("Action code applied successfully");

        // Reload user to get updated verification status
        if (currentUser) {
          await currentUser.reload();
          console.log("User reloaded, emailVerified:", currentUser.emailVerified);
        }

        this.setSnackbar({
          show: true,
          text: "Email successfully verified",
          color: "baseAccent",
        });
      } catch (error) {
        console.error("Error in handleVerifyEmail:", {
          code: error.code,
          message: error.message,
          actionCode: actionCode.substring(0, 20) + "...",
        });

        // Check if email is actually verified despite the error
        // This handles the case where verification succeeded but we got an error
        const currentUser = auth.currentUser;
        let emailActuallyVerified = false;

        if (currentUser) {
          try {
            await currentUser.reload();
            emailActuallyVerified = currentUser.emailVerified;
            console.log("After error, checked user emailVerified status:", emailActuallyVerified);
          } catch (reloadError) {
            console.error("Error reloading user:", reloadError);
          }
        }

        // If email is verified, show success message even if there was an error
        if (emailActuallyVerified) {
          console.log("Email is verified despite error - showing success message");
          this.setSnackbar({
            show: true,
            text: "Email successfully verified",
            color: "baseAccent",
          });
        } else {
          // Handle specific error cases
          let errorMessage = getFriendlyErrorMessage(error.code);

          if (error.code === "auth/invalid-action-code") {
            errorMessage =
              "This verification link has already been used or is invalid. Please request a new verification email.";
          } else if (error.code === "auth/expired-action-code") {
            errorMessage =
              "This verification link has expired. Please request a new verification email.";
          }

          this.setSnackbar({
            show: true,
            text: errorMessage,
            color: "pink",
          });
          this.$router.push("/verify");
        }
      } finally {
        this.verificationInProgress = false;
      }
    },
    login() {
      console.log("loggin in");
      this.loading = true;
      firebase
        .auth()
        .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
          return firebase.auth().signInWithEmailAndPassword(this.email, this.password);
        })
        .then(() => {
          this.proceed();
        })
        .catch((error) => {
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage(error.code),
            color: "pink",
          });
          this.loading = false;
        });
    },
    proceed(retries = 0) {
      // Wait briefly for auth/person state to settle after sign-in, but don't loop
      // forever — a missing person doc (e.g. a stranded account) must not hang here.
      if (!this.user?.data?.id || !this.person?.id) {
        if (retries >= 20) {
          // Gave up waiting on the person doc; decide based on Auth status directly.
          return this.handleVerifiedRedirect();
        }
        return setTimeout(() => this.proceed(retries + 1), 500);
      }
      this.handleVerifiedRedirect();
    },
    async handleVerifiedRedirect() {
      const authUser = firebase.auth().currentUser;
      // Reload so emailVerified reflects a link the user may have just clicked elsewhere.
      try {
        await authUser?.reload();
      } catch (e) {
        // ignore – fall back to whatever status we already have
      }
      const verified = authUser?.emailVerified ?? this.user?.data?.verified;
      if (verified) {
        this.loading = false;
        this.$router.push("/");
      } else {
        await this.resendVerificationOnLogin(authUser);
      }
    },
    async resendVerificationOnLogin(authUser) {
      this.loading = false;
      if (!authUser) {
        this.$router.push("/verify");
        return;
      }
      try {
        const actionCodeSettings = {
          url: window.location.origin + "/login",
          handleCodeInApp: true,
        };
        await authUser.sendEmailVerification(actionCodeSettings);
        this.setSnackbar({
          show: true,
          text: "Your account isn't verified yet. We've emailed you a fresh verification link — please check your inbox.",
          color: "baseAccent",
        });
      } catch (err) {
        // Firebase rate-limits resends; if we've sent too many recently, just guide
        // them to the link already in their inbox rather than surfacing an error.
        this.setSnackbar({
          show: true,
          text: "Your account isn't verified yet. Please check your inbox for the verification link we sent — including your spam folder.",
          color: "baseAccent",
        });
      }
      this.$router.push("/verify");
    },
    validate() {
      this.$refs.form.validate();
    },
    resetPassword() {
      firebase
        .auth()
        .sendPasswordResetEmail(this.email)
        .then(() => {
          this.setSnackbar({
            show: true,
            text: "Reset Password Email Sent",
            color: "baseAccent",
          });
        })
        .catch((error) => {
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage(error.code),
            color: "pink",
          });
        });
    },
    delay(ms) {
      return new Promise((res) => setTimeout(res, ms));
    },
    // Debug helper method - can be called from browser console
    // Usage: this.$refs.loginComponent?.debugVerificationState() or window.$loginDebug()
    debugVerificationState() {
      const currentUser = firebase.auth().currentUser;
      return {
        verificationInProgress: this.verificationInProgress,
        isVerifyEmail: this.isVerifyEmail,
        processedActionCodes: Array.from(this.processedActionCodes),
        currentRoute: {
          mode: this.$route.query.mode,
          oobCode: this.$route.query.oobCode
            ? this.$route.query.oobCode.substring(0, 20) + "..."
            : null,
        },
        user: currentUser
          ? {
              email: currentUser.email,
              emailVerified: currentUser.emailVerified,
              uid: currentUser.uid,
            }
          : null,
      };
    },
  },
};
</script>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Genos:wght@200&display=swap");

.gm-title {
  font-family: "Genos", sans-serif;
  // font-size: 5vw; inline on isMobile condition
  color: var(--v-baseAccent-base);
  letter-spacing: 15px;
  z-index: 1;
  // position: relative;
  // top: 100px;
}
.login {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  background-color: #393e46;
  background-size: cover;
  box-shadow: inset 0 0 0 2000px rgba(20, 30, 48, 0.9);
  /* Prevent mobile viewport changes */
  position: relative;
  overflow: hidden;

  .title {
    color: var(--v-baseAccent-base);
    text-transform: uppercase;
    text-align: center;
  }

  .custom-input {
    font-size: 0.9rem;
  }

  a {
    color: var(--v-baseAccent-base) !important;
  }
}

#galaxy-info {
  width: 300px;
  // height: 400px;
  border: 1px solid var(--v-baseAccent-base);
  margin-top: 30px;
  padding: 20px;
  // background: var(--v-baseAccent-base);
  position: relative;
  backdrop-filter: blur(2px);
  z-index: 3;

  .galaxy-label {
    font-size: 0.8rem;
    font-weight: 400;
    text-transform: uppercase;
    // ribbon label
    position: absolute;
    top: 0;
    left: -1px;
    background-color: var(--v-baseAccent-base);
    color: var(--v-background-base);
    padding: 0px 15px 0px 5px;
    clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
  }

  .resetPassButton {
    text-decoration: underline;
    cursor: pointer;
  }
}
</style>
