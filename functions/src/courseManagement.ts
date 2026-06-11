import { DocumentReference, FieldValue, Filter } from "firebase-admin/firestore";
import { runWith } from "firebase-functions/v1";
import { HttpsError, type CallableContext } from "firebase-functions/v1/https";
import { db, requireAuthenticated } from "./_shared.js";
import {
  VERACITY_LRS_SECRET,
  startGalaxyXAPIStatement,
  stopGalaxyXAPIStatement,
  startTopicXAPIStatement,
  startTaskXAPIStatement,
} from "./veracityLRS.js";
import { type CourseToGalaxyMap } from "./schemas.js";

// Get a course by courseId
export const getCourseByCourseIdHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  const courseId = data.courseId as string | null;
  if (courseId == null) {
    throw new HttpsError("invalid-argument", "missing courseId");
  }

  const courseDoc = await db.collection("courses").doc(courseId).get();
  const courseData = courseDoc.data();

  if (courseData == null) {
    throw new HttpsError("not-found", `Course not found: ${courseId}`);
  }

  // Handle both owner and mappedBy.personId fields for backward compatibility
  let courseOwner = null;
  if (courseData.owner) {
    courseOwner =
      courseData.owner instanceof DocumentReference ? courseData.owner.path : courseData.owner;
  } else if (courseData.mappedBy?.personId) {
    // Fallback to mappedBy.personId if owner field is missing
    courseOwner = db.collection("people").doc(courseData.mappedBy.personId).path;
  }

  // if the course is public and published then always return it
  // if not and the context is unauthenticated then throw not found
  if (courseData.public === true && courseData.status === "published") {
    return {
      course: {
        ...courseData,
        owner: courseOwner,
        id: courseDoc.id,
      },
    };
  } else if (context.auth == null) {
    throw new HttpsError("not-found", `Course not found: ${courseId}`);
  }

  // if the context is authenticated and they are admin, return course
  if (context.auth.token.admin === true) {
    return {
      course: {
        ...courseData,
        owner: courseOwner,
        id: courseDoc.id,
      },
    };
  }

  // if the context is authenticated, they are not admin, and they are
  // the course owner (either via owner field or mappedBy.personId), return course
  if (courseOwner && courseOwner === db.collection("people").doc(context.auth.uid).path) {
    return {
      course: {
        ...courseData,
        owner: courseOwner,
        id: courseDoc.id,
      },
    };
  }

  // if the context is authenticated and they are not admin, check if they are a collaborator
  if (courseData.collaboratorIds && courseData.collaboratorIds.length > 0) {
    const currentUserId = context.auth.uid;
    const isCollaborator = courseData.collaboratorIds.some((collaboratorId: unknown) => {
      // Handle both UID strings and document references
      if (typeof collaboratorId === "string") {
        // If it's a document reference path like "people/uid", extract the UID
        if (collaboratorId.startsWith("people/")) {
          return collaboratorId === `people/${currentUserId}`;
        }
        // If it's just a UID string
        return collaboratorId === currentUserId;
      }
      // If it's a DocumentReference object
      if (collaboratorId instanceof DocumentReference) {
        return collaboratorId.path === `people/${currentUserId}`;
      }
      return false;
    });

    if (isCollaborator) {
      return {
        course: {
          ...courseData,
          owner: courseOwner,
          id: courseDoc.id,
        },
      };
    }
  }

  // if the context is authenticated and they are not admin, check that they
  // belong to a cohort for the course as a teacher or student

  console.log("🔍 Checking cohort access for user:", context.auth.uid);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teacherCohorts: Record<string, any>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studentCohorts: Record<string, any>[] = [];

  const studentQuerySnapShot = await db
    .collection("cohorts")
    .where("students", "array-contains", context.auth.uid)
    .get();
  const teacherQuerySnapShot = await db
    .collection("cohorts")
    .where("teachers", "array-contains", context.auth.uid)
    .get();

  console.log("🔍 Student cohorts found:", studentQuerySnapShot.docs.length);
  console.log("🔍 Teacher cohorts found:", teacherQuerySnapShot.docs.length);

  for (const cohort of studentQuerySnapShot.docs) {
    studentCohorts.push({
      ...cohort.data(),
      id: cohort.id,
    });
  }
  for (const cohort of teacherQuerySnapShot.docs) {
    teacherCohorts.push({
      ...cohort.data(),
      id: cohort.id,
    });
  }

  const courseIds = Array.from(
    new Set([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...studentCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...teacherCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
    ]),
  );

  console.log("🔍 Course IDs from cohorts:", courseIds);
  console.log("🔍 Current course ID:", courseDoc.id);
  console.log("🔍 Is course in user's cohorts?", courseIds.includes(courseDoc.id));

  if (!courseIds.includes(courseDoc.id)) {
    console.log("❌ Course not found in user's cohorts, throwing 404");
    throw new HttpsError("not-found", `Course not found: ${courseId}`);
  }

  console.log("✅ User has cohort access to course, returning map data");

  return {
    course: {
      ...courseData,
      owner: courseOwner,
      id: courseDoc.id,
    },
  };
});

// Get course map-edges and map-nodes by courseId
export const getCourseMapEdgesAndNodesByCourseIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    const courseId = data.courseId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }

    const courseDoc = await db.collection("courses").doc(courseId).get();
    const courseData = courseDoc.data();

    if (courseData == null) {
      throw new HttpsError("not-found", `Course not found: ${courseId}`);
    }

    // Handle both owner and mappedBy.personId fields for backward compatibility
    let courseOwner = null;
    if (courseData.owner) {
      courseOwner =
        courseData.owner instanceof DocumentReference ? courseData.owner.path : courseData.owner;
    } else if (courseData.mappedBy?.personId) {
      // Fallback to mappedBy.personId if owner field is missing
      courseOwner = db.collection("people").doc(courseData.mappedBy.personId).path;
    }

    // if the course is public and published then return the map-edges and map-nodes
    // if not and the context is unauthenticated then throw not found
    if (courseData.public === true && courseData.status === "published") {
      const mapEdgeCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("map-edges")
        .get();

      const mapNodeCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("map-nodes")
        .get();

      const mapEdges = [];
      for (const doc of mapEdgeCollection.docs) {
        mapEdges.push({
          ...doc.data(),
          id: doc.id,
        });
      }

      const mapNodes = [];
      for (const doc of mapNodeCollection.docs) {
        mapNodes.push({
          ...doc.data(),
          id: doc.id,
        });
      }

      return {
        mapEdges,
        mapNodes,
      };
    } else if (context.auth == null) {
      throw new HttpsError("not-found", `Course not found: ${courseId}`);
    }

    // if the context is authenticated, and they are admin or they are
    // the course owner (either via owner field or mappedBy.personId), return the map-edges and map-nodes
    if (
      context.auth.token.admin === true ||
      (courseOwner && courseOwner === db.collection("people").doc(context.auth.uid).path)
    ) {
      const mapEdgeCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("map-edges")
        .get();

      const mapNodeCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("map-nodes")
        .get();

      const mapEdges = [];
      for (const doc of mapEdgeCollection.docs) {
        mapEdges.push({
          ...doc.data(),
          id: doc.id,
        });
      }

      const mapNodes = [];
      for (const doc of mapNodeCollection.docs) {
        mapNodes.push({
          ...doc.data(),
          id: doc.id,
        });
      }

      return {
        mapEdges,
        mapNodes,
      };
    }

    // if the context is authenticated and they are not admin, check if they are a collaborator
    if (courseData.collaboratorIds && courseData.collaboratorIds.includes(context.auth.uid)) {
      const mapEdgeCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("map-edges")
        .get();

      const mapNodeCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("map-nodes")
        .get();

      const mapEdges = [];
      for (const doc of mapEdgeCollection.docs) {
        mapEdges.push({
          ...doc.data(),
          id: doc.id,
        });
      }

      const mapNodes = [];
      for (const doc of mapNodeCollection.docs) {
        mapNodes.push({
          ...doc.data(),
          id: doc.id,
        });
      }

      return {
        mapEdges,
        mapNodes,
      };
    }

    // if the context is authenticated and they are not admin, check that they
    // belong to a cohort for the course as a teacher or student

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teacherCohorts: Record<string, any>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentCohorts: Record<string, any>[] = [];

    const studentQuerySnapShot = await db
      .collection("cohorts")
      .where("students", "array-contains", context.auth.uid)
      .get();
    const teacherQuerySnapShot = await db
      .collection("cohorts")
      .where("teachers", "array-contains", context.auth.uid)
      .get();

    for (const cohort of studentQuerySnapShot.docs) {
      studentCohorts.push({
        ...cohort.data(),
        id: cohort.id,
      });
    }
    for (const cohort of teacherQuerySnapShot.docs) {
      teacherCohorts.push({
        ...cohort.data(),
        id: cohort.id,
      });
    }

    const courseIds = Array.from(
      new Set([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...studentCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...teacherCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
      ]),
    );

    if (!courseIds.includes(courseDoc.id)) {
      throw new HttpsError("not-found", `Course not found: ${courseId}`);
    }

    const mapEdgeCollection = await db
      .collection("courses")
      .doc(courseId)
      .collection("map-edges")
      .get();

    const mapNodeCollection = await db
      .collection("courses")
      .doc(courseId)
      .collection("map-nodes")
      .get();

    const mapEdges = [];
    for (const doc of mapEdgeCollection.docs) {
      mapEdges.push({
        ...doc.data(),
        id: doc.id,
      });
    }

    const mapNodes = [];
    for (const doc of mapNodeCollection.docs) {
      mapNodes.push({
        ...doc.data(),
        id: doc.id,
      });
    }

    return {
      mapEdges,
      mapNodes,
    };
  },
);

