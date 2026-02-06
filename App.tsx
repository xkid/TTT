
import React, { useState, useEffect } from 'react';
import { CourseBasics, LearningOutcome, CoursePlan, DayPlan, GenerationStatus, SavedCourse, IceBreaker } from './types';
import { generateOutcomes, generateCourseStructure, generateIceBreakerOptions, generateFinalPlanContent, refineContent } from './services/geminiService';
import { saveCourseToDB, getAllCourses, deleteCourse, exportToJSON, exportToMarkdown } from './services/dbService';
import SessionPlanTable from './components/SessionPlanTable';

// --- Icons ---
const Spinner = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const CheckIcon = () => (
  <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
);

const App: React.FC = () => {
  // --- State ---
  const [step, setStep] = useState<number>(1);
  const [maxStepReached, setMaxStepReached] = useState<number>(1);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [loadingMsg, setLoadingMsg] = useState<string>("Thinking...");
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>([]);

  // Data
  const [basics, setBasics] = useState<CourseBasics>({
    trainerName: '', courseTitle: '', duration: '1 Day', location: ''
  });
  const [outcomes, setOutcomes] = useState<LearningOutcome[]>([]);
  
  // Step 3 Data: Structure Skeleton
  const [structure, setStructure] = useState<DayPlan[]>([]);
  
  // Step 4 Data: Ice Breaker Options Map (DayIndex -> Options)
  const [iceBreakerOptions, setIceBreakerOptions] = useState<Record<number, IceBreaker[]>>({});
  
  // Final Result
  const [coursePlan, setCoursePlan] = useState<CoursePlan | null>(null);

  // --- DB Operations ---
  const loadSavedList = async () => {
    try {
      const list = await getAllCourses();
      setSavedCourses(list);
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!coursePlan) return;
    try {
      await saveCourseToDB(coursePlan);
      alert("Course saved successfully!");
      loadSavedList();
    } catch (e) { alert("Failed to save"); }
  };

  const handleLoad = (saved: SavedCourse) => {
    setBasics(saved.basics);
    setOutcomes(saved.outcomes);
    setStructure(saved.schedule.map(d => ({...d, modules: d.modules.map(m => ({...m, subModules: [], methodology: '', resources: ''})) }))); // Approximate structure
    setCoursePlan(saved); // Directly go to final view
    setStep(5);
    setMaxStepReached(5);
    setShowSavedMenu(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(confirm("Delete this course?")) {
      await deleteCourse(id);
      loadSavedList();
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.basics && parsed.schedule) {
          handleLoad(parsed);
        } else {
          alert("Invalid file format");
        }
      } catch (err) { alert("Error parsing JSON"); }
    };
    reader.readAsText(file);
  };

  // --- Navigation & Flow ---

  const advanceStep = (nextStep: number) => {
    setStep(nextStep);
    if (nextStep > maxStepReached) {
      setMaxStepReached(nextStep);
    }
  };

  // --- Handlers ---

  // Step 1 -> 2
  const generateSuggestedOutcomes = async () => {
    if (!basics.courseTitle) { setError("Enter title"); return; }
    setError(null); setStatus(GenerationStatus.GENERATING_OUTCOMES); setLoadingMsg("Drafting simple English outcomes...");
    try {
      const res = await generateOutcomes(basics);
      setOutcomes(res);
      advanceStep(2);
    } catch (err) { setError("Failed to generate outcomes"); setOutcomes([{id:'1', text:''}]); advanceStep(2); }
    finally { setStatus(GenerationStatus.IDLE); }
  };

  // Step 2 -> 3
  const generateStructure = async () => {
    if (outcomes.length < 3) { setError("Need at least 3 outcomes"); return; }
    setError(null); setStatus(GenerationStatus.GENERATING_STRUCTURE); setLoadingMsg("Outlining course modules...");
    try {
      const res = await generateCourseStructure(basics, outcomes);
      setStructure(res);
      advanceStep(3);
    } catch (err) { setError("Failed to outline structure"); }
    finally { setStatus(GenerationStatus.IDLE); }
  };

  // Step 3 Logic: Modify Structure
  const addModule = (dayIndex: number) => {
    const newStruct = [...structure];
    newStruct[dayIndex].modules.push({
      id: `new-${Date.now()}`, title: "New Module", duration: "1 hour",
      subModules: [], methodology: "", resources: ""
    });
    setStructure(newStruct);
  };
  
  const updateModuleTitle = (dayIndex: number, modIndex: number, val: string) => {
    const newStruct = [...structure];
    newStruct[dayIndex].modules[modIndex].title = val;
    setStructure(newStruct);
  };

  const removeModule = (dayIndex: number, modIndex: number) => {
    const newStruct = [...structure];
    newStruct[dayIndex].modules.splice(modIndex, 1);
    setStructure(newStruct);
  };

  // Step 3 -> 4
  const prepareIceBreakers = async () => {
    // Check if structure changed significantly? 
    // Simply proceed. If they modified Step 3, they will land in Step 4.
    advanceStep(4);
    // Generate options for Day 1 immediately if not present
    if (!iceBreakerOptions[0]) {
      loadIceBreakerOptions(1, 0);
    }
  };

  const loadIceBreakerOptions = async (dayNum: number, dayIndex: number) => {
    setStatus(GenerationStatus.GENERATING_ICEBREAKERS); setLoadingMsg(`Thinking of fun ideas for Day ${dayNum}...`);
    try {
      const opts = await generateIceBreakerOptions(dayNum);
      setIceBreakerOptions(prev => ({ ...prev, [dayIndex]: opts }));
    } catch (e) { console.error(e); }
    finally { setStatus(GenerationStatus.IDLE); }
  };

  const selectIceBreaker = (dayIndex: number, option: IceBreaker) => {
    const newStruct = [...structure];
    newStruct[dayIndex].iceBreaker = option;
    setStructure(newStruct);
  };

  // Step 4 -> 5
  const generateFinal = async () => {
    // Approval Gate: If coursePlan exists, we are overwriting it.
    setError(null); setStatus(GenerationStatus.GENERATING_PLAN); setLoadingMsg("Developing detailed content...");
    try {
      const finalSchedule = await generateFinalPlanContent(basics, outcomes, structure, (msg) => setLoadingMsg(msg));
      setCoursePlan({ basics, outcomes, schedule: finalSchedule });
      advanceStep(5);
    } catch (e) { setError("Failed to generate final content"); }
    finally { setStatus(GenerationStatus.IDLE); }
  };

  const handleRefine = async (currentText: string, context: string, callback: (newText: string) => void) => {
    if (!currentText) return;
    setIsRefining(true);
    try {
      const res = await refineContent(currentText, context);
      callback(res);
    } catch (err) { console.error(err); }
    finally { setIsRefining(false); }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Navbar */}
      <nav className="bg-orange-600 text-white shadow-md p-4 no-print sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setStep(1)}>
            <span className="text-2xl font-bold">MY-TTT</span>
            <span className="text-sm bg-orange-700 px-2 py-1 rounded hidden sm:inline">Course Builder</span>
          </div>
          <div className="flex items-center space-x-3 text-sm">
             <button onClick={() => { loadSavedList(); setShowSavedMenu(!showSavedMenu); }} className="hover:bg-orange-700 px-3 py-1 rounded">
               Saved Courses
             </button>
             {step === 5 && (
               <>
                 <button onClick={() => coursePlan && exportToJSON(coursePlan)} className="hover:bg-orange-700 px-3 py-1 rounded">Export JSON</button>
                 <button onClick={() => coursePlan && exportToMarkdown(coursePlan)} className="hover:bg-orange-700 px-3 py-1 rounded">Export MD</button>
                 <button onClick={handleSave} className="bg-white text-orange-600 px-3 py-1 rounded font-bold hover:bg-gray-100">Save</button>
               </>
             )}
          </div>
        </div>
        
        {/* Saved Courses Drawer */}
        {showSavedMenu && (
          <div className="absolute top-16 right-4 w-80 bg-white text-gray-900 shadow-xl rounded-lg border p-4 z-50">
             <div className="flex justify-between items-center mb-3">
               <h3 className="font-bold">Your Saved Courses</h3>
               <label className="text-xs text-blue-600 cursor-pointer hover:underline">
                 Import JSON <input type="file" accept=".json" className="hidden" onChange={handleImport} />
               </label>
             </div>
             {savedCourses.length === 0 ? <p className="text-sm text-gray-500">No saved courses.</p> : (
               <ul className="max-h-60 overflow-y-auto space-y-2">
                 {savedCourses.map(c => (
                   <li key={c.id} className="flex justify-between items-center p-2 hover:bg-gray-100 rounded text-sm cursor-pointer" onClick={() => handleLoad(c)}>
                      <div className="truncate w-48 font-medium">{c.basics.courseTitle || "Untitled"}</div>
                      <button onClick={(e) => handleDelete(c.id!, e)} className="text-red-500 px-2">&times;</button>
                   </li>
                 ))}
               </ul>
             )}
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-8 max-w-7xl mx-auto w-full">
        
        {/* Progress Bar */}
        <div className="mb-8 no-print">
            <div className="flex items-center justify-center space-x-2 text-xs font-bold text-gray-500">
              {[
                { n: 1, label: "Basics" },
                { n: 2, label: "Outcomes" },
                { n: 3, label: "Structure" },
                { n: 4, label: "Ice Breakers" },
                { n: 5, label: "Plan" }
              ].map((s, idx) => (
                <React.Fragment key={s.n}>
                  {idx > 0 && <div className="w-4 h-0.5 bg-gray-300"></div>}
                  <button 
                    onClick={() => { if (s.n <= maxStepReached) setStep(s.n); }}
                    disabled={s.n > maxStepReached}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full transition-colors ${
                      step === s.n ? 'bg-orange-500 text-white shadow-md' : 
                      s.n <= maxStepReached ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 cursor-pointer' : 
                      'bg-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {s.n < step ? <CheckIcon /> : <span>{s.n}.</span>} 
                    {s.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
        </div>

        {/* --- Step 1: Basics --- */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Start New Course</h2>
            <div className="space-y-4">
              <input type="text" name="trainerName" value={basics.trainerName} onChange={(e) => setBasics({...basics, trainerName: e.target.value})} className="w-full border rounded p-2 bg-white text-gray-900" placeholder="Trainer Name" />
              <input type="text" name="courseTitle" value={basics.courseTitle} onChange={(e) => setBasics({...basics, courseTitle: e.target.value})} className="w-full border rounded p-2 bg-white text-gray-900" placeholder="Course Title (e.g. Effective Leadership)" />
              <div className="grid grid-cols-2 gap-4">
                <input type="text" name="duration" value={basics.duration} onChange={(e) => setBasics({...basics, duration: e.target.value})} className="w-full border rounded p-2 bg-white text-gray-900" placeholder="Duration (e.g. 2 Days)" />
                <input type="text" name="location" value={basics.location} onChange={(e) => setBasics({...basics, location: e.target.value})} className="w-full border rounded p-2 bg-white text-gray-900" placeholder="Location" />
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              {maxStepReached > 1 ? (
                <button onClick={() => setStep(2)} className="px-4 py-2 border rounded hover:bg-gray-50 mr-2 text-gray-600">Go to Step 2</button>
              ) : null}
              <button onClick={generateSuggestedOutcomes} disabled={status !== GenerationStatus.IDLE} className="flex items-center px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
                {status === GenerationStatus.GENERATING_OUTCOMES ? <><Spinner /> Thinking...</> : 'Next: Learning Outcomes'}
              </button>
            </div>
          </div>
        )}

        {/* --- Step 2: Outcomes --- */}
        {step === 2 && (
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-3xl mx-auto animate-fade-in">
            <h2 className="text-2xl font-bold mb-2 text-gray-800">Learning Outcomes</h2>
            <p className="text-gray-600 mb-6 text-sm">Review (Simple English). At least 3 required.</p>
            <div className="space-y-3">
              {outcomes.map((o, idx) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="font-bold w-6 text-gray-400">{idx+1}.</span>
                  <input type="text" value={o.text} onChange={(e) => setOutcomes(outcomes.map(x => x.id === o.id ? {...x, text: e.target.value} : x))} className="flex-grow border rounded p-2 bg-white text-gray-900" />
                  <button onClick={() => setOutcomes(outcomes.filter(x => x.id !== o.id))} className="text-red-500">&times;</button>
                </div>
              ))}
              <button onClick={() => setOutcomes([...outcomes, {id: Date.now().toString(), text: ''}])} className="text-orange-600 text-sm font-bold">+ Add Outcome</button>
            </div>
            <div className="mt-8 flex justify-between">
              <button onClick={() => setStep(1)} className="text-gray-600">Back</button>
              <div className="flex gap-2">
                 {maxStepReached > 2 && <button onClick={() => setStep(3)} className="px-4 py-2 border rounded hover:bg-gray-50 text-gray-600">Go to Structure</button>}
                 <button onClick={generateStructure} disabled={status !== GenerationStatus.IDLE} className="flex items-center px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
                    {status === GenerationStatus.GENERATING_STRUCTURE ? <><Spinner /> Outlining...</> : (maxStepReached > 2 ? 'Regenerate Structure' : 'Next: Module Structure')}
                 </button>
              </div>
            </div>
          </div>
        )}

        {/* --- Step 3: Structure --- */}
        {step === 3 && (
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto animate-fade-in">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Refine Module Structure</h2>
            <p className="text-gray-600 text-sm mb-6">These titles will be used to generate the detailed content.</p>
            
            <div className="space-y-6">
              {structure.map((day, dayIdx) => (
                <div key={dayIdx} className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-bold text-lg mb-3 text-orange-700">Day {day.dayNumber}</h3>
                  <div className="space-y-2">
                    {day.modules.map((mod, modIdx) => (
                      <div key={mod.id} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-16">Module {modIdx+1}</span>
                        <input type="text" value={mod.title} onChange={(e) => updateModuleTitle(dayIdx, modIdx, e.target.value)} className="flex-grow border rounded p-2 text-sm bg-white text-gray-900" placeholder="Module Title" />
                        <input type="text" value={mod.duration} onChange={(e) => {
                             const newS = [...structure]; newS[dayIdx].modules[modIdx].duration = e.target.value; setStructure(newS);
                        }} className="w-24 border rounded p-2 text-sm bg-white text-gray-900" placeholder="Duration" />
                        <button onClick={() => removeModule(dayIdx, modIdx)} className="text-red-500 hover:text-red-700 px-2">&times;</button>
                      </div>
                    ))}
                    <button onClick={() => addModule(dayIdx)} className="text-sm text-blue-600 hover:underline pl-16 mt-2">+ Add Module</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-between">
              <button onClick={() => setStep(2)} className="text-gray-600">Back</button>
              <div className="flex gap-2">
                 {maxStepReached > 3 && <button onClick={() => setStep(4)} className="px-4 py-2 border rounded hover:bg-gray-50 text-gray-600">Go to Ice Breakers</button>}
                 <button onClick={prepareIceBreakers} className="flex items-center px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 shadow">
                   Next: Select Ice Breakers
                 </button>
              </div>
            </div>
          </div>
        )}

        {/* --- Step 4: Ice Breakers --- */}
        {step === 4 && (
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto animate-fade-in">
             <h2 className="text-2xl font-bold mb-4 text-gray-800">Select Ice Breakers</h2>
             <p className="text-gray-600 text-sm mb-6">Choose one energizer for each day to wake up your audience.</p>

             {structure.map((day, dayIdx) => (
               <div key={dayIdx} className="mb-8">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Day {day.dayNumber}</h3>
                    <button onClick={() => loadIceBreakerOptions(day.dayNumber, dayIdx)} disabled={status === GenerationStatus.GENERATING_ICEBREAKERS} className="text-sm text-orange-600 hover:underline">
                      {status === GenerationStatus.GENERATING_ICEBREAKERS ? 'Generating...' : 'Refresh Ideas'}
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   {(iceBreakerOptions[dayIdx] || []).map((opt, i) => (
                     <div 
                       key={i} 
                       onClick={() => selectIceBreaker(dayIdx, opt)}
                       className={`border rounded-lg p-4 cursor-pointer transition hover:shadow-md ${day.iceBreaker.title === opt.title ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200' : 'border-gray-200'}`}
                     >
                        <h4 className="font-bold text-sm mb-2">{opt.title}</h4>
                        <p className="text-xs text-gray-600 mb-2 line-clamp-3">{opt.description}</p>
                        <span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-700">{opt.duration}</span>
                     </div>
                   ))}
                   {(iceBreakerOptions[dayIdx] || []).length === 0 && (
                     <div className="col-span-3 text-center py-8 text-gray-400 italic">No options loaded. Click refresh.</div>
                   )}
                 </div>
                 {day.iceBreaker.title && (
                    <div className="mt-2 text-sm text-green-700 font-medium">Selected: {day.iceBreaker.title}</div>
                 )}
               </div>
             ))}

             <div className="mt-8 flex justify-between">
              <button onClick={() => setStep(3)} className="text-gray-600">Back</button>
              <div className="flex gap-2">
                 {maxStepReached > 4 && <button onClick={() => setStep(5)} className="px-4 py-2 border rounded hover:bg-gray-50 text-gray-600">Go to Final Plan</button>}
                 <button onClick={generateFinal} disabled={status !== GenerationStatus.IDLE} className="flex items-center px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 shadow disabled:opacity-50">
                    {status === GenerationStatus.GENERATING_PLAN ? <><Spinner /> {loadingMsg}</> : (coursePlan ? 'Regenerate Full Content' : 'Generate Full Content')}
                 </button>
              </div>
            </div>
          </div>
        )}

        {/* --- Step 5: Final Result --- */}
        {step === 5 && coursePlan && (
          <div className="animate-fade-in">
             <div className="flex justify-between items-center mb-6 no-print">
                <div>
                   <h2 className="text-2xl font-bold text-gray-800">Final Session Plan</h2>
                   <p className="text-sm text-gray-500">Edit any cell directly or use the Magic Wand to refine with AI.</p>
                </div>
                <div className="flex gap-2">
                   <button onClick={() => setStep(3)} className="px-3 py-1 border rounded bg-white hover:bg-gray-50">Edit Structure</button>
                </div>
             </div>

             <SessionPlanTable 
                plan={coursePlan} 
                onUpdatePlan={setCoursePlan}
                onRefine={handleRefine}
                isRefining={isRefining}
             />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
