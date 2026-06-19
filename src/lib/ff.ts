// Use this script for any firebase functions (ff) that are completely independant of components
import type {
  ICohort,
  ICourse,
  IPerson,
  IOrganisation,
  ITopic,
  ITask,
  IPersonTask,
  IPersonTopic,
  IMapNode,
  IMapEdge,
} from "@/store/_types";
import { functions } from "@/store/firestoreConfig";
import { FirebaseError } from "firebase/app";
import {
  StructureRefineResponseSchema,
  type StructureCandidates,
  type StructureRefineResponse,
  type StructureTargets,
} from "@/refiners/structure-refine-schemas";
import {
  personFetchThrottle,
  studentActivityThrottle,
  courseFetchThrottle,
} from "@/lib/requestThrottle";

export const fetchCohorts = async (): Promise<ICohort[]> => {
  const data = {};
  const getCohorts = functions.httpsCallable("getCohorts");
  const result = await getCohorts(data);
  return result.data.cohorts;
};

// Resend an email-verification link to an unverified account. Public/unauthenticated:
// works without the user's password, so it can be called from the register/login
// error states. Returns "alreadyVerified" if the account is already verified.
export const resendVerificationEmail = async (
  email: string,
): Promise<{ success: boolean; status: "sent" | "alreadyVerified" }> => {
  const resend = functions.httpsCallable("resendVerificationEmail");
  const result = await resend({ email });
  return result.data;
};

export const fetchCohortByCohortId = async (cohortId: string): Promise<ICohort> => {
  const data = {
    cohortId,
  };
  const getCohortByCohortId = functions.httpsCallable("getCohortByCohortId");
  const result = await getCohortByCohortId(data);
  return result.data.cohort;
};

export const fetchStudentCohortsByPersonId = async (personId: string): Promise<IPerson[]> => {
  const data = {
    personId,
  };
  const getStudentCohortsByPersonId = functions.httpsCallable("getStudentCohortsByPersonId");
  const result = await getStudentCohortsByPersonId(data);
  return result.data.cohorts;
};

export const fetchTeachersCohortsByPersonId = async (personId: string): Promise<ICohort[]> => {
  const data = {
    personId,
  };
  const getTeachersCohortsByPersonId = functions.httpsCallable("getTeachersCohortsByPersonId");
  const result = await getTeachersCohortsByPersonId(data);
  return result.data.cohorts;
};

export const fetchStudentSubmissionsByPersonId = async (
  personId: string,
): Promise<Array<{ id: string } & Record<string, any>>> => {
  const data = {
    personId,
  };
  const getStudentSubmissionsByPersonId = functions.httpsCallable(
    "getStudentSubmissionsByPersonId",
  );
  const result = await getStudentSubmissionsByPersonId(data);
  return result.data.submissions;
};

export const fetchStudentRequestsByPersonId = async (
  personId: string,
): Promise<Array<{ id: string } & Record<string, any>>> => {
  const data = {
    personId,
  };
  const getStudentRequestsByPersonId = functions.httpsCallable("getStudentRequestsByPersonId");
  const result = await getStudentRequestsByPersonId(data);
  return result.data.requests;
};

export const fetchAllCohortsInCourseByCourseId = async (courseId: string): Promise<ICohort[]> => {
  const data = {
    courseId,
  };
  const getCohortsByCourseId = functions.httpsCallable("getCohortsByCourseId");
  const result = await getCohortsByCourseId(data);
  return result.data.cohorts;
};

export const fetchCohortCoursesActivityByCohortId = async (
  cohortId: string,
): Promise<Record<string, any>[]> => {
  const data = {
    cohortId,
  };
  const getCohortCoursesActivityByCohortId = functions.httpsCallable(
    "getCohortCoursesActivityByCohortId",
  );
  const result = await getCohortCoursesActivityByCohortId(data);
  return result.data.activityData;
};

export const fetchCohortStudentsActivityTimeByCohortId = async (
  cohortId: string,
): Promise<Record<string, any>[]> => {
  const data = {
    cohortId,
  };
  const getCohortStudentsActivityTimeByCohortId = functions.httpsCallable(
    "getCohortStudentsActivityTimeByCohortId",
  );
  const result = await getCohortStudentsActivityTimeByCohortId(data);
  return result.data.activityData;
};

export const fetchCourses = async (slug?: string | null): Promise<ICourse[]> => {
  const data = {
    slug: slug ?? null,
  };
  const getCourses = functions.httpsCallable("getCourses");
  const result = await getCourses(data);
  return result.data.courses;
};