// Get a list of courses by SLUG
export const getCoursesHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  const slug = data.slug as string | null;
  let ownerRef: DocumentReference | null = null;
  if (slug != null) {
    const slugDoc = await db.collection("slugs").doc(slug).get();
    const slugData = slugDoc.data();
    if (slugData == null) {
      throw new HttpsError("invalid-argument", `Unknown slug: ${slug}`);
    }
    ownerRef = slugData.owner;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courseMap = new Map();

  // always fetch the public courses that are published
  const courseCollection = await db
    .collection("courses")
    .where(
      Filter.and(
        Filter.or(Filter.where("public", "==", true), Filter.where("visibility", "==", "public")),
        Filter.where("status", "==", "published"),
        ...(ownerRef != null ? [Filter.where("owner", "==", ownerRef)] : []),
      ),
    )
    .get();

  for (const doc of courseCollection.docs) {
    const course = doc.data();
    courseMap.set(doc.id, {
      ...course,
      owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
      id: doc.id,
    });
  }

  // if the context is unauthenticated, only return courses that are public and
  // have a published status
  if (context.auth == null) {
    return { courses: Array.from(courseMap.values()) };
  }

  // if the context is authenticated and they are admin, return all courses
  if (context.auth.token.admin === true) {
    const courseCollection =
      ownerRef != null
        ? await db.collection("courses").where("owner", "==", ownerRef).get()
        : await db.collection("courses").get();

    for (const doc of courseCollection.docs) {
      const course = doc.data();
      courseMap.set(doc.id, {
        ...course,
        owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
        id: doc.id,
      });
    }
    return { courses: Array.from(courseMap.values()) };
  }

  // if the context is authenticated and they are not admin, return all courses
  // where they are the owner or where they belong to a cohort for the course as
  // a teacher or as a student
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teacherCohorts: Record<string, any>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studentCohorts: Record<string, any>[] = [];

  const studentCohortCollection = await db
    .collection("cohorts")
    .where("students", "array-contains", context.auth.uid)
    .get();
  const teacherCohortCollection = await db
    .collection("cohorts")
    .where("teachers", "array-contains", context.auth.uid)
    .get();

  for (const cohort of studentCohortCollection.docs) {
    studentCohorts.push({
      ...cohort.data(),
      id: cohort.id,
    });
  }
  for (const cohort of teacherCohortCollection.docs) {
    teacherCohorts.push({
      ...cohort.data(),
      id: cohort.id,
    });
  }

  const courseIds = Array.from(
    new Set([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...studentCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...teacherCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
    ]),
  );

  const courseDocs = await Promise.all(courseIds.map((x) => db.collection("courses").doc(x).get()));

  for (const doc of courseDocs) {
    const course = doc.data();
    if (course == null) {
      continue;
    }

    // If ownerRef is not null, filter by owner
    if (ownerRef != null && course.owner.path !== ownerRef.path) {
      continue;
    }

    courseMap.set(doc.id, {
      ...course,
      owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
      id: doc.id,
    });
  }

  const ownedCourseCollection = await db
    .collection("courses")
    .where(
      Filter.and(
        Filter.where("owner", "==", db.collection("people").doc(context.auth.uid)),
        ...(ownerRef != null ? [Filter.where("owner", "==", ownerRef)] : []),
      ),
    )
    .where("owner", "==", db.collection("people").doc(context.auth.uid))
    .get();

  for (const doc of ownedCourseCollection.docs) {
    const course = doc.data();
    courseMap.set(doc.id, {
      ...course,
      owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
      id: doc.id,
    });
  }

  // Include courses where the authenticated user is a collaborator
  try {
    const collaboratorCoursesQuery = await db
      .collection("courses")
      .where(
        Filter.and(
          Filter.where("collaboratorIds", "array-contains", context.auth.uid),
          ...(ownerRef != null ? [Filter.where("owner", "==", ownerRef)] : []),
        ),
      )
      .get();

    for (const doc of collaboratorCoursesQuery.docs) {
      const course = doc.data();
      courseMap.set(doc.id, {
        ...course,
        owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
        id: doc.id,
      });
    }
  } catch (e) {
    // If field does not exist yet on some documents, ignore
  }

  return { courses: Array.from(courseMap.values()) };
});

// Get only public and published courses (no authentication required)
export const getPublicCoursesHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  const slug = data.slug as string | null;
  let ownerRef: DocumentReference | null = null;

  if (slug != null) {
    const slugDoc = await db.collection("slugs").doc(slug).get();
    const slugData = slugDoc.data();
    if (slugData == null) {
      throw new HttpsError("invalid-argument", `Unknown slug: ${slug}`);
    }
    ownerRef = slugData.owner;
  }

  // Only fetch public courses that are published
  const courseCollection = await db
    .collection("courses")
    .where(
      Filter.and(
        Filter.or(Filter.where("public", "==", true), Filter.where("visibility", "==", "public")),
        Filter.where("status", "==", "published"),
        ...(ownerRef != null ? [Filter.where("owner", "==", ownerRef)] : []),
      ),
    )
    .get();

  const courses = [];
  for (const doc of courseCollection.docs) {
    const course = doc.data();
    courses.push({
      ...course,
      owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
      id: doc.id,
    });
  }

  return { courses };
});

// Get only courses where the authenticated user has a direct relationship
export const getMyCoursesHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  requireAuthenticated(context);

  const slug = data.slug as string | null;
  let ownerRef: DocumentReference | null = null;

  if (slug != null) {
    const slugDoc = await db.collection("slugs").doc(slug).get();
    const slugData = slugDoc.data();
    if (slugData == null) {
      throw new HttpsError("invalid-argument", `Unknown slug: ${slug}`);
    }
    ownerRef = slugData.owner;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courseMap = new Map();

  // if they are admin, return all courses (or filtered by ownerRef if slug provided)
  if (context.auth.token.admin === true) {
    const courseCollection =
      ownerRef != null
        ? await db.collection("courses").where("owner", "==", ownerRef).get()
        : await db.collection("courses").get();

    for (const doc of courseCollection.docs) {
      const course = doc.data();
      courseMap.set(doc.id, {
        ...course,
        owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
        id: doc.id,
      });
    }
    return { courses: Array.from(courseMap.values()) };
  }

  // if they are not admin, return only courses where they have a direct relationship
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teacherCohorts: Record<string, any>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studentCohorts: Record<string, any>[] = [];

  const studentCohortCollection = await db
    .collection("cohorts")
    .where("students", "array-contains", context.auth.uid)
    .get();
  const teacherCohortCollection = await db
    .collection("cohorts")
    .where("teachers", "array-contains", context.auth.uid)
    .get();

  for (const cohort of studentCohortCollection.docs) {
    studentCohorts.push({
      ...cohort.data(),
      id: cohort.id,
    });
  }
  for (const cohort of teacherCohortCollection.docs) {
    teacherCohorts.push({
      ...cohort.data(),
      id: cohort.id,
    });
  }

  const courseIds = Array.from(
    new Set([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...studentCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...teacherCohorts.flatMap((x: Record<string, any>): string[] => x.courses),
    ]),
  );

  const courseDocs = await Promise.all(courseIds.map((x) => db.collection("courses").doc(x).get()));

  for (const doc of courseDocs) {
    const course = doc.data();
    if (course == null) {
      continue;
    }

    // If ownerRef is not null, filter by owner
    if (ownerRef != null && course.owner.path !== ownerRef.path) {
      continue;
    }

    courseMap.set(doc.id, {
      ...course,
      owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
      id: doc.id,
    });
  }

  // Get courses owned by the user
  const ownedCourseCollection = await db
    .collection("courses")
    .where(
      Filter.and(
        Filter.where("owner", "==", db.collection("people").doc(context.auth.uid)),
        ...(ownerRef != null ? [Filter.where("owner", "==", ownerRef)] : []),
      ),
    )
    .get();

  for (const doc of ownedCourseCollection.docs) {
    const course = doc.data();
    courseMap.set(doc.id, {
      ...course,
      owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
      id: doc.id,
    });
  }

  // Include courses where the authenticated user is a collaborator
  try {
    const collaboratorCoursesQuery = await db
      .collection("courses")
      .where(
        Filter.and(
          Filter.where("collaboratorIds", "array-contains", context.auth.uid),
          ...(ownerRef != null ? [Filter.where("owner", "==", ownerRef)] : []),
        ),
      )
      .get();

    for (const doc of collaboratorCoursesQuery.docs) {
      const course = doc.data();
      courseMap.set(doc.id, {
        ...course,
        owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
        id: doc.id,
      });
    }
  } catch (e) {
    // If field does not exist yet on some documents, ignore
  }

  return { courses: Array.from(courseMap.values()) };
});

// Get cohort by cohortId
export const getCohortByCohortIdHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  requireAuthenticated(context);

  const cohortId = data.cohortId as string | null;
  if (cohortId == null) {
    throw new HttpsError("invalid-argument", "missing cohortId");
  }

  const cohortDoc = await db.collection("cohorts").doc(cohortId).get();
  const cohortData = cohortDoc.data();

  if (cohortData == null) {
    throw new HttpsError("not-found", `Cohort not found: ${cohortId}`);
  }

  // TODO: permissions checks

  return {
    cohort: {
      ...cohortData,
      id: cohortDoc.id,
    },
  };
});

// Get cohorts
export const getCohortsHttpsEndpoint = runWith({}).https.onCall(async (_data, context) => {
  requireAuthenticated(context);

  // if they are admin, return all cohorts
  if (context.auth.token.admin === true) {
    const cohortCollection = await db.collection("cohorts").get();

    const cohortMap = new Map();
    for (const doc of cohortCollection.docs) {
      const cohort = doc.data();
      cohortMap.set(doc.id, {
        ...cohort,
        id: doc.id,
      });
    }
    return { cohorts: Array.from(cohortMap.values()) };
  }

  // if they are not admin, return all cohorts where they are a student or teacher
  const cohortMap = new Map();

  const studentCohortCollection = await db
    .collection("cohorts")
    .where("students", "array-contains", context.auth.uid)
    .get();
  const teacherCohortCollection = await db
    .collection("cohorts")
    .where("teachers", "array-contains", context.auth.uid)
    .get();

  for (const cohort of studentCohortCollection.docs) {
    cohortMap.set(cohort.id, {
      ...cohort.data(),
      id: cohort.id,
    });
  }
  for (const cohort of teacherCohortCollection.docs) {
    cohortMap.set(cohort.id, {
      ...cohort.data(),
      id: cohort.id,
    });
  }

  return { cohorts: Array.from(cohortMap.values()) };
});

// Get student cohorts by personId
export const getStudentCohortsByPersonIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }

    // TODO: permissions checks

    const cohortCollection = await db
      .collection("cohorts")
      .where("students", "array-contains", personId)
      .get();

    const cohorts = [];
    for (const doc of cohortCollection.docs) {
      const cohort = doc.data();
      cohorts.push({
        ...cohort,
        id: doc.id,
      });
    }

    return { cohorts };
  },
);

// Get teacher cohorts by personId
export const getTeachersCohortsByPersonIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }

    // TODO: permissions checks

    const cohortCollection = await db
      .collection("cohorts")
      .where("teachers", "array-contains", personId)
      .get();

    const cohorts = [];
    for (const doc of cohortCollection.docs) {
      const cohort = doc.data();
      cohorts.push({
        ...cohort,
        id: doc.id,
      });
    }

    return { cohorts };
  },
);

