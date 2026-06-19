import { log } from "firebase-functions/logger";
import { runWith } from "firebase-functions/v1";
import { createTransport } from "nodemailer";
import { CloudTasksClient } from "@google-cloud/tasks";
import { APP_NAME, DOMAIN } from "./_constants.js";

// CUSTOM INVITE EMAIL
// Configure the email transport using the default SMTP transport and a GMail account.
// For Gmail, enable these:
// 1. https://www.google.com/settings/security/lesssecureapps
// 2. https://accounts.google.com/DisplayUnlockCaptcha
// For other types of transports such as Sendgrid see https://nodemailer.com/transports/

// TODO: Configure the GMAIL_EMAIL and GMAIL_PASSWORD environment variables.
// Set these environment variables in your Firebase project configuration
// For this use:
// firebase functions:secrets:set GMAIL_EMAIL
// firebase functions:secrets:set GMAIL_PASSWORD

/** Creates a new nodemailer transport using runtime secrets. */
function getMailTransport() {
  return createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_EMAIL,
      pass: process.env.GMAIL_PASSWORD,
    },
  });
}

/**
 * Sends an invite email to a new teacher.
 */
export async function sendTeacherInviteEmail(email: string, displayName: string, link: string) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  mailOptions.subject = `Account created for ${APP_NAME}!`;
  mailOptions.text = `Greetings, ${displayName || ""}

Your Captain account has been created for ${APP_NAME}. 

Please click this link to set your password and complete your account setup: ${link}

If you have any issues please contact base@${DOMAIN}

Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("New teacher invite email sent to: ", email);
}

/**
 * Sends an invite email to a new student.
 */
export async function sendStudentInviteEmail(
  email: string,
  displayName: string,
  link: string,
  inviter: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  mailOptions.subject = `Account created for ${APP_NAME}!`;
  // mailOptions.text = `Greetings, ${displayName || ""}.
  mailOptions.text = `Greetings, Navigator

Captain ${inviter}, has created you a ${APP_NAME} account. 

Please click this link to set your password and complete your account setup: ${link}

If you have any issues please contact base@${DOMAIN}

Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("New student invite email sent to: ", email);
}

/**
 * Sends an email-verification link to a user who registered but hasn't verified
 * their email yet (e.g. their original verification link expired).
 */
export async function sendVerificationEmail(email: string, displayName: string, link: string) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  mailOptions.subject = `Verify your ${APP_NAME} account`;
  mailOptions.text = `Greetings, ${displayName || "Navigator"}

Please verify your email address to activate your ${APP_NAME} account.

Click this link to verify your account: ${link}

If you didn't create this account, you can safely ignore this email.

If you have any issues please contact base@${DOMAIN}

Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("Verification email sent to: ", email);
}

// ======COHORT REGISTRATION NOTIFICATION==================
export const sendNewCohortEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { email, displayName, firstName, lastName, inviter, cohort } = data;
  return sendNewCohortEmail(email, displayName, firstName, lastName, inviter, cohort);
});

/**
 * Sends a new cohort registration notification.
 */
export async function sendNewCohortEmail(
  email: string,
  displayName: string,
  firstName: string,
  lastName: string,
  inviter: string,
  cohort: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  mailOptions.subject = "You've been add to a Squad";
  mailOptions.text = `Greetings, Navigator ${displayName || lastName || ""}

Captain ${inviter || ""} has assigned you to Squad: ${cohort}.

Sign into your Galaxy Maps account to view your missions.

https://${DOMAIN}/login
  
If you have any issues please contact base@${DOMAIN}
  
Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("New cohort invite email sent to: ", email);
}

// ======COURSE REGISTRATION NOTIFICATION==================
export const sendNewGalaxyEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { email, inviter, course } = data;
  return sendNewGalaxyEmail(email, inviter, course);
});
/**
 * Sends a new course registration notification email.
 */
export async function sendNewGalaxyEmail(email: string, inviter: string, course: string) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  mailOptions.subject = "New Galaxy Assignment";
  mailOptions.text = `Greetings Navigator

Captain ${inviter || ""} has assigned you to Galaxy Map: ${course}.

Sign into your Galaxy Maps account to start exploring this new galaxy.

https://${DOMAIN}
  
If you have any issues please contact base@${DOMAIN}
  
Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("New assignment email sent to: ", email);
}