export const fetchPublicCourses = async (slug?: string | null): Promise<ICourse[]> => {
  const data = {
    slug: slug ?? null,
  };
  const getPublicCourses = functions.httpsCallable("getPublicCourses");
  const result = await getPublicCourses(data);
  return result.data.courses;
};

export const fetchMyCourses = async (slug?: string | null): Promise<ICourse[]> => {
  const data = {
    slug: slug ?? null,
  };
  const getMyCourses = functions.httpsCallable("getMyCourses");
  const result = await getMyCourses(data);
  return result.data.courses;
};

export const fetchCourseByCourseId = async (courseId: string): Promise<ICourse> => {
  const data = {
    courseId,
  };
  const getCourseByCourseId = functions.httpsCallable("getCourseByCourseId");
  const result = await getCourseByCourseId(data);
  return result.data.course;
};

export const fetchCoursesCreatedByPersonId = async (personId: string): Promise<ICourse[]> => {
  console.log(`🟢 Frontend: fetchCoursesCreatedByPersonId called for personId: ${personId}`);
  // Use courseFetchThrottle instead of studentActivityThrottle to avoid conflicts
  const result = await courseFetchThrottle.throttle(async () => {
    console.log(`🟡 Frontend: Throttle executing for personId: ${personId}`);
    const data = {
      personId,
    };
    const getCoursesCreatedByPersonId = functions.httpsCallable("getCoursesCreatedByPersonId");
    console.log(`🟠 Frontend: About to call Firebase function for personId: ${personId}`);
    try {
      const response = await getCoursesCreatedByPersonId(data);
      console.log(`✅ Frontend: Successfully received response for personId: ${personId}`, response);
      return response;
    } catch (error) {
      console.error(`❌ Frontend: Error calling function for personId: ${personId}`, error);
      throw error;
    }
  });
  console.log(`🟢 Frontend: Returning courses for personId: ${personId}`, result.data.courses);
  return result.data.courses;
};

export const fetchAllCoursesGroupedByCreator = async (): Promise<{
  [personId: string]: ICourse[];
}> => {
  console.log("🟢 Frontend: fetchAllCoursesGroupedByCreator called");
  const getAllCoursesGroupedByCreator = functions.httpsCallable("getAllCoursesGroupedByCreator");
  const result = await getAllCoursesGroupedByCreator({});
  console.log(
    `✅ Frontend: Successfully received grouped courses for ${Object.keys(result.data.coursesByCreator || {}).length} creators`,
  );
  return result.data.coursesByCreator || {};
};

export const fetchCourseMapEdgesAndNodesByCourseId = async (
  courseId: string,
): Promise<{ nodes: IMapNode[]; edges: IMapEdge[] }> => {
  const data = {
    courseId,
  };
  const getCourseMapEdgesAndNodesByCourseId = functions.httpsCallable(
    "getCourseMapEdgesAndNodesByCourseId",
  );
  const result = await getCourseMapEdgesAndNodesByCourseId(data);
  return { nodes: result.data.mapNodes, edges: result.data.mapEdges };
};

export const fetchTopicByCourseIdTopicId = async (
  courseId: string,
  topicId: string,
): Promise<ITopic> => {
  const data = {
    courseId,
    topicId,
  };
  const getTopicByCourseIdTopicId = functions.httpsCallable("getTopicByCourseIdTopicId");
  const result = await getTopicByCourseIdTopicId(data);
  return result.data.topic;
};

export const fetchTasksByCourseIdTopicId = async (
  courseId: string,
  topicId: string,
): Promise<ITask[]> => {
  const data = {
    courseId,
    topicId,
  };
  const getTasksByCourseIdTopicId = functions.httpsCallable("getTasksByCourseIdTopicId");
  const result = await getTasksByCourseIdTopicId(data);
  return result.data.tasks;
};

export const fetchTaskByCourseIdTopicIdTaskId = async (
  courseId: string,
  topicId: string,
  taskId: string,
): Promise<ITask> => {
  const data = {
    courseId,
    topicId,
    taskId,
  };
  const getTaskByCourseIdTopicIdTaskId = functions.httpsCallable("getTaskByCourseIdTopicIdTaskId");
  const result = await getTaskByCourseIdTopicIdTaskId(data);
  return result.data.task;
};

