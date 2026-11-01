import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

/**
 * ClassyDropdown
 * A premium, mobile-first responsive select/dropdown component.
 * On mobile (<768px): Opens as an elegant in-app Bottom Sheet modal (never pops out of screen!).
 * On desktop (>=768px): Opens as a sleek, anchored dropdown menu.
 * Fully supports grouped options, search filtering, badges, and dark/light modes.
 */
export default function ClassyDropdown({
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Select option...',
  icon = null,
  className = '',
  disabled = false,
  title = '',
  searchable = undefined, // auto-detect if > 8 items unless explicitly set
  renderNativeSr = true
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Normalize options into groups
  // Format supported:
  // 1) Flat array: [{ value, label, count?, badge?, group? }]
  // 2) Group array: [{ group: 'Header', items: [...] }]
  const normalizedGroups = useMemo(() => {
    if (!Array.isArray(options) || options.length === 0) return [];

    // Check if already in { group, items } format
    if (options[0] && Array.isArray(options[0].items)) {
      return options;
    }

    // Otherwise group by item.group (or '' for ungrouped)
    const groupsMap = new Map();
    groupsMap.set('', []); // default ungrouped

    options.forEach((opt) => {
      const item = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const grp = item.group || '';
      if (!groupsMap.has(grp)) {
        groupsMap.set(grp, []);
      }
      groupsMap.get(grp).push(item);
    });

    const result = [];
    // Ungrouped first
    const ungrouped = groupsMap.get('');
    if (ungrouped && ungrouped.length > 0) {
      result.push({ group: '', items: ungrouped });
    }
    // Other groups
    groupsMap.forEach((items, grp) => {
      if (grp !== '' && items.length > 0) {
        result.push({ group: grp, items });
      }
    });

    return result;
  }, [options]);

  // Total items count
  const totalItemsCount = useMemo(() => {
    return normalizedGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [normalizedGroups]);

  // Auto-searchable if > 8 items
  const isSearchable = searchable !== undefined ? searchable : totalItemsCount > 8;

  // Filter groups based on search term
  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return normalizedGroups;
    const term = searchTerm.toLowerCase().trim();

    return normalizedGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            (item.label && item.label.toLowerCase().includes(term)) ||
            (item.value && String(item.value).toLowerCase().includes(term)) ||
            (item.group && item.group.toLowerCase().includes(term))
        )
      }))
      .filter((g) => g.items.length > 0);
  }, [normalizedGroups, searchTerm]);

  // Selected item label
  const selectedItem = useMemo(() => {
    for (const g of normalizedGroups) {
      const found = g.items.find((item) => String(item.value) === String(value));
      if (found) return found;
    }
    return null;
  }, [normalizedGroups, value]);

  const displayLabel = selectedItem ? selectedItem.label : placeholder;

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      if (isSearchable) {
        setTimeout(() => {
          if (searchInputRef.current) searchInputRef.current.focus();
        }, 120);
      }
    }
  }, [isOpen, isSearchable]);

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isMobile]);

  // Prevent background scroll when mobile sheet is open
  useEffect(() => {
    if (isOpen && isMobile) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen, isMobile]);

  const handleSelect = (val) => {
    if (onChange) {
      onChange(val);
    }
    setIsOpen(false);
  };

  const modalTitle = title || (placeholder !== 'Select option...' ? placeholder : 'Select Option');

  return (
    <div className={`classy-dropdown-root ${className} ${disabled ? 'is-disabled' : ''}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={id ? `${id}-btn` : undefined}
        className={`classy-dropdown-trigger ${isOpen ? 'is-open' : ''} ${selectedItem ? 'has-value' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {icon && <span className="classy-dropdown-icon">{icon}</span>}
        <span className="classy-dropdown-label" title={typeof displayLabel === 'string' ? displayLabel : ''}>
          {displayLabel}
        </span>
        <span className="classy-dropdown-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Hidden native select for form accessibility & test selectors */}
      {renderNativeSr && (
        <select
          id={id}
          className="native-sr-only"
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
        >
          {normalizedGroups.map((g, gIdx) =>
            g.group ? (
              <optgroup key={`g-${gIdx}`} label={g.group}>
                {g.items.map((it) => (
                  <option key={String(it.value)} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              g.items.map((it) => (
                <option key={String(it.value)} value={it.value}>
                  {it.label}
                </option>
              ))
            )
          )}
        </select>
      )}

      {/* Dropdown Menu / Bottom Sheet */}
      {isOpen && (
        isMobile ? (
          // Mobile: Bottom Sheet Portal into body
          createPortal(
            <div className="classy-sheet-backdrop" onClick={() => setIsOpen(false)}>
              <div
                className="classy-sheet-container"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                {/* Drag Handle Bar */}
                <div className="classy-sheet-handle-bar">
                  <div className="classy-sheet-handle" />
                </div>

                {/* Sheet Header */}
                <div className="classy-sheet-header">
                  <div className="classy-sheet-title-col">
                    <h4 className="classy-sheet-title">{modalTitle}</h4>
                    <span className="classy-sheet-count">{totalItemsCount} options</span>
                  </div>
                  <button
                    type="button"
                    className="classy-sheet-close-btn"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Search Bar if items > 8 */}
                {isSearchable && (
                  <div className="classy-sheet-search-wrap">
                    <svg className="classy-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="classy-search-input"
                      placeholder="Search options..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        className="classy-search-clear"
                        onClick={() => setSearchTerm('')}
                        aria-label="Clear search"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}

                {/* Option List */}
                <div className="classy-sheet-list" role="listbox">
                  {filteredGroups.length === 0 ? (
                    <div className="classy-empty-state">No matching options found</div>
                  ) : (
                    filteredGroups.map((g, gIdx) => (
                      <div key={`sheet-g-${gIdx}`} className="classy-group-block">
                        {g.group && <div className="classy-group-header">{g.group}</div>}
                        {g.items.map((item) => {
                          const isSelected = String(item.value) === String(value);
                          return (
                            <button
                              key={`sheet-it-${item.value}`}
                              type="button"
                              className={`classy-option-item ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => handleSelect(item.value)}
                              role="option"
                              aria-selected={isSelected}
                            >
                              <div className="classy-option-content">
                                <span className="classy-option-text">{item.label}</span>
                                {item.badge && <span className="classy-item-badge">{item.badge}</span>}
                              </div>
                              {isSelected && (
                                <span className="classy-check-icon">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        ) : (
          // Desktop: Anchored Dropdown
          <div ref={dropdownRef} className="classy-desktop-dropdown" role="listbox">
            {isSearchable && (
              <div className="classy-desktop-search-wrap">
                <svg className="classy-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="classy-desktop-search-input"
                  placeholder="Filter..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="classy-search-clear"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <div className="classy-desktop-list">
              {filteredGroups.length === 0 ? (
                <div className="classy-empty-state">No matching options</div>
              ) : (
                filteredGroups.map((g, gIdx) => (
                  <div key={`desk-g-${gIdx}`} className="classy-group-block">
                    {g.group && <div className="classy-group-header">{g.group}</div>}
                    {g.items.map((item) => {
                      const isSelected = String(item.value) === String(value);
                      return (
                        <button
                          key={`desk-it-${item.value}`}
                          type="button"
                          className={`classy-option-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => handleSelect(item.value)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="classy-option-content">
                            <span className="classy-option-text">{item.label}</span>
                            {item.badge && <span className="classy-item-badge">{item.badge}</span>}
                          </div>
                          {isSelected && (
                            <span className="classy-check-icon">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