// ======COURSE SUBMISSION NOTIFICATION==================
export const sendNewSubmissionEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { author, title, id } = data;
  sendNewSubmissionEmail(author, title, id);
});

/**
 * Sends a new submission notification email.
 */
export async function sendNewSubmissionEmail(author: string, title: string, id: string) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: "base@galaxymaps.io", // TODO: this should be dynamic
  };

  mailOptions.subject = "New Galaxy Submission for PUBLIC VIEW";
  mailOptions.text = `Greetings Admin, 

${author} has submitted a new Galaxy Map called ${title} to be reviewed for PUBLIC / all users to access

Navigate to https://${DOMAIN}/galaxy/${id} from your ADMIN account to approve this map to be made public.
  
Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("New course submission email sent to admin");
}

// ======COURSE PUBLISHED NOTIFICATION==================
/**
 * Cloud function endpoint for sending course created email notifications
 *
 * Recent fixes implemented:
 * - Added parameter validation to prevent undefined/null values
 * - Added proper error logging for debugging
 * - Added async/await handling for proper error propagation
 *
 * This function validates that all required parameters are present
 * before calling the email sending function.
 */
export const sendCourseCreatedEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall(async (data, _context) => {
  const { email, name, course, courseId } = data;

  // Validate required parameters
  if (!email || !name || !course || !courseId) {
    log(
      `Missing required parameters: email=${email}, name=${name}, course=${course}, courseId=${courseId}`,
    );
    throw new Error("Missing required parameters for course created email");
  }

  await sendCourseCreatedEmail(email, name, course, courseId);
});
/**
 * Sends a course published notification.
 */
export async function sendCourseCreatedEmail(
  email: string,
  name: string,
  course: string,
  courseId: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: "base@galaxymaps.io",
  };

  mailOptions.subject = "New Galaxy Created";
  mailOptions.text = `Greetings admin, 

  ${name} from ${email} has created a new galaxy called ${course}.

  Navigate to https://${DOMAIN}/galaxy/${courseId} to take a look.
  
Galaxy Maps Bot`;
  await getMailTransport().sendMail(mailOptions);
  log("Course created email sent to admin");
}
// ======COURSE PUBLISHED NOTIFICATION==================
export const sendCoursePublishedEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { email, name, course } = data;
  sendCoursePublishedEmail(email, name, course);
});

/**
 * Sends a course published notification.
 */
export async function sendCoursePublishedEmail(email: string, name: string, course: string) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  mailOptions.subject = "Your Galaxy has been Published";
  mailOptions.text = `Greetings Captain ${name}, 

Your galaxy map ${course} has been successfully published and a default Squad has been created so you can monitor the progress of Navigators that explore this Galaxy.

Go to https://${DOMAIN} to manage your Galaxy and the ${course} Squad.
  
Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("Course published email sent to ", email);
}

// ======REQUEST FOR HELP SENT ==================
export const sendRequestForHelpHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { email, teacher, course, task, student, request, topic, studentEmail } = data;
  sendRequestForHelp(email, teacher, course, task, student, request, topic, studentEmail);
});

/**
 * Sends a request for help.
 */
