import React, { useState, useEffect, useRef } from 'react';

function ComboSelect({ value, onChange, options, unit, min, max }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val !== '') {
      const num = parseInt(val, 10);
      if (num > max) val = String(max);
      if (val.length >= 2 && num < min) val = String(min).padStart(2, '0');
    }
    onChange(val);
  };

  const handleInputBlur = () => {
    if (value === '' || isNaN(parseInt(value, 10))) {
      onChange(String(min).padStart(2, '0'));
    } else {
      onChange(String(value).padStart(2, '0'));
    }
  };

  return (
    <div className="combo-select-container" ref={containerRef}>
      <div className="combo-input-wrapper">
        <input 
          type="text" value={value} onChange={handleInputChange} onBlur={handleInputBlur} onFocus={() => setIsOpen(true)}
          className="combo-text-input" placeholder={String(min).padStart(2, '0')} maxLength={2}
        />
        <span className="combo-unit-label" onClick={() => setIsOpen(!isOpen)}>{unit}</span>
        <span className="combo-arrow-indicator" onClick={() => setIsOpen(!isOpen)}>▼</span>
      </div>
      {isOpen && (
        <ul className="combo-dropdown-list">
          {options.map((opt) => (
            <li key={opt} onClick={(e) => { e.stopPropagation(); onChange(opt); setIsOpen(false); }} className={`combo-dropdown-item ${value === opt ? 'selected' : ''}`}>{opt}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
export default ComboSelect;