
import React, { useRef, useEffect } from 'react';
import { CoursePlan, DayPlan, ModuleContent, LearningOutcome } from '../types';

interface Props {
  plan: CoursePlan;
  onUpdatePlan: (newPlan: CoursePlan) => void;
  onRefine: (text: string, context: string, callback: (newText: string) => void) => void;
  isRefining: boolean;
}

// Helper for auto-resizing textarea
const AutoTextArea: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  onRefine?: () => void;
  loading?: boolean;
}> = ({ value, onChange, className, onRefine, loading }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <div className="relative group w-full">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-orange-500 focus:bg-white focus:ring-1 focus:ring-orange-500 rounded p-1 transition-all resize-none overflow-hidden text-gray-900 ${className}`}
        rows={1}
      />
      {onRefine && (
        <button
          onClick={onRefine}
          disabled={loading}
          className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-md rounded-bl-md text-orange-600 hover:text-orange-800 z-10 print:hidden"
          title="Refine with AI"
        >
           {loading ? (
             <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
           ) : (
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
           )}
        </button>
      )}
    </div>
  );
};

const SessionPlanTable: React.FC<Props> = ({ plan, onUpdatePlan, onRefine, isRefining }) => {
  
  // Helpers to update state deeply
  const updateBasics = (field: keyof typeof plan.basics, value: string) => {
    onUpdatePlan({ ...plan, basics: { ...plan.basics, [field]: value } });
  };

  const updateOutcome = (index: number, value: string) => {
    const newOutcomes = [...plan.outcomes];
    newOutcomes[index] = { ...newOutcomes[index], text: value };
    onUpdatePlan({ ...plan, outcomes: newOutcomes });
  };

  const updateDay = (dayIndex: number, updater: (day: DayPlan) => DayPlan) => {
    const newSchedule = [...plan.schedule];
    newSchedule[dayIndex] = updater(newSchedule[dayIndex]);
    onUpdatePlan({ ...plan, schedule: newSchedule });
  };

  const updateModule = (dayIndex: number, modIndex: number, field: keyof ModuleContent, value: any) => {
    updateDay(dayIndex, (day) => {
      const newModules = [...day.modules];
      newModules[modIndex] = { ...newModules[modIndex], [field]: value };
      return { ...day, modules: newModules };
    });
  };

  // Global module counter for continuous numbering (1, 2, 3...)
  let globalModuleCounter = 1;

  return (
    <div className="w-full bg-white shadow-xl p-8 mb-8 print:shadow-none print:p-0">
      {/* Header Info */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center mb-1">
            <strong className="w-24">Name :</strong>
            <input 
              className="flex-grow border-b border-gray-300 hover:border-orange-500 focus:outline-none focus:border-orange-600 bg-transparent py-1 px-2 text-gray-900"
              value={plan.basics.trainerName} 
              onChange={(e) => updateBasics('trainerName', e.target.value)}
            />
          </div>
          <div className="flex items-center mb-1">
            <strong className="w-24">Title :</strong>
            <input 
              className="flex-grow border-b border-gray-300 hover:border-orange-500 focus:outline-none focus:border-orange-600 bg-transparent py-1 px-2 text-gray-900"
              value={plan.basics.courseTitle} 
              onChange={(e) => updateBasics('courseTitle', e.target.value)}
            />
          </div>
          <div className="flex items-center mb-1">
            <strong className="w-24">Duration :</strong>
            <input 
              className="flex-grow border-b border-gray-300 hover:border-orange-500 focus:outline-none focus:border-orange-600 bg-transparent py-1 px-2 text-gray-900"
              value={plan.basics.duration} 
              onChange={(e) => updateBasics('duration', e.target.value)}
            />
          </div>
          <div className="flex items-center mb-1">
            <strong className="w-24">Location :</strong>
            <input 
              className="flex-grow border-b border-gray-300 hover:border-orange-500 focus:outline-none focus:border-orange-600 bg-transparent py-1 px-2 text-gray-900"
              value={plan.basics.location} 
              onChange={(e) => updateBasics('location', e.target.value)}
            />
          </div>
        </div>
        <div>
          <p className="font-bold mb-1">Learning Outcome - At the end of this session, all trainees be able to:</p>
          <div className="space-y-1">
            {plan.outcomes.map((lo, idx) => (
              <div key={idx} className="flex items-start">
                <span className="mr-2 text-sm pt-1">{idx + 1}.</span>
                <AutoTextArea 
                   value={lo.text} 
                   onChange={(val) => updateOutcome(idx, val)}
                   className="text-sm border-b border-dotted border-gray-300"
                   onRefine={() => onRefine(lo.text, "Learning Outcome", (val) => updateOutcome(idx, val))}
                   loading={isRefining}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {plan.schedule.map((day, dayIdx) => (
        <div key={dayIdx} className={`mb-10 ${dayIdx > 0 ? 'print-break-before' : ''}`}>
          
          {/* Day Header */}
          {plan.schedule.length > 1 && (
             <h2 className="text-xl font-bold mb-2 text-gray-800 border-b-2 border-orange-500 pb-1">
              Day {day.dayNumber}
            </h2>
          )}

          {/* Table */}
          <div className="w-full border-2 border-gray-300">
            <div className="bg-orange-400 text-center font-bold py-2 border-b border-gray-300 text-black">
              Session Plan
            </div>
            <div className="grid grid-cols-12 bg-white text-sm font-semibold border-b border-gray-300 text-center items-center">
              <div className="col-span-3 p-2 border-r border-gray-300">Learning Points / Contents</div>
              <div className="col-span-2 p-2 border-r border-gray-300">Resources</div>
              <div className="col-span-5 p-2 border-r border-gray-300">Method / Learning / Activities</div>
              <div className="col-span-1 p-2 border-r border-gray-300">Duration</div>
              <div className="col-span-1 p-2">Slide No.</div>
            </div>

            {/* Recap (Day 2+) */}
            {day.recap && (
              <div className="grid grid-cols-12 text-sm border-b border-gray-300">
                <div className="col-span-3 p-3 border-r border-gray-300 font-bold">
                  Day {day.dayNumber} Start: Recap
                </div>
                <div className="col-span-2 p-3 border-r border-gray-300 text-center">PPT / Flipchart</div>
                <div className="col-span-5 p-3 border-r border-gray-300 whitespace-pre-line relative">
                   <div className="mb-2 text-gray-500 text-xs">Lecture: Briefly recap Day {day.dayNumber - 1}</div>
                   <div className="flex gap-1">
                      <span className="font-bold text-xs pt-1">Activity:</span>
                      <AutoTextArea
                        value={day.recap}
                        onChange={(val) => updateDay(dayIdx, d => ({ ...d, recap: val }))}
                        onRefine={() => onRefine(day.recap || '', "Recap Activity", (val) => updateDay(dayIdx, d => ({ ...d, recap: val })))}
                        loading={isRefining}
                      />
                   </div>
                </div>
                <div className="col-span-1 p-3 border-r border-gray-300 text-center">10 mins</div>
                <div className="col-span-1 p-3 text-center">-</div>
              </div>
            )}

            {/* Ice Breaker */}
            <div className="grid grid-cols-12 text-sm border-b border-gray-300">
              <div className="col-span-3 p-3 border-r border-gray-300">
                <strong>Introduction & Ice Breaker</strong>
                <ul className="list-disc list-inside mt-1 text-gray-600 mb-2">
                  <li>Trainers Profile</li>
                </ul>
                <div className="pl-4 border-l-2 border-orange-100">
                   <AutoTextArea
                      value={day.iceBreaker.title}
                      onChange={(val) => updateDay(dayIdx, d => ({ ...d, iceBreaker: { ...d.iceBreaker, title: val } }))}
                      className="font-semibold text-gray-800"
                   />
                </div>
                <ul className="list-disc list-inside mt-2 text-gray-600">
                  <li>Learning Outcome</li>
                  <li>Contents Mapping</li>
                </ul>
              </div>
              <div className="col-span-2 p-3 border-r border-gray-300 text-center flex items-center justify-center">
                PPT
              </div>
              <div className="col-span-5 p-3 border-r border-gray-300">
                <p className="text-gray-500 mb-2 text-xs">Lecture: Brief introduction of trainer and outcomes.</p>
                <div className="flex gap-1">
                    <span className="font-bold text-xs pt-1">Activity:</span>
                    <AutoTextArea
                      value={day.iceBreaker.description}
                      onChange={(val) => updateDay(dayIdx, d => ({ ...d, iceBreaker: { ...d.iceBreaker, description: val } }))}
                      onRefine={() => onRefine(day.iceBreaker.description, "Ice Breaker Activity Description", (val) => updateDay(dayIdx, d => ({ ...d, iceBreaker: { ...d.iceBreaker, description: val } })))}
                      loading={isRefining}
                      className="min-h-[60px]"
                    />
                </div>
              </div>
              <div className="col-span-1 p-3 border-r border-gray-300 text-center flex items-center justify-center">
                <AutoTextArea
                  value={day.iceBreaker.duration}
                  onChange={(val) => updateDay(dayIdx, d => ({ ...d, iceBreaker: { ...d.iceBreaker, duration: val } }))}
                  className="text-center"
                />
              </div>
              <div className="col-span-1 p-3 text-center flex items-center justify-center">1-5</div>
            </div>

            {/* Modules */}
            {day.modules.map((mod, mIdx) => {
              const currentModuleNum = globalModuleCounter++;
              
              return (
              <div key={mod.id} className="grid grid-cols-12 text-sm border-b border-gray-300">
                <div className="col-span-3 p-3 border-r border-gray-300">
                  <div className="flex items-start gap-1 mb-2">
                    <span className="font-bold whitespace-nowrap">{currentModuleNum}.</span>
                    <AutoTextArea
                      value={mod.title}
                      onChange={(val) => updateModule(dayIdx, mIdx, 'title', val)}
                      className="font-bold"
                    />
                  </div>
                  
                  <div className="text-xs text-gray-400 mb-1">Sub-modules:</div>
                  <div className="space-y-1">
                    {mod.subModules.map((sub, sIdx) => (
                      <div key={sIdx} className="flex items-start gap-1">
                        <span className="text-gray-500 text-xs font-mono pt-1">{currentModuleNum}.{sIdx+1}</span>
                        <AutoTextArea
                          value={sub}
                          onChange={(val) => {
                             const newSubs = [...mod.subModules];
                             newSubs[sIdx] = val;
                             updateModule(dayIdx, mIdx, 'subModules', newSubs);
                          }}
                          className="text-gray-700"
                        />
                         <button 
                            onClick={() => {
                               const newSubs = mod.subModules.filter((_, i) => i !== sIdx);
                               updateModule(dayIdx, mIdx, 'subModules', newSubs);
                            }}
                            className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 px-1 print:hidden"
                         >&times;</button>
                      </div>
                    ))}
                    <button 
                      onClick={() => updateModule(dayIdx, mIdx, 'subModules', [...mod.subModules, 'New Sub-module'])}
                      className="text-xs text-blue-500 hover:text-blue-700 print:hidden ml-6"
                    >+ Add Item</button>
                  </div>
                </div>
                <div className="col-span-2 p-3 border-r border-gray-300 text-center flex items-center justify-center">
                  <AutoTextArea
                    value={mod.resources}
                    onChange={(val) => updateModule(dayIdx, mIdx, 'resources', val)}
                    className="text-center h-full flex items-center justify-center"
                  />
                </div>
                <div className="col-span-5 p-3 border-r border-gray-300">
                  <AutoTextArea
                    value={mod.methodology}
                    onChange={(val) => updateModule(dayIdx, mIdx, 'methodology', val)}
                    onRefine={() => onRefine(mod.methodology, "Training Module Methodology", (val) => updateModule(dayIdx, mIdx, 'methodology', val))}
                    loading={isRefining}
                    className="whitespace-pre-line min-h-[80px]"
                  />
                </div>
                <div className="col-span-1 p-3 border-r border-gray-300 text-center flex items-center justify-center">
                   <AutoTextArea
                    value={mod.duration}
                    onChange={(val) => updateModule(dayIdx, mIdx, 'duration', val)}
                    className="text-center"
                  />
                </div>
                <div className="col-span-1 p-3 text-center flex items-center justify-center">
                   <AutoTextArea
                    value={mod.slideNumbers || ''}
                    onChange={(val) => updateModule(dayIdx, mIdx, 'slideNumbers', val)}
                    className="text-center"
                  />
                </div>
              </div>
            )})}

            {/* Summary & Review */}
            <div className="grid grid-cols-12 text-sm">
              <div className="col-span-3 p-3 border-r border-gray-300">
                <strong>Summary & Review Outcome</strong>
              </div>
              <div className="col-span-2 p-3 border-r border-gray-300 text-center flex items-center justify-center">
                PPT
              </div>
              <div className="col-span-5 p-3 border-r border-gray-300">
                <div className="flex gap-1 mb-2">
                   <span className="font-bold text-xs pt-1">Lecture:</span>
                   <AutoTextArea
                    value={day.summary}
                    onChange={(val) => updateDay(dayIdx, d => ({ ...d, summary: val }))}
                    onRefine={() => onRefine(day.summary, "Day Summary", (val) => updateDay(dayIdx, d => ({ ...d, summary: val })))}
                    loading={isRefining}
                  />
                </div>
                <div className="font-bold text-xs mt-2 mb-1">Review Questions:</div>
                <AutoTextArea
                  value={day.reviewQuestions.join('\n')}
                  onChange={(val) => updateDay(dayIdx, d => ({ ...d, reviewQuestions: val.split('\n') }))}
                  onRefine={() => onRefine(day.reviewQuestions.join('\n'), "Review Questions", (val) => updateDay(dayIdx, d => ({ ...d, reviewQuestions: val.split('\n') })))}
                  loading={isRefining}
                  className="italic text-gray-600"
                />
              </div>
              <div className="col-span-1 p-3 border-r border-gray-300 text-center flex items-center justify-center">
                15 mins
              </div>
              <div className="col-span-1 p-3 text-center flex items-center justify-center">End</div>
            </div>

          </div>
        </div>
      ))}
    </div>
  );
};

export default SessionPlanTable;
