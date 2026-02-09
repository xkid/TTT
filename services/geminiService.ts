import { GoogleGenAI, Type } from "@google/genai";
import { CourseBasics, LearningOutcome, DayPlan, ModuleContent, IceBreaker } from "../types";

/**
 * Gets the API key from localStorage or falls back to the environment variable safely.
 */
const getApiKey = () => {
  const userKey = localStorage.getItem('MY_TTT_API_KEY');
  if (userKey) return userKey;

  try {
    // Check if process and process.env are defined to prevent crash
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    console.warn("Environment API key not accessible");
  }
  
  return undefined;
};

const getClient = () => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error("Gemini API Key not found. Please set it in Settings (top right gear icon).");
  }
  
  return new GoogleGenAI({ apiKey });
};

// --- Step 2: Outcomes ---

/**
 * Generates suggested learning outcomes based on course basics.
 */
export const generateOutcomes = async (basics: CourseBasics): Promise<LearningOutcome[]> => {
  const ai = getClient();
  const prompt = `
    Act as a Master Trainer certified by HRD Corp Malaysia.
    I need 5 suggested Learning Outcomes (LO) for a training course with the following details:
    Title: ${basics.courseTitle}
    Target Audience/Context: General professional training.

    CRITICAL INSTRUCTION: Use simple, plain English (CEFR B2 level). Avoid overly complex academic jargon. 
    The outcomes must be action-oriented (e.g., "Analyze", "Demonstrate", "Apply") adhering to Bloom's Taxonomy.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING }
          }
        }
      }
    }
  });

  const raw = JSON.parse(response.text || "[]");
  return raw.map((item: any, index: number) => ({
    id: `lo-${Date.now()}-${index}`,
    text: item.text
  }));
};

// --- Step 3: Structure (Titles) ---

/**
 * Generates the basic structure (module titles) of the course.
 */
export const generateCourseStructure = async (basics: CourseBasics, outcomes: LearningOutcome[]): Promise<DayPlan[]> => {
  const ai = getClient();
  const outcomesText = outcomes.map((o, i) => `${i + 1}. ${o.text}`).join('\n');
  const durationLower = basics.duration.toLowerCase();
  
  let numDays = 1;
  if (durationLower.includes('2 day')) numDays = 2;
  if (durationLower.includes('3 day')) numDays = 3;
  if (durationLower.includes('4 day')) numDays = 4;
  if (durationLower.includes('5 day')) numDays = 5;

  const prompt = `
    Act as a Master Trainer. Create a Course Outline (Structure only) for:
    Title: ${basics.courseTitle}
    Duration: ${basics.duration} (${numDays} days)
    
    Learning Outcomes:
    ${outcomesText}

    Task:
    1. Define the schedule for ${numDays} day(s).
    2. For each day, provide a list of MODULE TITLES.
    3. Do NOT generate module content, methodology, or ice breakers yet. Just titles and estimated duration.
    
    Return JSON array of DayPlan. Use placeholders for non-title fields.
  `;

  const structureSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        dayNumber: { type: Type.INTEGER },
        modules: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
               id: { type: Type.STRING },
               title: { type: Type.STRING },
               duration: { type: Type.STRING }
            },
            required: ["title", "duration"]
          }
        }
      },
      required: ["dayNumber", "modules"]
    }
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: structureSchema
    }
  });

  const rawDays = JSON.parse(response.text || "[]");
  
  return rawDays.map((d: any, dIdx: number) => ({
    dayNumber: d.dayNumber,
    iceBreaker: { title: "", description: "", duration: "" },
    recap: d.dayNumber > 1 ? "Recap of previous day" : undefined,
    summary: "Key takeaways and Q&A",
    reviewQuestions: [],
    modules: d.modules.map((m: any, mIdx: number) => ({
      id: m.id || `d${dIdx}-m${mIdx}-${Date.now()}`,
      title: m.title,
      duration: m.duration,
      subModules: [],
      methodology: "",
      resources: ""
    }))
  }));
};

// --- Step 4: Ice Breaker Options ---

/**
 * Generates options for ice breakers for a specific day.
 */
export const generateIceBreakerOptions = async (dayNum: number): Promise<IceBreaker[]> => {
  const ai = getClient();
  const prompt = `
    Suggest 3 different, creative, high-energy Ice Breaker activities suitable for Day ${dayNum} of a corporate training.
    
    Requirements:
    1. Simple English.
    2. Duration approx 15-30 mins.
    3. Include Title, Description (how to run it), and Duration.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            duration: { type: Type.STRING }
          }
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
};

