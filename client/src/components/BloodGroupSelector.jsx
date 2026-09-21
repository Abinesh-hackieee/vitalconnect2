import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Droplet, Check } from 'lucide-react';

export const NORMAL_BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

export const SPECIAL_BLOOD_TYPES = [
  'A1+',
  'A1-',
  'A2+',
  'A2-',
  'A1B+',
  'A1B-',
  'A2B+',
  'A2B-',
  'Bombay Blood Group (Oh / hh)',
];

export const ALL_BLOOD_GROUPS = [...NORMAL_BLOOD_GROUPS, ...SPECIAL_BLOOD_TYPES];

export default function BloodGroupSelector({
  value = 'O+',
  onChange,
  name = 'bloodGroup',
  id = 'blood-group-selector',
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelectedSpecial = SPECIAL_BLOOD_TYPES.includes(value);
  const [isSpecialExpanded, setIsSpecialExpanded] = useState(isSelectedSpecial);
  const containerRef = useRef(null);

  // Keep special section expanded if a special type is currently active
  useEffect(() => {
    if (SPECIAL_BLOOD_TYPES.includes(value)) {
      setIsSpecialExpanded(true);
    }
  }, [value]);

  // Click outside listener to close dropdown (mouse & touch)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (selectedGroup) => {
    if (disabled) return;
    if (onChange) {
      onChange({
        target: {
          name,
          value: selectedGroup,
        },
      });
    }
    setIsOpen(false);
  };

  const toggleSpecialAccordion = (e) => {
    e.stopPropagation();
    setIsSpecialExpanded((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${isOpen ? 'z-40' : 'z-10'} ${className}`}
      data-testid="blood-group-selector"
    >
      {/* Hidden input for standard form submission */}
      <input type="hidden" name={name} value={value || ''} id={`${id}-hidden`} />

      {/* Main Trigger Button */}
      <button
        type="button"
        id={id}
        data-testid="blood-group-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all bg-slate-50/80 hover:bg-slate-100/90 focus:bg-white focus:outline-none focus:ring-2 focus:ring-vital-500/20 focus:border-vital-500 ${
          isOpen
            ? 'border-vital-500 ring-2 ring-vital-500/20 bg-white shadow-sm'
            : 'border-slate-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center space-x-2.5 truncate">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
              isSelectedSpecial
                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                : 'bg-vital-100 text-vital-700 border border-vital-200'
            }`}
          >
            <Droplet className="w-3.5 h-3.5 fill-current" />
          </div>
          <div className="truncate">
            <span className="font-bold text-slate-800 text-sm">{value || 'Select Blood Group'}</span>
            {isSelectedSpecial && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                Special Type
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-vital-600' : ''
          }`}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Blood Group Selection"
          className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden animate-fadeIn max-h-[380px] overflow-y-auto"
        >
          {/* Category 1: Normal Blood Groups */}
          <div className="p-3 border-b border-slate-100">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 px-1">
              Normal Blood Groups
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {NORMAL_BLOOD_GROUPS.map((group) => {
                const isSelected = value === group;
                return (
                  <button
                    key={group}
                    type="button"
                    data-blood-group={group}
                    data-testid={`blood-group-option-${group}`}
                    onClick={() => handleSelect(group)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold text-center transition-all flex items-center justify-center space-x-1 ${
                      isSelected
                        ? 'bg-vital-600 text-white shadow-sm ring-2 ring-vital-600/30'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60 active:scale-95'
                    }`}
                  >
                    <span>{group}</span>
                    {isSelected && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category 2: Collapsible Dropdown/Accordion - Special Blood Types */}
          <div className="p-3 bg-slate-50/50">
            {/* Collapsible Accordion Header: 🩸 Special Blood Types ▼ */}
            <button
              type="button"
              id="special-blood-types-toggle"
              data-testid="special-blood-types-toggle"
              aria-expanded={isSpecialExpanded}
              aria-controls="special-blood-types-list"
              onClick={toggleSpecialAccordion}
              className="w-full py-2 px-2.5 rounded-xl bg-purple-50/90 hover:bg-purple-100/80 border border-purple-200/90 flex items-center justify-between transition-colors group cursor-pointer"
              title="Click to expand/collapse Special Blood Types"
            >
              <div className="flex items-center space-x-2 text-xs font-extrabold text-purple-900">
                <span className="text-sm">🩸</span>
                <span>Special Blood Types</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-purple-200/80 text-purple-800">
                  9 Types
                </span>
              </div>
              <div
                className="flex items-center space-x-1 text-purple-700 group-hover:text-purple-900 p-0.5"
                data-testid="special-blood-types-arrow"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isSpecialExpanded ? 'rotate-180 text-purple-900' : ''
                  }`}
                />
              </div>
            </button>

            {/* Collapsible Content: Expands / Collapses */}
            {isSpecialExpanded && (
              <div
                id="special-blood-types-list"
                data-testid="special-blood-types-list"
                className="mt-2 space-y-1.5 animate-fadeIn"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {SPECIAL_BLOOD_TYPES.filter(
                    (t) => t !== 'Bombay Blood Group (Oh / hh)'
                  ).map((specialType) => {
                    const isSelected = value === specialType;
                    return (
                      <button
                        key={specialType}
                        type="button"
                        data-blood-group={specialType}
                        data-testid={`special-blood-type-${specialType}`}
                        onClick={() => handleSelect(specialType)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-500/30'
                            : 'bg-white text-slate-700 hover:bg-purple-50/60 hover:text-purple-900 border border-slate-200/70 active:scale-95'
                        }`}
                      >
                        <span className="font-mono">{specialType}</span>
                        {isSelected && <Check className="w-3 h-3 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Bombay Blood Group (Oh / hh) - Dedicated Card */}
                {(() => {
                  const bombay = 'Bombay Blood Group (Oh / hh)';
                  const isSelected = value === bombay;
                  return (
                    <button
                      type="button"
                      data-blood-group={bombay}
                      data-testid="special-blood-type-bombay"
                      onClick={() => handleSelect(bombay)}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-500/30'
                          : 'bg-white text-slate-800 hover:bg-purple-50/60 hover:text-purple-900 border border-purple-200/90 active:scale-95'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-sm">🧬</span>
                        <span className="truncate">{bombay}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0 pl-2">
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-purple-800 text-white'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          Rare
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </div>
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
