<template>
  <div class="login">
    <!-- <v-img :src="`https://i.pravatar.cc/300`" class="gm-logo"></v-img> -->
    <div id="galaxy-info">
      <h2 class="galaxy-label">RESET PASSWORD</h2>
      <!-- <h1 class="galaxy-title">Login</h1> -->
      <!-- <div class="d-flex justify-center align-center"> -->
      <!-- <v-img class="galaxy-image" :src=""></v-img> -->
      <!-- </div> -->
      <p class="overline mt-3 baseAccent--text">Enter your email to reset your password</p>
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
        <v-btn
          :disabled="!valid"
          :loading="loading"
          color="baseAccent"
          class="mr-4"
          @click="resetPassword"
          outlined
          width="100%"
        >
          Reset Password
        </v-btn>
      </v-form>
      <div v-if="googleOnly" class="google-only-notice">
        <p class="baseAccent--text">
          This account signs in with Google, so it doesn't have a password to reset. Use the "Sign
          in with Google" button on the login page instead.
        </p>
        <v-btn color="baseAccent" outlined width="100%" @click="$router.push('/login')">
          Go to Login
        </v-btn>
      </div>
    </div>

    <BackButton :toPath="'/login'" />
  </div>
</template>

<script>
import BackButton from "@/components/Reused/BackButton.vue";
import useRootStore from "@/store/index";
import firebase from "firebase/compat/app";
import { mapActions } from "pinia";
import { getFriendlyErrorMessage } from "@/lib/utils";

export default {
  name: "ResetPassword",
  components: {
    BackButton,
  },
  data: () => ({
    valid: true,
    email: "",
    password: "",
    emailRules: [
      (v) => !!v || "E-mail is required",
      (v) => /.+@.+\..+/.test(v) || "E-mail must be valid",
    ],
    loading: false,
    googleOnly: false,
  }),
  watch: {
    email() {
      this.googleOnly = false;
    },
  },
  mounted() {},
  methods: {
    ...mapActions(useRootStore, ["setSnackbar"]),
    login() {
      firebase
        .auth()
        .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
          // New sign-in will be persisted with session persistence.
          return firebase.auth().signInWithEmailAndPassword(this.email, this.password);
        })
        .then(() => {
          console.log("Successfully logged in");
          this.$router.push("/");
        })
        .catch((error) => {
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage(error.code),
            color: "pink",
          });
          console.log("Login error:", error);
        });
    },
    validate() {
      this.$refs.form.validate();
    },
    async resetPassword() {
      this.loading = true;
      this.googleOnly = false;

      // Google-only accounts have no password, so Firebase sends no reset email
      // even though sendPasswordResetEmail resolves. Point them at Google sign-in instead.
      try {
        const methods = await firebase.auth().fetchSignInMethodsForEmail(this.email);
        if (methods.includes("google.com") && !methods.includes("password")) {
          this.googleOnly = true;
          this.loading = false;
          return;
        }
      } catch (error) {
        // Lookup failed (e.g. network); fall through and try the reset anyway.
        console.log("fetchSignInMethodsForEmail error:", error);
      }

      console.log("sending reset email password");
      firebase
        .auth()
        .sendPasswordResetEmail(this.email)
        .then(() => {
          this.setSnackbar({
            show: true,
            text: "Reset Password Email Sent",
            color: "baseAccent",
          });
          // Delay routing back to login to allow snackbar to be visible
          setTimeout(() => {
            this.$router.push("/login");
          }, 2000); // 2000 milliseconds delay
        })
        .catch((error) => {
          this.setSnackbar({
            show: true,
            text: getFriendlyErrorMessage(error.code),
            color: "pink",
          });
        })
        .finally(() => {
          this.loading = false;
        });
    },
  },
};
</script>

<style lang="scss" scoped>
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
      padding: 0px 25px 0px 5px;
      clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
    }

    .resetPassButton {
      text-decoration: underline;
      cursor: pointer;
    }

    .google-only-notice {
      font-size: 0.85rem;
    }
  }

  .backButton {
    margin-top: 15px;
    width: calc(100% - 30px);
    z-index: 999;
  }
}
</style>