// get student submissions by personId
export const getStudentSubmissionsByPersonIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }

    const courseIdsSet = new Set<string>();

    if (context.auth.uid === personId) {
      // get person
      const personDoc = await db.collection("people").doc(personId).get();
      const person = personDoc.data();
      if (person == null) {
        throw new HttpsError("not-found", `Person not found: ${personId}`);
      }

      // get assigned courses
      for (const courseId of person.assignedCourses) {
        courseIdsSet.add(courseId);
      }
    } else {
      // get courses for teacher
      const teacherCohortCollection = await db
        .collection("cohorts")
        .where("teachers", "array-contains", context.auth.uid)
        .get();

      for (const cohortDoc of teacherCohortCollection.docs) {
        const cohort = cohortDoc.data();
        for (const courseId of cohort.courses) {
          courseIdsSet.add(courseId);
        }
      }
    }

    // get course submissions for review
    const submissions = [];

    for (const courseId of Array.from(courseIdsSet)) {
      const submissionsForReviewCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("submissionsForReview")
        .where("studentId", "==", personId)
        .get();

      for (const submissionForReviewDoc of submissionsForReviewCollection.docs) {
        const submissionForReview = submissionForReviewDoc.data();
        console.log("debug: submissionForReview", submissionForReview);
        submissions.push({
          ...submissionForReview,
          courseId,
          id: submissionForReviewDoc.id,
        });
      }
    }

    return { submissions };
  },
);

export const getStudentRequestsByPersonIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }

    const courseIdsSet = new Set<string>();

    if (context.auth.uid === personId) {
      // get assigned courses
      const personDoc = await db.collection("people").doc(personId).get();
      const person = personDoc.data();
      if (person == null) {
        throw new HttpsError("not-found", `Person not found: ${personId}`);
      }

      for (const courseId of person.assignedCourses) {
        courseIdsSet.add(courseId);
      }
    } else {
      // get courses for teacher
      const teacherCohortCollection = await db
        .collection("cohorts")
        .where("teachers", "array-contains", context.auth.uid)
        .get();

      for (const cohortDoc of teacherCohortCollection.docs) {
        const cohort = cohortDoc.data();
        for (const courseId of cohort.courses) {
          courseIdsSet.add(courseId);
        }
      }
    }

    // get course submissions for review
    const requests = [];

    for (const courseId of Array.from(courseIdsSet)) {
      const requestsForHelpCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("requestsForHelp")
        .where("personId", "==", personId)
        .get();

      for (const requestForHelpDoc of requestsForHelpCollection.docs) {
        const requestForHelp = requestForHelpDoc.data();
        requests.push({
          ...requestForHelp,
          courseId,
          id: requestForHelpDoc.id,
        });
      }
    }

    return { requests };
  },
);

// Get all cohorts in course by courseId
export const getCohortsByCourseIdHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  requireAuthenticated(context);

  const courseId = data.courseId as string | null;
  if (courseId == null) {
    throw new HttpsError("invalid-argument", "missing courseId");
  }

  // TODO: permissions checks

  const cohortCollection = await db
    .collection("cohorts")
    .where("courses", "array-contains", courseId)
    .get();

  const cohorts = [];
  for (const doc of cohortCollection.docs) {
    const cohort = doc.data();
    cohorts.push({
      ...cohort,
      id: doc.id,
    });
  }

  return { cohorts };
});

// Get topic by courseId and topicId
export const getTopicByCourseIdTopicIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }

    const topicDoc = await db
      .collection("courses")
      .doc(courseId)
      .collection("topics")
      .doc(topicId)
      .get();
    const topicData = topicDoc.data();

    if (topicData == null) {
      throw new HttpsError("not-found", `Topic not found: ${topicId}`);
    }

    // TODO: permissions checks

    return {
      topic: {
        ...topicData,
        id: topicDoc.id,
      },
    };
  },
);

// Get task by courseId and topicId and taskId
export const getTaskByCourseIdTopicIdTaskIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    const taskId = data.taskId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }
    if (taskId == null) {
      throw new HttpsError("invalid-argument", "missing taskId");
    }

    const taskDoc = await db
      .collection("courses")
      .doc(courseId)
      .collection("topics")
      .doc(topicId)
      .collection("tasks")
      .doc(taskId)
      .get();
    const taskData = taskDoc.data();

    if (taskData == null) {
      throw new HttpsError("not-found", `Task not found: ${taskId}`);
    }

    // TODO: permissions checks

    return {
      task: {
        ...taskData,
        id: taskDoc.id,
      },
    };
  },
);

// Get tasks by courseId and topicId
export const getTasksByCourseIdTopicIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }

    // TODO: permissions checks

    const taskCollection = await db
      .collection("courses")
      .doc(courseId)
      .collection("topics")
      .doc(topicId)
      .collection("tasks")
      .get();

    const tasks = [];
    for (const doc of taskCollection.docs) {
      const task = doc.data();
      tasks.push({
        ...task,
        id: doc.id,
      });
    }

    return { tasks };
  },
);

// Get person topic by personId and courseId and topicId
export const getPersonTopicByPersonIdCourseIdTopicIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }

    // TODO: permissions checks

    const personTopicDoc = await db
      .collection("people")
      .doc(personId)
      .collection(courseId)
      .doc(topicId)
      .get();

    const personTopic = personTopicDoc.data();

    return {
      personTopic: {
        ...personTopic,
        id: personTopicDoc.id,
      },
    };
  },
);

// Get person topics by personId and courseId
export const getPersonTopicsByPersonIdCourseIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    const courseId = data.courseId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }

    // TODO: permissions checks

    const personTopicCollection = await db
      .collection("people")
      .doc(personId)
      .collection(courseId)
      .get();

    const personTopics = [];
    for (const doc of personTopicCollection.docs) {
      const personTopic = doc.data();
      personTopics.push({
        ...personTopic,
        id: doc.id,
      });
    }

    return { personTopics };
  },
);

// Get person tasks by personId and courseId and topicId
export const getPersonTasksByPersonIdCourseIdTopicIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }

    // TODO: permissions checks

    const personTaskCollection = await db
      .collection("people")
      .doc(personId)
      .collection(courseId)
      .doc(topicId)
      .collection("tasks")
      .get();

    const personTasks = [];
    for (const doc of personTaskCollection.docs) {
      const personTask = doc.data();
      personTasks.push({
        ...personTask,
        id: doc.id,
      });
    }

    return { personTasks };
  },
);

// Get all people in course by courseId
export const getPeopleByCourseIdHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  requireAuthenticated(context);

  const courseId = data.courseId as string | null;
  if (courseId == null) {
    throw new HttpsError("invalid-argument", "missing courseId");
  }

  // TODO: permissions checks

  const querySnapshot = await db
    .collection("people")
    .where("assignedCourses", "array-contains", courseId)
    .get();

  const people = [];
  for (const doc of querySnapshot.docs) {
    const person = doc.data();
    people.push({
      ...person,
      id: doc.id,
    });
  }

  return { people };
});

// Get courses created by a person (where personId matches mappedBy.personId)
export const getCoursesCreatedByPersonIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    console.log("🔵 getCoursesCreatedByPersonIdHttpsEndpoint ENTRY - Function called", {
      hasData: !!data,
      hasContext: !!context,
      hasAuth: !!context?.auth,
      personId: data?.personId,
    });
    try {
      requireAuthenticated(context);
      console.log("✅ Authentication check passed");

      const personId = data.personId as string | null;
      if (personId == null) {
        console.error("❌ Missing personId in request data");
        throw new HttpsError("invalid-argument", "missing personId");
      }

      console.log(`🔍 getCoursesCreatedByPersonId called for personId: ${personId}`);

      // Query courses where mappedBy.personId matches
      let mappedByQuerySnapshot;
      try {
        mappedByQuerySnapshot = await db
          .collection("courses")
          .where("mappedBy.personId", "==", personId)
          .get();
        console.log(`Found ${mappedByQuerySnapshot.docs.length} courses for personId: ${personId}`);
      } catch (queryError) {
        console.error("Error querying courses:", queryError);
        // If it's a missing index error, return empty array instead of failing
        if (
          queryError instanceof Error &&
          queryError.message.includes("index") &&
          queryError.message.includes("required")
        ) {
          console.warn("Firestore index missing, returning empty array");
          return { courses: [] };
        }
        throw queryError;
      }

      const courses = [];
      for (const doc of mappedByQuerySnapshot.docs) {
        try {
          const course = doc.data();
          courses.push({
            ...course,
            owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
            id: doc.id,
          });
        } catch (docError) {
          console.error(`Error processing course ${doc.id}:`, docError);
          // Continue processing other courses
        }
      }

      console.log(`Returning ${courses.length} courses for personId: ${personId}`);
      return { courses };
    } catch (err) {
      // Log the error for debugging
      console.error("getCoursesCreatedByPersonId error:", err);
      // Re-throw HttpsError as-is
      if (err instanceof HttpsError) {
        throw err;
      }
      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to get courses created by person: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  },
);

// Get all courses grouped by creator (mappedBy.personId)
// This is more efficient than querying for each person individually
export const getAllCoursesGroupedByCreatorHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    console.log("🔵 getAllCoursesGroupedByCreatorHttpsEndpoint ENTRY - Function called");
    try {
      requireAuthenticated(context);
      console.log("✅ Authentication check passed");

      // TODO: permissions checks - ensure user has permission to view all courses

      // Fetch all courses from Firestore (single query)
      let coursesSnapshot;
      try {
        coursesSnapshot = await db.collection("courses").get();
        console.log(`Found ${coursesSnapshot.docs.length} total courses`);
      } catch (queryError) {
        console.error("Error querying all courses:", queryError);
        throw queryError;
      }

      // Group courses by mappedBy.personId
      const coursesByCreator: { [personId: string]: unknown[] } = {};

      for (const doc of coursesSnapshot.docs) {
        try {
          const course = doc.data();
          const personId = course.mappedBy?.personId;

          // Skip courses without mappedBy.personId (shouldn't happen per user, but handle gracefully)
          if (!personId) {
            console.warn(`Course ${doc.id} has no mappedBy.personId, skipping`);
            continue;
          }

          // Initialize array for this personId if it doesn't exist
          if (!coursesByCreator[personId]) {
            coursesByCreator[personId] = [];
          }

          // Add course to the appropriate person's array
          coursesByCreator[personId].push({
            ...course,
            owner: course.owner instanceof DocumentReference ? course.owner.path : course.owner,
            id: doc.id,
          });
        } catch (docError) {
          console.error(`Error processing course ${doc.id}:`, docError);
          // Continue processing other courses
        }
      }

      console.log(`Returning courses grouped by ${Object.keys(coursesByCreator).length} creators`);
      return { coursesByCreator };
    } catch (err) {
      // Log the error for debugging
      console.error("getAllCoursesGroupedByCreator error:", err);
      // Re-throw HttpsError as-is
      if (err instanceof HttpsError) {
        throw err;
      }
      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to get all courses grouped by creator: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  },
);

// Create task with courseId and topicId
export const createTaskWithCourseIdTopicIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    const task = data.task as Record<string, unknown> | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }
    if (task == null) {
      throw new HttpsError("invalid-argument", "missing task");
    }

    // TODO: permissions checks

    const result = await createTask(courseId, topicId, task);

    return result;
  },
);

/**
 * Create a task
 */