export async function sendRequestForHelp(
  email: string,
  teacher: string,
  course: string,
  task: string,
  student: string,
  request: string,
  topic: string,
  studentEmail: string,
) {
  const mailOptions: Record<string, string | undefined> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
    replyTo: `${student} <${studentEmail}>`,
  };

  /* eslint-disable max-len */
  mailOptions.subject = `[${course}] - Request for help`;
  mailOptions.text = `Greetings Captain ${teacher}, 

Navigator ${student} has sent a REQUEST FOR HELP.

Galaxy Map: ${course}
System: ${topic}
Mission: ${task}

Their request for help: "${request}"

To respond to ${student}, reply to this email or login to https://${DOMAIN}/dashboard to view all Requests for Help.
  
Galaxy Maps Team`;

  mailOptions.html = `<p>Greetings, Captain ${teacher}</p>
  </br> 
<p>Navigator ${student} has sent a request for help.</p>
</br> 
<p><span style="text-decoration: underline;">Please note:</span> Navigators may be unable to progress until they receive assistance.</p>
</br>
<hr>
</br>
<p style="text-decoration: underline;">Context:</p>
<ul>
  <li>Galaxy: ${course}</li>
  <li>System: ${topic}</li>
  <li>Mission: ${task}</li>
</ul>
</br> 
</br> 
<p style="text-decoration: underline;">Request for Help:</p> 
<div style="border: 3px solid #E269CF; border-radius: 10px; padding:10px;">
<p>${request}</p>
</div>
</br>
</br>
<p>To respond to ${student}'s request and provide assistance,
please login to <a href="https://${DOMAIN}/dashboard" target="_blank"
  >https://${DOMAIN}/dashboard</a> to view your Requests for Help.</p>
</br> 
<p style="font-size: 0.75rem !important;font-weight: 500;letter-spacing: 0.1666666667em !important;line-height: 2rem;text-transform: uppercase;font-family: "Roboto", sans-serif !important;">Galaxy Maps Team</p>`;
  /* eslint-enable max-len */

  await getMailTransport().sendMail(mailOptions);
  log("Request notification email sent to ", email);
}

// ====== RESPONSE TO REQUEST ==================
export const sendResponseToHelpHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { email, teacher, course, task, student, response, topic, request, teacherEmail } = data;
  sendResponseToHelp(email, teacher, course, task, student, response, topic, request, teacherEmail);
});

/**
 * Sends a response for help.
 */
export async function sendResponseToHelp(
  email: string,
  teacher: string,
  course: string,
  task: string,
  student: string,
  response: string,
  topic: string,
  request: string,
  teacherEmail: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
    replyTo: `${teacher} <${teacherEmail}>`,
  };

  /* eslint-disable max-len */
  mailOptions.subject = `[${course}] - Response from Captain`;
  mailOptions.text = `Greetings Navigator ${student}, 

Captain ${teacher} has replied to your request for help.

Galaxy Map: ${course}
System: ${topic}
Mission: ${task}

Your request: "${request}"

Captain's response: "${response}"

Login to https://${DOMAIN} to continue your missions.
  
Galaxy Maps Team`;

  mailOptions.html = `<p>Greetings, Navigator ${student}</p>
  </br> 
<p>Captain ${teacher} has replied to your request for help.</p>
</br> 
<hr>
</br>
<p style="text-decoration: underline;">Context:</p>
<ul>
  <li>Galaxy: ${course}</li>
  <li>System: ${topic}</li>
  <li>Mission: ${task}</li>
</ul>
</br> 
</br> 
<p style="text-decoration: underline;">Your Request:</p> 
<div style="border: 3px solid #E269CF; border-radius: 10px; padding:10px;">
<p>${request}</p>
</div>
</br>
</br>
<p style="text-decoration: underline;">Captain's Response:</p> 
<div style="border: 3px solid #69A1E2; border-radius: 10px; padding:10px;">
<p>${response}</p>
</div>
</br>
</br>
<p>Login to <a href="https://${DOMAIN}" target="_blank"
  >https://${DOMAIN}</a> to continue your missions.</p>
</br> 
<p style="font-size: 0.75rem !important;font-weight: 500;letter-spacing: 0.1666666667em !important;line-height: 2rem;text-transform: uppercase;font-family: "Roboto", sans-serif !important;">Galaxy Maps Team</p>`;
  /* eslint-enable max-len */

  await getMailTransport().sendMail(mailOptions);
  log("Instructor response sent to ", email);
}