export const createTaskWithCourseIdTopicId = async (
  courseId: string,
  topicId: string,
  task: object,
): Promise<ITask> => {
  const data = {
    courseId,
    topicId,
    task,
  };
  const createTaskWithCourseIdTopicId = functions.httpsCallable("createTaskWithCourseIdTopicId");
  const result = await createTaskWithCourseIdTopicId(data);
  return result.data.task;
};

export const updateTaskByCourseIdTopicIdTaskId = async (
  courseId: string,
  topicId: string,
  taskId: string,
  task: object,
): Promise<ITask> => {
  const data = {
    courseId,
    topicId,
    taskId,
    task,
  };
  const updateTaskByCourseIdTopicIdTaskId = functions.httpsCallable(
    "updateTaskByCourseIdTopicIdTaskId",
  );
  const result = await updateTaskByCourseIdTopicIdTaskId(data);
  return result.data.task;
};

export const deleteTaskByCourseIdTopicIdTaskId = async (
  courseId: string,
  topicId: string,
  taskId: string,
): Promise<ITask> => {
  const data = {
    courseId,
    topicId,
    taskId,
  };
  const deleteTaskByCourseIdTopicIdTaskId = functions.httpsCallable(
    "deleteTaskByCourseIdTopicIdTaskId",
  );
  const result = await deleteTaskByCourseIdTopicIdTaskId(data);
  return result.data.task;
};

export const deleteRequestByCourseIdRequestId = async (
  courseId: string,
  requestId: string,
): Promise<void> => {
  const data = {
    courseId,
    requestId,
  };
  const deleteRequestByCourseIdRequestId = functions.httpsCallable(
    "deleteRequestByCourseIdRequestId",
  );

  await deleteRequestByCourseIdRequestId(data);
  // const result = await deleteRequestByCourseIdRequestId(data);
  // return result.data.task;
};

export const updateTaskOrderIndexesByCourseIdTopicId = async (
  courseId: string,
  topicId: string,
  orderIndexes: { taskId: string; orderIndex: number }[],
): Promise<ITask[]> => {
  const data = {
    courseId,
    topicId,
    orderIndexes,
  };
  const updateTaskOrderIndexesByCourseIdTopicId = functions.httpsCallable(
    "updateTaskOrderIndexesByCourseIdTopicId",
  );
  const result = await updateTaskOrderIndexesByCourseIdTopicId(data);
  return result.data.tasks;
};

// organisation
export const fetchOrganisations = async (): Promise<IOrganisation[]> => {
  const data = {};
  const getOrganisations = functions.httpsCallable("getOrganisations");
  const result = await getOrganisations(data);
  return result.data.organisations;
};

export const fetchOrganisationByOrganisationId = async (
  organisationId: string,
): Promise<IOrganisation> => {
  const data = {
    organisationId,
  };
  const getOrganisationByOrganisationId = functions.httpsCallable(
    "getOrganisationByOrganisationId",
  );
  const result = await getOrganisationByOrganisationId(data);
  return result.data.organisation;
};

export const fetchPeopleByOrganisationId = async (organisationId: string): Promise<IPerson[]> => {
  const data = {
    organisationId,
  };
  const getPeopleByOrganisationId = functions.httpsCallable("getPeopleByOrganisationId");
  const result = await getPeopleByOrganisationId(data);
  return result.data.people;
};

export const createOrganisation = async (organisation: object): Promise<IOrganisation> => {
  const data = {
    organisation,
  };
  const createOrganisation = functions.httpsCallable("createOrganisation");
  const result = await createOrganisation(data);
  return result.data.organisation;
};

export const updateOrganisationByOrganisationId = async (
  organisationId: string,
  organisation: object,
): Promise<IOrganisation> => {
  const data = {
    organisationId,
    organisation,
  };
  const updateOrganisationByOrganisationId = functions.httpsCallable(
    "updateOrganisationByOrganisationId",
  );
  const result = await updateOrganisationByOrganisationId(data);
  return result.data.organisation;
};

export const addPersonToOrganisationByOrganisationIdAndPersonId = async (
  organisationId: string,
  personId: string,
): Promise<IOrganisation> => {
  const data = {
    organisationId,
    personId,
  };
  const addPersonToOrganisationByOrganisationIdAndPersonId = functions.httpsCallable(
    "addPersonToOrganisationByOrganisationIdAndPersonId",
  );
  const result = await addPersonToOrganisationByOrganisationIdAndPersonId(data);
  return result.data.organisation;
};