async function createTask(courseId: string, topicId: string, task: Record<string, unknown>) {
  const taskRef = await db
    .collection("courses")
    .doc(courseId)
    .collection("topics")
    .doc(topicId)
    .collection("tasks")
    .add({ ...task, taskCreatedTimestamp: new Date() });

  // increment course taskTotals by 1
  await db.collection("courses").doc(courseId).update("taskTotal", FieldValue.increment(1));

  // increment topic taskTotals by 1
  await db
    .collection("courses")
    .doc(courseId)
    .collection("topics")
    .doc(topicId)
    .update("taskTotal", FieldValue.increment(1));

  const taskDoc = await taskRef.get();

  // update students with task

  // get all students in the course
  const studentCollection = await db
    .collection("people")
    .where("assignedCourses", "array-contains", courseId)
    .get();

  for (const doc of studentCollection.docs) {
    const studentId = doc.id;

    // set reference to this course
    const courseRef = db.collection("people").doc(studentId).collection(courseId);

    // check if the student has already started the course
    // if not they will be assigned this task when they start the course
    const studentHasStartedCourse = await courseRef.get().then((subQuery) => {
      return subQuery.docs.length;
    });

    if (studentHasStartedCourse) {
      // if they have started the course, get the tasks for this topic
      const query = await courseRef.doc(topicId).collection("tasks").get();

      // get the data from the task
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tasks: Record<string, any>[] = query.docs.map((doc) => {
        return {
          ...doc.data(),
          id: doc.id,
        };
      });

      // check if all the tasks are all completed
      const uncompletedTasks = tasks.filter((task) => task.taskStatus !== "completed");

      // assign task to student
      await courseRef
        .doc(topicId)
        .collection("tasks")
        .doc(taskDoc.id)
        .set({
          ...taskDoc.data(),
          // if they arent all completed this task will be locked.
          // if they are completed then this task should be unlocked
          taskStatus: uncompletedTasks.length ? "locked" : "unlocked",
        });
    }
  }

  return {
    task: {
      ...taskDoc.data(),
      id: taskDoc.id,
    },
  };
}

// Update task by courseId and topicId and taskId
export const updateTaskByCourseIdTopicIdTaskIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    const taskId = data.taskId as string | null;
    const task = data.task as Record<string, unknown> | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }
    if (taskId == null) {
      throw new HttpsError("invalid-argument", "missing taskId");
    }
    if (task == null) {
      throw new HttpsError("invalid-argument", "missing task");
    }

    // TODO: permissions checks

    const result = await updateTask(courseId, topicId, taskId, task);

    return result;
  },
);

/**
 * Update a task
 */
async function updateTask(
  courseId: string,
  topicId: string,
  taskId: string,
  task: Record<string, unknown>,
) {
  const taskRef = db
    .collection("courses")
    .doc(courseId)
    .collection("topics")
    .doc(topicId)
    .collection("tasks")
    .doc(taskId);

  await taskRef.update(task);

  const taskDoc = await taskRef.get();

  // update students with task

  // get all students in the course
  const studentCollection = await db
    .collection("people")
    .where("assignedCourses", "array-contains", courseId)
    .get();

  for (const doc of studentCollection.docs) {
    const studentId = doc.id;

    // set reference to this course
    const courseRef = db.collection("people").doc(studentId).collection(courseId);

    // check if the student has already started the course
    // if not they will be assigned this task when they start the course
    const studentHasStartedCourse = await courseRef.get().then((subQuery) => {
      return subQuery.docs.length;
    });

    if (studentHasStartedCourse) {
      // assign task to student
      await courseRef
        .doc(topicId)
        .collection("tasks")
        .doc(taskDoc.id)
        .set(
          {
            ...taskDoc.data(),
          },
          { merge: true },
        );
    }
  }

  return {
    task: {
      ...taskDoc.data(),
      id: taskDoc.id,
    },
  };
}

// Delete task by courseId and topicId and taskId
export const deleteTaskByCourseIdTopicIdTaskIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    const taskId = data.taskId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }
    if (taskId == null) {
      throw new HttpsError("invalid-argument", "missing taskId");
    }

    // TODO: permissions checks

    const result = await deleteTask(courseId, topicId, taskId);

    return result;
  },
);

// Delete request for help by courseId and requestId
export const deleteRequestByCourseIdRequestIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const requestId = data.requestId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (requestId == null) {
      throw new HttpsError("invalid-argument", "missing requestId");
    }

    // TODO: permissions checks

    await deleteRequest(courseId, requestId);

    // const result = await deleteRequest(courseId, requestId);
    // return result;
  },
);

/**
 * Delete a task
 */
async function deleteTask(courseId: string, topicId: string, taskId: string) {
  const taskRef = db
    .collection("courses")
    .doc(courseId)
    .collection("topics")
    .doc(topicId)
    .collection("tasks")
    .doc(taskId);

  const taskDoc = await taskRef.get();

  // update students with task

  // get all students in the course
  const studentCollection = await db
    .collection("people")
    .where("assignedCourses", "array-contains", courseId)
    .get();

  for (const doc of studentCollection.docs) {
    const studentId = doc.id;

    // delete for student
    await db
      .collection("people")
      .doc(studentId)
      .collection(courseId)
      .doc(topicId)
      .collection("tasks")
      .doc(taskDoc.id)
      .delete();
  }

  // increment course taskTotals by -1
  await db.collection("courses").doc(courseId).update("taskTotal", FieldValue.increment(-1));

  // increment topic taskTotals by -1
  await db
    .collection("courses")
    .doc(courseId)
    .collection("topics")
    .doc(topicId)
    .update("taskTotal", FieldValue.increment(-1));

  // TODO: check if the next task in the topic needs to be unlocked

  await taskRef.delete();

  return {
    task: {
      ...taskDoc.data(),
      id: taskDoc.id,
    },
  };
}

/**
 * Delete a request for help
 */
async function deleteRequest(courseId: string, requestId: string) {
  await db
    .collection("courses")
    .doc(courseId)
    .collection("requestsForHelp")
    .doc(requestId)
    .delete();
}

// Update task order indexes by courseId and topicId
export const updateTaskOrderIndexesByCourseIdTopicIdHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    const topicId = data.topicId as string | null;
    const orderIndexes = data.orderIndexes as { taskId: string; orderIndex: number }[] | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }
    if (topicId == null) {
      throw new HttpsError("invalid-argument", "missing topicId");
    }
    if (orderIndexes == null) {
      throw new HttpsError("invalid-argument", "missing orderIndexes");
    }

    // TODO: permissions checks

    const result = await updateTaskOrderIndexes(courseId, topicId, orderIndexes);

    return result;
  },
);

/**
 * Update a task
 */
async function updateTaskOrderIndexes(
  courseId: string,
  topicId: string,
  orderIndexes: { taskId: string; orderIndex: number }[],
) {
  const updatedTaskCollection = await Promise.all(
    orderIndexes.map(async (taskOrderIndex) => {
      const taskRef = db
        .collection("courses")
        .doc(courseId)
        .collection("topics")
        .doc(topicId)
        .collection("tasks")
        .doc(taskOrderIndex.taskId);

      await taskRef.set(
        {
          orderIndex: taskOrderIndex.orderIndex,
        },
        { merge: true },
      );

      const taskDoc = await taskRef.get();

      return taskDoc;
    }),
  );

  // update students with tasks

  // get all students in the course
  const studentCollection = await db
    .collection("people")
    .where("assignedCourses", "array-contains", courseId)
    .get();

  for (const doc of studentCollection.docs) {
    const studentId = doc.id;

    // set reference to this course
    const courseRef = db.collection("people").doc(studentId).collection(courseId);

    // check if the student has already started the course
    // if not they will be assigned this task when they start the course
    const studentHasStartedCourse = await courseRef.get().then((subQuery) => {
      return subQuery.docs.length;
    });

    if (studentHasStartedCourse) {
      // assign tasks to student
      await Promise.all(
        updatedTaskCollection.map((taskDoc) =>
          courseRef
            .doc(topicId)
            .collection("tasks")
            .doc(taskDoc.id)
            .set({ ...taskDoc.data() }),
        ),
      );
    }
  }

  const taskCollection = await db
    .collection("courses")
    .doc(courseId)
    .collection("topics")
    .doc(topicId)
    .collection("tasks")
    .get();

  const tasks = [];
  for (const doc of taskCollection.docs) {
    const task = doc.data();
    tasks.push({
      ...task,
      id: doc.id,
    });
  }

  return {
    tasks,
  };
}

// ====== ASSIGN PERSON TO COHORT ==================
export const addMeToCohortHttpsEndpoint = runWith({}).https.onCall(
  async (data: { cohortId: string }, context) => {
    requireAuthenticated(context);

    const cohortId = data.cohortId as string | null;
    if (cohortId == null) {
      throw new HttpsError("invalid-argument", "missing cohortId");
    }

    const personId = context.auth.uid;

    const result = await addStudentToCohort(cohortId, personId);

    return result;
  },
);

export const addStudentToCohortHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  requireAuthenticated(context);

  const personId = data.personId as string | null;
  const cohortId = data.cohortId as string | null;
  if (personId == null) {
    throw new HttpsError("invalid-argument", "missing personId");
  }
  if (cohortId == null) {
    throw new HttpsError("invalid-argument", "missing cohortId");
  }

  // TODO: add permissions checks to see if current authenticated user has permission to
  // add the specified personId to the specified cohortId

  const result = await addStudentToCohort(cohortId, personId);

  return result;
});

/**
 * Add person to cohort
 */
async function addStudentToCohort(cohortId: string, personId: string) {
  // Load person and course from their IDs
  const [cohortDoc, personDoc] = await Promise.all([
    db.collection("cohorts").doc(cohortId).get(),
    db.collection("people").doc(personId).get(),
  ]);
  const cohort = cohortDoc.data();
  const person = personDoc.data();

  if (cohort == null) {
    throw new HttpsError("not-found", `Cohort not found: ${cohortId}`);
  }
  if (person == null) {
    throw new HttpsError("not-found", `Person not found: ${personId}`);
  }

  await cohortDoc.ref.update({
    students: FieldValue.arrayUnion(personId),
  });

  const updatedCohortDoc = await cohortDoc.ref.get();

  return {
    cohort: {
      ...updatedCohortDoc.data(),
      id: updatedCohortDoc.id,
    },
  };
}

// ====== ASSIGN PERSON TO COURSE ==================
export const assignCourseToMeHttpsEndpoint = runWith({
  secrets: [VERACITY_LRS_SECRET],
}).https.onCall(async (data: { courseId: string }, context) => {
  requireAuthenticated(context);

  const courseId = data.courseId as string | null;
  if (courseId == null) {
    throw new HttpsError("invalid-argument", "missing courseId");
  }

  const personId = context.auth.uid;

  const result = await assignCourseToStudent(courseId, personId);

  return result;
});

export const assignCourseToStudentHttpsEndpoint = runWith({
  secrets: [VERACITY_LRS_SECRET],
}).https.onCall(async (data, context) => {
  requireAuthenticated(context);

  const personId = data.personId as string | null;
  const courseId = data.courseId as string | null;
  if (personId == null) {
    throw new HttpsError("invalid-argument", "missing personId");
  }
  if (courseId == null) {
    throw new HttpsError("invalid-argument", "missing courseId");
  }

  // TODO: add permissions checks to see if current authenticated user has permission to
  // add the specified personId to the specified courseId

  const result = await assignCourseToStudent(courseId, personId);

  return result;
});