// ======SUBMISSION FOR TASK SENT ==================
export const sendTaskSubmissionHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const {
    email,
    teacher,
    course,
    task,
    student,
    submission,
    topic,
    submissionInstructions,
    studentEmail,
  } = data;
  sendTaskSubmission(
    email,
    teacher,
    course,
    task,
    student,
    submission,
    topic,
    submissionInstructions,
    studentEmail,
  );
});

/**
 * Sends a work submission notification.
 */
export async function sendTaskSubmission(
  email: string,
  teacher: string,
  course: string,
  task: string,
  student: string,
  submission: string,
  topic: string,
  submissionInstructions: string,
  studentEmail: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
    replyTo: `${student} <${studentEmail}>`,
  };

  /* eslint-disable max-len */
  mailOptions.subject = `${task} work submission`;
  mailOptions.text = `Greetings Captain ${teacher}, 

Navigator, ${student} has submitted work for your review.

Galaxy: ${course}
System: ${topic}
Mission: ${task}

Your Instructions:</span>
${submissionInstructions}

Navigator's Submission Response: ${submission}

To respond to ${student}'s submission and UNLOCK the next mission from them,
please login to https://${DOMAIN}/dashboard to respond to their submission
  
Galaxy Maps Team`;

  mailOptions.html = `<p>Greetings, Captain ${teacher}</p>
  </br> 
<p>Navigator ${student}, has submitted work for you to review.</p>
</br> 
<p><span style="text-decoration: underline;">Please note:</span> Navigators <strong>cannot</strong> progress until submissions are approved!!</p>
</br>
<hr>
</br>
<p style="text-decoration: underline;">Context:</p>
<ul>
  <li>Galaxy: ${course}</li>
  <li>System: ${topic}</li>
  <li>Mission: ${task}</li>
</ul>
</br> 
</br> 
<p style="text-decoration: underline;">Your Instructions:</p> 
<div style="border: 3px solid #E269CF; border-radius: 10px; padding:10px;">
<p>${submissionInstructions}</p>
</div>
</br>
</br>
<p style="text-decoration: underline;">Their Submission:</p> 
<div style="border: 3px solid #69A1E2; border-radius: 10px; padding:10px;">
<p>${submission}</p>
</div>
</br> 
</br>
<p>To respond to ${student}'s Submission and unlock their next mission,
please login to <a href="https://${DOMAIN}/dashboard" target="_blank"
  >https://${DOMAIN}/dashboard</a> to approve or decline their submission</p>
</br> 
<p style="font-size: 0.75rem !important;font-weight: 500;letter-spacing: 0.1666666667em !important;line-height: 2rem;text-transform: uppercase;font-family: "Roboto", sans-serif !important;">Galaxy Maps Team</p>`;
  /* eslint-enable max-len */

  await getMailTransport().sendMail(mailOptions);
  log("Task submission notification email sent to ", email);
}

// ====== RESPONSE TO REQUEST ==================
export const sendResponseToSubmissionHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const {
    email,
    teacher,
    course,
    task,
    firstName,
    lastName,
    outcome,
    topic,
    message,
    submission,
    teacherEmail,
  } = data;
  sendResponseToSubmission(
    email,
    teacher,
    course,
    topic,
    task,
    firstName,
    lastName,
    submission,
    outcome,
    message,
    teacherEmail,
  );
});

/**
 * Sends a submission response notification.
 */