export const removePersonFromOrganisationByOrganisationIdAndPersonId = async (
  organisationId: string,
  personId: string,
): Promise<IOrganisation> => {
  const data = {
    organisationId,
    personId,
  };
  const removePersonFromOrganisationByOrganisationIdAndPersonId = functions.httpsCallable(
    "removePersonFromOrganisationByOrganisationIdAndPersonId",
  );
  const result = await removePersonFromOrganisationByOrganisationIdAndPersonId(data);
  return result.data.organisation;
};

export const deleteOrganisationByOrganisationId = async (
  organisationId: string,
): Promise<IOrganisation> => {
  const data = {
    organisationId,
  };
  const deleteOrganisationByOrganisationId = functions.httpsCallable(
    "deleteOrganisationByOrganisationId",
  );
  const result = await deleteOrganisationByOrganisationId(data);
  return result.data.organisation;
};

export const fetchPersonByPersonId = async (
  id: string,
  cohortId: string,
): Promise<IPerson | null> => {
  const data = {
    personId: id,
    cohortId,
  };
  try {
    // Throttle the request to avoid overwhelming Firebase with concurrent requests
    const result = await personFetchThrottle.throttle(async () => {
      const getPersonByPersonId = functions.httpsCallable("getPersonByPersonId");
      return await getPersonByPersonId(data);
    });
    return result.data.person;
  } catch (error: any) {
    // Only log if it's not a resource exhaustion error (those are expected when throttled)
    const errorCode = error?.code;
    const errorMessage = error?.message || "";
    if (
      errorCode !== "internal" ||
      (!errorMessage.includes("ERR_INSUFFICIENT_RESOURCES") &&
        !errorMessage.includes("ERR_CONNECTION_CLOSED"))
    ) {
      console.error(
        `Error in fetchPersonByPersonId with ID ${id} ${
          cohortId ? `from COHORT ${cohortId}` : ""
        }:`,
        error,
      );
    }
    return null;
  }
};

export const fetchPersonByEmail = async (email: string): Promise<IPerson | null> => {
  const data = {
    email,
  };
  const getPersonByEmail = functions.httpsCallable("getPersonByEmail");
  try {
    const result = await getPersonByEmail(data);
    return result.data.person;
  } catch (e) {
    if (e instanceof FirebaseError && e.code === "functions/not-found") {
      return null;
    }
    throw e;
  }
};

export const createPerson = async (profile: Record<string, any>): Promise<IPerson> => {
  const data = {
    profile,
  };
  const createNewUser = functions.httpsCallable("createNewUser");
  const result = await createNewUser(data);
  const person = result.data.person;
  if (profile.inviter) person.inviter = profile.inviter;
  return person;
};

export const updatePerson = async (personId: string, person: object): Promise<IPerson> => {
  const data = {
    personId,
    person,
  };
  const updatePersonByPersonId = functions.httpsCallable("updatePersonByPersonId");
  const result = await updatePersonByPersonId(data);
  return result.data.person;
};

export const fetchAllPeopleInCourseByCourseId = async (courseId: string): Promise<IPerson[]> => {
  const data = {
    courseId,
  };
  const getPeopleByCourseId = functions.httpsCallable("getPeopleByCourseId");
  const result = await getPeopleByCourseId(data);
  return result.data.people;
};

export const fetchPersonsTopicsByPersonIdCourseId = async (
  personId: string,
  courseId: string,
): Promise<IPersonTopic[]> => {
  const data = {
    personId,
    courseId,
  };
  const getPersonTopicsByPersonIdCourseId = functions.httpsCallable(
    "getPersonTopicsByPersonIdCourseId",
  );
  const result = await getPersonTopicsByPersonIdCourseId(data);
  return result.data.personTopics;
};

export const fetchPersonsTopicByPersonIdCourseIdTopicId = async (
  personId: string,
  courseId: string,
  topicId: string,
): Promise<IPersonTopic> => {
  const data = {
    personId,
    courseId,
    topicId,
  };
  const getPersonTopicByPersonIdCourseIdTopicId = functions.httpsCallable(
    "getPersonTopicByPersonIdCourseIdTopicId",
  );
  const result = await getPersonTopicByPersonIdCourseIdTopicId(data);
  return result.data.personTopic;
};

export const fetchPersonsTasksByPersonIdCourseIdTopicId = async (
  personId: string,
  courseId: string,
  topicId: string,
): Promise<IPersonTask[]> => {
  const data = {
    personId,
    courseId,
    topicId,
  };
  const getPersonTasksByPersonIdCourseIdTopicId = functions.httpsCallable(
    "getPersonTasksByPersonIdCourseIdTopicId",
  );
  const result = await getPersonTasksByPersonIdCourseIdTopicId(data);
  return result.data.personTasks;
};