/**
 * Add person to course
 */
async function assignCourseToStudent(courseId: string, personId: string) {
  // Load person and course from their IDs
  const [personDoc, courseDoc] = await Promise.all([
    db.collection("people").doc(personId).get(),
    db.collection("courses").doc(courseId).get(),
  ]);
  const person = personDoc.data();
  const course = courseDoc.data();

  if (person == null) {
    throw new HttpsError("not-found", `Person not found: ${personId}`);
  }
  if (course == null) {
    throw new HttpsError("not-found", `Course not found: ${courseId}`);
  }

  console.log("person:", person);

  // check if student is assigned to course
  if (!person.assignedCourses || !person.assignedCourses.includes(courseId)) {
    console.log("course DOES NOT exist for student", person.firstName + " " + person.lastName);

    // Add the topics and tasks to the student

    // 1) get topics in this course
    const topicCollection = await db
      .collection("courses")
      .doc(courseDoc.id)
      .collection("topics")
      .orderBy("topicCreatedTimestamp")
      .get();

    // 2) add them to person (this will store their TOPIC progression data for this course )
    for (const topicDoc of topicCollection.docs) {
      const topic = topicDoc.data();

      // calculate topic status
      let topicStatus: string;
      if (topic.group === "introduction") {
        // is the topic part of the introduction group? if so make it unlocked
        topicStatus = "unlocked";
      } else if ((topic.prerequisites?.length ?? 0) === 0) {
        // does this topic have prereqs? if not make it unlocked
        topicStatus = "unlocked";
      } else {
        // default to locked
        topicStatus = "locked";
      }

      await db
        .collection("people")
        .doc(personDoc.id)
        .collection(courseDoc.id)
        .doc(topicDoc.id)
        .set({
          ...topic,
          topicStatus,
        });

      // 3) check if this topic has tasks
      const taskCollection = await db
        .collection("courses")
        .doc(courseDoc.id)
        .collection("topics")
        .doc(topicDoc.id)
        .collection("tasks")
        // order by timestamp is important otherwise index == 0 (in the next step)
        // wont necessarily be the first mission
        .orderBy("taskCreatedTimestamp")
        .get();

      // 4) if tasks exist. add them to person
      for (const [index, taskDoc] of taskCollection.docs.entries()) {
        const task = taskDoc.data();

        await db
          .collection("people")
          .doc(personDoc.id)
          .collection(courseDoc.id)
          .doc(topicDoc.id)
          .collection("tasks")
          .doc(taskDoc.id)
          .set({
            ...task,
            // set the status of topics to locked unless they are the first mission (index == 0)
            taskStatus: index == 0 ? "unlocked" : "locked",
          });
      }
    }
  } else {
    console.log(person.firstName + " is already in " + course.title + ". Continuing...");
  }

  // Ensure the course is added to the person's assignedCourses
  await personDoc.ref.update({
    assignedCourses: FieldValue.arrayUnion(courseId),
  });

  // Send Galaxy Started statment to LRS
  startGalaxyXAPIStatement(
    {
      id: personDoc.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
    },
    {
      galaxy: {
        id: courseDoc.id,
        title: course.title,
      },
    },
  );

  const updatedPersonDoc = await personDoc.ref.get();

  return {
    person: {
      ...updatedPersonDoc.data(),
      id: updatedPersonDoc.id,
    },
  };
}

// ====== REMOVE PERSON FROM COURSE ==================
export const removeMeFromCourseHttpsEndpoint = runWith({}).https.onCall(
  async (data: { courseId: string }, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }

    const personId = context.auth.uid;

    const result = await removeStudentFromCourse(courseId, personId);

    return result;
  },
);

export const removeStudentFromCourseHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const personId = data.personId as string | null;
    const courseId = data.courseId as string | null;
    if (personId == null) {
      throw new HttpsError("invalid-argument", "missing personId");
    }
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }

    // TODO: add permissions checks to see if current authenticated user has permission to
    // remove the specified personId from the specified courseId

    const result = await removeStudentFromCourse(courseId, personId);

    return result;
  },
);

/**
 * Remove person from course
 */
async function removeStudentFromCourse(courseId: string, personId: string) {
  // Load person and course from their IDs
  const [personDoc, courseDoc] = await Promise.all([
    db.collection("people").doc(personId).get(),
    db.collection("courses").doc(courseId).get(),
  ]);
  const person = personDoc.data();
  const course = courseDoc.data();

  if (person == null) {
    throw new HttpsError("not-found", `Person not found: ${personId}`);
  }
  if (course == null) {
    throw new HttpsError("not-found", `Course not found: ${courseId}`);
  }

  // check if student is assigned to course
  if (person.assignedCourses.includes(courseId)) {
    console.log("course DOES exist for student", person.firstName + " " + person.lastName);

    // Get a list of topics in this course
    const personTopicCollection = await db
      .collection("people")
      .doc(personDoc.id)
      .collection(courseDoc.id)
      .get();

    // Loop over topics and delete the tasks and the topic
    for (const personTopicDoc of personTopicCollection.docs) {
      const personTaskCollection = await db
        .collection("people")
        .doc(personDoc.id)
        .collection(courseDoc.id)
        .doc(personTopicDoc.id)
        .collection("tasks")
        .get();

      await Promise.all(
        personTaskCollection.docs.map((personTaskDoc) => personTaskDoc.ref.delete()),
      );

      // Delete the topic
      await personTopicDoc.ref.delete();
    }

    await personDoc.ref.update({
      assignedCourses: FieldValue.arrayRemove(courseId),
    });
  } else {
    throw new HttpsError("not-found", person.firstName + " is not in " + course.title);
  }

  // Send Galaxy Stopped statment to LRS
  stopGalaxyXAPIStatement(
    {
      id: personDoc.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
    },
    {
      galaxy: {
        id: courseDoc.id,
        title: course.title,
      },
    },
  );

  const updatedPersonDoc = await personDoc.ref.get();

  return {
    person: {
      ...updatedPersonDoc.data(),
      id: updatedPersonDoc.id,
    },
  };
}

/**
 * Save AI-generated galaxy map to database
 */
export const saveGalaxyMapHttpsEndpoint = runWith({
  timeoutSeconds: 540, // 9 minutes timeout
  memory: "1GB",
}).https.onCall(async (data, context) => {
  console.log("🚀 saveGalaxyMapHttpsEndpoint called with data:", data);
  console.log("👤 Context auth:", context.auth);

  requireAuthenticated(context);
  console.log("✅ Authentication check passed");

  const { galaxyMap, mapLayout } = data;
  if (!galaxyMap) {
    console.error("❌ Missing required field: galaxyMap");
    throw new HttpsError("invalid-argument", "Missing required field: galaxyMap");
  }
  console.log("✅ Galaxy map data validated");

  const personId = context.auth.uid;
  console.log("👤 Person ID from context:", personId);

  console.log("🔄 Calling saveGalaxyMap function...");
  const result = await saveGalaxyMap(galaxyMap, mapLayout, personId);
  console.log("✅ saveGalaxyMap function completed, returning result:", result);

  return result;
});

/**
 * Save AI-generated galaxy map to database
 */
