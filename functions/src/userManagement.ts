import { error, log } from "firebase-functions/logger";
import { runWith } from "firebase-functions/v1";
import { HttpsError } from "firebase-functions/v1/https";
import { DOMAIN } from "./_constants.js";
import { auth, db, requireAuthenticated } from "./_shared.js";
import { sendStudentInviteEmail, sendTeacherInviteEmail, sendVerificationEmail } from "./emails.js";
import { assignCourseToStudent } from "./courseManagement.js";
import { FieldValue } from "firebase-admin/firestore";

// Get a person by personId
export const getPersonByPersonIdHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  try {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }

    const personDoc = await db.collection("people").doc(personId).get();
    const personData = personDoc.data();

    if (personData == null) {
      throw new HttpsError("not-found", `Person not found: ${personId}`);
    }

    // TODO: permissions checks

    return {
      person: {
        ...personData,
        id: personDoc.id,
      },
    };
  } catch (err) {
    // Log the error for debugging
    error("getPersonByPersonId error:", err);
    // Re-throw HttpsError as-is
    if (err instanceof HttpsError) {
      throw err;
    }
    // Wrap other errors
    throw new HttpsError(
      "internal",
      `Failed to get person: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

// Get a person by email
export const getPersonByEmailHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  requireAuthenticated(context);

  const email = data.email as string | null;
  if (email == null) {
    throw new HttpsError("invalid-argument", "missing email");
  }

  log("getPersonByEmail: searching for email:", email);

  // First check Firestore
  const queryResult = await db.collection("people").where("email", "==", email).limit(1).get();
  log("getPersonByEmail: Firestore query result docs length:", queryResult.docs.length);

  const personDoc = queryResult.docs[0];

  if (personDoc != null) {
    const personData = personDoc.data();
    if (personData != null) {
      log("getPersonByEmail: found person in Firestore:", personData);
      return {
        person: {
          ...personData,
          id: personDoc.id,
        },
      };
    }
  }

  // If not found in Firestore, check Firebase Auth
  log("getPersonByEmail: not found in Firestore, checking Firebase Auth");

  try {
    const userRecord = await auth.getUserByEmail(email);
    log("getPersonByEmail: found user in Firebase Auth:", userRecord.uid);

    return {
      person: {
        id: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
      },
    };
  } catch (error) {
    log("getPersonByEmail: user not found in Firebase Auth either");
    throw new HttpsError("not-found", "Person not found with this email");
  }
});

// upgrade someones account to admin
export const addAdminRoleHttpsEndpoint = runWith({}).https.onCall(async (uid: string, context) => {
  requireAuthenticated(context);

  // check request is made by an admin
  if (context.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Only admins can add other admins");
  }

  // get user and add admin custom claim
  try {
    const user = await auth.getUser(uid);

    await auth.setCustomUserClaims(user.uid, {
      admin: true,
    });

    return {
      message: `Success! ${user.uid} has been made an admin.`,
    };
  } catch (err) {
    error(err);
    throw new HttpsError("internal", `something went wrong ${err}`);
  }
});

export const createNewUserHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall(async (data, context) => {
  requireAuthenticated(context);
  log("1. createNewUserHttpsEndpoint");
  // TODO: this should be split and permissions checks ensured but that requires a major refactor
  // of how adding students to cohorts works

  const profile = data.profile as Record<string, unknown> | null;
  if (profile == null) {
    throw new HttpsError("invalid-argument", "missing profile");
  }

  try {
    log("2. create user: ", profile);
    const createdUser = await auth.createUser(profile);

    const person: { id: string } & Record<string, unknown> = {
      ...profile,
      id: createdUser.uid,
    };

    // Create a short-lived custom token so the user can sign in and set a password
    const setupToken = await auth.createCustomToken(person.id as string, { initialSetup: true });

    // Attempt to send invite email with login instructions (non-blocking)
    let emailSent = false;
    try {
      if (person.accountType == "teacher") {
        log("3. send email to teacher: ", person.email);
        await sendTeacherInviteEmail(
          person.email as string,
          person.displayName as string,
          `https://${DOMAIN}/login?mode=initialPassword&email=${encodeURIComponent(
            person.email as string,
          )}&userId=${person.id}&token=${encodeURIComponent(setupToken)}`,
        );
      } else {
        log("3. send email to student: ", person.email);
        await sendStudentInviteEmail(
          person.email as string,
          person.displayName as string,
          `https://${DOMAIN}/login?mode=initialPassword&email=${encodeURIComponent(
            person.email as string,
          )}&userId=${person.id}&token=${encodeURIComponent(setupToken)}`,
          person.inviter as string,
        );
      }
      emailSent = true;
    } catch (inviteErr) {
      // Do not fail user creation if email sending fails
      log("3.a invite email failed (continuing without failing request)", inviteErr as any);
    }

    log("4. add person to people collection: ", person);
    delete person.inviter;
    await db.collection("people").doc(person.id).set(person);

    const personDoc = await db.collection("people").doc(person.id).get();

    return {
      person: {
        ...personDoc.data(),
        id: personDoc.id,
      },
      emailSent,
    };
  } catch (err) {
    error(err);
    log("error: ", err);
    throw new HttpsError("internal", `something went wrong ${err}`);
  }
});

// Update a person by personId
export const updatePersonByPersonIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    const person = data.person as Record<string, unknown> | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }
    if (person == null) {
      throw new HttpsError("invalid-argument", "missing person");
    }

    const personDoc = await db.collection("people").doc(personId).get();
    const personData = personDoc.data();

    if (personData == null) {
      throw new HttpsError("not-found", `Person not found: ${personId}`);
    }

    // TODO: permissions checks

    await personDoc.ref.update(person);

    const updatedPersonDoc = await personDoc.ref.get();
    const updatedPersonData = updatedPersonDoc.data();

    return {
      person: {
        ...updatedPersonData,
        id: updatedPersonDoc.id,
      },
    };
  },
);

export const updateUserPasswordHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  requireAuthenticated(context);
  log("updateUserPassword: starting password update");

  const userId = data.userId as string | null;
  const password = data.password as string | null;
  const firstName = data.firstName as string | null;
  const lastName = data.lastName as string | null;
  const email = data.email as string | null;

  if (
    userId == null ||
    password == null ||
    firstName == null ||
    lastName == null ||
    email == null
  ) {
    throw new HttpsError(
      "invalid-argument",
      "missing required fields: userId, password, firstName, lastName, or email",
    );
  }

  try {
    log(`updateUserPassword: updating password for user ${userId}`);

    // Update the user's password
    await auth.updateUser(userId, {
      password: password,
      displayName: `${firstName} ${lastName}`,
    });

    // Update the person document in Firestore
    await db
      .collection("people")
      .doc(userId)
      .update({
        firstName: firstName,
        lastName: lastName,
        displayName: `${firstName} ${lastName}`,
      });

    log(`updateUserPassword: successfully updated password for user ${userId}`);

    return {
      success: true,
      message: "Password updated successfully",
    };
  } catch (error) {
    log(`updateUserPassword: error updating password for user ${userId}:`, error);
    throw new HttpsError("internal", `Failed to update password: ${error}`);
  }
});

export const bulkImportStudentsHttpsEndpoint = runWith({
  timeoutSeconds: 540, // 9 minutes timeout
  memory: "1GB",
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall(async (data, context) => {
  requireAuthenticated(context);
  log("bulkImportStudents: starting bulk import");

  const students = data.students as Array<Record<string, unknown>> | null;
  const cohortId = data.cohortId as string | null;
  const inviter = data.inviter as string | null;

  if (students == null || cohortId == null || inviter == null) {
    throw new HttpsError(
      "invalid-argument",
      "missing required fields: students, cohortId, or inviter",
    );
  }

  log(`bulkImportStudents: processing ${students.length} students for cohort ${cohortId}`);

  const results = {
    success: [] as Array<{ email: string; action: string; personId: string }>,
    errors: [] as Array<{ email: string; error: string }>,
  };

  // Process students sequentially to avoid overwhelming the database
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    let email = student.email as string;

    // Clean email address - remove carriage returns, line breaks, and trim whitespace
    email = email.replace(/[\r\n]/g, "").trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      log(`bulkImportStudents: invalid email format: ${email}`);
      results.errors.push({
        email: student.email as string,
        error: `Invalid email format: ${email}`,
      });
      continue;
    }

    try {
      log(`bulkImportStudents: processing student ${i + 1}/${students.length}: ${email}`);
      if (email !== (student.email as string)) {
        log(`bulkImportStudents: cleaned email from "${student.email}" to "${email}"`);
      }

      // Check if person exists
      const queryResult = await db.collection("people").where("email", "==", email).limit(1).get();
      const personDoc = queryResult.docs[0];

      if (personDoc != null) {
        // Person exists - add to cohort
        log(`bulkImportStudents: person exists, adding to cohort: ${email}`);

        const personId = personDoc.id;

        // Add to cohort
        await db
          .collection("cohorts")
          .doc(cohortId)
          .update({
            students: FieldValue.arrayUnion(personId),
          });

        // Get cohort to check for courses
        const cohortDoc = await db.collection("cohorts").doc(cohortId).get();
        const cohortData = cohortDoc.data();

        if (cohortData?.courses?.length) {
          // Assign courses. This must create the per-student topic/task progression
          // records (people/{personId}/{courseId}) as well as adding to assignedCourses,
          // otherwise the student sees a fully-locked galaxy map with no accessible nodes.
          for (const courseId of cohortData.courses) {
            await assignCourseToStudent(courseId, personId);
          }
        }

        results.success.push({
          email,
          action: "added_to_cohort",
          personId,
        });
      } else {
        // Person doesn't exist - create new user
        log(`bulkImportStudents: creating new person: ${email}`);

        const profile = {
          ...student,
          displayName: `${student.firstName} ${student.lastName}`,
          email, // Use the cleaned email
          inviter,
          accountType: "student",
        };

        // Create user in Firebase Auth
        const createdUser = await auth.createUser(profile);

        const person: { id: string } & Record<string, unknown> = {
          ...profile,
          id: createdUser.uid,
        };

        // Create a short-lived custom token for initial setup
        const setupToken = await auth.createCustomToken(person.id as string, {
          initialSetup: true,
        });

        // Send invite email with login instructions (no magic link needed)
        await sendStudentInviteEmail(
          email,
          person.displayName as string,
          `https://${DOMAIN}/login?mode=initialPassword&email=${encodeURIComponent(email)}&userId=${
            person.id
          }&token=${encodeURIComponent(setupToken)}`,
          inviter,
        );

        // Add to people collection
        delete person.inviter;
        await db.collection("people").doc(person.id).set(person);

        // Add to cohort
        await db
          .collection("cohorts")
          .doc(cohortId)
          .update({
            students: FieldValue.arrayUnion(person.id),
          });

        // Get cohort to check for courses
        const cohortDoc = await db.collection("cohorts").doc(cohortId).get();
        const cohortData = cohortDoc.data();

        if (cohortData?.courses?.length) {
          // Assign courses. This must create the per-student topic/task progression
          // records (people/{personId}/{courseId}) as well as adding to assignedCourses,
          // otherwise the student sees a fully-locked galaxy map with no accessible nodes.
          for (const courseId of cohortData.courses) {
            await assignCourseToStudent(courseId, person.id);
          }
        }

        results.success.push({
          email,
          action: "created_and_added",
          personId: person.id,
        });
      }
    } catch (error) {
      log(`bulkImportStudents: error processing ${email}:`, error);
      results.errors.push({
        email,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  log(
    `bulkImportStudents: completed. Success: ${results.success.length}, Errors: ${results.errors.length}`,
  );

  return {
    results,
    summary: {
      total: students.length,
      success: results.success.length,
      errors: results.errors.length,
    },
  };
});

export const resendInitialSetupLinkHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall(async (data, _context) => {
  const personId = (data?.personId as string) ?? null;
  const email = (data?.email as string) ?? null;

  if (personId == null || email == null) {
    throw new HttpsError("invalid-argument", "missing required fields: personId or email");
  }

  // Look up person
  const personDoc = await db.collection("people").doc(personId).get();
  const personData = personDoc.data();
  if (personData == null) {
    throw new HttpsError("not-found", `Person not found: ${personId}`);
  }

  if ((personData.email as string)?.toLowerCase() !== email.toLowerCase()) {
    throw new HttpsError("permission-denied", "Email does not match record for this person");
  }

  // Create new custom token
  const setupToken = await auth.createCustomToken(personId, { initialSetup: true });
  const link = `https://${DOMAIN}/login?mode=initialPassword&email=${encodeURIComponent(
    email,
  )}&userId=${personId}&token=${encodeURIComponent(setupToken)}`;

  // Send appropriate email
  if (personData.accountType === "teacher") {
    await sendTeacherInviteEmail(email, (personData.displayName as string) ?? "", link);
  } else {
    await sendStudentInviteEmail(
      email,
      (personData.displayName as string) ?? "",
      link,
      (personData.inviter as string) ?? "",
    );
  }

  return { success: true };
});

/**
 * Public (unauthenticated) endpoint that resends an email-verification link to a
 * user who registered but never verified — e.g. their original link expired.
 *
 * This is the recovery path for the "I registered, didn't verify in time, and now
 * re-registering says the email is already in use" problem. It works without the
 * user's password and uses our own branded email instead of Firebase's default.
 *
 * To avoid leaking which emails have accounts, a generic { status: "sent" } is
 * returned when no account exists. When the account is already verified we return
 * { status: "alreadyVerified" } so the UI can nudge the user to simply log in.
 */
export const resendVerificationEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall(async (data, _context) => {
  const email = ((data?.email as string) ?? "").trim();
  if (!email) {
    throw new HttpsError("invalid-argument", "missing required field: email");
  }

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err) {
    // No account with this email — respond generically so we don't reveal it.
    log("resendVerificationEmail: no auth user for", email);
    return { success: true, status: "sent" };
  }

  // Already verified — let the UI tell them to just log in.
  if (userRecord.emailVerified) {
    log("resendVerificationEmail: account already verified", email);
    return { success: true, status: "alreadyVerified" };
  }

  // Prefer a friendly greeting from the Auth record, falling back to the person doc.
  let displayName = userRecord.displayName ?? "";
  if (!displayName) {
    const personQuery = await db.collection("people").where("email", "==", email).limit(1).get();
    const personData = personQuery.docs[0]?.data();
    displayName = (personData?.firstName as string) ?? (personData?.displayName as string) ?? "";
  }

  const actionCodeSettings = {
    url: `https://${DOMAIN}/login`,
    handleCodeInApp: true,
  };

  const link = await auth.generateEmailVerificationLink(email, actionCodeSettings);
  await sendVerificationEmail(email, displayName, link);
  log("resendVerificationEmail: verification link sent to", email);

  return { success: true, status: "sent" };
});