// --- Step 5: Content Generation (Module by Module) ---

const moduleSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    subModules: { type: Type.ARRAY, items: { type: Type.STRING } },
    methodology: { type: Type.STRING },
    resources: { type: Type.STRING },
    duration: { type: Type.STRING },
    slideNumbers: { type: Type.STRING }
  },
  required: ["title", "subModules", "methodology", "resources", "duration"]
};

/**
 * Generates detailed content for a single module.
 */
const generateModuleDetail = async (
  ai: GoogleGenAI, 
  basics: CourseBasics, 
  moduleTitle: string, 
  dayNum: number,
  outcomesText: string
): Promise<ModuleContent> => {
  const prompt = `
    Act as a Master Trainer. Develop the content for ONE module.
    
    Course: ${basics.courseTitle}
    Module Title: "${moduleTitle}"
    Day: ${dayNum}
    Outcomes Context: ${outcomesText}
    
    Requirements:
    1. Sub-modules: 3-5 bullet points of specific contents.
    2. Methodology: "Lecture: [Details] \n Activity: [Details]". Keep it concise.
    3. Resources: e.g. "Slides, Video".
    4. Duration: Estimate realistic duration.
    
    Return JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: moduleSchema
    }
  });

  return JSON.parse(response.text || "{}");
};

/**
 * Generates the full detailed content for the entire course plan.
 */
export const generateFinalPlanContent = async (
  basics: CourseBasics, 
  outcomes: LearningOutcome[],
  skeleton: DayPlan[],
  onProgress?: (msg: string) => void
): Promise<DayPlan[]> => {
  const ai = getClient();
  const outcomesText = outcomes.map((o, i) => `${i + 1}. ${o.text}`).join('\n');
  
  const refinedDays: DayPlan[] = [];

  for (let d = 0; d < skeleton.length; d++) {
    const day = skeleton[d];
    const refinedModules: ModuleContent[] = [];

    // 1. Generate Module Details
    for (let m = 0; m < day.modules.length; m++) {
      const partialMod = day.modules[m];
      if (onProgress) onProgress(`Writing content for Day ${day.dayNumber}: ${partialMod.title}...`);
      
      try {
        const fullMod = await generateModuleDetail(ai, basics, partialMod.title, day.dayNumber, outcomesText);
        refinedModules.push({
          ...fullMod,
          id: partialMod.id,
          title: partialMod.title 
        });
      } catch (e) {
        console.error(`Failed to generate detail`, e);
        refinedModules.push({ ...partialMod, methodology: "Error generating content." });
      }
    }

    // 2. Generate Summary & Review Questions for the day
    if (onProgress) onProgress(`Finalizing Day ${day.dayNumber} summary...`);
    const endOfDayPrompt = `
       Create a Day End Summary and 3 Review Questions for Day ${day.dayNumber} of course "${basics.courseTitle}".
       Modules covered: ${refinedModules.map(m => m.title).join(', ')}.
       Return JSON { "summary": "string", "reviewQuestions": ["string"] }
    `;
    
    let summaryData = { summary: day.summary, reviewQuestions: day.reviewQuestions };
    try {
        const endResp = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: endOfDayPrompt,
            config: { 
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  summary: { type: Type.STRING },
                  reviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
        });
        const parsed = JSON.parse(endResp.text || "{}");
        summaryData = {
          summary: parsed.summary || day.summary,
          reviewQuestions: parsed.reviewQuestions || day.reviewQuestions
        };
    } catch (e) {
        console.error(`Failed to generate day summary`, e);
    }

    refinedDays.push({
      ...day,
      modules: refinedModules,
      summary: summaryData.summary,
      reviewQuestions: summaryData.reviewQuestions
    });
  }

  return refinedDays;
};

// --- Step 6: Refine Content ---

/**
 * Refines existing text using Gemini to improve clarity and tone.
 */
export const refineContent = async (text: string, context: string): Promise<string> => {
  const ai = getClient();
  const prompt = `
    Refine the following content for a corporate training plan.
    Context: ${context}
    Original Text: ${text}
    
    Task: Improve clarity, professional tone, and engagement while keeping it simple (CEFR B2 level).
    Return ONLY the refined text.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt
  });

  return response.text?.trim() || text;
};