export async function sendResponseToSubmission(
  email: string,
  teacher: string,
  course: string,
  topic: string,
  task: string,
  firstName: string,
  lastName: string,
  submission: string,
  outcome: string,
  message: string,
  teacherEmail: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
    replyTo: `${teacher} <${teacherEmail}>`,
  };

  /* eslint-disable max-len */
  mailOptions.subject = `Mission ${task} ${outcome}`;

  // annoying auto format on save that indents to 6 when expected 8
  // indent then save without formatting
  mailOptions.text = `Greetings, Navigator ${
    lastName
      ? lastName.charAt(0).toUpperCase() + lastName.slice(1)
      : firstName
        ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
        : ""
  }

Captain ${teacher} has reviewed your submission for ${task}.

Galaxy: ${course}
System: ${topic}
Mission: ${task}

Your submission: ${submission} 

Submission outcome: ${outcome.toUpperCase()} 

Captain's message: ${message}

Login to https://${DOMAIN} to continue your mission.
  
Galaxy Maps Team`;

  mailOptions.html = `<p>Greetings, Navigator ${
    lastName
      ? lastName.charAt(0).toUpperCase() + lastName.slice(1)
      : firstName
        ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
        : ""
  }</p>
  </br> 
<p>Captain ${teacher} has reviewed your submission for ${task}.</p>
</br> 
<p><span style="text-decoration: underline;">Please note:</span> This is the outcome of your submission.</p>
</br>
<hr>
</br>
<p style="text-decoration: underline;">Context:</p>
<ul>
  <li>Galaxy: ${course}</li>
  <li>System: ${topic}</li>
  <li>Mission: ${task}</li>
</ul>
</br> 
</br> 
<p style="text-decoration: underline;">Your Submission:</p> 
<div style="border: 3px solid #69A1E2; border-radius: 10px; padding:10px;">
<p>${submission}</p>
</div>
</br>
</br>
<p style="text-decoration: underline;">Submission Outcome:</p> 
<div style="border: 3px solid #E269CF; border-radius: 10px; padding:10px;">
<p><strong>${outcome.toUpperCase()}</strong></p>
</div>
</br>
</br>
<p style="text-decoration: underline;">Captain's Message:</p> 
<div style="border: 3px solid #69A1E2; border-radius: 10px; padding:10px;">
<p>${message}</p>
</div>
</br> 
</br>
<p>Login to <a href="https://${DOMAIN}/dashboard" target="_blank"
  >https://${DOMAIN}/dashboard</a> to continue your mission.</p>
</br> 
<p style="font-size: 0.75rem !important;font-weight: 500;letter-spacing: 0.1666666667em !important;line-height: 2rem;text-transform: uppercase;font-family: "Roboto", sans-serif !important;">Galaxy Maps Team</p>`;
  /* eslint-enable max-len */

  await getMailTransport().sendMail(mailOptions);
  log("Submission outcome sent to ", email);
}

/**
 * Sends an inactvity notification to student.
 */
export async function sendStudentInActive(student: string, studentEmail: string, duration: string) {
  // send email to student
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: studentEmail,
  };

  // The user subscribed to the newsletter.
  /* eslint-disable max-len */
  mailOptions.subject = "Activity Alert";
  mailOptions.text = `Greetings Navigator ${student}, 

It has been ${duration} since you last signed into Galaxy Maps. 

Sign in to https://${DOMAIN} now to continue your learning journey.
  
Galaxy Maps Team`;

  mailOptions.html = `<p><strong>Greetings Navigator ${student},</strong></p>
</br>
<p>It has been <strong>${duration}</strong> since you last signed into Galaxy Maps.</p>
</br> 
<p>Sign in to <a href="https://${DOMAIN}" target="_blank"
  >https://${DOMAIN}/dashboard</a> now to continue your learning journey.</p>
</br> 
<p style="color: #69a1e2; font-family: 'Genos', sans-serif; font-size: 20px; letter-spacing: 5px;">Galaxy Maps Team</p>`;
  /* eslint-enable max-len */

  await getMailTransport().sendMail(mailOptions);
  log("student low activity alert sent", studentEmail);
}

/**
 * Sends a student inactivity notification to teacher.
 */