async function saveGalaxyMap(
  galaxyMap: Record<string, unknown>,
  mapLayout: string = "zigzag",
  personId: string,
) {
  try {
    console.log("🚀 Starting saveGalaxyMap function with:", { personId, mapLayout });
    console.log("📊 Galaxy map data:", {
      title: galaxyMap.title,
      description: galaxyMap.description,
      starsCount: (galaxyMap.stars as Array<unknown>)?.length,
    });

    // Load person from ID
    console.log("👤 Loading person data for ID:", personId);
    const personDoc = await db.collection("people").doc(personId).get();
    const person = personDoc.data();

    if (person == null) {
      console.error("❌ Person not found:", personId);
      throw new HttpsError("not-found", `Person not found: ${personId}`);
    }
    console.log("✅ Person loaded successfully:", {
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
    });

    let previousNodeId = null;

    // Calculate total planets for progress tracking
    console.log("🔢 Calculating total planets...");
    let totalPlanets = 0;
    for (const star of galaxyMap.stars as Array<{ planets: Array<unknown> }>) {
      totalPlanets += star.planets.length;
    }
    console.log("📈 Total planets calculated:", totalPlanets);

    const courseData = {
      title: galaxyMap.title as string,
      description: galaxyMap.description as string,
      stars: galaxyMap.stars as Array<Record<string, unknown>>,
    };
    console.log("📋 Course data prepared:", {
      title: courseData.title,
      description: courseData.description,
      starsCount: courseData.stars.length,
    });

    // Create or update the course document
    const imageData = galaxyMap.image as { url: string; name: string } | undefined;
    console.log("🖼️ Using image data for course:", imageData);

    const stars = courseData.stars;
    console.log("⭐ Stars to process:", stars.length);

    // If an idInDatabase exists, update that course; otherwise create a new one
    const existingCourseId = (galaxyMap as { idInDatabase?: string }).idInDatabase;
    let courseDocRef: FirebaseFirestore.DocumentReference;

    if (existingCourseId) {
      console.log("✏️ Updating existing course:", existingCourseId);
      courseDocRef = db.collection("courses").doc(existingCourseId);

      // Update top-level course fields
      await courseDocRef.update({
        title: courseData.title,
        description: courseData.description,
        image: imageData || null,
        galaxyMapAsObject: { ...galaxyMap, idInDatabase: existingCourseId },
        topicTotal: stars.length,
        taskTotal: totalPlanets,
      });

      // Delete and recreate subcollections: map-edges, map-nodes, topics (and tasks)
      console.log("🧹 Clearing existing subcollections before re-creating");
      // Delete edges
      const edgesSnap = await courseDocRef.collection("map-edges").get();
      for (const doc of edgesSnap.docs) {
        await doc.ref.delete();
      }
      // Delete map-nodes
      const nodesSnap = await courseDocRef.collection("map-nodes").get();
      for (const doc of nodesSnap.docs) {
        await doc.ref.delete();
      }
      // Delete topics and their tasks
      const topicsSnap = await courseDocRef.collection("topics").get();
      for (const topicDoc of topicsSnap.docs) {
        const tasksSnap = await topicDoc.ref.collection("tasks").get();
        for (const taskDoc of tasksSnap.docs) {
          await taskDoc.ref.delete();
        }
        await topicDoc.ref.delete();
      }
    } else {
      console.log("🏗️ Preparing formatted course data for creation...");
      const formattedCourse = {
        title: courseData.title,
        description: courseData.description,
        image: imageData || null, // Use AI-generated image if available, or null if undefined
        mappedBy: {
          name: person.firstName + " " + person.lastName,
          personId: person.id,
        },
        contentBy: {
          name: person.firstName + " " + person.lastName,
          personId: person.id,
        },
        status: "drafting",
        owner: db.collection("people").doc(personId),
        galaxyMapAsObject: galaxyMap,
      };
      console.log("📝 Formatted course data:", formattedCourse);

      console.log("💾 Creating course document in database...");
      try {
        courseDocRef = await db.collection("courses").add(formattedCourse);
        console.log("✅ Course document created with ID:", courseDocRef.id);

        console.log("🔄 Updating course document with ID and topic total...");
        await courseDocRef.update({
          id: courseDocRef.id,
          topicTotal: stars.length,
          taskTotal: totalPlanets,
          galaxyMapAsObject: { ...galaxyMap, idInDatabase: courseDocRef.id },
        });
        console.log("✅ Course document updated successfully");
      } catch (courseError: unknown) {
        console.error("❌ Error creating course document:", courseError);
        throw new HttpsError("internal", "Failed to create course document");
      }
      console.log("🎯 Course saved: " + courseData.title + " to db with id: " + courseDocRef.id);
    }

    // Create stars/topics and planets/tasks
    console.log("🌟 Starting to process stars and planets...");
    /* =============================
          Looping Stars
    ============================= */
    for (let i = 0; i < stars.length; i++) {
      console.log(`⭐ Processing star ${i + 1}/${stars.length}...`);
      const star = stars[i] as {
        title: string;
        description: string;
        planets: Array<Record<string, unknown>>;
      };
      console.log("📝 Star data:", {
        title: star.title,
        planetsCount: star.planets.length,
      });

      console.log("📍 Calculating position for star...");
      const { x, y } = mapLayout === "zigzag" ? getZigzag(i) : getSpiral(i);
      console.log("📍 Star position calculated:", { x, y, layout: mapLayout });

      // create star/topic node
      console.log("🏗️ Creating node data for star...");
      const nodeData: Record<string, unknown> = {
        label: star.title,
        description: star.description || null, // Convert undefined to null
        topicCreatedTimestamp: new Date(),
        x,
        y,
        taskTotal: star.planets.length,
        prerequisites: previousNodeId ? [previousNodeId] : [],
      };

      if (i === 0) {
        nodeData.group = "introduction";
        console.log("🎯 First star marked as introduction");
      }

      let mapNodeDocRef;
      try {
        console.log("💾 Creating map node in database...");
        // create map node
        mapNodeDocRef = await db
          .collection("courses")
          .doc(courseDocRef.id)
          .collection("map-nodes")
          .add(nodeData);
        console.log("✅ Map node created with ID:", mapNodeDocRef.id);

        console.log("🔄 Updating map node with ID...");
        await mapNodeDocRef.update({ id: mapNodeDocRef.id });
        console.log("✅ Map node updated successfully");

        console.log("💾 Creating topic in database...");
        // create star
        await db
          .collection("courses")
          .doc(courseDocRef.id)
          .collection("topics")
          .doc(mapNodeDocRef.id)
          .set({ ...nodeData, id: mapNodeDocRef.id });
        console.log("✅ Topic created successfully");
      } catch (nodeError: unknown) {
        console.error("❌ Error creating map node:", nodeError);
        if ((nodeError as { code?: string }).code === "already-exists") {
          console.log("⚠️ Map node already exists, continuing...");
          // Try to get the existing node reference
          const existingNodes = await db
            .collection("courses")
            .doc(courseDocRef.id)
            .collection("map-nodes")
            .where("label", "==", star.title)
            .limit(1)
            .get();

          if (!existingNodes.empty) {
            mapNodeDocRef = existingNodes.docs[0].ref;
            console.log("✅ Found existing map node:", mapNodeDocRef.id);
          } else {
            console.error("❌ Could not find existing map node, throwing error");
            throw nodeError;
          }
        } else {
          console.error("❌ Non-already-exists error, throwing:", nodeError);
          throw nodeError;
        }
      }

      // create planets
      console.log(`🪐 Creating ${star.planets.length} planets for star: ${star.title}`);
      /* =============================
            Looping Planets
      ============================= */
      for (let j = 0; j < star.planets.length; j++) {
        console.log(`🪐 Processing planet ${j + 1}/${star.planets.length}...`);
        const planet = star.planets[j] as {
          title: string;
          description?: string;
          instructions?: unknown;
          missionInstructions?: unknown;
          missionInstructionsHtmlString?: string;
          missionInstructionsObject?: unknown;
          missionRenderMode?: string;
        };

        // Prefer explicit fields sent by the client, but maintain legacy fallbacks.
        let missionInstructionsHtmlString: string | null = null;
        if (typeof planet.missionInstructionsHtmlString === "string") {
          missionInstructionsHtmlString = planet.missionInstructionsHtmlString;
        } else if (typeof planet.missionInstructions === "string") {
          missionInstructionsHtmlString = planet.missionInstructions;
        } else if (typeof planet.instructions === "string") {
          missionInstructionsHtmlString = planet.instructions as string;
        }

        let missionInstructionsObject: unknown = null;
        if (
          planet.missionInstructionsObject &&
          typeof planet.missionInstructionsObject === "object"
        ) {
          missionInstructionsObject = planet.missionInstructionsObject;
        } else if (planet.missionInstructions && typeof planet.missionInstructions === "object") {
          missionInstructionsObject = planet.missionInstructions;
        } else if (typeof planet.missionInstructions === "string") {
          try {
            missionInstructionsObject = JSON.parse(planet.missionInstructions);
          } catch (error) {
            console.warn("Failed to parse missionInstructions string on backend", error);
          }
        } else if (planet.instructions && typeof planet.instructions === "object") {
          missionInstructionsObject = planet.instructions;
        }

        if (!missionInstructionsHtmlString && missionInstructionsObject) {
          try {
            missionInstructionsHtmlString = JSON.stringify(missionInstructionsObject);
          } catch (error) {
            console.warn("Failed to stringify mission instructions object", error);
          }
        }

        console.log("📝 Planet data:", {
          title: planet.title,
          hasMissionInstructions: typeof planet.missionInstructions !== "undefined",
          hasMissionInstructionsHtmlString:
            typeof planet.missionInstructionsHtmlString === "string",
          hasLegacyInstructions: typeof planet.instructions !== "undefined",
          htmlLength: missionInstructionsHtmlString ? missionInstructionsHtmlString.length : 0,
          hasMissionInstructionsObject: Boolean(missionInstructionsObject),
        });

        console.log("🏗️ Preparing planet data...");
        const planetDescription =
          typeof planet.description === "string" && planet.description.trim().length > 0
            ? planet.description
            : null;

        const planetData = {
          title: planet.title,
          description: planetDescription, // keep legacy field as high-level description only
          missionInstructionsHtmlString: missionInstructionsHtmlString ?? null,
          missionInstructionsObject: missionInstructionsObject ?? null,
          // Whitelisted render directive: "iframe" marks a complete standalone
          // HTML artifact that the app must render in a sandboxed iframe.
          missionRenderMode: planet.missionRenderMode === "iframe" ? "iframe" : null,
          submissionRequired: false,
          submissionInstructions: "",
          color: "#69a1e2",
          orderIndex: j,
          taskCreatedTimestamp: new Date(),
        };
        console.log("📋 Planet data prepared:", planetData);

        try {
          console.log("💾 Saving planet to database...");
          // save step to db
          const taskDocRef = await db
            .collection("courses")
            .doc(courseDocRef.id)
            .collection("topics")
            .doc(mapNodeDocRef.id)
            .collection("tasks")
            .add(planetData);
          console.log("✅ Planet document created with ID:", taskDocRef.id);

          console.log("🔄 Updating planet document with ID...");
          // Update the document with its ID
          await taskDocRef.update({ id: taskDocRef.id });
          console.log("✅ Planet document updated successfully");

          console.log("🎯 Saved Planet: " + planet.title + " to db");
        } catch (taskError: unknown) {
          console.error("❌ Error creating task:", taskError);
          // If the task already exists, we can continue
          if ((taskError as { code?: string }).code === "already-exists") {
            console.log("⚠️ Task already exists, continuing...");
          } else {
            console.error("❌ Non-already-exists task error, throwing:", taskError);
            throw taskError;
          }
        }
      }

      if (previousNodeId) {
        console.log("🔗 Creating edge from previous node to current node...");
        try {
          console.log("💾 Creating edge in database...");
          const edgeDocRef = await db
            .collection("courses")
            .doc(courseDocRef.id)
            .collection("map-edges")
            .add({ from: previousNodeId, to: mapNodeDocRef.id, dashes: false, color: "#69a1e2" });
          console.log("✅ Edge document created with ID:", edgeDocRef.id);

          console.log("🔄 Updating edge document with ID...");
          await edgeDocRef.update({ id: edgeDocRef.id });
          console.log("✅ Edge document updated successfully");
        } catch (edgeError: unknown) {
          console.error("❌ Error creating edge:", edgeError);
          if ((edgeError as { code?: string }).code === "already-exists") {
            console.log("⚠️ Edge already exists, continuing...");
          } else {
            console.error("❌ Non-already-exists edge error, throwing:", edgeError);
            throw edgeError;
          }
        }
      } else {
        console.log("🔗 No previous node, skipping edge creation");
      }

      previousNodeId = mapNodeDocRef.id;
      console.log("🔄 Updated previousNodeId to:", previousNodeId);

      console.log("🎯 Saved Star: " + star.title + " to db");
    }

    console.log("🌟 All stars and planets processed successfully!");

    // Send course created email
    console.log("📧 Sending course created email...");
    try {
      await sendCourseCreatedEmail(
        person.email as string,
        person.firstName + " " + person.lastName,
        courseData.title,
        courseDocRef.id,
      );
      console.log("✅ Course created email sent successfully");
    } catch (emailError: unknown) {
      console.error("❌ Error sending course created email:", emailError);
      // Don't fail the entire operation if email fails
      console.log("⚠️ Continuing despite email error...");
    }

    console.log("🎉 saveGalaxyMap function completed successfully!");
    console.log("📊 Final result:", { courseId: courseDocRef.id, totalPlanets });

    return {
      courseId: courseDocRef.id,
      totalPlanets,
    };
  } catch (error: unknown) {
    console.error("❌ Unhandled error in saveGalaxyMap function:", error);
    throw error;
  }
}

/**
 * Get zigzag position for map layout
 */
function getZigzag(
  index: number,
  startX: number = 0,
  startY: number = 0,
  spacing: number = 200,
  amplitude: number = 100,
) {
  // Calculate horizontal position (moving right)
  const x = startX + index * spacing;

  // Calculate vertical position (zigzag pattern)
  // Even indices go up, odd indices go down
  const y = startY + (index % 2 === 0 ? amplitude : -amplitude);

  return { x, y };
}

/**
 * Get spiral position for map layout
 */
