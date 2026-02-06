
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { CourseBasics, LearningOutcome, DayPlan, ModuleContent, IceBreaker } from "../types";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

// --- Step 2: Outcomes ---

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

  // Simplified schema for structure
  const structureSchema: Schema = {
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
  
  // Hydrate with empty fields for strict typing
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

const moduleSchema: Schema = {
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
          // If title changed significantly, keep original or use new? Let's prefer the structure title but allow AI refinement
          title: partialMod.title // Enforce user's title structure
        });
      } catch (e) {
        console.error(`Failed to generate detail`, e);
        refinedModules.push({ ...partialMod, methodology: "Error generating content." });
      }
    }

    // 2. Generate Summary & Review Questions for the day (since we only had titles before)
    if (onProgress) onProgress(`Finalizing Day ${day.dayNumber} summary...`);
    const endOfDayPrompt = `
       Create a Day End Summary and 3 Review Questions for Day ${day.dayNumber} of course "${basics.courseTitle}".
       Modules covered: ${refinedModules.map(m => m.title).join(', ')}.
       Return JSON { summary: string, reviewQuestions: string[] }
    `;
    
    let summaryData = { summary: day.summary, reviewQuestions: day.reviewQuestions };
    try {
        const endResp = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: endOfDayPrompt,
            config: { responseMimeType: "application/json" }
        });
        const parsed = JSON.parse(endResp.text || "{}");
        if(parsed.summary) summaryData = parsed;
    } catch(e) {}

    refinedDays.push({
      ...day,
      modules: refinedModules,
      summary: summaryData.summary,
      reviewQuestions: summaryData.reviewQuestions
    });
  }

  return refinedDays;
};

export const refineContent = async (text: string, contextType: string): Promise<string> => {
  const ai = getClient();
  const prompt = `
    Refine this text for a TTT Session Plan ("${contextType}").
    Current: "${text}"
    Requirement: Professional, concise, action-oriented. Simple English.
    Return ONLY rewritten text.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
  });
  return response.text?.trim() || text;
};