export async function sendTeacherStudentInActive(
  student: string,
  studentEmail: string,
  duration: string,
  email: string,
  cohort: string,
  teacher: string,
) {
  // send email to student
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
    replyTo: `${student} <${studentEmail}>`,
  };

  /* eslint-disable max-len */
  mailOptions.subject = "Activity Alert";
  mailOptions.text = `Greetings Captain ${teacher}, 
  
It has been ${duration} since Navigator: ${student} from Squad: ${cohort} last signed into Galaxy Maps. 

We recommend checking in on them via email ${studentEmail} to encourage and support them on their learning journey.
  
Galaxy Maps Team`;

  mailOptions.html = `<p><strong>Greetings Captain ${teacher},</strong></p>
  </br>
  <p>It has been <strong>${duration}</strong> since Navigator: <strong>${student}</strong> from Squad: <strong>${cohort}</strong> last signed into Galaxy Maps.</p>
  </br> 
  <p>  We recommend checking in on them. By replying to this email you can email them directly to encourage and support them on their missions.</p>
  </br> 
  <div style="display: flex;align-items:center">
    <img src="https://${DOMAIN}/favicon.png" alt="Galaxy Maps" style="height: 20px;" /><p style="color:#69a1e2;font-size: 0.7rem !important;
    font-weight: 500;
    letter-spacing: 0.1666666667em !important;
    text-transform: uppercase;
    font-family:  sans-serif !important;margin-left:2px">ALAXY MAPS</p></div>`;

  await getMailTransport().sendMail(mailOptions);
  log("student low activity alert sent to teacher", email);
}

// ====== ACTIVE COURSE DELETED ==================
export const sendCourseDeletedHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { email, teacher, course, student, teacherEmail } = data;
  sendCourseDeleted(email, teacher, course, student, teacherEmail);
});

/**
 * Sends a course deleted notification.
 */
export async function sendCourseDeleted(
  email: string,
  teacher: string,
  course: string,
  student: string,
  teacherEmail: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  // The user subscribed to the newsletter.

  /* eslint-disable max-len */
  mailOptions.subject = "Galaxy Deleted";
  mailOptions.text = `Greetings Navigator ${student || ""}, 

Captain ${teacher} has deleted the Galaxy ${course}.

If you have any questions or concerns about this please contact the Captain by email at ${teacherEmail}

Galaxy Maps Team`;

  mailOptions.html = `<p><strong>Greetings ${student},</strong></p>
  </br>
<p>Captain ${teacher} has deleted the Galaxy ${course}.</p>
</br> 
<p>If you have any questions or concerns about this please contact the Captain by email at <a href="mailto:${teacherEmail}">${teacherEmail}</a></p>
</br> 
<p style="color: #69a1e2; font-family: 'Genos', sans-serif; font-size: 20px; letter-spacing: 5px;">Galaxy Maps Team</p>`;
  /* eslint-enable max-len */

  await getMailTransport().sendMail(mailOptions);
  log("Galaxy deleted email sent to ", email);
}

/**
 * Sends a notification email when someone is added as a collaborator to a galaxy map.
 */
export async function sendCollaboratorAddedEmail(
  collaboratorEmail: string,
  collaboratorName: string,
  galaxyTitle: string,
  inviterName: string,
  galaxyId: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: collaboratorEmail,
  };

  mailOptions.subject = `You've been added as a collaborator on Galaxy Map: "${galaxyTitle}"`;
  mailOptions.text = `Greetings, Captain ${collaboratorName}!

Captain ${inviterName} has added you as a collaborator on the Galaxy Map: "${galaxyTitle}".

As a collaborator, you can now:
- View and edit the Galaxy Map
- Add and modify Stars and Missions

Jump into this Galaxy Map now by click this link and signing into your account: https://${DOMAIN}/galaxy/${galaxyId}

If you have any questions, please contact ${inviterName} or reach out to base@${DOMAIN}

Welcome to the team!

Galaxy Maps Team`;
  await getMailTransport().sendMail(mailOptions);
  log("Collaborator notification email sent to: ", collaboratorEmail);
}

