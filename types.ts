
export interface CourseBasics {
  trainerName: string;
  courseTitle: string;
  duration: string;
  location: string;
}

export interface LearningOutcome {
  id: string;
  text: string;
}

export interface ModuleContent {
  id: string;
  title: string;
  subModules: string[];
  methodology: string;
  resources: string;
  duration: string;
  slideNumbers?: string;
}

export interface IceBreaker {
  title: string;
  description: string;
  duration: string;
}

export interface DayPlan {
  dayNumber: number;
  iceBreaker: IceBreaker;
  recap?: string; // Only for Day 2+
  modules: ModuleContent[];
  summary: string;
  reviewQuestions: string[];
}

export interface CoursePlan {
  id?: string; // For DB
  lastModified?: number;
  basics: CourseBasics;
  outcomes: LearningOutcome[];
  schedule: DayPlan[];
}

export interface SavedCourse extends CoursePlan {
  id: string;
  lastModified: number;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  GENERATING_OUTCOMES = 'GENERATING_OUTCOMES',
  GENERATING_STRUCTURE = 'GENERATING_STRUCTURE',
  GENERATING_ICEBREAKERS = 'GENERATING_ICEBREAKERS',
  GENERATING_PLAN = 'GENERATING_PLAN',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}