export const fetchStudentActivityLogByPersonId = async (
  personId: string,
): Promise<Record<string, any>[]> => {
  const data = {
    personId,
  };
  const getStudentActivityLogByPersonId = functions.httpsCallable(
    "getStudentActivityLogByPersonId",
  );
  const result = await getStudentActivityLogByPersonId(data);
  return result.data.activityData;
};

export const fetchStudentCoursesActivityByPersonId = async (
  personId: string,
): Promise<
  {
    course: ICourse;
    activities: Record<string, any>;
    taskCompletedCount: number;
    topicCompletedCount: number;
  }[]
> => {
  const data = {
    personId,
  };
  const getStudentCoursesActivityByPersonId = functions.httpsCallable(
    "getStudentCoursesActivityByPersonId",
  );
  const result = await getStudentCoursesActivityByPersonId(data);
  return result.data.activityData;
};

export const fetchStudentCoursesTimeDataByPersonIdStartAtEndAt = async (
  personId: string,
  startAt: string,
  endAt: string,
): Promise<Record<string, any>[]> => {
  const data = {
    personId,
    startAt,
    endAt,
  };
  const getStudentCoursesTimeDataByPersonIdStartAtEndAt = functions.httpsCallable(
    "getStudentCoursesTimeDataByPersonIdStartAtEndAt",
  );
  const result = await getStudentCoursesTimeDataByPersonIdStartAtEndAt(data);
  return result.data.activityData;
};

export const fetchStudentCoursesTimeDataByPersonId = async (
  personId: string,
): Promise<Record<string, any>[]> => {
  const data = {
    personId,
  };
  const getStudentCoursesTimeDataByPersonId = functions.httpsCallable(
    "getStudentCoursesTimeDataByPersonId",
  );
  const result = await getStudentCoursesTimeDataByPersonId(data);
  return result.data.activityData;
};

// add person to cohort
export const addMeToCohort = async (cohortId: string): Promise<ICohort> => {
  const data = {
    cohortId,
  };
  const addMeToCohort = functions.httpsCallable("addMeToCohort");
  const result = await addMeToCohort(data);
  return result.data.cohort;
};

export const addPersonToCohort = async (personId: string, cohortId: string): Promise<ICohort> => {
  const data = {
    personId,
    cohortId,
  };
  const addStudentToCohort = functions.httpsCallable("addStudentToCohort");
  const result = await addStudentToCohort(data);
  return result.data.cohort;
};

// add course to person
export const assignCourseToMe = async (courseId: string): Promise<ICourse> => {
  const data = {
    courseId,
  };
  const assignCourseToMe = functions.httpsCallable("assignCourseToMe");
  const result = await assignCourseToMe(data);
  return result.data.person;
};

export const assignCourseToPerson = async (
  personId: string,
  courseId: string,
): Promise<IPerson> => {
  const data = {
    personId,
    courseId,
  };
  const assignCourseToStudent = functions.httpsCallable("assignCourseToStudent");
  const result = await assignCourseToStudent(data);
  return result.data.person;
};

// remove course from person
export const removeMeFromCourse = async (courseId: string): Promise<IPerson> => {
  const data = {
    courseId,
  };
  const removeMeFromCourse = functions.httpsCallable("removeMeFromCourse");
  const result = await removeMeFromCourse(data);
  return result.data.person;
};

export const removePersonFromCourse = async (
  personId: string,
  courseId: string,
): Promise<IPerson> => {
  const data = {
    personId,
    courseId,
  };
  const removeStudentFromCourse = functions.httpsCallable("removeStudentFromCourse");
  const result = await removeStudentFromCourse(data);
  return result.data.person;
};

// AI Galaxy Map Generation
export const generateGalaxyMap = async (
  description: string,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = {
    description,
  };
  const generateGalaxyMapFunction = functions.httpsCallable("generateGalaxyMap", {
    timeout: 540000,
  }); // 180s timeout
  const result = await generateGalaxyMapFunction(data);
  return result.data;
};

// Unified AI Galaxy Map Generation (Stars + Missions + Mission Instructions)
export const generateUnifiedGalaxyMap = async (
  description: string,
  attachedFiles?: Array<
    | { name: string; mimeType?: string; base64: string }
    | { name: string; mimeType?: string; storagePath: string }
  >,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = { description, attachedFiles } as Record<string, any>;
  const generateUnifiedGalaxyMapFunction = functions.httpsCallable("generateUnifiedGalaxyMap", {
    timeout: 540000,
  });
  const result = await generateUnifiedGalaxyMapFunction(data);
  return result.data;
};