export const sendCollaboratorAddedEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall((data, _context) => {
  const { collaboratorEmail, collaboratorName, galaxyTitle, inviterName, galaxyId } = data;
  return sendCollaboratorAddedEmail(
    collaboratorEmail,
    collaboratorName,
    galaxyTitle,
    inviterName,
    galaxyId,
  );
});

// ======GENERIC EMAIL FUNCTION==================
export const sendGenericEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall(async (data, _context) => {
  const { to, subject, body, isHtml = false } = data;

  // Validate required parameters
  if (!to || !subject || !body) {
    log(`Missing required parameters: to=${to}, subject=${subject}, body=${body}`);
    throw new Error("Missing required parameters for generic email");
  }

  await sendGenericEmail(to, subject, body, isHtml);
});

/**
 * Sends a generic email with customizable content.
 * Perfect for AI agent responses and general notifications.
 */
export async function sendGenericEmail(
  to: string,
  subject: string,
  body: string,
  isHtml: boolean = false,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: to,
  };

  mailOptions.subject = subject;

  if (isHtml) {
    mailOptions.html = body;
  } else {
    mailOptions.text = body;
  }

  await getMailTransport().sendMail(mailOptions);
  log(`Generic email sent to: ${to} with subject: ${subject}`);
}

// ============================================================================
// DELAYED/SCHEDULED EMAILS
// ============================================================================
// The functions below use Google Cloud Tasks to schedule emails to be sent
// at a specific time in the future (e.g., 3 hours after an event).
// This differs from the above functions which send emails immediately.
// ============================================================================

// ======GALAXY FEEDBACK EMAIL (SCHEDULED 3 HOURS AFTER CREATION)==================

/**
 * Cloud Function callable endpoint to schedule a feedback email.
 * This is called from the frontend when a new galaxy is created.
 *
 * Unlike other email functions which send immediately, this function:
 * 1. Creates a Cloud Task scheduled to run 3 hours in the future
 * 2. The task will call sendGalaxyFeedbackEmailTask at the scheduled time
 * 3. That task handler then sends the actual email
 *
 * Requirements:
 * - Cloud Tasks API must be enabled in GCP
 * - Queue 'galaxy-feedback-emails' must be created (see setup instructions)
 */
export const scheduleGalaxyFeedbackEmailHttpsEndpoint = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onCall(async (data, _context) => {
  const { email, name, galaxyTitle, galaxyId, createdAt } = data;

  // Validate required parameters
  if (!email || !name || !galaxyTitle || !galaxyId) {
    log(
      `Missing required parameters: email=${email}, name=${name}, galaxyTitle=${galaxyTitle}, galaxyId=${galaxyId}`,
    );
    throw new Error("Missing required parameters for scheduling feedback email");
  }

  await scheduleGalaxyFeedbackEmail(email, name, galaxyTitle, galaxyId, new Date(createdAt));
});

/**
 * Internal function that creates a Cloud Task to send email 3 hours later.
 *
 * How it works:
 * - Uses Google Cloud Tasks to schedule an HTTP request
 * - The HTTP request targets sendGalaxyFeedbackEmailTask function
 * - Task is scheduled for exactly 3 hours after galaxy creation
 *
 * Note: If scheduling fails, it logs the error but doesn't throw
 * to avoid blocking galaxy creation.
 */
