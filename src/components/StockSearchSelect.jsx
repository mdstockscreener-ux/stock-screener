import { useState, useEffect, useRef, useCallback } from 'react';
import { IconSearch } from './icons';
import { searchEquities } from '../utils/equitySearch';

export default function StockSearchSelect({ value, stockName, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  const displayValue = open ? query : stockName || value || '';

  const runSearch = useCallback((q) => {
    setResults(searchEquities(q));
    setHighlightIndex(-1);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setHighlightIndex(-1);
  }, []);

  const handleSelect = useCallback(
    (item) => {
      onChange({ symbol: item.symbol, name: item.name });
      closeDropdown();
    },
    [onChange, closeDropdown]
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  const handleInputChange = (e) => {
    const next = e.target.value;
    setQuery(next);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(next), 150);
  };

  const handleFocus = () => {
    setOpen(true);
    const initial = stockName || value || '';
    setQuery(initial);
    runSearch(initial);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
      return;
    }

    if (!open || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const index = highlightIndex >= 0 ? highlightIndex : 0;
      handleSelect(results[index]);
    }
  };

  return (
    <div className="stock-search" ref={wrapperRef}>
      <label htmlFor="stock-search-input" className="stock-search-label">
        Stock Name
      </label>
      <div className="stock-search-input-wrap">
        <IconSearch />
        <input
          id="stock-search-input"
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search by company name or symbol"
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="stock-search-dropdown" role="listbox">
          {results.map((item, index) => (
            <li key={`${item.symbol}-${item.series}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlightIndex}
                className={`stock-search-option ${index === highlightIndex ? 'highlighted' : ''}`}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => handleSelect(item)}
              >
                <span className="stock-search-name">{item.name}</span>
                <span className="stock-search-symbol">{item.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="stock-search-empty">No matching stocks found</div>
      )}
    </div>
  );
}