function getSpiral(index: number, centerX: number = 0, centerY: number = 0, radius: number = 200) {
  const angle = index * 0.8;
  const spiralGrowth = 80;
  const currentRadius = radius + index * spiralGrowth;
  const x = centerX + currentRadius * Math.cos(angle);
  const y = centerY + currentRadius * Math.sin(angle);
  return { x, y };
}

// Get galaxy map object from course
export const getGalaxyMapObjectFromCourseHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    requireAuthenticated(context);

    const courseId = data.courseId as string | null;
    if (courseId == null) {
      throw new HttpsError("invalid-argument", "missing courseId");
    }

    // TODO: Add permissions checks to ensure the user has access to this course

    const result = await convertCourseToGalaxyMapObject(courseId);
    return result;
  },
);

/**
 * Convert a course's topics and tasks into a galaxy map object
 * that matches the CourseToGalaxyMapSchema (without status/questions)
 */
export async function convertCourseToGalaxyMapObject(courseId: string): Promise<CourseToGalaxyMap> {
  try {
    console.log("🔄 Converting course to galaxy map for courseId:", courseId);

    // Get the course document
    const courseDoc = await db.collection("courses").doc(courseId).get();
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new HttpsError("not-found", `Course not found: ${courseId}`);
    }

    console.log("📋 Course data loaded:", {
      title: courseData.title,
      description: courseData.description,
    });

    // Get all topics (stars) for the course, ordered by creation timestamp
    const topicsCollection = await db
      .collection("courses")
      .doc(courseId)
      .collection("topics")
      .orderBy("topicCreatedTimestamp")
      .get();

    console.log("⭐ Found topics:", topicsCollection.docs.length);

    const stars = [];

    // Process each topic (star)
    for (const topicDoc of topicsCollection.docs) {
      const topicData = topicDoc.data();
      console.log("⭐ Processing topic:", topicData.label || topicData.title);

      // Get all tasks (planets) for this topic, ordered by orderIndex
      const tasksCollection = await db
        .collection("courses")
        .doc(courseId)
        .collection("topics")
        .doc(topicDoc.id)
        .collection("tasks")
        .orderBy("orderIndex")
        .get();

      console.log("🪐 Found tasks for topic:", tasksCollection.docs.length);

      const planets = [];

      // Process each task (planet)
      for (const taskDoc of tasksCollection.docs) {
        const taskData = taskDoc.data();
        console.log("🪐 Processing task:", taskData.title);

        const planet = {
          title: taskData.title,
          description: taskData.description || taskData.submissionInstructions || "",
        };

        planets.push(planet);
      }

      // Create star object
      const star = {
        title: topicData.label || topicData.title,
        description: topicData.description || "",
        planets: planets,
      };

      stars.push(star);
    }

    // Create the galaxy map object
    const galaxyMap: CourseToGalaxyMap = {
      title: courseData.title,
      description: courseData.description,
      stars: stars,
      image: courseData.image || null,
    };

    // save the galaxy map object to the course
    await courseDoc.ref.update({
      galaxyMapAsObject: galaxyMap,
    });

    console.log("✅ Galaxy map conversion completed:", {
      title: galaxyMap.title,
      starsCount: galaxyMap.stars?.length,
      totalPlanets: galaxyMap.stars?.reduce((sum, star) => sum + star.planets.length, 0),
    });

    // Validate the result against the schema
    // const validatedGalaxyMap = CourseToGalaxyMapSchema.parse(galaxyMap);
    // console.log("✅ Galaxy map validation passed");
    // return validatedGalaxyMap;

    return galaxyMap;
  } catch (error) {
    console.error("❌ Error converting course to galaxy map:", error);
    throw error;
  }
}

/**
 * Send course created email
 */
async function sendCourseCreatedEmail(
  email: string,
  name: string,
  courseTitle: string,
  courseId: string,
) {
  // For now, just log the email details
  // TODO: Implement proper email sending
  console.log("Course created email would be sent to:", {
    email,
    name,
    course: courseTitle,
    courseId,
  });
}

/**
 * Remove prerequisites from topics collection and return list of affected topics
 * This function handles the cleanup when a node is deleted from a course
 */
export const removePrerequisitesFromTopicsHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    try {
      // Require authentication
      requireAuthenticated(context);
      const { uid } = context.auth;
      console.log("🔐 User authenticated:", uid);

      const { courseId, nodeId } = data;

      // Validate required parameters
      if (!courseId || !nodeId) {
        throw new HttpsError(
          "invalid-argument",
          "Missing required parameters: courseId and nodeId",
        );
      }

      console.log("🗑️ Removing prerequisites for node:", { courseId, nodeId });

      // Get all topics in the course
      const topicsSnapshot = await db
        .collection("courses")
        .doc(courseId)
        .collection("topics")
        .get();

      const batch = db.batch();
      const affectedTopics: Array<{
        topicId: string;
        oldPrerequisites: string[];
        newPrerequisites: string[];
      }> = [];

      // Check each topic for prerequisites that reference the deleted node
      topicsSnapshot.forEach((doc) => {
        const topicData = doc.data();
        if (topicData.prerequisites && Array.isArray(topicData.prerequisites)) {
          const nodeIdIndex = topicData.prerequisites.indexOf(nodeId);
          if (nodeIdIndex !== -1) {
            // Remove the deleted node ID from the prerequisites array
            const updatedPrerequisites = topicData.prerequisites.filter(
              (prereqId: string) => prereqId !== nodeId,
            );

            // Update the topic document with the new prerequisites array
            const topicRef = db
              .collection("courses")
              .doc(courseId)
              .collection("topics")
              .doc(doc.id);

            batch.update(topicRef, { prerequisites: updatedPrerequisites });

            affectedTopics.push({
              topicId: doc.id,
              oldPrerequisites: topicData.prerequisites,
              newPrerequisites: updatedPrerequisites,
            });

            console.log("📝 Updated prerequisites for topic:", doc.id, {
              old: topicData.prerequisites,
              new: updatedPrerequisites,
            });
          }
        }
      });

      // Execute all updates in a single batch
      if (affectedTopics.length > 0) {
        await batch.commit();
        console.log("✅ Successfully removed prerequisites from", affectedTopics.length, "topics");
      } else {
        console.log("ℹ️ No prerequisites found to remove");
      }

      return {
        success: true,
        affectedTopicsCount: affectedTopics.length,
        affectedTopics,
      };
    } catch (error) {
      console.error("❌ Error removing prerequisites:", error);
      throw new HttpsError("internal", "Failed to remove prerequisites");
    }
  },
);

/**
 * Update prerequisites for a specific student's topics
 * This function syncs prerequisite changes from the main course to individual student collections
 */
export const updateStudentTopicPrerequisitesHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    try {
      // Require authentication
      requireAuthenticated(context);
      const { uid } = context.auth;
      console.log("🔐 User authenticated:", uid);

      const { courseId, personId, affectedTopics } = data;

      // Validate required parameters
      if (!courseId || !personId || !affectedTopics || !Array.isArray(affectedTopics)) {
        throw new HttpsError(
          "invalid-argument",
          "Missing required parameters: courseId, personId, and affectedTopics array",
        );
      }

      console.log("👤 Updating prerequisites for student:", {
        courseId,
        personId,
        affectedTopicsCount: affectedTopics.length,
      });

      const batch = db.batch();
      let updatedCount = 0;

      // Process each affected topic for the student
      for (const affectedTopic of affectedTopics) {
        if (!affectedTopic.topicId || !affectedTopic.newPrerequisites) {
          console.warn("⚠️ Skipping invalid affected topic:", affectedTopic);
          continue;
        }

        const studentTopicRef = db
          .collection("people")
          .doc(personId)
          .collection(courseId)
          .doc(affectedTopic.topicId);

        // Check if the student has this topic
        const studentTopicDoc = await studentTopicRef.get();
        if (studentTopicDoc.exists) {
          batch.update(studentTopicRef, {
            prerequisites: affectedTopic.newPrerequisites,
          });
          updatedCount++;

          console.log("📝 Updated prerequisites for student topic:", {
            topicId: affectedTopic.topicId,
            newPrerequisites: affectedTopic.newPrerequisites,
          });
        } else {
          console.log("ℹ️ Student doesn't have topic:", affectedTopic.topicId);
        }
      }

      // Execute all updates in a single batch
      if (updatedCount > 0) {
        await batch.commit();
        console.log(
          "✅ Successfully updated prerequisites for",
          updatedCount,
          "topics for student",
          personId,
        );
      } else {
        console.log("ℹ️ No student topics were updated");
      }

      return {
        success: true,
        updatedTopicsCount: updatedCount,
        personId,
      };
    } catch (error) {
      console.error("❌ Error updating student topic prerequisites:", error);
      throw new HttpsError("internal", "Failed to update student topic prerequisites");
    }
  },
);

/**
 * Save a topic to all students in a course
 * This function handles creating/updating topic documents for each student
 * and sets appropriate topic status based on prerequisites
 */
export const saveTopicToStudentsHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  try {
    // Require authentication
    requireAuthenticated(context);
    const { uid } = context.auth;
    console.log("🔐 User authenticated:", uid);

    const { courseId, node, students } = data;

    // Validate required parameters
    if (!courseId || !node || !students || !Array.isArray(students)) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required parameters: courseId, node, and students array",
      );
    }

    console.log("👥 Saving topic to students:", {
      courseId,
      nodeId: node.id,
      studentsCount: students.length,
    });

    // if no students, return early
    if (students.length === 0) {
      console.log("ℹ️ No students in this course");
      return {
        success: true,
        studentsProcessed: 0,
        topicsCreated: 0,
        message: "No students to process",
      };
    }

    const batch = db.batch();
    let studentsProcessed = 0;
    let topicsCreated = 0;

    // Process each student
    for (const student of students) {
      const personId = student.id;

      // Validate required fields before proceeding
      if (!personId) {
        console.warn("⚠️ Skipping student with missing personId:", student);
        continue;
      }

      // Set reference to this course for the student
      const courseRef = db.collection("people").doc(personId).collection(courseId);

      // Check if the student has already started the course
      const studentHasStartedCourse = await courseRef
        .get()
        .then((subQuery) => subQuery.docs.length > 0);

      if (studentHasStartedCourse) {
        // Determine topic status based on prerequisites
        let topicStatus = "unlocked"; // default

        if (node.prerequisites && node.prerequisites.length > 0) {
          try {
            // Get the prerequisite topic for this student
            const prerequisiteTopicRef = courseRef.doc(node.prerequisites[0]);
            const prerequisiteTopicDoc = await prerequisiteTopicRef.get();

            if (prerequisiteTopicDoc.exists) {
              const prerequisiteTopic = prerequisiteTopicDoc.data();
              if (prerequisiteTopic?.topicStatus) {
                // If prerequisite is completed, set topic as unlocked, else locked
                topicStatus = prerequisiteTopic.topicStatus === "completed" ? "unlocked" : "locked";
              }
            }
          } catch (error) {
            console.warn("⚠️ Error checking prerequisite for student:", personId, error);
            // Default to locked if we can't determine prerequisite status
            topicStatus = "locked";
          }
        }

        console.log(
          `📝 Student ${personId} has started course. Setting new topic as ${topicStatus}`,
        );

        // Create the topic document for the student
        const studentTopicRef = courseRef.doc(node.id);
        batch.set(studentTopicRef, {
          ...node,
          topicStatus,
        });

        topicsCreated++;
      } else {
        console.log(
          `ℹ️ Student ${personId} hasn't started the course yet - topic will be assigned when they start`,
        );
      }

      studentsProcessed++;
    }

    // Execute all updates in a single batch
    if (topicsCreated > 0) {
      await batch.commit();
      console.log(`✅ Successfully created ${topicsCreated} topics for students`);
    }

    return {
      success: true,
      studentsProcessed,
      topicsCreated,
      message: `Processed ${studentsProcessed} students, created ${topicsCreated} topics`,
    };
  } catch (error) {
    console.error("❌ Error saving topic to students:", error);
    throw new HttpsError("internal", "Failed to save topic to students");
  }
});