// Generate image for a Galaxy Map (separate lightweight call)
export const generateGalaxyImage = async (
  title: string,
  description: string,
): Promise<{
  success: boolean;
  image: { name: string; url: string };
}> => {
  const data = { title, description };
  const fn = functions.httpsCallable("generateGalaxyImage", { timeout: 300000 });
  const result = await fn(data);
  return result.data;
};

// Unified AI Galaxy Map Generation with Streaming (Stars + Missions + Mission Instructions)
export const generateUnifiedGalaxyMapStreaming = async (
  description: string,
  onStreamUpdate?: (update: { type: string; text?: string; delta?: string }) => void,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = { description };
  const generateUnifiedGalaxyMapStreamingFunction = functions.httpsCallable(
    "generateUnifiedGalaxyMapStreaming",
    {
      timeout: 540000, // 9 minutes to match cloud function
    },
  );

  // For now, we'll just call the function normally
  // In the future, this could be enhanced to handle real-time streaming updates
  const result = await generateUnifiedGalaxyMapStreamingFunction(data);
  return result.data;
};

// AI Galaxy Map Generation with Clarification (Second Step)
export const generateGalaxyMapWithClarification = async (
  clarificationAnswers: string,
  previousResponseId: string,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = {
    clarificationAnswers,
    previousResponseId,
  };
  const generateGalaxyMapWithClarificationFunction = functions.httpsCallable(
    "generateGalaxyMapWithClarification",
    { timeout: 540000 }, // 180s (3 minutes) timeout to match cloud function
  );
  const result = await generateGalaxyMapWithClarificationFunction(data);
  return result.data;
};

// Generate galaxy map again with default prompt
export const generateGalaxyMapAgain = async (
  responseId: string,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = {
    responseId,
  };
  const generateGalaxyMapAgainFunction = functions.httpsCallable("generateGalaxyMapAgain", {
    timeout: 540000,
  }); // 180s timeout
  const result = await generateGalaxyMapAgainFunction(data);
  return result.data;
};

// Unified AI Galaxy Map Generation with Clarification (Second Step)
export const generateUnifiedGalaxyMapWithClarification = async (
  clarificationAnswers: string,
  previousResponseId: string,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = { clarificationAnswers, previousResponseId };
  const fn = functions.httpsCallable("generateUnifiedGalaxyMap", { timeout: 540000 });
  const result = await fn(data);
  return result.data;
};

// Galaxy Map Refinement with Clarification
export const refineGalaxyMapWithClarification = async (
  clarificationAnswers: string,
  previousResponseId: string,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = { clarificationAnswers, previousResponseId };
  const fn = functions.httpsCallable("refineGalaxyMap", { timeout: 540000 });
  const result = await fn(data);
  return result.data;
};

// Initial Galaxy Map Refinement
export const refineGalaxyMap = async (
  galaxyMap: any,
  activeItems: string[],
  userRequest: string,
  previousResponseId: string,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = { galaxyMap, activeItems, userRequest, previousResponseId };
  const fn = functions.httpsCallable("refineGalaxyMap", { timeout: 540000 });
  const result = await fn(data);
  return result.data;
};

type StructureCallableInput =
  | ({
      userRequest: string;
      previousResponseId?: string;
      targets?: StructureTargets;
      candidates?: StructureCandidates;
      stars?: Array<Record<string, any>>;
      planets?: Array<Record<string, any>>;
      neighbors?: Record<string, { prevTitle?: string; nextTitle?: string }>;
      styleGuide?: string[];
    } & Record<string, unknown>)
  | {
      clarificationAnswers: string;
      previousResponseId: string;
    };

export type StructureRefineCallableResult = {
  success: boolean;
  status: StructureRefineResponse["status"];
  questions: string[] | null;
  suggestedTargets: StructureTargets | null;
  selectedTargets: StructureTargets | null;
  ops: StructureRefineResponse["ops"] | null;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
};