async function scheduleGalaxyFeedbackEmail(
  email: string,
  name: string,
  galaxyTitle: string,
  galaxyId: string,
  createdAt: Date,
): Promise<void> {
  const client = new CloudTasksClient();

  // Get project ID from environment
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!project) {
    log("Warning: No project ID found, cannot schedule task");
    // Don't throw - we don't want to block galaxy creation
    return;
  }

  // Configure task location and queue
  // NOTE: Change 'us-central1' if your Firebase project is in a different region
  const location = "us-central1";
  const queue = "galaxy-feedback-emails";

  const parent = client.queuePath(project, location, queue);

  // Task should run 3 hours from now
  const scheduleTime = new Date(createdAt.getTime() + 3 * 60 * 60 * 1000);

  // Construct the Cloud Task
  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: `https://${location}-${project}.cloudfunctions.net/sendGalaxyFeedbackEmailTask`,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(
        JSON.stringify({
          email,
          name,
          galaxyTitle,
          galaxyId,
        }),
      ).toString("base64"),
    },
    scheduleTime: {
      seconds: Math.floor(scheduleTime.getTime() / 1000),
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    log(`Scheduled feedback email task for ${email} at ${scheduleTime}`, response.name);
  } catch (error) {
    log("Error scheduling feedback email:", error);
    // Don't throw - we don't want to block galaxy creation if scheduling fails
    log("Continuing despite scheduling error - user will not receive feedback email");
  }
}

/**
 * Cloud Function HTTP handler called by Cloud Tasks (not by users directly).
 * This runs 3 hours after galaxy creation and sends the actual feedback email.
 *
 * Security Note: This endpoint is called by Cloud Tasks, not directly by users.
 * In production, you should verify the request comes from Cloud Tasks.
 */
export const sendGalaxyFeedbackEmailTask = runWith({
  secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"],
}).https.onRequest(async (req, res) => {
  try {
    const { email, name, galaxyTitle, galaxyId } = req.body;

    log(`Processing feedback email task for ${email}`);

    await sendGalaxyFeedbackEmail(email, name, galaxyTitle, galaxyId);

    res.status(200).send({ success: true });
  } catch (error) {
    log("Error in sendGalaxyFeedbackEmailTask:", error);
    res.status(500).send({ error: "Failed to send feedback email" });
  }
});

/**
 * Sends the actual feedback request email to galaxy creator.
 * This is called by sendGalaxyFeedbackEmailTask after the 3-hour delay.
 */
async function sendGalaxyFeedbackEmail(
  email: string,
  name: string,
  galaxyTitle: string,
  galaxyId: string,
) {
  const mailOptions: Record<string, string> = {
    from: `${APP_NAME} <noreply@${DOMAIN}>`,
    to: email,
  };

  mailOptions.subject = `Debrief Request: [${galaxyTitle.toUpperCase()} GALAXY]`;

  mailOptions.text = `Greetings Captain ${name},

My name is Ian, part of engineering for Galaxy Maps, and Captain of the TaiCollective fleet.

Our systems show you recently created a Galaxy Map called "${galaxyTitle}". Great start!

As we are currently in a beta testing stage, we'd love to hear about your experience:

• How are you finding the Galaxy Maps platform so far?
• What are you currently using it for?
• How could we improve the platform?

Any feedback is greatly appreciated. 
We hope to hear from you.

See You Among the Stars,
The Galaxy Maps Team`;

  mailOptions.html = `<p>Greetings Captain <strong>${name}</strong>,</p>
<p>My name is Ian, part of engineering for Galaxy Maps, and Captain of the TaiCollective fleet.</p>
<p>Our system shows you recently created a Galaxy Map called <strong>"${galaxyTitle}"</strong>. Great start!</p>
<p>As we are currently in a beta testing stage, we'd love to hear about your experience:</p>
<ul>
  <li>How are you finding the Galaxy Maps platform so far?</li>
  <li>What are you currently using it for?</li>
  <li>How could we improve the platform?</li>
</ul>
<p>Any feedback is greatly appreciated. We hope to hear from you.</p>
<ul>
<p>FYI you can resume your Galaxy creation here: <a href="https://${DOMAIN}/galaxy/${galaxyId}" style="color: #69A1E2; text-decoration: none; border: 1px solid #69A1E2; padding: 10px 20px; display: inline-block;">View Your Galaxy Map →</a></p>
<br/>
<p style="font-size: 0.75rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: #69A1E2;">See You Among the Stars,<br/>The Galaxy Maps Team</p>`;

  await getMailTransport().sendMail(mailOptions);
  log("Galaxy feedback email sent to:", email);
}
