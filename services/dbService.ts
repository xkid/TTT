
import { CoursePlan, SavedCourse } from "../types";

const DB_NAME = "MyTTT_DB";
const STORE_NAME = "courses";
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveCourseToDB = async (plan: CoursePlan): Promise<string> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  
  const savedItem: SavedCourse = {
    ...plan,
    id: plan.id || crypto.randomUUID(),
    lastModified: Date.now()
  };

  store.put(savedItem);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(savedItem.id);
    tx.onerror = () => reject(tx.error);
  });
};

export const getAllCourses = async (): Promise<SavedCourse[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      // Sort by last modified desc
      const results = request.result as SavedCourse[];
      resolve(results.sort((a, b) => b.lastModified - a.lastModified));
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteCourse = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// --- Export / Import Utilities ---

export const exportToJSON = (plan: CoursePlan) => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(plan, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", `${plan.basics.courseTitle.replace(/\s+/g, '_')}_TTT.json`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

export const exportToMarkdown = (plan: CoursePlan) => {
  let md = `# ${plan.basics.courseTitle}\n\n`;
  md += `**Trainer:** ${plan.basics.trainerName}\n`;
  md += `**Duration:** ${plan.basics.duration}\n`;
  md += `**Location:** ${plan.basics.location}\n\n`;
  
  md += `## Learning Outcomes\n`;
  plan.outcomes.forEach((lo, i) => md += `${i+1}. ${lo.text}\n`);
  md += `\n---\n`;

  plan.schedule.forEach(day => {
    md += `## Day ${day.dayNumber}\n\n`;
    md += `### Ice Breaker: ${day.iceBreaker.title}\n${day.iceBreaker.description}\n\n`;
    if (day.recap) md += `### Recap\n${day.recap}\n\n`;
    
    day.modules.forEach(mod => {
      md += `### ${mod.title}\n`;
      md += `*Duration: ${mod.duration} | Resources: ${mod.resources}*\n\n`;
      md += `**Methodology:**\n${mod.methodology}\n\n`;
      md += `**Sub-modules:**\n`;
      mod.subModules.forEach(sm => md += `- ${sm}\n`);
      md += `\n`;
    });

    md += `### Summary\n${day.summary}\n\n`;
    md += `### Review Questions\n`;
    day.reviewQuestions.forEach(q => md += `- ${q}\n`);
    md += `\n---\n`;
  });

  const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", `${plan.basics.courseTitle.replace(/\s+/g, '_')}_TTT.md`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};