export const refineStructure = async (
  payload: StructureCallableInput,
): Promise<StructureRefineCallableResult> => {
  const fn = functions.httpsCallable("refineStructure", { timeout: 540000 });
  const result = await fn(payload as Record<string, unknown>);
  const data = result.data as Record<string, any>;

  if (!data?.success) {
    throw new Error(data?.message || "Structure refinement failed");
  }

  const parsed = StructureRefineResponseSchema.parse({
    status: data.status,
    questions: data.questions ?? undefined,
    suggestedTargets: data.suggestedTargets ?? undefined,
    selectedTargets: data.selectedTargets ?? undefined,
    ops: data.ops ?? undefined,
  });

  const tokenUsage = data.tokenUsage ?? {
    modelsUsed: [],
    combinedEstimatedCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
  };

  return {
    success: true,
    status: parsed.status,
    questions: parsed.questions ?? null,
    suggestedTargets: parsed.suggestedTargets ?? null,
    selectedTargets: parsed.selectedTargets ?? null,
    ops: parsed.ops ?? null,
    tokenUsage,
    responseId: data.responseId,
  };
};

// Unified AI Galaxy Map Generation with Clarification and Streaming (Second Step)
export const generateUnifiedGalaxyMapWithClarificationStreaming = async (
  clarificationAnswers: string,
  previousResponseId: string,
  onStreamUpdate?: (update: { type: string; text?: string; delta?: string }) => void,
): Promise<{
  success: boolean;
  galaxyMap: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = { clarificationAnswers, previousResponseId };
  const fn = functions.httpsCallable("generateUnifiedGalaxyMapStreaming", { timeout: 540000 }); // 9 minutes to match cloud function
  const result = await fn(data);
  return result.data;
};

// Generate mission instructions with AI
export const generateInstructionsForMission = async (
  missionContext: string,
  aiGeneratedGalaxyMap?: any,
  originResponseId?: string,
  refinement?: {
    currentInstructions: string;
    userFeedback: string;
  },
): Promise<{
  success: boolean;
  missionInstructions: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = {
    missionContext,
    aiGeneratedGalaxyMap,
    originResponseId,
    refinement,
  };
  const generateInstructionsForMissionFunction = functions.httpsCallable(
    "generateInstructionsForMission",
    { timeout: 540000 }, // 180s timeout
  );
  const result = await generateInstructionsForMissionFunction(data);
  return result.data;
};

// Save AI-generated Galaxy Map to Database
export const saveGalaxyMap = async (
  galaxyMap: any,
  mapLayout = "zigzag",
): Promise<{
  courseId: string;
  totalPlanets: number;
}> => {
  const data = {
    galaxyMap,
    mapLayout,
  };
  const saveGalaxyMapFunction = functions.httpsCallable("saveGalaxyMap");
  const result = await saveGalaxyMapFunction(data);
  return result.data;
};

// Get Galaxy Map Object from Course
export const getGalaxyMapObjectFromCourse = async (
  courseId: string,
): Promise<{
  title: string | null;
  description: string | null;
  stars: Array<{
    title: string;
    description: string;
    planets: Array<{
      title: string;
      description: string;
    }>;
  }> | null;
  image: {
    name: string;
    url: string;
  } | null;
}> => {
  const data = {
    courseId,
  };
  const getGalaxyMapObjectFromCourseFunction = functions.httpsCallable(
    "getGalaxyMapObjectFromCourse",
  );
  const result = await getGalaxyMapObjectFromCourseFunction(data);
  return result.data;
};

// Download and upload image to Firebase Storage
export const downloadAndUploadImage = async (
  imageUrl: string,
  fileName: string,
): Promise<{
  downloadURL: string;
}> => {
  const data = {
    imageUrl,
    fileName,
  };
  const downloadAndUploadImageFunction = functions.httpsCallable("downloadAndUploadImage");
  const result = await downloadAndUploadImageFunction(data);
  return result.data;
};

export const bulkImportStudents = async (
  students: Array<Record<string, any>>,
  cohortId: string,
  inviter: string,
): Promise<{
  results: {
    success: Array<{ email: string; action: string; personId: string }>;
    errors: Array<{ email: string; error: string }>;
  };
  summary: {
    total: number;
    success: number;
    errors: number;
  };
}> => {
  const data = {
    students,
    cohortId,
    inviter,
  };
  const bulkImportStudents = functions.httpsCallable("bulkImportStudents");
  const result = await bulkImportStudents(data);
  return result.data;
};

// Remove prerequisites from topics when a node is deleted
export const removePrerequisitesFromTopics = async (
  courseId: string,
  nodeId: string,
): Promise<{
  success: boolean;
  affectedTopicsCount: number;
  affectedTopics: Array<{
    topicId: string;
    oldPrerequisites: string[];
    newPrerequisites: string[];
  }>;
}> => {
  const data = {
    courseId,
    nodeId,
  };
  const removePrerequisitesFromTopicsFunction = functions.httpsCallable(
    "removePrerequisitesFromTopics",
  );
  const result = await removePrerequisitesFromTopicsFunction(data);
  return result.data;
};