/**
 * Delete a topic from all students in a course
 * This function handles removing topic documents for each student
 * and updates prerequisites for affected topics
 */
export const deleteTopicForStudentsHttpsEndpoint = runWith({}).https.onCall(
  async (data, context) => {
    try {
      // Require authentication
      requireAuthenticated(context);
      const { uid } = context.auth;
      console.log("🔐 User authenticated:", uid);

      const { courseId, node, students, affectedTopics = [] } = data;

      // Validate required parameters
      if (!courseId || !node || !students || !Array.isArray(students)) {
        throw new HttpsError(
          "invalid-argument",
          "Missing required parameters: courseId, node, and students array",
        );
      }

      console.log("🗑️ Deleting topic from students:", {
        courseId,
        nodeId: node.id,
        nodeLabel: node.label,
        studentsCount: students.length,
        affectedTopicsCount: affectedTopics.length,
      });

      // if no students, return early
      if (students.length === 0) {
        console.log("ℹ️ No students in this course");
        return {
          success: true,
          studentsProcessed: 0,
          topicsDeleted: 0,
          message: "No students to process",
        };
      }

      const batch = db.batch();
      let studentsProcessed = 0;
      let topicsDeleted = 0;

      // Process each student
      for (const student of students) {
        const personId = student.id;

        // Validate required fields before proceeding
        if (!personId || !node?.id) {
          console.warn("⚠️ Skipping student with missing fields:", {
            personId,
            nodeId: node?.id,
          });
          continue;
        }

        console.log(`🗑️ Deleting ${node.label} for student: ${personId}`);

        // Delete the main topic document for the student
        const studentTopicRef = db
          .collection("people")
          .doc(personId)
          .collection(courseId)
          .doc(node.id);

        batch.delete(studentTopicRef);
        topicsDeleted++;
        studentsProcessed++;
      }

      // Execute all deletions in a single batch
      if (topicsDeleted > 0) {
        await batch.commit();
        console.log(`✅ Successfully deleted ${topicsDeleted} topics from students`);
      }

      // Update prerequisites for affected topics in student collections
      if (affectedTopics.length > 0) {
        console.log(
          `🔄 Updating prerequisites for ${affectedTopics.length} affected topics across all students`,
        );

        // Process each student for prerequisite updates
        for (const student of students) {
          const personId = student.id;
          if (personId) {
            try {
              // Update prerequisites for this student's affected topics
              const studentCourseRef = db.collection("people").doc(personId).collection(courseId);

              for (const affectedTopic of affectedTopics) {
                if (affectedTopic.topicId && affectedTopic.newPrerequisites) {
                  const studentTopicRef = studentCourseRef.doc(affectedTopic.topicId);

                  // Check if the student has this topic
                  const studentTopicDoc = await studentTopicRef.get();
                  if (studentTopicDoc.exists) {
                    batch.update(studentTopicRef, {
                      prerequisites: affectedTopic.newPrerequisites,
                    });
                    console.log(
                      `📝 Updated prerequisites for student topic: ${affectedTopic.topicId}`,
                    );
                  }
                }
              }
            } catch (error) {
              console.warn(`⚠️ Failed to update prerequisites for student ${personId}:`, error);
              // Continue with other students even if one fails
            }
          }
        }

        // Commit prerequisite updates along with deletions
        if (topicsDeleted > 0 || affectedTopics.length > 0) {
          await batch.commit();
          console.log("✅ Successfully processed all operations in batch");
        }
      } else if (topicsDeleted > 0) {
        // Only commit if we have deletions but no prerequisite updates
        await batch.commit();
        console.log(`✅ Successfully deleted ${topicsDeleted} topics from students`);
      }

      return {
        success: true,
        studentsProcessed,
        topicsDeleted,
        affectedTopicsUpdated: affectedTopics.length > 0,
        message: `Processed ${studentsProcessed} students, deleted ${topicsDeleted} topics, updated ${affectedTopics.length} affected topics`,
      };
    } catch (error) {
      console.error("❌ Error deleting topic from students:", error);
      throw new HttpsError("internal", "Failed to delete topic from students");
    }
  },
);

/**
 * Save a node to the course map
 * This function handles saving nodes to map-nodes, creating edges, saving topics,
 * and updating course totals
 */
export const saveNodeHttpsEndpoint = runWith({}).https.onCall(async (data, context) => {
  try {
    // Require authentication
    requireAuthenticated(context);
    const { uid } = context.auth;
    console.log("🔐 User authenticated:", uid);

    const { courseId, node, isUpdate = false } = data;

    // Validate required parameters
    if (!courseId || !node) {
      throw new HttpsError("invalid-argument", "Missing required parameters: courseId and node");
    }

    console.log("💾 Saving node:", {
      courseId,
      nodeId: node.id,
      nodeLabel: node.label,
      isUpdate,
    });

    // Prepare node data
    const nodeData = {
      ...node,
      connectedEdge: node.connectedEdge || "",
      color: node.color?.hex || node.color,
      nodeCreatedTimestamp: new Date(),
    };

    // Save topic node info to map-nodes
    await db.collection("courses").doc(courseId).collection("map-nodes").doc(node.id).set(nodeData);
    console.log("✅ Node successfully written to map-nodes!");

    // Create edges for prerequisites
    if (node.prerequisites && node.prerequisites.length > 0) {
      console.log(`🔗 Creating ${node.prerequisites.length} prerequisite edges`);

      for (const prereq of node.prerequisites) {
        const from = prereq;
        const to = node.id;

        const edgeDocRef = await db
          .collection("courses")
          .doc(courseId)
          .collection("map-edges")
          .add({
            from: from,
            to: to,
            dashes: false,
          });

        await edgeDocRef.update({ id: edgeDocRef.id });
        console.log(`✅ Created edge from ${from} to ${to}`);
      }
    }

    // Save topic info to topics collection
    const topicData = {
      ...node,
      topicCreatedTimestamp: new Date(),
    };

    await db.collection("courses").doc(courseId).collection("topics").doc(node.id).set(topicData);
    console.log("✅ Topic successfully written to topics!");

    // Update course topic totals if this is a new node
    if (!isUpdate) {
      await db.collection("courses").doc(courseId).update("topicTotal", FieldValue.increment(1));
      console.log("✅ Course topic total increased by 1");
    }

    return {
      success: true,
      nodeId: node.id,
      edgesCreated: node.prerequisites?.length || 0,
      topicTotalUpdated: !isUpdate,
      message: `Node ${node.label} saved successfully`,
    };
  } catch (error) {
    console.error("❌ Error saving node:", error);
    throw new HttpsError("internal", "Failed to save node");
  }
});

/**
 * Start Mission - Sets task and topic as active and sends XAPI statements
 */
export const startMissionHttpsEndpoint = runWith({ secrets: [VERACITY_LRS_SECRET] }).https.onCall(
  async (
    data: {
      courseId: string;
      topicId: string;
      taskId: string;
      topicActive: boolean;
    },
    context: CallableContext,
  ) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { courseId, topicId, taskId, topicActive } = data;
    const personId = context.auth.uid;

    try {
      console.log("🚀 Starting mission:", { courseId, topicId, taskId, personId, topicActive });

      // Get person data
      const personDoc = await db.collection("people").doc(personId).get();
      if (!personDoc.exists) {
        throw new HttpsError("not-found", "Person not found");
      }
      const person = { ...personDoc.data(), id: personDoc.id } as {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      } & Record<string, unknown>;

      // Get course data
      const courseDoc = await db.collection("courses").doc(courseId).get();
      if (!courseDoc.exists) {
        throw new HttpsError("not-found", "Course not found");
      }
      const course = { ...courseDoc.data(), id: courseDoc.id };

      // Get topic data
      const topicDoc = await db
        .collection("courses")
        .doc(courseId)
        .collection("topics")
        .doc(topicId)
        .get();
      if (!topicDoc.exists) {
        throw new HttpsError("not-found", "Topic not found");
      }
      const topic = { ...topicDoc.data(), id: topicDoc.id };

      // Get task data
      const taskDoc = await db
        .collection("courses")
        .doc(courseId)
        .collection("topics")
        .doc(topicId)
        .collection("tasks")
        .doc(taskId)
        .get();
      if (!taskDoc.exists) {
        throw new HttpsError("not-found", "Task not found");
      }
      const task = { ...taskDoc.data(), id: taskDoc.id };

      // Reference to person's topic document
      const personTopicRef = db
        .collection("people")
        .doc(personId)
        .collection(courseId)
        .doc(topicId);

      // Update task status to active
      await personTopicRef.collection("tasks").doc(taskId).update({
        taskStatus: "active",
        taskStartedTimestamp: new Date(),
      });
      console.log("✅ Task status updated to active");

      // Update topic status to active if not already active
      if (!topicActive) {
        await personTopicRef.update({
          topicStatus: "active",
          topicStartedTimeStamp: new Date(),
        });
        console.log("✅ Topic status updated to active");

        // Send topic started XAPI statement
        await startTopicXAPIStatement(person, {
          galaxy: { id: course.id, title: (course as any).title || "Unknown Course" },
          system: { id: topic.id, label: (topic as any).label || "Unknown Topic" },
        });
        console.log("✅ Topic started XAPI statement sent");
      }

      // Send task started XAPI statement
      await startTaskXAPIStatement(person, taskId, {
        galaxy: { id: course.id, title: (course as any).title || "Unknown Course" },
        system: { id: topic.id, label: (topic as any).label || "Unknown Topic" },
        mission: { id: task.id, title: (task as any).title || "Unknown Task" },
      });
      console.log("✅ Task started XAPI statement sent");

      return {
        success: true,
        message: "Mission started successfully",
        taskId,
        topicId,
        courseId,
      };
    } catch (error) {
      console.error("❌ Error starting mission:", error);
      throw new HttpsError("internal", "Failed to start mission");
    }
  },
);
