import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * ClassyDropdown
 * A premium, mobile-first responsive select/dropdown component.
 * - Mobile (<=768px): renders as an in-app bottom sheet (portaled to <body>).
 * - Desktop: renders as a fixed-position popover portaled to <body>, so it is
 *   never clipped by overflow:hidden cards, tables or scroll containers, and
 *   it automatically flips above the trigger when there is not enough room.
 * Supports grouped options, search filtering, badges, full keyboard
 * navigation and dark/light themes.
 */

let scrollLockCount = 0;
function lockBodyScroll() {
  if (scrollLockCount === 0) {
    document.body.dataset.classyScroll = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}
function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = document.body.dataset.classyScroll || '';
    delete document.body.dataset.classyScroll;
  }
}

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
  searchable = undefined,
  renderNativeSr = true
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320, dropUp: false });

  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionRefs = useRef([]);

  // Responsive detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener('change', update) : mq.addListener(update);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', update) : mq.removeListener(update);
    };
  }, []);

  // Normalize options into groups: flat [{value,label}] or [{group, items}]
  const normalizedGroups = useMemo(() => {
    if (!Array.isArray(options) || options.length === 0) return [];
    if (options[0] && Array.isArray(options[0].items)) return options;

    const groupsMap = new Map();
    groupsMap.set('', []);
    options.forEach((opt) => {
      const item = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const grp = item.group || '';
      if (!groupsMap.has(grp)) groupsMap.set(grp, []);
      groupsMap.get(grp).push(item);
    });

    const result = [];
    const ungrouped = groupsMap.get('');
    if (ungrouped && ungrouped.length) result.push({ group: '', items: ungrouped });
    groupsMap.forEach((items, grp) => {
      if (grp !== '' && items.length) result.push({ group: grp, items });
    });
    return result;
  }, [options]);

  const totalItemsCount = useMemo(
    () => normalizedGroups.reduce((acc, g) => acc + g.items.length, 0),
    [normalizedGroups]
  );

  const isSearchable = searchable !== undefined ? searchable : totalItemsCount > 8;

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return normalizedGroups;
    const term = searchTerm.toLowerCase().trim();
    return normalizedGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            String(item.label ?? '').toLowerCase().includes(term) ||
            String(item.value ?? '').toLowerCase().includes(term) ||
            String(item.group ?? '').toLowerCase().includes(term)
        )
      }))
      .filter((g) => g.items.length > 0);
  }, [normalizedGroups, searchTerm]);

  // Flat list of currently visible options, used for keyboard navigation
  const flatOptions = useMemo(
    () => filteredGroups.flatMap((g) => g.items),
    [filteredGroups]
  );

  const selectedItem = useMemo(() => {
    for (const g of normalizedGroups) {
      const found = g.items.find((item) => String(item.value) === String(value));
      if (found) return found;
    }
    return null;
  }, [normalizedGroups, value]);

  const displayLabel = selectedItem ? selectedItem.label : placeholder;
  const modalTitle = title || (placeholder !== 'Select option...' ? placeholder : 'Select Option');

  // Compute fixed popover coordinates from the trigger rectangle
  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - rect.bottom - gap - 8;
    const above = rect.top - gap - 8;
    const dropUp = below < 200 && above > below;
    const room = dropUp ? above : below;
    const width = Math.max(rect.width, 200);
    setPosition({
      top: dropUp ? Math.max(8, rect.top - Math.min(320, room) - gap) : rect.bottom + gap,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(160, Math.min(320, room)),
      dropUp
    });
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setSearchTerm('');
    setActiveIndex(-1);
    computePosition();
    setIsOpen(true);
  }, [disabled, computePosition]);

  const close = useCallback(() => setIsOpen(false), []);

  const handleSelect = useCallback(
    (val) => {
      if (onChange) onChange(val);
      close();
      if (triggerRef.current) triggerRef.current.focus();
    },
    [onChange, close]
  );

  // Focus search field whenever the menu opens
  useEffect(() => {
    if (!isOpen || !isSearchable) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [isOpen, isSearchable]);

  // Keep the fixed popover positioned on scroll / resize
  useLayoutEffect(() => {
    if (!isOpen || isMobile) return;
    computePosition();
    window.addEventListener('resize', computePosition);
    window.addEventListener('scroll', computePosition, true);
    return () => {
      window.removeEventListener('resize', computePosition);
      window.removeEventListener('scroll', computePosition, true);
    };
  }, [isOpen, isMobile, computePosition]);

  // Outside click + Escape (works for both the desktop popover and mobile sheet)
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      close();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen, close]);

  // Lock background scroll while the mobile sheet is visible
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen, isMobile]);

  // Reset the active option whenever the visible list changes
  useEffect(() => {
    setActiveIndex((prev) => (prev >= flatOptions.length ? -1 : prev));
  }, [flatOptions.length]);

  // Scroll the active option into view
  useEffect(() => {
    if (activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onListKeyDown = (e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flatOptions.length) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) => {
        const next = prev + dir;
        if (next < 0) return flatOptions.length - 1;
        if (next >= flatOptions.length) return 0;
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = flatOptions[activeIndex];
      if (opt) handleSelect(opt.value);
      else if (flatOptions.length === 1) handleSelect(flatOptions[0].value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(flatOptions.length - 1);
    }
  };

  const renderOption = (item, flatIndex, isMobileSheet) => {
    const isSelected = String(item.value) === String(value);
    const isActive = flatIndex === activeIndex;
    const optionId = `${id || 'dropdown'}-option-${flatIndex}`;
    return (
      <button
        key={`${isMobileSheet ? 'sheet' : 'desk'}-it-${item.value}`}
        ref={(el) => { optionRefs.current[flatIndex] = el; }}
        id={optionId}
        type="button"
        className={`classy-option-item ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''}`}
        onClick={() => handleSelect(item.value)}
        onMouseEnter={() => setActiveIndex(flatIndex)}
        role="option"
        aria-selected={isSelected}
      >
        <div className="classy-option-content">
          <span className="classy-option-text">{item.label}</span>
          {item.badge && <span className="classy-item-badge">{item.badge}</span>}
        </div>
        {isSelected && (
          <span className="classy-check-icon">
            <svg width={isMobileSheet ? 14 : 13} height={isMobileSheet ? 14 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
      </button>
    );
  };

  const renderGroups = (isMobileSheet) => {
    if (filteredGroups.length === 0) {
      return <div className="classy-empty-state">No matching options found</div>;
    }
    let flatIndex = -1;
    return filteredGroups.map((g, gIdx) => (
      <div key={`${isMobileSheet ? 'sheet' : 'desk'}-g-${gIdx}`} className="classy-group-block">
        {g.group && <div className="classy-group-header">{g.group}</div>}
        {g.items.map((item) => {
          flatIndex += 1;
          return renderOption(item, flatIndex, isMobileSheet);
        })}
      </div>
    ));
  };

  return (
    <div className={`classy-dropdown-root ${className} ${disabled ? 'is-disabled' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id ? `${id}-btn` : undefined}
        className={`classy-dropdown-trigger ${isOpen ? 'is-open' : ''} ${selectedItem ? 'has-value' : ''}`}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
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

      {renderNativeSr && (
        <select
          id={id}
          className="native-sr-only"
          value={value ?? ''}
          onChange={(e) => onChange && onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
        >
          {!selectedItem && value != null && <option value={value}>{String(value)}</option>}
          {normalizedGroups.map((g, gIdx) =>
            g.group ? (
              <optgroup key={`g-${gIdx}`} label={g.group}>
                {g.items.map((it) => <option key={String(it.value)} value={it.value}>{it.label}</option>)}
              </optgroup>
            ) : (
              g.items.map((it) => <option key={String(it.value)} value={it.value}>{it.label}</option>)
            )
          )}
        </select>
      )}

      {isOpen && isMobile &&
        createPortal(
          <div className="classy-sheet-backdrop" onClick={close}>
            <div
              className="classy-sheet-container"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={modalTitle}
              onKeyDown={onListKeyDown}
            >
              <div className="classy-sheet-handle-bar"><div className="classy-sheet-handle" /></div>
              <div className="classy-sheet-header">
                <div className="classy-sheet-title-col">
                  <h4 className="classy-sheet-title">{modalTitle}</h4>
                  <span className="classy-sheet-count">{totalItemsCount} options</span>
                </div>
                <button type="button" className="classy-sheet-close-btn" onClick={close} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {isSearchable && (
                <div className="classy-sheet-search-wrap">
                  <svg className="classy-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="classy-search-input"
                    placeholder="Search options..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setActiveIndex(-1); }}
                    onKeyDown={onListKeyDown}
                    autoComplete="off"
                  />
                  {searchTerm && (
                    <button type="button" className="classy-search-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
              <div className="classy-sheet-list" role="listbox" aria-activedescendant={activeIndex >= 0 ? `${id || 'dropdown'}-option-${activeIndex}` : undefined}>
                {renderGroups(true)}
              </div>
            </div>
          </div>,
          document.body
        )}

      {isOpen && !isMobile &&
        createPortal(
          <div
            ref={dropdownRef}
            className={`classy-desktop-dropdown ${position.dropUp ? 'is-dropup' : ''}`}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight
            }}
            role="listbox"
            aria-activedescendant={activeIndex >= 0 ? `${id || 'dropdown'}-option-${activeIndex}` : undefined}
            onKeyDown={onListKeyDown}
          >
            {isSearchable && (
              <div className="classy-desktop-search-wrap">
                <svg className="classy-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="classy-desktop-search-input"
                  placeholder="Filter..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setActiveIndex(-1); }}
                  onKeyDown={onListKeyDown}
                  autoComplete="off"
                />
                {searchTerm && (
                  <button type="button" className="classy-search-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <div className="classy-desktop-list">{renderGroups(false)}</div>
          </div>,
          document.body
        )}
    </div>
  );
}