// Update prerequisites for a specific student's topics
export const updateStudentTopicPrerequisites = async (
  courseId: string,
  personId: string,
  affectedTopics: Array<{
    topicId: string;
    newPrerequisites: string[];
  }>,
): Promise<{
  success: boolean;
  updatedTopicsCount: number;
  personId: string;
}> => {
  const data = {
    courseId,
    personId,
    affectedTopics,
  };
  const updateStudentTopicPrerequisitesFunction = functions.httpsCallable(
    "updateStudentTopicPrerequisites",
  );
  const result = await updateStudentTopicPrerequisitesFunction(data);
  return result.data;
};

// Save a topic to all students in a course
export const saveTopicToStudents = async (
  courseId: string,
  node: any,
  students: Array<{ id: string; [key: string]: any }>,
): Promise<{
  success: boolean;
  studentsProcessed: number;
  topicsCreated: number;
  message: string;
}> => {
  const data = {
    courseId,
    node,
    students,
  };
  const saveTopicToStudentsFunction = functions.httpsCallable("saveTopicToStudents");
  const result = await saveTopicToStudentsFunction(data);
  return result.data;
};

// Delete a topic from all students in a course
export const deleteTopicForStudents = async (
  courseId: string,
  node: any,
  students: Array<{ id: string; [key: string]: any }>,
  affectedTopics: Array<{
    topicId: string;
    newPrerequisites: string[];
  }> = [],
): Promise<{
  success: boolean;
  studentsProcessed: number;
  topicsDeleted: number;
  affectedTopicsUpdated: boolean;
  message: string;
}> => {
  const data = {
    courseId,
    node,
    students,
    affectedTopics,
  };
  const deleteTopicForStudentsFunction = functions.httpsCallable("deleteTopicForStudents");
  const result = await deleteTopicForStudentsFunction(data);
  return result.data;
};

// Save a node to the course map
export const saveNode = async (
  courseId: string,
  node: any,
  isUpdate = false,
): Promise<{
  success: boolean;
  nodeId: string;
  edgesCreated: number;
  topicTotalUpdated: boolean;
  message: string;
}> => {
  const data = {
    courseId,
    node,
    isUpdate,
  };
  const saveNodeFunction = functions.httpsCallable("saveNode");
  const result = await saveNodeFunction(data);
  return result.data;
};

// Generate ephemeral client token for OpenAI Realtime API
export const generateRealtimeToken = async (): Promise<{
  clientSecret: string;
  expires_at: number;
}> => {
  const data = {};
  const generateRealtimeTokenFunction = functions.httpsCallable("generateRealtimeToken");
  const result = await generateRealtimeTokenFunction(data);
  return result.data;
};

// Generate Squad Report from AI (using gpt-5-mini)
export const generateSquadReport = async (
  squadPacket: any,
  cohortId?: string,
  statusReportId?: string,
): Promise<{
  success: boolean;
  report: any;
  tokenUsage: {
    modelsUsed: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }[];
    combinedEstimatedCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  responseId: string;
}> => {
  const data = { squadPacket, cohortId, statusReportId } as Record<string, any>;
  const fn = functions.httpsCallable("generateSquadReport", { timeout: 540000 });
  const result = await fn(data);
  return result.data;
};

// Start Mission - Sets task and topic as active and sends XAPI statements
export const startMission = async (
  courseId: string,
  topicId: string,
  taskId: string,
  topicActive: boolean,
): Promise<{
  success: boolean;
  message: string;
  taskId: string;
  topicId: string;
  courseId: string;
}> => {
  const data = {
    courseId,
    topicId,
    taskId,
    topicActive,
  };
  const startMissionFunction = functions.httpsCallable("startMission");
  const result = await startMissionFunction(data);
  return result.data;
};

// Send generic email - perfect for AI agent responses
export const sendGenericEmail = async (
  to: string,
  subject: string,
  body: string,
  isHtml = false,
): Promise<{ success: boolean; message: string }> => {
  const data = {
    to,
    subject,
    body,
    isHtml,
  };
  const sendGenericEmailFunction = functions.httpsCallable("sendGenericEmail");
  const result = await sendGenericEmailFunction(data);
  return result.data;
};
