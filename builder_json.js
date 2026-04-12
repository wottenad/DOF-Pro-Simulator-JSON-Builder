// 
//  builder_json.js v3.6.3  Phase A+B: Trigger-scoped editing, Revert All, M/L rework  JSON Import/Export + Card UI for DOF Builder
//  Phase 1.2: _updateGenStr hook (fixes color/dir sync), @variable@
//  expansion, card drag-reorder, bidirectional sectioncard focus,
//  1500ms physical flash, strip render verification
//  Phase B: Revert All, filter bar in Target Section, delete control, column-first layout, M/L/Trigger rework
// 

const BUILDER_JSON_VERSION = '1.2.0';
const BUILDER_JSON_BUILD = '2026-03-28a';
window.__DOF_BUILD_INFO = window.__DOF_BUILD_INFO || {};
window.__DOF_BUILD_INFO.builder_json = {
    version: BUILDER_JSON_VERSION,
    build: BUILDER_JSON_BUILD,
    file: 'builder_json.js'
};

const BuilderJSON = {

    //  State 
    importedConfig: null,
    importedToys: [],
    originalSections: null,
    originalSingleSections: null,
    jsonMode: false,
    importFormat: '',
    sectionLayers: {},
    layerWindow: {},
    latchedToys: {},
    activeTimers: [],
    _cssInjected: false,
    _catFilter: 'all',
    _showEmpty: false,
    _activeToyPort: null,   // Issue 4: which toy card owns the display right now
    _cardOrder: null,       // Persisted card order per table (array of portIds)
    _layoutSource: 'default',
    _layoutDirty: false,
    _layoutNote: '',
    _layoutNoteTimer: null,
    _dragSrc: null,         // Currently dragged card portId
    _suppressSync: false,   // Suppresses _onBuilderLayerChanged during section loads
    _inPreview: false,      // True when Builder.layers hold preview data (M/L/trigger fire)
    _origNumLayers: null,   // Stashed NUM_LAYERS when expanded for >6 layer preview
    _activeTrigger: null,   // Currently active trigger filter (e.g. 'S2', 'W45') for render masking
    _userVariables: null,   // Parsed from [Variables DOF] section of INI file
    _stripExtended: false,  // Strip display mode: false=compact (inline), true=extended (fixed-right)
    _stripOnePx: false,     // Vertical strip LED width mode: false=normal, true=1px
    _newEffectPort: null,   // Port ID of card currently in "New Effect" editing mode
    _newEffectTrigger: '',  // Trigger being assigned to the new layer
    _syncActive: false,     // v13.13.25: Sync All  fire triggers across all cards simultaneously
    _cardSyncState: {},     // Persist per-card Sync checkbox state across card rerenders
    _triggerScope: null,    // Array of master indices when trigger active (scoped editing)
    _triggerScopeSection: null, // Section name that owns current trigger scope
    _scopePage: 0,          // Current page within trigger scope
    _tabsPerPage: 10,       // Max tabs shown per page (user-adjustable, 4-12)
    _latchedLoopTimer: null,
    _latchedLoopPort: null,
    _latchedLoopTrigger: null,
    _latchedSelectionOnly: false,
    _triggerLinkMode: false,
    _triggerLinkPort: null,
    _triggerLinkTrigger: null,
    _editTargetPort: null,      // Explicit card port currently bound to Builder edit panel
    _editTargetMasterIdx: null, // Explicit master row index currently bound to Builder controls
    _routeWarnLastKey: '',
    _routeWarnLastTs: 0,
    _routeFallbackLastKey: '',
    _routeFallbackLastTs: 0,
    _origBuilderBuildStripRack: null,
    _builderStripRackHooked: false,
    _supportOverrides: {},
    _supportPanelOpen: false,
    _shapeAlertCache: {},
    _tableBitmapSource: null,
    _bitmapPreviewHold: false,
    _bitmapPreviewLoop: true,
    _bitmapPreviewFrame: 0,
    _bitmapPreviewFrameDirty: false,
    _bitmapPreviewLayerKey: '',
    _bitmapInspectorLive: false,
    _mapUiHooked: false,
    _mapUiRepositionQueued: false,
    _mapDragState: null,
    _timedToyPreviewState: {},
    _beaconPreviewColors: {},
    _dragPrimedPort: null,
    _cardResizeHooked: false,
    _cardResizeState: null,
    _cardHeightPx: 110,
    _cardMaxHeightPx: null,
    _genStrHeightPx: 120,
    _genStrManualHeight: false,
    _genStrResizeState: null,
    _genStrResizeHooked: false,
    _examplePaletteState: null,
    _examplePaletteDragState: null,
    _examplePaletteResizeObserver: null,
    _examplePalettePreviewKey: '',
    _examplePalettePreviewPort: null,
    _examplePalettePreviewTimer: null,
    _preservedDraftRawText: '',

    CATS: {
        mx:       { label:'MX Matrix/Strip', icon:'-', color:'#00bcd4' },
        rgb:      { label:'RGB Toys',        icon:'o', color:'#f5a623' },
        flasher:  { label:'Flashers',        icon:'!', color:'#ff9800' },
        bumper:   { label:'Bumpers',         icon:'*', color:'#e91e63' },
        strobe:   { label:'Strobes',         icon:'◉', color:'#dfe6ee' },
        solenoid: { label:'Solenoids',       icon:'#', color:'#8bc34a' },
        button:   { label:'Buttons/Inputs',  icon:'o', color:'#9c27b0' },
        other:    { label:'Other',           icon:'<>', color:'#607d8b' }
    },

    // 
    //  INIT + HOOKS
    // 
    init() {
        if (!window.Builder) { setTimeout(() => this.init(), 200); return; }
        this._addFileInput();
        this._addBitmapFileInput();
        this._hookBuilder();
        this._injectCSS();
        this._hookMapUi();
        this._loadStripLayoutPreference();
        this._loadCardHeightPreference();
        this._loadGenStrHeightPreference();
        this._hookGenStrResize();
        this._loadExamplePalettePreference();
        this._hookCardResizeUi();
        this._initTriggerKeyNav();
        this._enhanceBuilderNumSteppers();
        this._refreshBitmapUiState({ silent: true });
        console.log('[BuilderJSON v' + BUILDER_JSON_VERSION + '] Ready');
        window.BJSON_VERSION = BUILDER_JSON_VERSION;
    },

    _hookMapUi() {
        if (this._mapUiHooked) return;
        this._mapUiHooked = true;
        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.bj-card-map')) return;
            this._closeAllMapMenus();
        });
        document.addEventListener('scroll', () => this._queueOpenMapMenuReposition(), true);
        window.addEventListener('resize', () => this._queueOpenMapMenuReposition());
        document.addEventListener('pointermove', (e) => {
            if (!this._mapDragState) return;
            const nextLeft = this._mapDragState.startLeft + (e.clientX - this._mapDragState.startX);
            const nextTop = this._mapDragState.startTop + (e.clientY - this._mapDragState.startY);
            const pop = this._mapDragState.pop;
            if (!pop) return;
            pop.style.left = Math.max(8, Math.min(nextLeft, window.innerWidth - pop.offsetWidth - 8)) + 'px';
            pop.style.top = Math.max(8, Math.min(nextTop, window.innerHeight - pop.offsetHeight - 8)) + 'px';
        });
        document.addEventListener('pointerup', () => { this._mapDragState = null; });
        document.addEventListener('mouseup', () => this._clearCardDragPrime());
        document.addEventListener('pointerup', () => this._clearCardDragPrime());
        document.addEventListener('dragend', () => this._clearCardDragPrime(), true);
    },

    _queueOpenMapMenuReposition() {
        if (this._mapUiRepositionQueued) return;
        this._mapUiRepositionQueued = true;
        requestAnimationFrame(() => {
            this._mapUiRepositionQueued = false;
            this._syncOpenMapMenus();
        });
    },

    _syncOpenMapMenus() {
        document.querySelectorAll('.bj-card-map.bj-open').forEach(wrap => this._positionCardMapMenu(wrap));
    },

    _applyStripLayoutMode() {
        const vs = document.getElementById('bjson-vstrips');
        const grid = document.getElementById('bjson-display-grid');
        if (!vs || !grid) return;
        const container = document.querySelector('.dob-container');
        const workspace = document.querySelector('.dob-workspace');
        const toggleBtn = document.getElementById('bj-strip-mode-btn');
        const widthBtn = document.getElementById('bj-strip-width-btn');

        vs.classList.toggle('bj-strip-1px', !!this._stripOnePx);
        widthBtn?.classList.toggle('active', !!this._stripOnePx);

        if (this._stripExtended) {
            vs.classList.add('bj-strips-extended');
            if (container) {
                if (workspace && workspace.parentNode === container) {
                    if (vs.parentNode !== container || vs.nextSibling !== workspace.nextSibling) {
                        container.insertBefore(vs, workspace.nextSibling);
                    }
                } else if (vs.parentNode !== container) {
                    container.appendChild(vs);
                }
            } else if (vs.parentNode !== grid) {
                grid.appendChild(vs);
            }
            grid.style.gridTemplateColumns = '1fr';
            toggleBtn?.classList.add('active');
            if (toggleBtn) toggleBtn.title = 'Return strips to compact inline display';
        } else {
            vs.classList.remove('bj-strips-extended');
            if (vs.parentNode !== grid) grid.appendChild(vs);
            grid.style.gridTemplateColumns = '1fr auto';
            toggleBtn?.classList.remove('active');
            if (toggleBtn) toggleBtn.title = 'Toggle to full-height strip display';
        }
    },

    _getWorkspaceScrollContainer() {
        const workspace = document.querySelector('.dob-workspace');
        if (!workspace) return null;
        const pinnedScroll = workspace.querySelector('.dob-ws-scroll');
        if (workspace.classList.contains('dob-ws-pinned') && pinnedScroll) return pinnedScroll;
        return workspace;
    },

    _scrollElementIntoScrollerView(scroller, el, opts = {}) {
        if (!el || !scroller) return;
        const canScroll = (scroller.scrollHeight > (scroller.clientHeight + 1)) || (scroller.scrollWidth > (scroller.clientWidth + 1));
        if (!canScroll) return;
        const align = opts.align === 'start' ? 'start' : (opts.align === 'center' ? 'center' : 'nearest');
        const margin = Number.isFinite(opts.margin) ? opts.margin : 10;
        const elRect = el.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const relativeTop = elRect.top - scrollerRect.top + scroller.scrollTop;
        const relativeBottom = elRect.bottom - scrollerRect.top + scroller.scrollTop;
        const viewTop = scroller.scrollTop;
        const viewBottom = viewTop + scroller.clientHeight;
        let targetTop = null;

        if (align === 'start') {
            targetTop = Math.max(0, relativeTop - margin);
        } else if (align === 'center') {
            targetTop = Math.max(0, relativeTop - Math.max(0, (scroller.clientHeight - elRect.height) / 2));
        } else {
            if (relativeTop < viewTop + margin) {
                targetTop = Math.max(0, relativeTop - margin);
            } else if (relativeBottom > viewBottom - margin) {
                targetTop = Math.max(0, relativeBottom - scroller.clientHeight + margin);
            }
        }

        if (targetTop !== null) {
            scroller.scrollTo({ top: targetTop, behavior: opts.behavior || 'smooth' });
        }
    },

    _scrollElementIntoWorkspaceView(el, opts = {}) {
        if (!el) return;
        const scroller = this._getWorkspaceScrollContainer();
        if (!scroller) return;
        this._scrollElementIntoScrollerView(scroller, el, opts);
    },

    _findScrollableAncestor(el, stopAt = null) {
        let node = el?.parentElement || null;
        while (node && node !== stopAt && node !== document.body && node !== document.documentElement) {
            const style = window.getComputedStyle(node);
            const overflowY = `${style.overflowY || ''} ${style.overflow || ''}`;
            const canScrollY = /(auto|scroll|overlay)/i.test(overflowY);
            if (canScrollY && node.scrollHeight > (node.clientHeight + 1)) return node;
            node = node.parentElement;
        }
        return null;
    },

    _scrollElementIntoNearestView(el, opts = {}) {
        if (!el) return;
        const workspace = document.querySelector('.dob-workspace');
        const localScroller = this._findScrollableAncestor(el, workspace);
        if (localScroller) {
            this._scrollElementIntoScrollerView(localScroller, el, opts);
        }
        this._scrollElementIntoWorkspaceView(el, opts);
        this._resetDocumentScrollIfNeeded();
    },

    _resetDocumentScrollIfNeeded() {
        const top = Math.max(
            window.scrollY || 0,
            document.documentElement?.scrollTop || 0,
            document.body?.scrollTop || 0
        );
        if (top > 0) {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
    },

    _positionCardMapMenu(wrap) {
        if (!wrap) return;
        const pop = wrap.querySelector('.bj-map-pop');
        const btn = wrap.querySelector('.bj-map-btn');
        if (!pop || !btn) return;
        if (wrap.dataset.mapDetached === '1') return;
        wrap.classList.remove('bj-map-up');
        const btnRect = btn.getBoundingClientRect();
        const popRect = pop.getBoundingClientRect();
        const popW = Math.max(popRect.width || 240, 240);
        const popH = Math.max(popRect.height || 120, 120);
        let left = btnRect.right - popW;
        left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
        let top = btnRect.bottom + 4;
        const canOpenUp = btnRect.top > (popH + 8);
        if ((top + popH) > (window.innerHeight - 8) && canOpenUp) {
            top = Math.max(8, btnRect.top - popH - 4);
            wrap.classList.add('bj-map-up');
        }
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
    },

    _hookGenStrResize() {
        if (this._genStrResizeHooked) {
            this._ensureGenStrResizeGrip();
            this._syncGenStrResizeVisibility();
            this._autoFitGenStr({ persist: false });
            return;
        }
        this._genStrResizeHooked = true;
        this._ensureGenStrResizeGrip();
        this._autoFitGenStr({ persist: false });
        this._syncGenStrResizeVisibility();

        const move = (e) => {
            if (!this._genStrResizeState) return;
            const y = typeof e.clientY === 'number' ? e.clientY : null;
            if (y == null) return;
            const next = this._genStrResizeState.startHeight + (y - this._genStrResizeState.startY);
            this._applyGenStrHeightPreference(next, { persist: false, mode: 'manual' });
        };
        const stop = () => {
            if (!this._genStrResizeState) return;
            this._genStrResizeState = null;
            document.body.classList.remove('bj-genstr-resizing');
            this._saveGenStrHeightPreference();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('mousemove', move);
        document.addEventListener('pointerup', stop);
        document.addEventListener('mouseup', stop);
        window.addEventListener('resize', () => this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false }));

        if (!this._origBuilderToggleGenStr && typeof Builder.toggleGenStr === 'function') {
            this._origBuilderToggleGenStr = Builder.toggleGenStr.bind(Builder);
            Builder.toggleGenStr = () => {
                this._origBuilderToggleGenStr();
                this._syncGenStrResizeVisibility();
            };
        }
    },

    _ensureGenStrResizeGrip() {
        const gen = document.getElementById('dob-genstr');
        if (!gen) return null;
        let grip = document.getElementById('bjson-genstr-resize');
        if (!grip) {
            grip = document.createElement('div');
            grip.id = 'bjson-genstr-resize';
            grip.className = 'bj-genstr-resize';
            grip.title = 'Drag to resize Generated DOF String. Double-click to auto-fit.';
            gen.insertAdjacentElement('afterend', grip);
            grip.addEventListener('pointerdown', (e) => {
                if (typeof e.button === 'number' && e.button !== 0) return;
                e.stopPropagation();
                if (typeof e.preventDefault === 'function') e.preventDefault();
                this._genStrResizeState = {
                    startY: e.clientY,
                    startHeight: this._genStrHeightPx
                };
                document.body.classList.add('bj-genstr-resizing');
            });
            grip.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (typeof e.preventDefault === 'function') e.preventDefault();
                this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: true, mode: 'auto' });
            });
        }
        return grip;
    },

    _syncGenStrResizeVisibility() {
        const gen = document.getElementById('dob-genstr');
        const grip = document.getElementById('bjson-genstr-resize') || this._ensureGenStrResizeGrip();
        if (!gen || !grip) return;
        grip.style.display = gen.style.display === 'none' ? 'none' : '';
    },

    _hookCardResizeUi() {
        if (this._cardResizeHooked) return;
        this._cardResizeHooked = true;
        const move = (e) => {
            if (!this._cardResizeState) return;
            const y = typeof e.clientY === 'number' ? e.clientY : null;
            if (y == null) return;
            const next = this._cardResizeState.startHeight + (y - this._cardResizeState.startY);
            if (this._cardResizeState.mode === 'max') this._applyCardMaxHeightPreference(next, { persist: false });
            else this._applyCardHeightPreference(next, { persist: false });
        };
        const stop = () => {
            if (!this._cardResizeState) return;
            const mode = this._cardResizeState.mode;
            this._cardResizeState = null;
            document.body.classList.remove('bj-card-resizing');
            if (mode === 'max') this._saveCardMaxHeightPreference();
            else this._saveCardHeightPreference();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('mousemove', move);
        document.addEventListener('pointerup', stop);
        document.addEventListener('mouseup', stop);
        document.addEventListener('pointercancel', stop);
        document.addEventListener('mouseleave', (e) => {
            if (e.target === document.documentElement || e.target === document.body) stop();
        });
    },

    _cardHeightStorageKey() {
        return 'bjson-card-height-global';
    },

    _cardMaxHeightStorageKey() {
        return 'bjson-card-height-max';
    },

    _stripLayoutStorageKey() {
        return 'bjson-strip-layout-global';
    },

    _tableStripLayoutStorageKey(tableName = '') {
        const safe = String(tableName || '').trim().toLowerCase();
        return safe ? ('bjson-strip-layout-table-' + safe) : '';
    },

    _genStrHeightStorageKey() {
        return 'bjson-genstr-height';
    },

    _genStrHeightModeStorageKey() {
        return 'bjson-genstr-height-mode';
    },

    _genStrHeightCeiling() {
        const sidebar = document.querySelector('.dob-sidebar');
        const fixed = document.querySelector('.dob-sidebar-fixed');
        const genWrap = document.querySelector('.dob-genstr-wrap');
        if (!sidebar || !fixed || !genWrap) {
            const h = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) ? window.innerHeight : 900;
            return Math.max(110, Math.round(h * 0.8));
        }
        const applyBtn = fixed.querySelector('.dob-apply');
        const tabs = document.getElementById('dob-layerTabs');
        const actions = document.querySelector('.dob-tab-actions');
        const nav = document.getElementById('bjson-layer-nav');
        const grip = document.getElementById('bjson-genstr-resize');
        const label = genWrap.querySelector('.dob-genstr-label');
        const wrapStyle = window.getComputedStyle(genWrap);
        const wrapPad = (parseFloat(wrapStyle.paddingTop) || 0) + (parseFloat(wrapStyle.paddingBottom) || 0);
        const occupied =
            (applyBtn?.offsetHeight || 0) +
            (tabs?.offsetHeight || 0) +
            (actions?.offsetHeight || 0) +
            (nav?.offsetHeight || 0) +
            (label?.offsetHeight || 0) +
            (grip?.offsetHeight || 8) +
            wrapPad;
        const sidebarH = sidebar.clientHeight || ((typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) ? window.innerHeight : 900);
        return Math.max(110, sidebarH - occupied - 24);
    },

    _normalizeCardHeight(px) {
        const n = Math.round(Number(px) || 110);
        return Math.max(56, Math.min(220, n));
    },

    _defaultCardMaxHeightPx() {
        const h = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) ? window.innerHeight : 900;
        return Math.max(220, Math.round(h * 0.55));
    },

    _normalizeGenStrHeight(px) {
        const ceiling = this._genStrHeightCeiling();
        const n = Math.round(Number(px) || 120);
        return Math.max(42, Math.min(ceiling, n));
    },

    _normalizeCardMaxHeight(px) {
        const fallback = this._defaultCardMaxHeightPx();
        const n = Math.round(Number(px) || fallback);
        const ceiling = Math.max(320, ((typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) ? (window.innerHeight - 120) : 900));
        return Math.max(160, Math.min(ceiling, n));
    },

    _applyCardHeightPreference(px, opts = {}) {
        const next = this._normalizeCardHeight(px);
        this._cardHeightPx = next;
        document.documentElement.style.setProperty('--bj-card-layer-max-h', next + 'px');
        document.documentElement.style.setProperty('--bj-card-layer-max-h-two-col', Math.max(next, 90) + 'px');
        document.documentElement.style.setProperty('--bj-card-layer-min-h', Math.max(0, next - 88) + 'px');
        if (opts.persist) this._saveCardHeightPreference();
    },

    _applyCardMaxHeightPreference(px, opts = {}) {
        const next = this._normalizeCardMaxHeight(px);
        this._cardMaxHeightPx = next;
        document.documentElement.style.setProperty('--bj-card-layer-max-h-max', next + 'px');
        if (opts.persist) this._saveCardMaxHeightPreference();
    },

    _loadCardHeightPreference() {
        let next = 110;
        try {
            const raw = localStorage.getItem(this._cardHeightStorageKey());
            if (raw != null && raw !== '') next = raw;
        } catch {}
        this._applyCardHeightPreference(next, { persist: false });
        try {
            const rawMax = localStorage.getItem(this._cardMaxHeightStorageKey());
            if (rawMax != null && rawMax !== '') this._applyCardMaxHeightPreference(rawMax, { persist: false });
        } catch {}
    },

    _loadGenStrHeightPreference() {
        let next = 120;
        try {
            const raw = localStorage.getItem(this._genStrHeightStorageKey());
            if (raw != null && raw !== '') next = raw;
        } catch {}
        this._genStrManualHeight = false;
        this._autoFitGenStr({ persist: false });
    },

    _saveCardHeightPreference() {
        try {
            localStorage.setItem(this._cardHeightStorageKey(), String(this._cardHeightPx));
        } catch {}
    },

    _saveCardMaxHeightPreference() {
        if (this._cardMaxHeightPx == null) return;
        try {
            localStorage.setItem(this._cardMaxHeightStorageKey(), String(this._cardMaxHeightPx));
        } catch {}
    },

    _saveGenStrHeightPreference() {
        try {
            localStorage.setItem(this._genStrHeightStorageKey(), String(this._genStrHeightPx));
            localStorage.setItem(this._genStrHeightModeStorageKey(), this._genStrManualHeight ? 'manual' : 'auto');
        } catch {}
    },

    _loadStoredStripLayout(key) {
        if (!key) return null;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return {
                extended: !!parsed.extended,
                onePx: !!parsed.onePx
            };
        } catch {}
        return null;
    },

    _saveStoredStripLayout(key, prefs) {
        if (!key || !prefs) return;
        try {
            localStorage.setItem(key, JSON.stringify({
                extended: !!prefs.extended,
                onePx: !!prefs.onePx
            }));
        } catch {}
    },

    _deleteStoredStripLayout(key) {
        if (!key) return;
        try { localStorage.removeItem(key); } catch {}
    },

    _resolveStripLayoutPreference(tableName = '') {
        const tablePref = this._loadStoredStripLayout(this._tableStripLayoutStorageKey(tableName));
        if (tablePref) return { ...tablePref, source: 'table' };
        const globalPref = this._loadStoredStripLayout(this._stripLayoutStorageKey());
        if (globalPref) return { ...globalPref, source: 'global' };
        return {
            extended: !!this._stripExtended,
            onePx: !!this._stripOnePx,
            source: 'default'
        };
    },

    _applyStripLayoutPreference(pref) {
        if (!pref) return;
        this._stripExtended = !!pref.extended;
        this._stripOnePx = !!pref.onePx;
    },

    _loadStripLayoutPreference(tableName = '') {
        this._applyStripLayoutPreference(this._resolveStripLayoutPreference(tableName));
    },

    _saveStripLayoutPreference(opts = {}) {
        const mode = opts.mode === 'table' ? 'table' : 'global';
        const tableName = opts.tableName || this._currentTableName();
        const key = mode === 'table'
            ? this._tableStripLayoutStorageKey(tableName)
            : this._stripLayoutStorageKey();
        this._saveStoredStripLayout(key, {
            extended: !!this._stripExtended,
            onePx: !!this._stripOnePx
        });
    },

    _clearTableStripLayoutPreference(tableName = '') {
        this._deleteStoredStripLayout(this._tableStripLayoutStorageKey(tableName));
    },

    _measureGenStrContentHeight(el) {
        if (!el) return 42;
        const prevHeight = el.style.height;
        const prevMaxHeight = el.style.maxHeight;
        const prevOverflowY = el.style.overflowY;
        el.style.height = 'auto';
        el.style.maxHeight = 'none';
        el.style.overflowY = 'hidden';
        const measured = Math.ceil(el.scrollHeight || 0) + 2;
        el.style.height = prevHeight;
        el.style.maxHeight = prevMaxHeight;
        el.style.overflowY = prevOverflowY;
        return Math.max(42, measured);
    },

    _applyGenStrHeightPreference(px, opts = {}) {
        const requested = this._normalizeGenStrHeight(px);
        if (opts.mode === 'manual') this._genStrManualHeight = true;
        else if (opts.mode === 'auto') this._genStrManualHeight = false;
        const el = document.getElementById('dob-genstr');
        const ceiling = this._genStrHeightCeiling();
        let next = requested;
        if (el) {
            const contentNeeded = this._measureGenStrContentHeight(el);
            if (!this._genStrManualHeight) next = Math.min(ceiling, Math.max(42, contentNeeded));
            el.style.height = next + 'px';
            el.style.maxHeight = next + 'px';
            el.style.overflowY = 'auto';
        }
        this._genStrHeightPx = next;
        if (opts.persist) this._saveGenStrHeightPreference();
    },

    _autoFitGenStr(opts = {}) {
        this._applyGenStrHeightPreference(this._genStrHeightPx, { ...opts, mode: 'auto' });
    },

    _setPreservedDraftRawText(text) {
        this._preservedDraftRawText = String(text || '').trim();
    },

    _clearPreservedDraftRawText() {
        this._preservedDraftRawText = '';
    },

    _applyPreservedDraftRawToUi() {
        const raw = String(this._preservedDraftRawText || '').trim();
        if (!raw) return false;
        const gs = document.getElementById('dob-genstr');
        if (gs && !gs._bjsonEditing) {
            gs.textContent = raw;
            gs.style.color = '#3aaa3a';
            this._lastGenStr = raw;
            this._autoFitGenStr({ persist: false });
        }
        const txtInput = document.getElementById('bj-ne-text');
        if (txtInput) txtInput.value = raw;
        return true;
    },

    _resetCardMaxHeightPreference() {
        this._cardMaxHeightPx = null;
        document.documentElement.style.removeProperty('--bj-card-layer-max-h-max');
        try {
            localStorage.removeItem(this._cardMaxHeightStorageKey());
        } catch {}
    },

    _startCardResize(e, mode = 'normal') {
        if (typeof e.button === 'number' && e.button !== 0) return;
        e.stopPropagation();
        if (typeof e.preventDefault === 'function') e.preventDefault();
        this._cardResizeState = {
            startY: e.clientY,
            startHeight: mode === 'max' ? (this._cardMaxHeightPx ?? this._defaultCardMaxHeightPx()) : this._cardHeightPx,
            mode
        };
        document.body.classList.add('bj-card-resizing');
    },

    _armCardDrag(portId) {
        this._dragPrimedPort = portId;
    },

    _clearCardDragPrime(portId = null) {
        if (portId && this._dragPrimedPort !== portId) return;
        this._dragPrimedPort = null;
    },

    _addFileInput() {
        let inp = document.getElementById('bjson-file-input');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json,.ini';
            inp.id = 'bjson-file-input';
            inp.style.display = 'none';
            document.body.appendChild(inp);
        } else {
            inp.type = 'file';
            inp.accept = '.json,.ini';
        }
        inp.onchange = (e) => this.handleImport(e.target);
    },

    _addBitmapFileInput() {
        if (document.getElementById('bjson-bitmap-file-input')) return;
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.gif,image/gif';
        inp.id = 'bjson-bitmap-file-input';
        inp.style.display = 'none';
        inp.onchange = async (e) => {
            const file = e.target.files?.[0] || null;
            if (file) await this.loadTableBitmap(file);
            e.target.value = '';
        };
        document.body.appendChild(inp);
    },

    _enhanceBuilderNumSteppers() {
        document.querySelectorAll('#dob-view .dob-num-box').forEach(input => {
            if (!input || input.closest('.dob-stepper')) return;
            const wrapper = document.createElement('span');
            wrapper.className = 'dob-stepper';
            const dec = document.createElement('button');
            dec.type = 'button';
            dec.className = 'dob-stepper-btn dob-stepper-dec';
            dec.textContent = '<';
            dec.title = 'Decrease';
            const inc = document.createElement('button');
            inc.type = 'button';
            inc.className = 'dob-stepper-btn dob-stepper-inc';
            inc.textContent = '>';
            inc.title = 'Increase';
            const parent = input.parentNode;
            if (!parent) return;
            parent.insertBefore(wrapper, input);
            wrapper.appendChild(dec);
            wrapper.appendChild(input);
            wrapper.appendChild(inc);

            const fireInput = () => {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            };
            dec.addEventListener('click', () => {
                if (input.disabled) return;
                try { input.stepDown(); } catch {}
                fireInput();
            });
            inc.addEventListener('click', () => {
                if (input.disabled) return;
                try { input.stepUp(); } catch {}
                fireInput();
            });
        });
        this._syncBuilderNumStepperStates();
    },

    _syncBuilderNumStepperStates() {
        document.querySelectorAll('#dob-view .dob-stepper').forEach(wrapper => {
            const input = wrapper.querySelector('.dob-num-box');
            const disabled = !!input?.disabled;
            wrapper.querySelectorAll('.dob-stepper-btn').forEach(btn => { btn.disabled = disabled; });
        });
    },

    _getActiveBitmapSource() {
        const tableName = this._currentTableName();
        const tableBitmap = this._tableBitmapSource;
        if (tableBitmap?.frames?.length && tableBitmap.tableName === tableName) {
            return {
                source: 'table',
                tableName,
                fileName: tableBitmap.fileName || 'loaded GIF',
                frames: tableBitmap.frames,
                width: tableBitmap.width || 0,
                height: tableBitmap.height || 0,
                frameCount: tableBitmap.frames.length
            };
        }
        return {
            source: 'none',
            tableName,
            fileName: '',
            frames: null,
            width: 0,
            height: 0,
            frameCount: 0
        };
    },

    getBitmapSourceSummary() {
        const info = this._getActiveBitmapSource();
        const tableName = info.tableName || 'current table';
        const stats = `${info.width || 0} x ${info.height || 0}, ${info.frameCount || 0} frame${info.frameCount === 1 ? '' : 's'}`;
        if (info.source === 'table') {
            return {
                ...info,
                text: `Source bitmap: ${stats}, table: ${tableName}`
            };
        }
        return {
            ...info,
            text: this.jsonMode
                ? `Source: load a GIF with Load Table Bitmap to preview ${tableName}'s bitmap rows.`
                : 'Source: import a JSON table, then load a GIF with Load Table Bitmap for Builder bitmap preview.'
        };
    },

    _refreshBitmapUiState(opts = {}) {
        const statusEl = document.getElementById('dob-bitmap-file-status');
        const loadBtn = document.getElementById('dob-load-table-bitmap');
        const clearBtn = document.getElementById('dob-clear-table-bitmap');
        const info = this._getActiveBitmapSource();
        const hasJsonTable = !!(this.jsonMode && this.importedConfig?.table);
        if (loadBtn) loadBtn.disabled = !hasJsonTable;
        if (clearBtn) clearBtn.disabled = !(this._tableBitmapSource?.frames?.length);
        if (statusEl) {
            if (!hasJsonTable) {
                statusEl.textContent = 'Import a JSON table to load a Builder bitmap.';
            } else if (this._tableBitmapSource?.frames?.length) {
                statusEl.textContent = `Table bitmap: ${this._tableBitmapSource.fileName}`;
            } else {
                statusEl.textContent = 'No table bitmap loaded for this Builder session.';
            }
            statusEl.title = statusEl.textContent;
        }
        if (opts.silent !== true && typeof App !== 'undefined' && typeof App._updateBitmapSourceHint === 'function') {
            App._updateBitmapSourceHint();
        } else if (opts.silent === true) {
            const hintEl = document.getElementById('dob-bitmap-source-hint');
            const summary = this.getBitmapSourceSummary();
            if (hintEl && summary?.text) hintEl.textContent = summary.text;
        }
        this._syncBitmapInspectorUi();
    },

    promptTableBitmap() {
        if (!(this.jsonMode && this.importedConfig?.table)) {
            alert('Import a JSON table first, then load its bitmap GIF.');
            return;
        }
        document.getElementById('bjson-bitmap-file-input')?.click();
    },

    async tryAutoLoadRomBitmap() {
        if (!(this.jsonMode && this.importedConfig?.table)) return false;
        const tableName = this._currentTableName();
        if (this._tableBitmapSource?.frames?.length && this._tableBitmapSource.tableName === tableName) {
            return true;
        }
        if (typeof App === 'undefined' || typeof App.findBuilderBitmapFileForRom !== 'function') {
            return false;
        }
        const file = await App.findBuilderBitmapFileForRom(this.importedConfig || {});
        if (!file) return false;
        try {
            return await this.loadTableBitmap(file);
        } catch (err) {
            console.warn('[BuilderJSON] Auto-load ROM bitmap failed:', err);
            return false;
        }
    },

    async loadTableBitmap(file, opts = {}) {
        if (!(this.jsonMode && this.importedConfig?.table)) {
            alert('Import a JSON table first, then load its bitmap GIF.');
            return false;
        }
        if (!file || !/\.gif$/i.test(file.name || '')) {
            alert('Table bitmap must be a .gif file.');
            return false;
        }
        if (typeof App === 'undefined' || (typeof App._builderParseGif !== 'function' && typeof App._animSimParseGif !== 'function')) {
            alert('GIF parser is not available right now.');
            return false;
        }
        try {
            const parseGif = (typeof App._builderParseGif === 'function')
                ? App._builderParseGif.bind(App)
                : App._animSimParseGif.bind(App);
            const { gifFrames, gifWidth, gifHeight } = await parseGif(file);
            this._tableBitmapSource = {
                tableName: this._currentTableName(),
                fileName: file.name,
                frames: gifFrames,
                width: gifWidth,
                height: gifHeight,
                loadedAt: Date.now()
            };
            this._refreshBitmapUiState();
            this._setStatus(`Loaded table bitmap ${file.name} for ${this._currentTableName()}.`, '#4caf50');
            if (Builder._previewScene) Builder._resetPreviewTiming();
            if (opts.cacheWorkspace !== false && typeof App !== 'undefined' && typeof App._cacheWorkspaceSlot === 'function') {
                try {
                    await App._cacheWorkspaceSlot('bj-f-bitmap', [file], file.name || 'table-bitmap.gif');
                } catch (e) {
                    console.warn('[BuilderJSON] Could not cache table bitmap GIF:', e);
                }
            }
            return true;
        } catch (err) {
            this._refreshBitmapUiState();
            alert('Could not parse table bitmap GIF: ' + (err?.message || err));
            return false;
        }
    },

    clearTableBitmap(opts = {}) {
        const hadBitmap = !!(this._tableBitmapSource?.frames?.length);
        this._tableBitmapSource = null;
        this._refreshBitmapUiState(opts);
        if (!opts.preserveCache && typeof App !== 'undefined' && typeof App._removeWorkspaceSlot === 'function') {
            App._removeWorkspaceSlot('bj-f-bitmap').catch?.(err => {
                console.warn('[BuilderJSON] Could not clear cached table bitmap slot:', err);
            });
        }
        if (!opts.silent && hadBitmap) this._setStatus('Table bitmap cleared for Builder preview.', '#8aacca');
    },

    _getPreviewBitmapSource() {
        const info = this._getActiveBitmapSource();
        return info.source === 'none' ? null : info;
    },

    _layerHasBitmapTokens(layer) {
        const b = layer?.bitmap || {};
        return ['left', 'top', 'width', 'height', 'frame', 'frameCount', 'fps', 'frameDelayMs', 'stepSize']
            .some(key => b[key] !== null && b[key] !== undefined && b[key] !== '') ||
            !!b.stepDirection || !!b.behaviour;
    },

    _currentBitmapPreviewContext() {
        const toy = this._resolveDisplayToyForRender();
        const source = this._getActiveBitmapSource();
        const layer = Builder?.layers?.[Builder?.currentLayerIdx ?? 0] || null;
        const hasBitmapLayer = !!(layer && this._layerHasBitmapTokens(layer));
        const frameCount = Math.max(0, Number(source?.frameCount || 0));
        const layerKey = `${Builder?.activeSection || ''}|${Builder?.currentLayerIdx ?? 0}|${toy?.portId || ''}`;
        const rawBaseFrame = Number(layer?.bitmap?.frame || 0);
        const baseFrame = Number.isFinite(rawBaseFrame) ? rawBaseFrame : 0;
        const clampedBase = Math.max(0, Math.min(frameCount > 0 ? frameCount - 1 : Number.MAX_SAFE_INTEGER, baseFrame));
        return {
            toy,
            source,
            layer,
            hasBitmapLayer,
            frameCount,
            layerKey,
            baseFrame: clampedBase
        };
    },

    _syncBitmapInspectorUi() {
        const holdBtn = document.getElementById('dob-bitmap-hold-btn');
        const loopEl = document.getElementById('dob-bitmap-loop');
        const frameSlider = document.getElementById('dob-bitmap-frame');
        const frameInput = document.getElementById('dob-bitmap-frame-n');
        const statusEl = document.getElementById('dob-bitmap-preview-status');
        const ctx = this._currentBitmapPreviewContext();

        if (ctx.layerKey !== this._bitmapPreviewLayerKey) {
            this._bitmapPreviewLayerKey = ctx.layerKey;
            this._bitmapPreviewFrameDirty = false;
            this._bitmapPreviewFrame = ctx.baseFrame;
        } else if (!this._bitmapPreviewFrameDirty) {
            this._bitmapPreviewFrame = ctx.baseFrame;
        }

        const resolvedFrame = Math.max(0, Math.min(Math.max(0, ctx.frameCount - 1), Number(this._bitmapPreviewFrame || 0)));
        this._bitmapPreviewFrame = resolvedFrame;

        const canInspect = !!(this.jsonMode && ctx.toy && ctx.hasBitmapLayer && ctx.frameCount > 0);
        const cropLeft = ctx.layer?.bitmap?.left ?? 0;
        const cropTop = ctx.layer?.bitmap?.top ?? 0;
        const cropW = ctx.layer?.bitmap?.width ?? ctx.source?.width ?? 0;
        const cropH = ctx.layer?.bitmap?.height ?? ctx.source?.height ?? 0;
        const animCount = Number(ctx.layer?.bitmap?.frameCount || 1);
        const animFps = Number(ctx.layer?.bitmap?.fps || 0);
        const animDir = String(ctx.layer?.bitmap?.stepDirection || '').toUpperCase() || '-';
        const animStep = Number(ctx.layer?.bitmap?.stepSize || 1);
        const animBehaviour = String(ctx.layer?.bitmap?.behaviour || 'L').toUpperCase() || 'L';

        if (holdBtn) {
            holdBtn.disabled = !canInspect;
            holdBtn.classList.toggle('active', !!this._bitmapPreviewHold && canInspect);
        }
        if (loopEl) {
            loopEl.checked = !!this._bitmapPreviewLoop;
            loopEl.disabled = !canInspect;
        }
        [frameSlider, frameInput].forEach(el => {
            if (!el) return;
            el.disabled = !canInspect;
            el.min = '0';
            el.max = String(Math.max(0, ctx.frameCount - 1));
            el.value = String(resolvedFrame);
        });
        this._syncBuilderNumStepperStates();

        if (statusEl) {
            if (!this.jsonMode) {
                statusEl.textContent = 'Import a JSON table, then select a bitmap-bearing row to inspect it.';
            } else if (!ctx.source?.frameCount) {
                statusEl.textContent = 'Load a table bitmap to inspect bitmap rows.';
            } else if (!ctx.hasBitmapLayer) {
                statusEl.textContent = 'Select a bitmap-bearing row to inspect crop and frame details.';
            } else {
                const animLabel = animCount > 1
                    ? `anim ${animCount} @ ${animFps || '-'}fps ${animDir}/${animStep} ${animBehaviour}`
                    : 'static';
                statusEl.textContent = `Resolved ${resolvedFrame}/${Math.max(0, ctx.frameCount - 1)} | crop ${cropLeft},${cropTop},${cropW}x${cropH} | ${animLabel}`;
            }
            statusEl.title = statusEl.textContent;
        }

        if (this._bitmapPreviewHold) {
            this._refreshBitmapInspectorPreview({ silent: true });
        }
    },

    _buildBitmapInspectorPreviewLayer(ctx) {
        if (!ctx?.toy || !ctx?.layer) return null;
        const preview = this._normalizePreviewLayerForToy(ctx.toy, ctx.layer);
        if (!preview) return null;
        const next = {
            ...preview,
            bitmap: { ...(preview.bitmap || {}) }
        };
        const frame = Math.max(0, Math.min(Math.max(0, ctx.frameCount - 1), Number(this._bitmapPreviewFrame || 0)));
        next.effect = '';
        next.wait = 0;
        next.fu = 0;
        next.fd = 0;
        next.f = 0;
        next.duration = 0;
        next.maxDur = 0;
        next.blink = 0;
        next.bitmap.frame = frame;
        if (this._bitmapPreviewFrameDirty || !this._bitmapPreviewLoop) {
            next.bitmap.frameCount = 1;
            next.bitmap.fps = null;
            next.bitmap.frameDelayMs = null;
            next.bitmap.stepDirection = '';
            next.bitmap.stepSize = null;
            next.bitmap.behaviour = 'L';
        } else if (Number(next.bitmap.frameCount || 0) > 1) {
            next.bitmap.behaviour = 'L';
        }
        return next;
    },

    _refreshBitmapInspectorPreview(opts = {}) {
        if (!this._bitmapPreviewHold) {
            if (this._bitmapInspectorLive) this._stopBitmapInspectorPreview({ restore: opts.restore !== false, silent: true });
            return false;
        }
        const ctx = this._currentBitmapPreviewContext();
        if (!(this.jsonMode && ctx.toy && ctx.hasBitmapLayer && ctx.frameCount > 0)) {
            if (!opts.silent) this._setStatus('Select a bitmap-bearing row and load a bitmap source to hold preview.', '#f5a623');
            this._stopBitmapInspectorPreview({ restore: opts.restore !== false, silent: true });
            return false;
        }
        const layer = this._buildBitmapInspectorPreviewLayer(ctx);
        if (!layer) {
            this._stopBitmapInspectorPreview({ restore: opts.restore !== false, silent: true });
            return false;
        }
        const scene = this._buildSceneForExplicitLayers(ctx.toy, [layer]);
        this._activeToyPort = ctx.toy.portId;
        this._setPreviewScene(scene);
        Builder._resetPreviewTiming();
        this._bitmapInspectorLive = true;
        return true;
    },

    _stopBitmapInspectorPreview(opts = {}) {
        const wasLive = this._bitmapInspectorLive;
        this._bitmapInspectorLive = false;
        if (!wasLive) return;
        if (opts.restore !== false && this._restoreScopedPreviewAfterLayerLoad(Builder.activeSection || null)) return;
        this._setPreviewScene(null);
        Builder._resetPreviewTiming();
    },

    toggleBitmapPreviewHold() {
        this._bitmapPreviewHold = !this._bitmapPreviewHold;
        this._syncBitmapInspectorUi();
        if (this._bitmapPreviewHold) {
            if (this._refreshBitmapInspectorPreview()) {
                this._setStatus('Bitmap preview held for the current Builder row.', '#4caf50');
            }
        } else {
            this._bitmapPreviewFrameDirty = false;
            this._stopBitmapInspectorPreview({ restore: true });
            this._syncBitmapInspectorUi();
            this._setStatus('Bitmap preview hold released.', '#8aacca');
        }
    },

    setBitmapPreviewLoop(enabled) {
        this._bitmapPreviewLoop = !!enabled;
        if (this._bitmapPreviewLoop) this._bitmapPreviewFrameDirty = false;
        this._syncBitmapInspectorUi();
        if (this._bitmapPreviewHold) this._refreshBitmapInspectorPreview({ silent: true });
    },

    setBitmapPreviewFrame(value) {
        const ctx = this._currentBitmapPreviewContext();
        const max = Math.max(0, ctx.frameCount - 1);
        const parsed = parseInt(value, 10);
        const next = Math.max(0, Math.min(max, Number.isFinite(parsed) ? parsed : 0));
        this._bitmapPreviewFrame = next;
        this._bitmapPreviewFrameDirty = true;
        if (!this._bitmapPreviewHold) this._bitmapPreviewHold = true;
        const input = document.getElementById('dob-abf');
        if (input) {
            input.value = String(next);
            Builder.updateLayer();
        }
        this._syncBitmapInspectorUi();
        this._refreshBitmapInspectorPreview({ silent: true });
    },

    handleBitmapAuthoringChange(controlId = '') {
        if (controlId === 'dob-abf') {
            const abf = document.getElementById('dob-abf');
            const next = Math.max(0, parseInt(abf?.value || '0', 10) || 0);
            this._bitmapPreviewFrame = next;
            this._bitmapPreviewFrameDirty = false;
        }
        Builder.updateLayer();
        this._syncBitmapInspectorUi();
        if (this._bitmapPreviewHold) {
            this._refreshBitmapInspectorPreview({ silent: true });
        }
    },

    _examplePaletteStorageKey() {
        return 'bjson-examples-palette';
    },

    _defaultExamplePaletteState() {
        const vw = (typeof window !== 'undefined' && Number.isFinite(window.innerWidth)) ? window.innerWidth : 1600;
        const vh = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) ? window.innerHeight : 900;
        return {
            open: false,
            left: Math.max(24, vw - 484),
            top: Math.max(72, Math.round(vh * 0.16)),
            width: 460,
            height: 460,
            mode: 'momentary',
            type: 'matrix',
            portId: null,
            selectedName: ''
        };
    },

    _normalizeExamplePaletteState(raw = {}) {
        const base = this._defaultExamplePaletteState();
        const vw = (typeof window !== 'undefined' && Number.isFinite(window.innerWidth)) ? window.innerWidth : 1600;
        const vh = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) ? window.innerHeight : 900;
        const maxWidth = Math.max(320, vw - 24);
        const maxHeight = Math.max(240, vh - 32);
        const width = Math.max(340, Math.min(maxWidth, Math.round(Number(raw.width) || base.width)));
        const height = Math.max(260, Math.min(maxHeight, Math.round(Number(raw.height) || base.height)));
        const left = Math.max(12, Math.min(vw - width - 12, Math.round(Number(raw.left) || base.left)));
        const top = Math.max(56, Math.min(vh - height - 12, Math.round(Number(raw.top) || base.top)));
        return {
            open: raw.open === true,
            left,
            top,
            width,
            height,
            mode: raw.mode === 'latched' ? 'latched' : 'momentary',
            type: raw.type === 'strip' ? 'strip' : 'matrix',
            portId: raw.portId != null ? String(raw.portId) : null,
            selectedName: String(raw.selectedName || '')
        };
    },

    _cloneLayerForBuilder(layer, toy = null) {
        if (!layer) return Builder._defaultLayer();
        const raw = layer._raw || this._layerToRaw(layer);
        const parsed = raw ? this._parseLayer(raw, toy ? this._parseContextForToy(toy) : undefined) : null;
        const clone = parsed ? parsed : { ...layer };
        clone.bitmap = { ...(clone.bitmap || layer.bitmap || {}) };
        clone._extra = [...(clone._extra || layer._extra || [])];
        clone._raw = raw;
        clone._originalRaw = layer._originalRaw || raw;
        return clone;
    },

    _loadExamplePalettePreference() {
        let next = this._defaultExamplePaletteState();
        try {
            const raw = localStorage.getItem(this._examplePaletteStorageKey());
            if (raw) next = this._normalizeExamplePaletteState(JSON.parse(raw));
        } catch {}
        this._examplePaletteState = next;
    },

    _saveExamplePalettePreference() {
        if (!this._examplePaletteState) return;
        try {
            localStorage.setItem(this._examplePaletteStorageKey(), JSON.stringify(this._examplePaletteState));
        } catch {}
    },
    _hookBuilder() {
        // Lazy button injection on Builder open
        const origToggle = Builder.toggle.bind(Builder);
        Builder.toggle = () => {
            origToggle();
            if (Builder.isVisible) {
                setTimeout(() => {
                    this._injectButtons();
                    this._enhanceBuilderNumSteppers();
                    this._syncBitmapInspectorUi();
                }, 60);
            }
        };

        if (!this._origBuilderLoadLayerToUI && typeof Builder.loadLayerToUI === 'function') {
            this._origBuilderLoadLayerToUI = Builder.loadLayerToUI.bind(Builder);
        }
        if (!this._builderLoadLayerHooked && this._origBuilderLoadLayerToUI) {
            Builder.loadLayerToUI = (idx) => {
                this._origBuilderLoadLayerToUI(idx);
                this._syncBitmapInspectorUi();
            };
            this._builderLoadLayerHooked = true;
        }

        // Issue 7 FIX: Hook _updateGenStr  the UNIVERSAL chokepoint.
        // updateLayer() only catches slider changes.
        // _setColor(), setDir(), clearLayer all call _updateGenStr directly.
        // This hook fires after EVERY layer modification path.
        if (!this._origBuilderUpdateGenStr) this._origBuilderUpdateGenStr = Builder._updateGenStr.bind(Builder);
        if (!this._builderGenHooked) {
            Builder._updateGenStr = () => {
                this._origBuilderUpdateGenStr();
                const gs = document.getElementById('dob-genstr');
                if (gs) this._lastGenStr = gs.textContent?.trim() || '';
                this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false });
                if (this.jsonMode) {
                    if (!this._suppressSync) this._onBuilderLayerChanged();
                    // Keep JSON mode display deterministic: always reflect checked raw rows
                    // instead of falling back to compact Builder serialization text.
                    if (Builder.activeSection && !this._newEffectPort) this._updateJsonGenStrFromCheckedRows(Builder.activeSection);
                }
            };
            this._builderGenHooked = true;
        }

        // Issue 1 (E-code bypass): applyToSection in JSON mode
        const origApply = Builder.applyToSection.bind(Builder);
        Builder.applyToSection = () => {
            if (this.jsonMode) { this._jsonApplyToSection(); return; }
            origApply();
        };

        if (!this._origBuilderCopyLayer && typeof Builder.copyLayer === 'function') {
            this._origBuilderCopyLayer = Builder.copyLayer.bind(Builder);
        }
        if (!this._builderCopyHooked && this._origBuilderCopyLayer) {
            Builder.copyLayer = () => {
                if (this.jsonMode) { this._jsonCopyLayer(); return; }
                this._origBuilderCopyLayer();
            };
            this._builderCopyHooked = true;
        }

        if (!this._origBuilderAddLayer && typeof Builder.addLayer === 'function') {
            this._origBuilderAddLayer = Builder.addLayer.bind(Builder);
        }
        if (!this._builderAddHooked && this._origBuilderAddLayer) {
            Builder.addLayer = () => {
                if (this.jsonMode) { this._jsonAddLayer(); return; }
                this._origBuilderAddLayer();
            };
            this._builderAddHooked = true;
        }

        if (!this._origBuilderRemoveLayer && typeof Builder.removeLayer === 'function') {
            this._origBuilderRemoveLayer = Builder.removeLayer.bind(Builder);
        }
        if (!this._builderRemoveHooked && this._origBuilderRemoveLayer) {
            Builder.removeLayer = () => {
                if (this.jsonMode) { this._jsonRemoveLayer(); return; }
                this._origBuilderRemoveLayer();
            };
            this._builderRemoveHooked = true;
        }

        // Keep strip render bindings stable in JSON mode even if base app rebuilds strip rack.
        if (!this._origBuilderBuildStripRack && typeof Builder._buildStripRack === 'function') {
            this._origBuilderBuildStripRack = Builder._buildStripRack.bind(Builder);
        }
        if (!this._builderStripRackHooked && this._origBuilderBuildStripRack) {
            Builder._buildStripRack = (...args) => {
                const out = this._origBuilderBuildStripRack(...args);
                if (this.jsonMode) {
                    // Re-attach to visible vertical strip nodes after any base rack rebuild.
                    this._syncVerticalStripBindings(true);
                }
                return out;
            };
            this._builderStripRackHooked = true;
        }

        // Issue 2: Hook _renderFrame for strip remap, @variable@ expansion, and post-render routing
        const origRender = Builder._renderFrame.bind(Builder);
        Builder._renderFrame = (dt) => {
            let saved = null;
            let liveHighlightSection = Builder.activeSection;
            if (this.jsonMode && Builder._previewScene) {
                origRender(dt);
                this._syncLiveGenStrHighlights(this._resolveDisplayToyForRender()?.toyName || Builder.activeSection);
                return;
            }
            if (this.jsonMode) {
                const activeToy = this._resolveDisplayToyForRender();
                const isStrip = activeToy?._display === 'strip';
                liveHighlightSection = activeToy?.toyName || Builder.activeSection;

                // Save + remap layers for rendering (restored after)
                saved = [];
                for (let i = 0; i < Builder.NUM_LAYERS; i++) {
                    const l = Builder.layers[i];
                    if (!l) continue;
                    const orig = { idx: i, al: l.al, aw: l.aw, at: l.at, ah: l.ah,
                                   dir: l.dir, shp: l.shp, color: l.color, hex: l.hex,
                                   effect: l.effect, blink: l.blink, emissiveStrobe: l._emissiveStrobe };
                    saved.push(orig);
                    if (!l.active) continue;

                    // Expand @variables@ FIRST  they may provide color, position, shape
                    if (l._extra?.length) {
                        l._extra.forEach(tok => {
                            const m = tok.match(/^@(\w+)@$/);
                            if (!m) return;
                            const key = m[1].toLowerCase();
                            // Use user-parsed variables first, fallback to hardcoded
                            const uv = this._userVariables?.[key];
                            const pos = uv || this.VAR_POSITIONS[key];
                            if (pos) {
                                if (pos.al !== undefined && l.al === 0) l.al = pos.al;
                                if (pos.aw !== undefined && l.aw === 100) l.aw = pos.aw;
                                if (pos.ah !== undefined && l.ah === 100) l.ah = pos.ah;
                                if (pos.at !== undefined && l.at === 0) l.at = pos.at;
                                if (pos.shp && !l.shp) l.shp = pos.shp;
                                if (pos.color && (!l.color || l.hex === '#000000')) {
                                    l.color = pos.color; l.hex = pos.hex || this._resolveHex(pos.color);
                                }
                            }
                            if (/^letter[a-z]$/i.test(key) || /^number\d$/i.test(key)) {
                                l.shp = 'SHP' + m[1].charAt(0).toUpperCase() + m[1].slice(1);
                            }
                        });
                        // Default to White for position-injected layers with no color
                        if (!l.color || l.hex === '#000000') {
                            const hasPos = l._extra.some(t => {
                                const m2 = t.match(/^@(\w+)@$/);
                                if (!m2) return false;
                                const k = m2[1].toLowerCase();
                                return this._userVariables?.[k] || this.VAR_POSITIONS[k];
                            });
                            if (hasPos) { l.color = 'White'; l.hex = '#FFFFFF'; }
                        }
                    }
                    this._applyStrobePreviewSemantics(l);

                    // After expansion, skip if still no color
                    if (!l.color) continue;

                    // For strip toys, remap AT/AHAL/AW (strips sample row 0 only)
                    if (isStrip) {
                        l.al = l.at;
                        l.aw = l.ah;
                        l.at = 0;
                        l.ah = 100;
                        if (l.dir === 'ADD') l.dir = 'ADR';
                        else if (l.dir === 'ADU') l.dir = 'ADL';
                    }
                }
            }
            origRender(dt);
            // Restore original layer values after render
            if (saved) {
                saved.forEach(r => {
                    const l = Builder.layers[r.idx];
                    l.al = r.al; l.aw = r.aw; l.at = r.at; l.ah = r.ah;
                    l.dir = r.dir; l.shp = r.shp; l.color = r.color; l.hex = r.hex;
                    l.effect = r.effect; l.blink = r.blink; l._emissiveStrobe = r.emissiveStrobe;
                });
            }
            if (this.jsonMode) {
                this._syncLiveGenStrHighlights(liveHighlightSection);
            }
            if (this.jsonMode && !Builder._previewScene) this._postRenderRouting();
        };

        // Override Builder's opacity/timing to match Simulator's calculateOpacity logic
        // Builder originals use hard on/off for Blink and ignore fu/fd entirely
        const origCyclePeriod = Builder._cyclePeriod.bind(Builder);
        Builder._cyclePeriod = (layer) => {
            if (!this.jsonMode) return origCyclePeriod(layer);
            if (layer.effect === 'Plasma') return origCyclePeriod(layer);
            const fu = layer.fu || 0, fd = layer.fd || 0;
            // Blink + FU/FD: breathing cycle = fu + fd
            if (layer.effect === 'Blink' && fu > 0 && fd > 0) return fu + fd;
            if (layer.effect === 'Blink' && (fu > 0 || fd > 0)) return Math.max(50, (layer.blink || 200));
            if (layer.effect === 'Blink') return Math.max(50, (layer.blink || 200));
            if (fu > 0 && fd > 0) return fu + fd;
            if (fd > 0 && !fu) return fd + 100;
            if (layer.duration > 0 && !layer.as) return layer.duration + (fd || 200);
            return origCyclePeriod(layer);
        };

        const origComputeOpacity = Builder._computeOpacity.bind(Builder);
        Builder._computeOpacity = (layer, tInCycle, cyclePeriod) => {
            if (!this.jsonMode) return origComputeOpacity(layer, tInCycle, cyclePeriod);
            const fu = layer.fu || 0, fd = layer.fd || 0;
            const bpw = layer.bpw !== undefined ? layer.bpw : 50;
            const maxDur = layer.maxDur || 0;

            // Respect hard cutoff for all effects, including Plasma.
            if (maxDur > 0 && tInCycle >= maxDur) return 0;

            // Case 1: Blink + FU/FD  smooth breathing (Simulator calculateOpacity Case 1)
            if (layer.effect === 'Blink' && (fu > 0 || fd > 0)) {
                const interval = (fu > 0 && fd > 0) ? fu + fd : Math.max(50, layer.blink || 200);
                const onTime = (fu > 0 && fd > 0) ? fu : Math.round(interval * bpw / 100);
                const cyclePos = tInCycle % interval;
                if (cyclePos < onTime) return fu > 0 ? Math.min(1, cyclePos / fu) : 1;
                return fd > 0 ? Math.max(0, 1 - (cyclePos - onTime) / fd) : 0;
            }
            // Case 2: Standard Blink  hard on/off with BPW
            if (layer.effect === 'Blink') {
                const period = Math.max(50, layer.blink || 200);
                const onTime = Math.round(period * bpw / 100);
                return (tInCycle % period) < onTime ? 1.0 : 0.0;
            }
            // Case 3: FU+FD cycling pulse (no blink, static)
            if (fu > 0 && fd > 0 && !(layer.as > 0)) {
                const total = fu + fd;
                const phase = tInCycle % total;
                return phase < fu ? phase / fu : 1 - (phase - fu) / fd;
            }
            // Case 4: Duration  on then optional fade-out
            // Skip for AS scroll effects  duration is a trigger timeout, not a visual property.
            // Scrolling effects are persistent in preview (no trigger loop to re-fire).
            if (layer.duration > 0 && (!layer.effect || layer.effect === 'Static (Solid)') && !layer.as) {
                if (tInCycle >= layer.duration + (fd || 0)) return 0;
                if (tInCycle >= layer.duration && fd > 0) return 1 - (tInCycle - layer.duration) / fd;
                if (fu > 0 && tInCycle < fu) return tInCycle / fu;
                return 1;
            }
            // Case 5: FD standalone  cycling fade out
            if (fd > 0 && !fu && !(layer.as > 0)) return 1 - (tInCycle % fd) / fd;
            // Case 6: FU only  fade in then hold
            if (fu > 0 && tInCycle < fu && !(layer.as > 0)) return tInCycle / fu;
            // Plasma: keep persistent in preview when scrolling (AS) is active.
            if (layer.effect === 'Plasma') {
                if (layer.duration > 0 && !(layer.as > 0)) {
                    if (tInCycle >= layer.duration + (fd || 0)) return 0;
                    if (fd > 0 && tInCycle >= layer.duration) return Math.max(0, 1 - (tInCycle - layer.duration) / fd);
                }
                if (fu > 0 || fd > 0) {
                    const total = fu + fd;
                    if (total > 0) {
                        const phase = tInCycle % total;
                        if (phase < fu) return fu > 0 ? Math.min(1, phase / fu) : 1;
                        return fd > 0 ? Math.max(0, 1 - (phase - fu) / fd) : 1;
                    }
                }
                return 1.0;
            }
            // Flicker
            if (layer.effect === 'Flicker') return Math.random() > 0.4 ? 1.0 : 0.0;
            return 1.0;
        };
    },

    _jsonApplyToSection() {
        if (Builder.activeSection) this._writeBackLayers(Builder.activeSection);
        this._regenerateSectionString(Builder.activeSection);
        Builder._saveState(); Builder.renderStaging();
        // Visual feedback: flash the Apply button
        const applyBtn = document.querySelector('.dob-apply');
        if (applyBtn) {
            applyBtn.classList.add('bj-applied-flash');
            setTimeout(() => applyBtn.classList.remove('bj-applied-flash'), 1200);
        }
    },

    // 
    //  Issue 7 FIX: ANY layer change  sectionLayers + card text + staging
    //  Now fires on color clicks, direction, sliders, shape, clear  everything
    // 
    _onBuilderLayerChanged() {
        if (this._suppressSync) return;
        if (this._preservedDraftRawText) this._clearPreservedDraftRawText();
        // New Effect mode gets priority  sync to panel regardless of _inPreview
        const hasExplicitRowTargetInNewMode =
            !!this._newEffectPort &&
            this._activeToyPort === this._newEffectPort &&
            Number.isFinite(this._editTargetMasterIdx);
        if (this._newEffectPort && !hasExplicitRowTargetInNewMode) {
            // New Effect edit must always render directly from current Builder layer state.
            // Clear any stale trigger scene/latched loop that would override slider/effect edits.
            // But do NOT clear a currently-running trigger preview scene; that would make
            // trigger playback appear dead until focus hops to another card.
            const hasActiveTriggerPreview = !!(this._activeTrigger && Builder._previewScene);
            if (!hasActiveTriggerPreview) {
                this._stopLatchedLoop();
                this._setPreviewScene(null);
            }
            this._syncNewEffectFromBuilder();
            if (this.latchedToys[this._newEffectPort]) {
                this._startDraftLatchedLoop(this._newEffectPort);
            }
            return;
        }
        if (this._inPreview) {
            // Recover from stale preview mode when editing mapped section layers.
            const sectionCheck = Builder.activeSection;
            const mapped = this.sectionLayers[sectionCheck];
            const mappedIdx = this._resolveMasterIndex(Builder.currentLayerIdx, mapped, sectionCheck);
            if (!mapped || mappedIdx < 0 || mappedIdx >= mapped.length) return;
            this._inPreview = false;
        }
        const section = Builder.activeSection;
        const allLayers = this.sectionLayers[section]; if (!allLayers) return;
        let srcIdx = this._resolveMasterIndex(Builder.currentLayerIdx, allLayers, section);
        // Deterministic edit target applies only in single-row selection mode.
        // When multiple rows are checked (trigger-combined editing), edits must follow
        // the active Builder tab/layer instead of any sticky explicit row target.
        let singleCheckedTarget = null;
        if (this._activeToyPort) {
            const checked = [];
            document.querySelectorAll('.bj-lcb[data-port="' + this._activeToyPort + '"]').forEach(cb => {
                if (!cb.checked) return;
                const idx = parseInt(cb.dataset.idx, 10);
                if (Number.isFinite(idx)) checked.push(idx);
            });
            if (checked.length === 1) singleCheckedTarget = checked[0];
        }
        if (singleCheckedTarget !== null &&
            this._editTargetPort && this._activeToyPort === this._editTargetPort &&
            Number.isFinite(this._editTargetMasterIdx) &&
            this._editTargetMasterIdx === singleCheckedTarget &&
            this._editTargetMasterIdx >= 0 && this._editTargetMasterIdx < allLayers.length) {
            srcIdx = this._editTargetMasterIdx;
        }
        if (srcIdx < 0 || srcIdx >= allLayers.length) return;
        const prevLayer = allLayers[srcIdx];
        const trig = prevLayer._trigger;
        const origRaw = prevLayer._originalRaw;
        const extra = prevLayer._extra;
        const prevRaw = prevLayer._raw;
        const prevRuntimeKey = this._layerRuntimeKey(prevLayer);
        // Build candidate layer from current Builder state
        const candidate = {
            ...Builder.layers[Builder.currentLayerIdx],
            bitmap: { ...(Builder.layers[Builder.currentLayerIdx]?.bitmap || {}) },
            _trigger: trig,
            _originalRaw: origRaw,
            _extra: Array.isArray(extra) ? [...extra] : extra
        };
        // BUG FIX: Always force active=true in sectionLayers  active=false is
        // only for Builder display masking, never for stored data
        candidate.active = true;
        if (prevLayer?._dirToken && (!candidate._dirToken || this._normalizeDirectionCode(candidate.dir) === this._normalizeDirectionCode(prevLayer.dir))) {
            candidate._dirToken = prevLayer._dirToken;
        }
        // Preserve the user's raw token layout whenever possible, updating only the
        // parameter(s) that actually changed. This prevents alias drift/reordering.
        let newRaw = prevRaw
            ? this._mergeEditedLayerRaw(prevRaw, prevLayer, candidate)
            : this._layerToRaw(candidate);
        const nextRuntimeKey = this._layerRuntimeKey(candidate);
        // Keep updates live even when raw text stays stable (e.g. defaults/equivalent tokens).
        if (newRaw === prevRaw && nextRuntimeKey === prevRuntimeKey) return;
        candidate._raw = newRaw;
        allLayers[srcIdx] = candidate;
        const toy = this.importedToys.find(t => t.toyName === section);
        if (toy) {
            this._refreshCardRow(toy.portId, srcIdx);
            this._updateCardChangeState(toy.portId);
            if (this._activeToyPort === toy.portId) {
                const hex = Builder.layers[Builder.currentLayerIdx].hex;
                if (hex && hex !== '#000000') this._indicateOn(toy.portId, hex);
            }
        }
        this._regenerateSectionString(section);

        if (Builder._initSparkleState) Builder._initSparkleState();
        this._syncBitmapInspectorUi();
        if (this._bitmapPreviewHold) {
            this._refreshBitmapInspectorPreview({ silent: true });
            return;
        }

        // Keep live preview in sync with edits when a trigger scene is active.
        if (this._latchedLoopPort && this.latchedToys[this._latchedLoopPort]) {
            const fallback = this._getSelectedLayers(this._latchedLoopPort);
            const loopTrigger = this._latchedSelectionOnly ? this._latchedLoopTrigger : (this._latchedLoopTrigger || this._activeTrigger);
            this._startLatchedLoop(this._latchedLoopPort, loopTrigger, fallback, {
                selectionOnly: this._latchedSelectionOnly
            });
        } else if (this._activeToyPort && this._activeTrigger) {
            const scene = this.buildSceneForTrigger({
                portId: this._activeToyPort,
                trigger: this._activeTrigger,
                syncActive: this._syncActive
            });
            this._setPreviewScene(scene);
            Builder._resetPreviewTiming();
        } else if (Builder._previewScene) {
            // Avoid stale scene cache when editing outside trigger-scoped preview.
            this._setPreviewScene(null);
            Builder._resetPreviewTiming();
        }
    },

    // 
    //  Issue 2: DISPLAY ROUTING  post-render cleanup per toy type
    // 
    _getDisplayTarget(toyName, portId = null, support = null) {
        const resolvedSupport = support || this._resolveToySupport({ toyName, portId });
        if (resolvedSupport?.display) return resolvedSupport.display;
        const l = String(toyName || '').toLowerCase();
        if (/\bmx\b/i.test(l)) {
            if (/\bmatrix\b/i.test(l)) return 'matrix';
            if (/strobe/i.test(l)) return 'matrix';
            if (/pf\s+(back|logo)/i.test(l)) return 'matrix';
            // Strict strip detection for classification: direct toyMap/exact-name matches only.
            // Do NOT use side-token inference here (it can misclassify matrix cards as strip).
            const mappedStrict = this._getStripIndices(
                { toyName: String(toyName || ''), portId },
                { strict: true }
            );
            if (Array.isArray(mappedStrict) && mappedStrict.length) return 'strip';
            // Preserve legacy explicit strip-name heuristics for common MX strip cards.
            if (/pf\s+(left|right)/i.test(l)) return 'strip';
            if (/magnasave/i.test(l)) return 'strip';
            return 'matrix';
        }
        if (/\brgb\b/i.test(l)) return 'indicator';
        if (/flasher|bumper|knocker|shaker|slingshot|strobe|beacon|fan|gear|bell|button|flipper|coin|launch|start|exit/i.test(l))
            return 'physical';
        return 'matrix';
    },

    _getToyCatalogMeta(toyRef) {
        const toy = (toyRef && typeof toyRef === 'object')
            ? toyRef
            : { portId: toyRef, toyName: String(toyRef || '') };
        const catalogById = (typeof window !== 'undefined' && window.__DOF_TOY_BY_ID) ? window.__DOF_TOY_BY_ID : new Map();
        const catalogByName = (typeof window !== 'undefined' && window.__DOF_TOY_BY_NAME) ? window.__DOF_TOY_BY_NAME : new Map();
        const toyId = parseInt(toy.portId, 10);
        return catalogById.get(toyId) || catalogByName.get(this._normToyName(toy.toyName)) || null;
    },

    _isStrobeToy(toyRef) {
        const toy = (toyRef && typeof toyRef === 'object')
            ? toyRef
            : { portId: toyRef, toyName: String(toyRef || '') };
        const meta = this._getToyCatalogMeta(toy);
        const name = String(meta?.name || toy.toyName || '').toLowerCase();
        return !/\bmx\b/.test(name) && /\bstrobe\b/.test(name);
    },

    _layerStrobeVarKey(layer) {
        const extra = Array.isArray(layer?._extra) ? layer._extra : [];
        for (const tok of extra) {
            const m = String(tok || '').match(/^@(\w+)@$/);
            if (!m) continue;
            const key = m[1].toLowerCase();
            if (key === 'strblft' || key === 'strbrgt') return key;
        }
        const raw = String(layer?._raw || '');
        const rawMatch = raw.match(/@(strblft|strbrgt)@/i);
        return rawMatch ? rawMatch[1].toLowerCase() : '';
    },

    _isVariableStrobeLayer(layer) {
        return !!this._layerStrobeVarKey(layer);
    },

    _toyNameOf(toyRef) {
        if (!toyRef) return '';
        if (typeof toyRef === 'string') return toyRef;
        return String(toyRef.toyName || toyRef.name || '');
    },

    _isBeaconToy(toyRef) {
        const name = this._toyNameOf(toyRef).toLowerCase();
        return /\bbeacon\b/.test(name) && !/\bmx\b/.test(name);
    },

    _isIncandescentPhysicalToy(toyRef) {
        const name = this._toyNameOf(toyRef).toLowerCase();
        return /button|flipper|coin|launch|start|exit|extra ball|how to play|genre/.test(name) && !/\bmx\b/.test(name);
    },

    _emissivePhysicalKind(toyRef) {
        if (this._isStrobeToy(toyRef)) return 'strobe';
        if (this._isBeaconToy(toyRef)) return 'beacon';
        if (this._isIncandescentPhysicalToy(toyRef)) return 'incandescent';
        return '';
    },

    _applyStrobePreviewSemantics(layer, opts = {}) {
        if (!layer) return layer;
        const treatAsStrobe = !!opts.force || this._isVariableStrobeLayer(layer);
        if (!treatAsStrobe) return layer;

        const raw = String(layer._raw || '');
        const hasExplicitBlink = /\bblink\b/i.test(raw);
        const hasExplicitFade = /\bFU\d+\b/i.test(raw) || /\bFD\d+\b/i.test(raw);
        const durationMs = Math.max(0, Number(layer.duration || layer.maxDur || 0));
        const pulseCount = Math.max(0, Number(layer._pulseCount || 0));
        const derivedBlink = (durationMs > 0 && pulseCount > 0)
            ? Math.max(20, Math.round(durationMs / Math.max(1, pulseCount)))
            : 80;

        layer._emissiveStrobe = true;
        if (durationMs > 0 && !hasExplicitBlink && !hasExplicitFade) {
            layer.effect = 'Blink';
            layer.blink = derivedBlink;
        }
        return layer;
    },

    _isEmissivePhysicalToy(toyRef) {
        return !!this._emissivePhysicalKind(toyRef);
    },

    _allowsDualEmissiveRouting(toyRef) {
        const kind = this._emissivePhysicalKind(toyRef);
        return kind === 'strobe' || kind === 'beacon';
    },

    _beaconPreviewHex(portId) {
        return this._beaconPreviewColors[String(portId)] || '#ffb300';
    },

    _previewColorForToy(toy, layers = []) {
        const kind = this._emissivePhysicalKind(toy);
        if (kind === 'strobe') return '#FFFFFF';
        if (kind === 'incandescent') return '#e6d7b3';
        if (kind === 'beacon') return this._beaconPreviewHex(toy?.portId);
        const fallback = layers?.[0]?.color;
        return this._resolveHex(fallback || 'White');
    },

    _beaconCycleDurationMs() {
        return 1200;
    },

    _beaconSwatchDefs() {
        return [
            { key: 'amber',  hex: '#ffb300' },
            { key: 'red',    hex: '#ff3b30' },
            { key: 'blue',   hex: '#3d7dff' },
            { key: 'yellow', hex: '#ffd84d' },
            { key: 'green',  hex: '#44d26a' },
            { key: 'purple', hex: '#9a66ff' },
            { key: 'orange', hex: '#ff8f3a' },
            { key: 'pink',   hex: '#ff5fb2' },
            { key: 'cyan',   hex: '#33d6ff' }
        ];
    },

    _activePreviewLayersForPort(portId) {
        if (this._isNewEffectDraftMode(portId)) return this._getDraftPreviewLayers(portId);
        return this._getSelectedLayers(portId);
    },

    _applyBeaconPreviewColor(portId, hex) {
        this._beaconPreviewColors[String(portId)] = hex;
        const card = document.getElementById('bjc-' + portId);
        card?.querySelectorAll('.bj-beacon-swatch').forEach(btn => {
            btn.classList.toggle('active', String(btn.dataset.hex || '').toLowerCase() === String(hex || '').toLowerCase());
        });
        const toy = this.importedToys.find(t => String(t.portId) === String(portId));
        if (!toy) return;
        const layers = this._activePreviewLayersForPort(portId);
        if (!layers.length) return;
        if (this.latchedToys[portId]) {
            this._startTimedToyPreview(toy, layers, { color: this._previewColorForToy(toy, layers), loop: true });
        } else if (this._timedToyPreviewState?.[String(portId)]) {
            this._startTimedToyPreview(toy, layers, { color: this._previewColorForToy(toy, layers), loop: false });
        }
    },

    _strobeRendersOnMatrix(toy) {
        return this._isStrobeToy(toy) && (toy?._display === 'matrix' || toy?._display === 'both');
    },

    _strobeMatrixPlacement(index = 0, total = 1) {
        const slotCount = Math.max(1, total || 1);
        const slotIndex = Math.min(Math.max(0, index || 0), slotCount - 1);
        const aw = 12;
        const ah = 22;
        const centerPct = ((slotIndex + 1) / (slotCount + 1)) * 100;
        const al = Math.max(0, Math.min(100 - aw, Math.round(centerPct - (aw / 2))));
        return { al, at: 4, aw, ah, shp: 'SHPCircle3' };
    },

    _hexToRgb(hex) {
        const safe = String(hex || '#ffffff').replace('#', '');
        const full = safe.length === 3 ? safe.split('').map(c => c + c).join('') : safe.padEnd(6, '0').slice(0, 6);
        const n = parseInt(full, 16);
        if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },

    _resolveDisplayToyForRender() {
        const byPort = this._activeToyPort
            ? this.importedToys.find(t => t.portId === this._activeToyPort)
            : null;
        // Render ownership is toy-scoped: focused card always wins.
        if (byPort) return byPort;

        const activeSection = (typeof Builder !== 'undefined') ? (Builder.activeSection || '') : '';
        const bySection = activeSection
            ? this.importedToys.find(t => t.toyName === activeSection)
            : null;
        return bySection || null;
    },

    // Bug 2: Map strip-targeted toys to specific strip indices
    // Returns array of strip indices this toy should render on, or null for all
    _getStripIndices(toyRef, opts = {}) {
        const strict = !!opts.strict;
        const cabinet = (typeof App !== 'undefined') ? App.data?.cabinet : null;
        const cabinetStrips = cabinet?.strips || [];
        if (!cabinetStrips.length) return [];

        const toy = (toyRef && typeof toyRef === 'object')
            ? toyRef
            : { toyName: String(toyRef || ''), portId: null };
        const toyName = String(toy.toyName || '').trim();
        const toyNameNorm = toyName.toLowerCase();
        const portNum = parseInt(toy.portId, 10);
        const support = toy._support || this._resolveToySupport(toy);
        if (support?.display === 'strip' && Array.isArray(support.stripIndices) && support.stripIndices.length) {
            return support.stripIndices.filter(idx => Number.isFinite(idx) && idx >= 0 && idx < cabinetStrips.length);
        }

        const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-]+/g, '').trim();
        const byStripName = (hwName) => {
            const n = norm(hwName);
            if (!n) return [];
            const idx = cabinetStrips.findIndex(s => norm(s.name) === n);
            return idx >= 0 ? [idx] : [];
        };

        // Primary path: explicit cabinet assignment model from Cabinet JSON + Cabinet.xml.
        const assignedStripHits = (support?.assignments || [])
            .filter(a => a.surface === 'strip')
            .flatMap(a => byStripName(a.outputName));
        if (assignedStripHits.length) {
            return [...new Set(assignedStripHits)];
        }

        // Legacy compatibility path: if a direct toyMap lookup happens to match.
        if (Number.isFinite(portNum) && cabinet?.toyMap && typeof cabinet.toyMap.get === 'function') {
            const mappedHw = cabinet.toyMap.get(portNum);
            const hit = byStripName(mappedHw);
            if (hit.length) return hit;
        }

        // Secondary path: exact strip-name match from toy label.
        const direct = byStripName(toyName);
        if (direct.length) return direct;

        if (strict) return [];

        // Non-strict mode keeps deterministic side-token matching as a convenience path.
        const stripName = (i) => (cabinetStrips[i]?.name || '').toLowerCase();
        const idxByToken = (token) => {
            const out = [];
            for (let i = 0; i < cabinetStrips.length; i++) {
                const sn = stripName(i);
                if (sn.includes(token)) out.push(i);
            }
            return out;
        };

        let inferred = [];
        const hasLeft = /\bleft\b/.test(toyNameNorm);
        const hasRight = /\bright\b/.test(toyNameNorm);
        if (hasLeft && !hasRight) inferred = idxByToken('left');
        else if (hasRight && !hasLeft) inferred = idxByToken('right');
        else if (/\bback\b|\brear\b/.test(toyNameNorm)) inferred = [...idxByToken('back'), ...idxByToken('rear')];

        inferred = [...new Set(inferred)].filter(i => i >= 0 && i < cabinetStrips.length);
        if (inferred.length) return inferred;

        // Last resort: if cabinet has exactly one strip, use it.
        if (cabinetStrips.length === 1) return [0];

        // Otherwise unresolved: no routing (never route to all strips).
        return [];
    },

    _warnUnresolvedStripRoute(toy, context = 'preview') {
        if (!toy) return;
        const key = `${context}:${toy.portId || '?'}:${toy.toyName || ''}`;
        const now = Date.now();
        if (this._routeWarnLastKey === key && (now - this._routeWarnLastTs) < 1200) return;
        this._routeWarnLastKey = key;
        this._routeWarnLastTs = now;
        console.warn(
            '[BuilderJSON] Unresolved strip route. Effect not rendered.',
            { context, portId: toy.portId, toyName: toy.toyName }
        );
    },

    _noteStripRouteFallback(toy, indices, context = 'preview') {
        if (!toy || !Array.isArray(indices) || !indices.length) return;
        const key = `${context}:${toy.portId || '?'}:${toy.toyName || ''}:${indices.join(',')}`;
        const now = Date.now();
        if (this._routeFallbackLastKey === key && (now - this._routeFallbackLastTs) < 1200) return;
        this._routeFallbackLastKey = key;
        this._routeFallbackLastTs = now;
        console.warn(
            '[BuilderJSON] Strict strip route unresolved; using toy-scoped fallback route.',
            { context, portId: toy.portId, toyName: toy.toyName, indices }
        );
    },

    _getEffectiveStripIndices(toy, context = 'preview') {
        if (!toy || toy._display !== 'strip') return [];

        // Preferred route: strict mapping (toyMap/exact strip-name).
        const strict = this._getStripIndices(toy, { strict: true });
        const strictValid = Array.isArray(strict) ? strict.filter(si => Number.isFinite(si) && si >= 0) : [];
        if (strictValid.length) return [...new Set(strictValid)];

        // Fallback route: toy-scoped inferred mapping (left/right/back tokens).
        // This is still toy-local and never fans out to all strips.
        const loose = this._getStripIndices(toy, { strict: false });
        const looseValid = Array.isArray(loose) ? loose.filter(si => Number.isFinite(si) && si >= 0) : [];
        if (looseValid.length) {
            const unique = [...new Set(looseValid)];
            this._noteStripRouteFallback(toy, unique, context);
            return unique;
        }

        return [];
    },

    _syncVerticalStripBindings(forceRecache = false) {
        if (!this.jsonMode || typeof Builder === 'undefined') return false;
        const vs = document.getElementById('bjson-vstrips');
        if (!vs) return false;
        const rack = vs.querySelector('.bj-vrack');
        if (!rack) return false;
        const cols = [...rack.children].filter(el => el.classList?.contains('bj-vcol'));
        if (!cols.length) return false;

        if (!Array.isArray(Builder._stripLedElsByStrip)) Builder._stripLedElsByStrip = [];
        if (!Array.isArray(Builder._stripColorCacheByStrip)) Builder._stripColorCacheByStrip = [];

        cols.forEach((col, sIdx) => {
            const leds = [...col.querySelectorAll('.bj-vled')];
            if (!leds.length) return;
            const ledCount = leds.length;
            const refs = new Array(ledCount);
            for (let i = 0; i < ledCount; i++) refs[i] = leds[i] || null;
            Builder._stripLedElsByStrip[sIdx] = refs;

            let cache = Builder._stripColorCacheByStrip[sIdx];
            if (forceRecache || !cache || cache.length !== ledCount) {
                cache = new Int32Array(ledCount);
                cache.fill(-1);
            }
            Builder._stripColorCacheByStrip[sIdx] = cache;
        });
        return true;
    },

    _applySyncRenderClasses(scene) {
        document.querySelectorAll('.bj-card').forEach(c => c.classList.remove('bj-sync-render'));
        if (!scene?.participants?.length) { this._updatePreviewScopeStatus(); return; }
        scene.participants.forEach(p => {
            if (!p.rendered) return;
            document.getElementById('bjc-' + p.portId)?.classList.add('bj-sync-render');
        });
        this._updatePreviewScopeStatus();
    },

    _setPreviewScene(scene) {
        if (scene && Object.keys(scene.stripLayersByIndex || {}).length) {
            this._syncVerticalStripBindings(false);
        }
        Builder._previewScene = scene || null;
        this._applySyncRenderClasses(scene);
    },

    _restoreScopedPreviewAfterLayerLoad(sectionName) {
        if (this._latchedLoopPort && this.latchedToys[this._latchedLoopPort]) {
            const latchedToy = this.importedToys.find(t => String(t.portId) === String(this._latchedLoopPort));
            if (!latchedToy || (sectionName && latchedToy.toyName !== sectionName)) return false;
            const fallback = this._getSelectedLayers(this._latchedLoopPort);
            const loopTrigger = this._latchedSelectionOnly
                ? this._latchedLoopTrigger
                : (this._latchedLoopTrigger || this._activeTrigger);
            this._startLatchedLoop(this._latchedLoopPort, loopTrigger, fallback, {
                selectionOnly: this._latchedSelectionOnly
            });
            return true;
        }
        if (!this._activeToyPort || !this._activeTrigger) return false;
        const activeToy = this.importedToys.find(t => t.portId === this._activeToyPort);
        if (!activeToy || (sectionName && activeToy.toyName !== sectionName)) return false;
        const scene = this.buildSceneForTrigger({
            portId: this._activeToyPort,
            trigger: this._activeTrigger,
            syncActive: this._syncActive
        });
        this._setPreviewScene(scene);
        Builder._resetPreviewTiming();
        return true;
    },

    _updatePreviewScopeStatus() {
        const el = document.getElementById('bjson-preview-scope');
        if (!el) return;
        const sync = this._syncActive ? 'ON' : 'OFF';
        const toy = this._activeToyPort || '';
        const trig = this._activeTrigger || '';
        const rendered = document.querySelectorAll('.bj-card.bj-sync-render').length;
        el.textContent = `Scope: Toy ${toy} | Trigger ${trig} | Sync ${sync} | Rendered Cards ${rendered}`;
    },

    _sceneRenderSurface(toy) {
        if (!toy) return null;
        if (toy._display === 'strip') return 'strip';
        if (toy._display === 'matrix' || toy._display === 'both') return 'matrix';
        return null;
    },

    _calcLayerCycleDuration(layer) {
        if (!layer) return 500;
        const strobeTiming = this._getStrobePreviewTiming(layer);
        if (strobeTiming) return Math.max(300, (strobeTiming.waitMs || 0) + strobeTiming.windowMs);
        if (layer.maxDur > 0) return Math.max(300, layer.maxDur);
        const hold = layer.duration > 0 ? layer.duration : 0;
        if ((layer.effect || '').toLowerCase() === 'blink') {
            const blink = Math.max(1, layer.blink || 200);
            return Math.max(300, (layer.wait || 0) + (layer.fu || 0) + blink + (layer.fd || 0) + blink);
        }
        const fade = (layer.fu || 0) + (layer.fd || 0);
        const legacyFade = layer.f > 0 ? (layer.f * 2) : 0;
        const total = (layer.wait || 0) + Math.max(fade, legacyFade) + hold;
        return Math.max(300, total || 500);
    },

    _samplePreviewLayerLevel(layer, elapsedMs, loop = false) {
        if (!layer) return 0;
        const strobeTiming = this._getStrobePreviewTiming(layer);
        if (strobeTiming) {
            const totalCycle = this._calcLayerCycleDuration(layer);
            let t = loop ? (elapsedMs % totalCycle) : Math.min(elapsedMs, totalCycle);
            if (t < strobeTiming.waitMs) return 0;
            t -= strobeTiming.waitMs;
            if (t >= strobeTiming.windowMs) return 0;
            const phase = t % strobeTiming.periodMs;
            return phase < strobeTiming.onMs ? 1 : 0;
        }
        const totalCycle = this._calcLayerCycleDuration(layer);
        let t = loop ? (elapsedMs % totalCycle) : Math.min(elapsedMs, totalCycle);
        const wait = Math.max(0, layer.wait || 0);
        if (t < wait) return 0;
        t -= wait;

        const effect = String(layer.effect || '').toLowerCase();
        if (effect === 'blink') {
            const fu = Math.max(0, layer.fu || layer.f || 0);
            const fd = Math.max(0, layer.fd || layer.f || 0);
            const blink = Math.max(1, layer.blink || 200);
            if (fu > 0) {
                if (t < fu) return t / fu;
                t -= fu;
            }
            if (t < blink) return 1;
            t -= blink;
            if (fd > 0) {
                if (t < fd) return 1 - (t / fd);
                t -= fd;
            }
            return 0;
        }

        const fu = Math.max(0, layer.fu || layer.f || 0);
        const fd = Math.max(0, layer.fd || layer.f || 0);
        const hold = Math.max(0, layer.maxDur || layer.duration || 0);
        if (fu > 0) {
            if (t < fu) return t / fu;
            t -= fu;
        }
        if (hold > 0) {
            if (t < hold) return 1;
            t -= hold;
        } else if (fu === 0 && fd === 0) {
            return t < totalCycle ? 1 : 0;
        }
        if (fd > 0) {
            if (t < fd) return 1 - (t / fd);
            t -= fd;
        }
        return hold > 0 ? 0 : 1;
    },

    _getStrobePreviewTiming(layer) {
        if (!layer?._emissiveStrobe) return null;
        const waitMs = Math.max(0, Number(layer.wait || 0));
        const durationMs = Math.max(0, Number(layer.maxDur || layer.duration || 0));
        const bpw = Math.max(5, Math.min(95, Number(layer.bpw ?? 50) || 50));
        const effect = String(layer.effect || '').toLowerCase();
        let periodMs = 0;
        let windowMs = durationMs;

        if (effect === 'blink' && Number(layer.blink || 0) > 0) {
            periodMs = Math.max(20, Number(layer.blink || 0));
            if (windowMs <= 0) windowMs = periodMs * 2;
        } else if (durationMs > 0 && Number(layer._pulseCount || 0) > 0) {
            periodMs = Math.max(20, durationMs / Math.max(1, Number(layer._pulseCount || 0)));
        } else if (durationMs > 0) {
            periodMs = 80;
        } else {
            return null;
        }

        const onMs = Math.max(1, Math.min(periodMs, periodMs * (bpw / 100)));
        return { waitMs, windowMs: Math.max(periodMs, windowMs), periodMs, onMs };
    },

    _applyBeaconPreviewFrame(portId, color, level, sweep = 50) {
        const safeLevel = Math.max(0, Math.min(1, level || 0));
        const ind = document.getElementById('bji-' + portId);
        const card = document.getElementById('bjc-' + portId);
        const icon = document.getElementById('bjtib-' + portId);
        const toy = this.importedToys.find(t => t.portId === portId);
        const effectColor = this._previewColorForToy(toy, []);
        const rgb = this._hexToRgb(effectColor);
        const sweepPos = Math.max(8, Math.min(92, Number(sweep) || 50));

        if (safeLevel <= 0.01) {
            this._indicateOff(portId);
            return;
        }

        const outer = (0.18 + safeLevel * 0.68).toFixed(3);
        const inner = (0.26 + safeLevel * 0.60).toFixed(3);
        if (ind) {
            const px = 10 + Math.round(safeLevel * 12);
            ind.style.width = px + 'px';
            ind.style.height = px + 'px';
            ind.style.borderRadius = Math.round(px / 2) + 'px';
            ind.style.marginRight = '4px';
            ind.style.flexShrink = '0';
            ind.style.background = `rgba(${rgb.r},${rgb.g},${rgb.b},${outer})`;
            ind.style.border = '1px solid ' + effectColor;
            ind.style.boxShadow =
                `0 0 ${12 + Math.round(safeLevel * 20)}px rgba(${rgb.r},${rgb.g},${rgb.b},${inner}), 0 0 ${24 + Math.round(safeLevel * 28)}px rgba(${rgb.r},${rgb.g},${rgb.b},${(safeLevel * 0.22).toFixed(3)})`;
        }
        if (card) {
            card.classList.add('bj-active');
            card.style.borderColor = effectColor;
            card.style.boxShadow =
                `0 0 ${16 + Math.round(safeLevel * 26)}px rgba(${rgb.r},${rgb.g},${rgb.b},${inner}), ` +
                `0 0 ${32 + Math.round(safeLevel * 34)}px rgba(${rgb.r},${rgb.g},${rgb.b},${(safeLevel * 0.22).toFixed(3)}), ` +
                `inset 0 0 ${10 + Math.round(safeLevel * 14)}px rgba(${rgb.r},${rgb.g},${rgb.b},${(safeLevel * 0.18).toFixed(3)})`;
            card.style.background =
                `radial-gradient(circle at ${sweepPos}% 52%, rgba(${rgb.r},${rgb.g},${rgb.b},${(0.34 + safeLevel * 0.34).toFixed(3)}) 0%, ` +
                `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.18 + safeLevel * 0.18).toFixed(3)}) 12%, ` +
                `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.06 + safeLevel * 0.08).toFixed(3)}) 22%, rgba(21,29,40,0) 34%), ` +
                `linear-gradient(180deg, rgba(${rgb.r},${rgb.g},${rgb.b},${(0.05 + safeLevel * 0.08).toFixed(3)}) 0%, rgba(21,29,40,0) 48%), #151d28`;
        }
        if (icon) {
            icon.classList.add('bj-tib-active');
            icon.style.color = effectColor;
            icon.style.textShadow =
                `0 0 ${10 + Math.round(safeLevel * 18)}px rgba(${rgb.r},${rgb.g},${rgb.b},${inner})`;
        }
    },

    _applyTimedToyPreviewLevel(portId, color, level) {
        const safeLevel = Math.max(0, Math.min(1, level || 0));
        const ind = document.getElementById('bji-' + portId);
        const card = document.getElementById('bjc-' + portId);
        const icon = document.getElementById('bjtib-' + portId);
        const toy = this.importedToys.find(t => t.portId === portId);
        const kind = this._emissivePhysicalKind(toy);
        const defaultIconColor = this._isStrobeToy(toy)
            ? '#dfe6ee'
            : ((this.CATS[toy?._cat] || this.CATS.other).color);
        if (kind === 'beacon') {
            this._applyBeaconPreviewFrame(portId, color, safeLevel, 50);
            return;
        }
        if (safeLevel <= 0.01) {
            if (ind) {
                ind.style.width = '';
                ind.style.height = '';
                ind.style.borderRadius = '';
                ind.style.marginRight = '';
                ind.style.flexShrink = '';
                ind.style.background = '#1a2030';
                ind.style.border = '';
                ind.style.boxShadow = 'none';
            }
            if (card) {
                card.classList.remove('bj-active');
                card.style.borderColor = '';
                card.style.boxShadow = '';
            }
            if (icon) {
                icon.style.color = defaultIconColor;
                icon.style.textShadow = 'none';
                icon.classList.remove('bj-tib-active');
            }
            return;
        }
        const effectColor = color || '#ffffff';
        const rgb = this._hexToRgb(effectColor);
        const outer = (kind === 'incandescent'
            ? (0.10 + safeLevel * 0.45)
            : (0.15 + safeLevel * 0.65)).toFixed(3);
        const inner = (kind === 'incandescent'
            ? (0.18 + safeLevel * 0.42)
            : (0.25 + safeLevel * 0.55)).toFixed(3);
        if (ind) {
            const px = 8 + Math.round(safeLevel * 8);
            ind.style.width = px + 'px';
            ind.style.height = px + 'px';
            ind.style.borderRadius = Math.round(px / 2) + 'px';
            ind.style.marginRight = '4px';
            ind.style.flexShrink = '0';
            ind.style.background = `rgba(${rgb.r},${rgb.g},${rgb.b},${outer})`;
            ind.style.border = '1px solid ' + effectColor;
            ind.style.boxShadow = `0 0 ${6 + Math.round(safeLevel * 12)}px rgba(${rgb.r},${rgb.g},${rgb.b},${inner})`;
        }
        if (card) {
            card.classList.add('bj-active');
            card.style.borderColor = effectColor;
            if (kind === 'incandescent') {
                card.style.boxShadow = `0 0 ${8 + Math.round(safeLevel * 14)}px rgba(${rgb.r},${rgb.g},${rgb.b},${inner}), inset 0 0 ${4 + Math.round(safeLevel * 8)}px rgba(${rgb.r},${rgb.g},${rgb.b},${(safeLevel * 0.16).toFixed(3)})`;
            } else {
                card.style.boxShadow = `0 0 ${10 + Math.round(safeLevel * 20)}px rgba(${rgb.r},${rgb.g},${rgb.b},${inner}), inset 0 0 ${6 + Math.round(safeLevel * 10)}px rgba(${rgb.r},${rgb.g},${rgb.b},${(safeLevel * 0.22).toFixed(3)})`;
            }
        }
        if (icon) {
            icon.classList.add('bj-tib-active');
            icon.style.color = effectColor;
            icon.style.textShadow = `0 0 ${6 + Math.round(safeLevel * 12)}px rgba(${rgb.r},${rgb.g},${rgb.b},${inner})`;
        }
    },

    _stopTimedToyPreview(portId, preserveVisual = false) {
        const key = String(portId);
        const state = this._timedToyPreviewState?.[key];
        if (!state) {
            if (!preserveVisual) this._indicateOff(portId);
            return;
        }
        if (state.rafId) cancelAnimationFrame(state.rafId);
        delete this._timedToyPreviewState[key];
        if (!preserveVisual) this._indicateOff(portId);
    },

    _startTimedToyPreview(toy, layers, opts = {}) {
        if (!toy || !Array.isArray(layers) || !layers.length) return;
        const portId = toy.portId;
        const loop = !!opts.loop;
        const color = opts.color || '#ffffff';
        if (this._isBeaconToy(toy)) {
            this._stopTimedToyPreview(portId, true);
            const startedAt = performance.now();
            const cycleMs = this._beaconCycleDurationMs();
            const sampleBeaconFrame = (elapsed) => {
                const phase = loop ? ((elapsed % cycleMs) / cycleMs) : Math.min(elapsed / cycleMs, 1);
                const peakA = Math.max(0, 1 - (Math.abs(phase - 0.20) / 0.14));
                const peakB = Math.max(0, 1 - (Math.abs(phase - 0.70) / 0.14));
                const level = 0.10 + (Math.max(peakA, peakB) * 0.90);
                const sweep = 14 + (phase * 72);
                return { level, sweep };
            };
            const step = (now) => {
                const elapsed = now - startedAt;
                const frame = sampleBeaconFrame(elapsed);
                this._applyBeaconPreviewFrame(portId, color, frame.level, frame.sweep);
                if (!loop && elapsed >= cycleMs) {
                    this._stopTimedToyPreview(portId);
                    return;
                }
                const state = this._timedToyPreviewState?.[String(portId)];
                if (state) state.rafId = requestAnimationFrame(step);
            };
            this._timedToyPreviewState[String(portId)] = { rafId: requestAnimationFrame(step) };
            this._applyBeaconPreviewFrame(portId, color, 1, 18);
            return;
        }
        const previewLayers = this._buildToyPreviewLayers(toy, layers, opts);
        if (!previewLayers.length) return;
        this._stopTimedToyPreview(portId, true);
        const startedAt = performance.now();
        const duration = Math.max(...previewLayers.map(l => this._calcLayerCycleDuration(l)), 300);
        const step = (now) => {
            const elapsed = now - startedAt;
            let level = 0;
            previewLayers.forEach(layer => {
                level = Math.max(level, this._samplePreviewLayerLevel(layer, elapsed, loop));
            });
            this._applyTimedToyPreviewLevel(portId, color, level);
            if (!loop && elapsed >= duration && level <= 0.01) {
                this._stopTimedToyPreview(portId);
                return;
            }
            const state = this._timedToyPreviewState?.[String(portId)];
            if (state) state.rafId = requestAnimationFrame(step);
        };
        this._timedToyPreviewState[String(portId)] = { rafId: requestAnimationFrame(step) };
    },

    _normalizePreviewLayerForToy(toy, layer, opts = {}) {
        const expanded = this._expandLayerForPreview(layer) || { ...layer };
        if (!expanded) return null;
        const emissiveKind = this._emissivePhysicalKind(toy);
        const emissiveHex = emissiveKind ? this._previewColorForToy(toy, [expanded]) : '';
        this._applyStrobePreviewSemantics(expanded, { force: this._isStrobeToy(toy) });
        if (this._isStrobeToy(toy)) {
            const placement = opts.strobePlacement || this._strobeMatrixPlacement(0, 1);
            expanded.color = 'White';
            expanded.hex = '#FFFFFF';
            expanded.shp = placement.shp || expanded.shp || 'SHPCircle3';
            expanded.al = placement.al;
            expanded.at = placement.at;
            expanded.aw = placement.aw;
            expanded.ah = placement.ah;
            expanded._emissiveStrobe = true;
        }
        if (this._isBeaconToy(toy)) {
            const hasTiming = Number(expanded.blink || 0) > 0 ||
                Number(expanded.fu || 0) > 0 ||
                Number(expanded.fd || 0) > 0 ||
                Number(expanded.duration || 0) > 0 ||
                Number(expanded.maxDur || 0) > 0 ||
                Number(expanded.f || 0) > 0;
            if (!hasTiming) {
                expanded.effect = 'Blink';
                expanded.blink = 180;
                expanded.fu = 70;
                expanded.fd = 220;
            }
        }
        const invalidEmissiveHex = !expanded.hex || expanded.hex === '#888888' || expanded.hex === '#000000';
        if ((!expanded.color || invalidEmissiveHex) && emissiveKind) {
            expanded.color = 'White';
            expanded.hex = emissiveHex;
        }
        if ((!expanded.hex || invalidEmissiveHex) && emissiveKind) {
            expanded.hex = emissiveHex;
        }
        if (!expanded.color && !this._previewLayerSupportsSourcePixels(expanded)) return null;
        return expanded;
    },

    _previewLayerSupportsSourcePixels(layer) {
        const b = layer?.bitmap || {};
        const hasBitmapPixels = [
            b.left,
            b.top,
            b.width,
            b.height,
            b.frame,
            b.frameCount,
            b.fps,
            b.frameDelayMs,
            b.stepDirection,
            b.stepSize,
            b.behaviour
        ].some(v => v !== null && v !== undefined && v !== '');
        if (hasBitmapPixels) return true;
        const shapeName = String(layer?.shp || '').trim();
        if (!shapeName) return false;
        const key = shapeName.toLowerCase().startsWith('shp') ? shapeName.toLowerCase().slice(3) : shapeName.toLowerCase();
        return !!App?.data?.shapes?.has?.(key);
    },

    _buildToyPreviewLayers(toy, layers, opts = {}) {
        const out = [];
        (layers || []).forEach(layer => {
            const normalized = this._normalizePreviewLayerForToy(toy, layer, opts);
            if (normalized) out.push({ ...normalized, active: true });
        });
        if (!out.length && this._isBeaconToy(toy)) {
            const hex = this._previewColorForToy(toy, []);
            out.push({
                color: 'White',
                hex,
                effect: 'Blink',
                blink: 180,
                fu: 70,
                fd: 220,
                duration: 0,
                maxDur: 0,
                wait: 0,
                active: true
            });
        }
        return out;
    },

    _calcToyPreviewDuration(toy, layers) {
        if (this._isBeaconToy(toy)) return this._beaconCycleDurationMs();
        return this._calcCycleDuration(layers);
    },

    _isCardSyncChecked(portId) {
        const cb = document.getElementById('bj-sync-cb-' + portId);
        if (cb) return !!cb.checked;
        return !!this._cardSyncState?.[String(portId)];
    },

    _setCardSyncChecked(portId, checked) {
        const key = String(portId);
        if (!this._cardSyncState) this._cardSyncState = {};
        this._cardSyncState[key] = !!checked;
    },

    _getSyncedPreviewPeerLayers(otherToy, preferredTriggers = []) {
        if (!otherToy) return [];
        const selected = this._getSelectedLayers(otherToy.portId);
        if (selected.length) return selected;
        const triggerSet = [...new Set((preferredTriggers || []).map(t => String(t || '')).filter(Boolean))];
        if (triggerSet.length) {
            const matched = (otherToy.layers || [])
                .filter(l => triggerSet.includes(String(l?._trigger || '')))
                .map(l => this._expandLayerForPreview(l) || l)
                .filter(Boolean);
            if (matched.length) return matched;
        }
        return (otherToy.layers || [])
            .map(l => this._expandLayerForPreview(l) || l)
            .filter(Boolean);
    },

    _markToyRowsFiring(portId, trigger = null) {
        document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => {
            const idx = Number(cb.dataset.idx);
            if (!Number.isFinite(idx)) return;
            const toy = this.importedToys.find(t => String(t.portId) === String(portId));
            const row = toy?.layers?.[idx];
            const matchesTrigger = trigger ? (String(row?._trigger || '') === String(trigger)) : cb.checked;
            if (!matchesTrigger) return;
            document.getElementById('bjlr-' + portId + '-' + idx)?.classList.add('bj-firing-row');
        });
    },

    _syncEmissivePhysicalTriggerPeers(sourceToy, trigger) {
        if (!this._syncActive || !sourceToy || !trigger) return;
        const familyKey = this._previewToySyncFamilyKey(sourceToy);
        this.importedToys.forEach(otherToy => {
            if (!otherToy || String(otherToy.portId) === String(sourceToy.portId)) return;
            if (!this._isEmissivePhysicalToy(otherToy)) return;
            if (!this._isCardSyncChecked(otherToy.portId)) return;
            const samePreviewFamily = !!familyKey && this._previewToySyncFamilyKey(otherToy) === familyKey;
            const hasTrigger = (otherToy.layers || []).some(l => String(l._trigger || '') === String(trigger));
            if (!samePreviewFamily && !hasTrigger) return;
            const otherCard = document.getElementById('bjc-' + otherToy.portId);
            if (otherCard) {
                otherCard.querySelectorAll('.bj-trig-btn').forEach(b => {
                    b.classList.toggle('bj-trig-active', hasTrigger && b.dataset.trig === trigger);
                });
            }
            const otherLayers = samePreviewFamily
                ? this._getSyncedPreviewPeerLayers(otherToy, [trigger])
                : (otherToy.layers || [])
                    .filter(l => String(l._trigger || '') === String(trigger))
                    .map(l => this._expandLayerForPreview(l) || l)
                    .filter(Boolean);
            if (!otherLayers.length) return;
            this._startTimedToyPreview(otherToy, otherLayers, {
                color: this._previewColorForToy(otherToy, otherLayers),
                loop: true
            });
            this._markToyRowsFiring(otherToy.portId, hasTrigger ? trigger : null);
        });
    },

    _previewToySyncFamilyKey(toy) {
        if (!toy) return '';
        if (!(this._isBeaconToy(toy) || this._isStrobeToy(toy))) return '';
        return String(toy._sourcePortId || toy.portId || '');
    },

    _syncPreviewToyManualPeers(sourceToy, sourceLayers, opts = {}) {
        if (!this._syncActive || !sourceToy || !Array.isArray(sourceLayers) || !sourceLayers.length) return;
        if (!this._isCardSyncChecked(sourceToy.portId)) return;
        const familyKey = this._previewToySyncFamilyKey(sourceToy);
        if (!familyKey) return;
        const loop = !!opts.loop;
        const markButtonId = opts.buttonId || '';
        const triggers = [...new Set(sourceLayers.map(l => String(l?._trigger || '')).filter(Boolean))];
        this.importedToys.forEach(otherToy => {
            if (!otherToy || String(otherToy.portId) === String(sourceToy.portId)) return;
            if (this._previewToySyncFamilyKey(otherToy) !== familyKey) return;
            if (!this._isCardSyncChecked(otherToy.portId)) return;
            const otherLayers = this._getSyncedPreviewPeerLayers(otherToy, triggers);
            if (!otherLayers.length) return;
            this._startTimedToyPreview(otherToy, otherLayers, {
                color: this._previewColorForToy(otherToy, otherLayers),
                loop
            });
            const markTrigger = triggers.find(tr => (otherToy.layers || []).some(l => String(l?._trigger || '') === tr)) || null;
            this._markToyRowsFiring(otherToy.portId, markTrigger);
            if (markButtonId) document.getElementById(markButtonId + otherToy.portId)?.classList.add('bj-firing');
            if (loop) this.latchedToys[otherToy.portId] = true;
        });
    },

    _clearSyncedPreviewToyPeers(sourceToy) {
        const familyKey = this._previewToySyncFamilyKey(sourceToy);
        if (!familyKey) return;
        this.importedToys.forEach(otherToy => {
            if (!otherToy || String(otherToy.portId) === String(sourceToy.portId)) return;
            if (this._previewToySyncFamilyKey(otherToy) !== familyKey) return;
            delete this.latchedToys[otherToy.portId];
            document.getElementById('bjm-' + otherToy.portId)?.classList.remove('bj-firing');
            document.getElementById('bjl-' + otherToy.portId)?.classList.remove('bj-firing');
            this._indicateOff(otherToy.portId);
        });
    },

    _buildToySceneLayers(toy, trigger, sceneIdxSeed, opts = {}) {
        const out = [];
        const layers = (toy.layers || []).filter(l => l._trigger === trigger);
        layers.forEach((l, i) => {
            const expanded = this._normalizePreviewLayerForToy(toy, l, opts);
            if (!expanded || (!expanded.color && !this._previewLayerSupportsSourcePixels(expanded))) return;
            out.push({ ...expanded, active: true, _sceneIdx: sceneIdxSeed + i });
        });
        return out;
    },

    _isSyncLive(syncActive = false) {
        if (typeof syncActive === 'boolean') return syncActive;
        return !!this._syncActive;
    },

    buildSceneForTrigger({ portId, trigger, syncActive }) {
        const primaryToy = this.importedToys.find(t => t.portId === portId);
        const scene = {
            matrixLayers: [],
            stripLayersByIndex: {},
            toyLayers: [],
            participants: [],
            unresolvedStripRoutes: []
        };
        if (!primaryToy || !trigger) return scene;

        const strips = (typeof App !== 'undefined') && App.data?.cabinet?.strips;
        const stripCount = (strips && strips.length) ? strips.length : 1;
        const syncLive = this._isSyncLive(syncActive);
        let sceneIdx = 0;
        const candidates = [];

        const collectToy = (toy, isPrimary) => {
            if (!toy) return;
            const hasTrigger = (toy.layers || []).some(l => l._trigger === trigger);
            if (!hasTrigger) return;

            let rendered = isPrimary;
            if (!isPrimary) {
                if (!syncLive) rendered = false;
                else {
                    const syncCb = document.getElementById('bj-sync-cb-' + toy.portId);
                    rendered = !syncCb || syncCb.checked;
                }
            }

            candidates.push({ toy, rendered, isPrimary });
            scene.participants.push({ portId: toy.portId, toyName: toy.toyName, display: toy._display, rendered });
        };

        collectToy(primaryToy, true);
        this.importedToys.forEach(toy => { if (toy.portId !== portId) collectToy(toy, false); });

        const matrixStrobes = candidates
            .filter(entry => entry.rendered && this._strobeRendersOnMatrix(entry.toy))
            .map(entry => entry.toy);
        const strobePlacementByPort = new Map();
        matrixStrobes.forEach((toy, idx) => {
            strobePlacementByPort.set(String(toy.portId), this._strobeMatrixPlacement(idx, matrixStrobes.length));
        });

        candidates.forEach(({ toy, rendered }) => {
            if (!rendered) return;
            const renderSurface = this._sceneRenderSurface(toy);
            if (!renderSurface) return;

            const toyLayers = this._buildToySceneLayers(toy, trigger, sceneIdx, {
                strobePlacement: strobePlacementByPort.get(String(toy.portId)) || null
            });
            sceneIdx += toyLayers.length + 1;
            if (!toyLayers.length) return;

            if (renderSurface === 'strip') {
                const mapped = this._getEffectiveStripIndices(toy, 'buildSceneForTrigger');
                let targets = Array.isArray(mapped) ? mapped.filter(si => si >= 0 && si < stripCount) : [];
                if (!targets.length) {
                    scene.unresolvedStripRoutes.push({ portId: toy.portId, toyName: toy.toyName });
                    this._warnUnresolvedStripRoute(toy, 'buildSceneForTrigger');
                    return;
                }
                targets.forEach(si => {
                    if (!scene.stripLayersByIndex[si]) scene.stripLayersByIndex[si] = [];
                    toyLayers.forEach(l => {
                        scene.stripLayersByIndex[si].push({ ...l, _stripStartPct: l.at, _stripLenPct: l.ah });
                    });
                });
                return;
            }

            toyLayers.forEach(l => scene.matrixLayers.push(l));
        });
        return scene;
    },

    _postRenderRouting() {
        const toy = this._resolveDisplayToyForRender();
        if (!toy) return;
        const target = toy._display;
        const COLS = Builder.previewCols || 100;
        const ROWS = Builder.previewRows || 16;
        const TOTAL_MX = COLS * ROWS;
        const clearMx = () => {
            for (let i = 0; i < TOTAL_MX; i++) {
                const el = document.getElementById('dob-mx-' + i);
                if (el) el.style.backgroundColor = '#111';
                // Keep App render cache in sync with manual DOM clears.
                // If cache stays non-zero while DOM is dark, subsequent frames can be skipped.
                if (Builder._matrixColorCache && i < Builder._matrixColorCache.length) {
                    Builder._matrixColorCache[i] = 0;
                }
            }
        };
        // Bug 2: Clear specific strips only  keep matched strip indices lit
        const clearStrips = (keepIndices) => {
            const strips = (typeof App !== 'undefined') && App.data?.cabinet?.strips;
            if (strips && strips.length) {
                strips.forEach((s, sIdx) => {
                    if (keepIndices && keepIndices.includes(sIdx)) return; // Keep this strip
                    const ledRefs = Builder._stripLedElsByStrip?.[sIdx] || [];
                    const cache = Builder._stripColorCacheByStrip?.[sIdx];
                    for (let i = 0; i < s.leds; i++) {
                        let el = ledRefs[i];
                        if (!el || !el.isConnected) {
                            el = document.getElementById('dob-str-' + sIdx + '-' + i);
                        }
                        if (el) el.style.backgroundColor = '#111';
                        // Sync scene-strip cache with the manual clear to avoid stale-skip writes.
                        if (cache && i < cache.length) cache[i] = 0;
                        if (el && ledRefs && (!ledRefs[i] || !ledRefs[i].isConnected)) ledRefs[i] = el;
                    }
                    if (Builder._stripLedElsByStrip) Builder._stripLedElsByStrip[sIdx] = ledRefs;
                });
            } else {
                const ledCount = Builder.previewStrip || 138;
                const ledRefs = Builder._stripLedElsByStrip?.[0] || [];
                const cache = Builder._stripColorCacheByStrip?.[0];
                for (let i = 0; i < ledCount; i++) {
                    let el = ledRefs[i];
                    if (!el || !el.isConnected) {
                        el = document.getElementById('dob-str-0-' + i);
                    }
                    if (el) el.style.backgroundColor = '#111';
                    if (cache && i < cache.length) cache[i] = 0;
                    if (el && ledRefs && (!ledRefs[i] || !ledRefs[i].isConnected)) ledRefs[i] = el;
                }
                if (Builder._stripLedElsByStrip) Builder._stripLedElsByStrip[0] = ledRefs;
            }
        };
        if (target === 'strip') {
            clearMx(); // Strip toys never show on matrix
            const stripIndices = this._getEffectiveStripIndices(toy, '_postRenderRouting');
            if (Array.isArray(stripIndices) && stripIndices.length) {
                clearStrips(stripIndices); // Clear all EXCEPT matched strips
            } else {
                clearStrips();
                this._warnUnresolvedStripRoute(toy, '_postRenderRouting');
            }
        }
        else if (target === 'matrix' || target === 'both') clearStrips(); // Matrix-capable toys clear ALL strips
        else if (target === 'indicator' || target === 'physical') { clearMx(); clearStrips(); }
    },

    // 
    //  LAYER TEXT HELPERS
    // 
    _normalizeIntensityTokenValue(v) {
        const raw = Number(v);
        if (!Number.isFinite(raw)) return 48;
        if (raw <= 0) return 0;
        if (raw <= 48) return Math.round(raw);
        return Math.max(0, Math.min(48, Math.round((raw / 255) * 48)));
    },
    _intensityFromHexToken(hexStr) {
        const n = parseInt(hexStr, 16);
        if (!Number.isFinite(n)) return 48;
        return this._normalizeIntensityTokenValue((n / 255) * 48);
    },
    _normalizeDirectionCode(dir) {
        return String(dir || '').toUpperCase().replace(/^ASD/, 'AD');
    },
    _normalizeEffectName(effect) {
        const raw = String(effect || '').trim();
        const e = raw.toLowerCase();
        if (!e || e === 'static' || e === 'static (solid)') return '';
        if (e.startsWith('pulse')) return 'Pulse';
        if (e === 'blink') return 'Blink';
        if (e === 'plasma') return 'Plasma';
        return raw;
    },
    _normalizedFadePair(l) {
        const f = Number(l?.f || 0);
        let fu = Number(l?.fu || 0);
        let fd = Number(l?.fd || 0);
        if (f > 0) {
            if (fu <= 0) fu = f;
            if (fd <= 0) fd = f;
        }
        return { fu: Math.max(0, fu), fd: Math.max(0, fd) };
    },
    _layerSemanticState(l) {
        if (!l) return null;
        const fade = this._normalizedFadePair(l);
        const effect = this._normalizeEffectName(l.effect);
        return {
            active: !!l.active,
            color: String(l.color || '').trim().toLowerCase(),
            effect,
            duration: Number(l.duration || 0),
            pulseCount: Number(l._pulseCount || 0),
            blink: Number(l.blink || 200),
            bpw: Number(l.bpw ?? 50),
            fadeUp: fade.fu,
            fadeDown: fade.fd,
            wait: Number(l.wait || 0),
            mhold: Number(l.mhold || 0),
            maxDur: Number(l.maxDur || 0),
            maxInt: this._normalizeIntensityTokenValue(l.maxInt),
            al: Number(l.al || 0),
            aw: Number(l.aw ?? 100),
            at: Number(l.at || 0),
            ah: Number(l.ah ?? 100),
            dir: this._normalizeDirectionCode(l.dir),
            as: Number(l.as || 0),
            ass: Number(l.ass || 0),
            assMs: Number(l.assMs || 0),
            asa: Number(l.asa || 0),
            afden: Number(l.afden || 0),
            afmin: Number(l.afmin ?? 50),
            afmax: Number(l.afmax ?? 150),
            affade: Number(l.affade || 0),
            shp: String(l.shp || '').trim().toUpperCase(),
            zlayer: Number(l.zlayer || 0),
            bitmapLeft: Number(l.bitmap?.left ?? 0),
            bitmapTop: Number(l.bitmap?.top ?? 0),
            bitmapWidth: Number(l.bitmap?.width ?? 0),
            bitmapHeight: Number(l.bitmap?.height ?? 0),
            bitmapFrame: Number(l.bitmap?.frame ?? 0),
            bitmapFrameCount: Number(l.bitmap?.frameCount ?? 0),
            bitmapFps: Number(l.bitmap?.fps ?? 0),
            bitmapStepDirection: String(l.bitmap?.stepDirection || '').trim().toUpperCase(),
            bitmapStepSize: Number(l.bitmap?.stepSize ?? 0),
            bitmapBehaviour: String(l.bitmap?.behaviour || '').trim().toUpperCase(),
            plasmaSpeed: Number(l.plasmaSpeed || 100),
            plasmaDensity: Number(l.plasmaDensity ?? l.plasmaScale ?? 100),
            plasmaColor2: this._normalizeApcToken(l.plasmaColor2 || this._extractApcFromExtra(l._extra)).toLowerCase(),
            extra: (l._extra || []).join('|')
        };
    },
    _layerRuntimeKey(l) {
        const s = this._layerSemanticState(l);
        if (!s) return '';
        return JSON.stringify({ ...s, hex: String(l?.hex || '').toLowerCase() });
    },
    _layerRuntimeKeyNoColor(l) {
        const s = this._layerSemanticState(l);
        if (!s) return '';
        const { color, ...rest } = s;
        return JSON.stringify(rest);
    },
    _isColorOnlyChange(prevLayer, nextLayer) {
        if (!prevLayer || !nextLayer) return false;
        const prevColor = (prevLayer.color || '').trim().toLowerCase();
        const nextColor = (nextLayer.color || '').trim().toLowerCase();
        if (!prevColor || !nextColor || prevColor === nextColor) return false;
        return this._layerRuntimeKeyNoColor(prevLayer) === this._layerRuntimeKeyNoColor(nextLayer);
    },
    _replaceColorInRaw(raw, newColor) {
        const str = String(raw || '').trim();
        if (!str) return str;
        const toks = str.split(/\s+/);
        let i = 0;
        if (i < toks.length && /^L-?\d+$/i.test(toks[i]) && i + 1 < toks.length && /^(W\d|S\d|ON|E\d)/i.test(toks[i + 1])) i++;
        if (i < toks.length && /^(W\d+|S\d+|ON|E\d+)(\|[A-Z]\d+)*$/i.test(toks[i])) i++;
        if (i < toks.length && !this._isP(toks[i]) && !/^\d+$/.test(toks[i]) && !toks[i].startsWith('@')) {
            toks[i] = newColor;
            return toks.join(' ');
        }
        // Fallback: inject color immediately after trigger when no explicit color token was detected.
        if (i <= toks.length) {
            toks.splice(i, 0, newColor);
            return toks.join(' ');
        }
        return str;
    },
    _mergeEditedLayerRaw(prevRaw, prevLayer, nextLayer) {
        const raw = String(prevRaw || '').trim();
        if (!raw) return this._layerToRaw(nextLayer);
        const prevState = this._layerSemanticState(prevLayer);
        const nextState = this._layerSemanticState(nextLayer);
        if (!prevState || !nextState) return this._layerToRaw(nextLayer);
        if (JSON.stringify(prevState) === JSON.stringify(nextState)) return raw;
        if (prevState.pulseCount !== nextState.pulseCount) return this._layerToRaw(nextLayer);
        if (this._isColorOnlyChange(prevLayer, nextLayer)) {
            return this._replaceColorInRaw(raw, nextLayer.color || prevLayer.color || '');
        }

        const toks = raw.split(/\s+/).filter(Boolean);
        if (!toks.length) return this._layerToRaw(nextLayer);

        const isColorToken = (tok) => !this._isP(tok) && !/^\d+$/.test(tok) && !tok.startsWith('@');
        const findPrefixTrigger = () => {
            let i = 0;
            let zprefixIdx = -1;
            if (i < toks.length && /^L-?\d+$/i.test(toks[i]) && i + 1 < toks.length && /^(W\d|S\d|ON|E\d)/i.test(toks[i + 1])) {
                zprefixIdx = i;
                i++;
            }
            const triggerIdx = (i < toks.length && /^(W\d+|S\d+|ON|E\d+)(\|[A-Z]\d+)*$/i.test(toks[i])) ? i : -1;
            return { zprefixIdx, triggerIdx, afterTriggerIdx: triggerIdx >= 0 ? triggerIdx + 1 : (zprefixIdx >= 0 ? zprefixIdx + 1 : 0) };
        };
        const findColorIdx = () => {
            const { afterTriggerIdx } = findPrefixTrigger();
            return (afterTriggerIdx < toks.length && isColorToken(toks[afterTriggerIdx])) ? afterTriggerIdx : -1;
        };
        const durationInsertIdx = () => {
            const { afterTriggerIdx } = findPrefixTrigger();
            let i = afterTriggerIdx;
            if (i < toks.length && isColorToken(toks[i])) i++;
            while (i < toks.length && /^@\w+@$/.test(toks[i])) i++;
            return i;
        };
        const findDurationIdx = () => {
            const i = durationInsertIdx();
            return (i < toks.length && /^\d+$/.test(toks[i])) ? i : -1;
        };
        const findAll = (re, start = 0) => {
            const out = [];
            for (let i = start; i < toks.length; i++) if (re.test(toks[i])) out.push(i);
            return out;
        };
        const removeAt = (idx) => { if (idx >= 0 && idx < toks.length) toks.splice(idx, 1); };
        const removeAll = (re, start = 0, keep = -1) => {
            const all = findAll(re, start).filter(i => i !== keep).sort((a, b) => b - a);
            all.forEach(removeAt);
        };
        const preserveTokenCase = (existingToken, nextToken) => {
            const oldTok = String(existingToken || '');
            const newTok = String(nextToken || '');
            if (!oldTok || !newTok) return newTok;
            const allLettersOld = /^[A-Za-z]+$/.test(oldTok);
            const allLettersNew = /^[A-Za-z]+$/.test(newTok);
            if (allLettersOld && allLettersNew && oldTok.length === newTok.length) {
                return newTok.split('').map((ch, i) => /[A-Z]/.test(oldTok[i]) ? ch.toUpperCase() : ch.toLowerCase()).join('');
            }
            const oldMatch = oldTok.match(/^([A-Za-z]+)(.*)$/);
            const newMatch = newTok.match(/^([A-Za-z]+)(.*)$/);
            if (oldMatch && newMatch) {
                const oldPrefix = oldMatch[1];
                const newPrefix = newMatch[1];
                const mapped = newPrefix.split('').map((ch, i) => {
                    if (i < oldPrefix.length && /[A-Z]/.test(oldPrefix[i])) return ch.toUpperCase();
                    return ch.toLowerCase();
                }).join('');
                return mapped + newMatch[2];
            }
            return newTok;
        };
        const setSingle = (re, token, insertAt = () => toks.length, start = 0) => {
            const all = findAll(re, start);
            const keep = all.length ? all[0] : -1;
            if (!token) {
                removeAll(re, start);
                return -1;
            }
            if (keep >= 0) toks[keep] = preserveTokenCase(toks[keep], token);
            else {
                const at = Math.max(0, Math.min(insertAt(), toks.length));
                toks.splice(at, 0, token);
            }
            const first = keep >= 0 ? keep : findAll(re, start)[0];
            removeAll(re, start, first);
            return first;
        };
        const setNumericToken = (re, prefix, value, defaultValue, allowNegative = false, start = 0) => {
            const n = Number(value || 0);
            if (n === Number(defaultValue)) {
                setSingle(re, null, () => toks.length, start);
                return;
            }
            if (!allowNegative && n < 0) return;
            const tok = prefix + String(Math.round(n));
            setSingle(re, tok, () => toks.length, start);
        };
        const setColor = () => {
            if (prevState.color === nextState.color) return;
            const idx = findColorIdx();
            const nextColor = String(nextLayer.color || '').trim();
            if (!nextColor) {
                if (idx >= 0) removeAt(idx);
                return;
            }
            if (idx >= 0) toks[idx] = nextColor;
            else toks.splice(findPrefixTrigger().afterTriggerIdx, 0, nextColor);
        };
        const setDuration = () => {
            if (prevState.duration === nextState.duration) return;
            const idx = findDurationIdx();
            if (nextState.duration > 0) {
                if (idx >= 0) toks[idx] = String(Math.round(nextState.duration));
                else toks.splice(durationInsertIdx(), 0, String(Math.round(nextState.duration)));
            } else if (idx >= 0) {
                removeAt(idx);
            }
        };
        const setFade = () => {
            if (prevState.fadeUp === nextState.fadeUp && prevState.fadeDown === nextState.fadeDown) return;
            const hasF = findAll(/^F\d+$/i).length > 0;
            const hasFU = findAll(/^FU\d+$/i).length > 0;
            const hasFD = findAll(/^FD\d+$/i).length > 0;
            const up = Math.max(0, Math.round(nextState.fadeUp));
            const down = Math.max(0, Math.round(nextState.fadeDown));
            if (up <= 0 && down <= 0) {
                setSingle(/^F\d+$/i, null);
                setSingle(/^FU\d+$/i, null);
                setSingle(/^FD\d+$/i, null);
                return;
            }
            const hadExplicit = hasFU || hasFD;
            const hadCompact = hasF && !hadExplicit;
            const preferCompact = (hadCompact && up === down) || (!hadExplicit && !hadCompact && up === down);
            if (preferCompact) {
                setSingle(/^FU\d+$/i, null);
                setSingle(/^FD\d+$/i, null);
                setSingle(/^F\d+$/i, 'F' + up);
            } else {
                setSingle(/^F\d+$/i, null);
                setSingle(/^FU\d+$/i, up > 0 ? ('FU' + up) : null);
                setSingle(/^FD\d+$/i, down > 0 ? ('FD' + down) : null);
            }
        };
        const setDir = () => {
            if (prevState.dir === nextState.dir) return;
            const idx = findAll(/^AS?D[DULR]$/i)[0] ?? -1;
            if (!nextState.dir) {
                if (idx >= 0) removeAt(idx);
                return;
            }
            const prior = idx >= 0 ? String(toks[idx] || '').toUpperCase() : String(prevLayer?._dirToken || '').toUpperCase();
            let out = nextState.dir;
            if ((prior.startsWith('ASD') || String(prevLayer?._dirToken || '').toUpperCase().startsWith('ASD')) && /^AD[DULR]$/.test(out)) {
                out = 'ASD' + out.slice(2);
            }
            if (idx >= 0) toks[idx] = out;
            else setSingle(/^AS?D[DULR]$/i, out);
        };
        const setBlink = () => {
            const nextEffect = nextState.effect;
            const prevEffect = prevState.effect;
            const blinkChanged = prevState.blink !== nextState.blink;
            if (!((prevEffect === 'Blink') || (nextEffect === 'Blink') || blinkChanged)) return;
            if (nextEffect !== 'Blink') {
                const idx = findAll(/^BLINK$/i)[0] ?? -1;
                if (idx >= 0) {
                    removeAt(idx);
                    if (idx < toks.length && /^\d+$/.test(toks[idx])) removeAt(idx);
                }
                return;
            }
            let idx = setSingle(/^BLINK$/i, 'BLINK');
            if (idx < 0) idx = findAll(/^BLINK$/i)[0] ?? -1;
            const val = Math.max(50, Math.round(nextState.blink || 200));
            if (idx >= 0) {
                if (val !== 200) {
                    if (idx + 1 < toks.length && /^\d+$/.test(toks[idx + 1])) toks[idx + 1] = String(val);
                    else toks.splice(idx + 1, 0, String(val));
                } else if (idx + 1 < toks.length && /^\d+$/.test(toks[idx + 1])) {
                    removeAt(idx + 1);
                }
            }
        };
        const setPlasma = () => {
            const nextEffect = nextState.effect;
            const prevEffect = prevState.effect;
            const changed = prevState.plasmaSpeed !== nextState.plasmaSpeed ||
                prevState.plasmaDensity !== nextState.plasmaDensity ||
                prevState.plasmaColor2 !== nextState.plasmaColor2;
            if (!((prevEffect === 'Plasma') || (nextEffect === 'Plasma') || changed)) return;
            if (nextEffect !== 'Plasma') {
                setSingle(/^APS\d+$/i, null);
                setSingle(/^APD\d+$/i, null);
                setSingle(/^APC.+$/i, null);
                setSingle(/^PS\d+$/i, null);
                setSingle(/^PV\d+$/i, null);
                return;
            }
            const aps = Math.max(1, Math.min(1000, Math.round(nextState.plasmaSpeed || 100)));
            const apd = Math.max(1, Math.min(1000, Math.round(nextState.plasmaDensity || 100)));
            setSingle(/^PS\d+$/i, null);
            setSingle(/^PV\d+$/i, null);
            setSingle(/^APS\d+$/i, 'APS' + aps);
            setSingle(/^APD\d+$/i, 'APD' + apd);
            const apc = this._normalizeApcToken(nextLayer.plasmaColor2 || this._extractApcFromExtra(nextLayer._extra));
            setSingle(/^APC.+$/i, apc ? ('APC' + apc) : null);
        };

        setColor();
        setDuration();
        setFade();
        setNumericToken(/^AT-?\d+$/i, 'AT', nextState.at, 0, true);
        setNumericToken(/^AH\d+$/i, 'AH', nextState.ah, 100);
        setNumericToken(/^AL-?\d+$/i, 'AL', nextState.al, 0, true);
        setNumericToken(/^AW\d+$/i, 'AW', nextState.aw, 100);
        setDir();
        setNumericToken(/^AS\d+$/i, 'AS', nextState.as, 0);
        setNumericToken(/^ASS\d+$/i, 'ASS', nextState.ass, 0);
        setNumericToken(/^ASSMS\d+$/i, 'ASSMS', nextState.assMs, 0);
        setNumericToken(/^ASA-?\d+$/i, 'ASA', nextState.asa, 0, true);
        if (prevState.afden !== nextState.afden || prevState.afmin !== nextState.afmin || prevState.afmax !== nextState.afmax || prevState.affade !== nextState.affade) {
            if (nextState.afden > 0) {
                setSingle(/^AFDEN\d+$/i, 'AFDEN' + Math.round(nextState.afden));
                setSingle(/^AFMIN\d+$/i, nextState.afmin !== 50 ? ('AFMIN' + Math.round(nextState.afmin)) : null);
                setSingle(/^AFMAX\d+$/i, nextState.afmax !== 150 ? ('AFMAX' + Math.round(nextState.afmax)) : null);
                setSingle(/^AFFADE\d+$/i, nextState.affade > 0 ? ('AFFADE' + Math.round(nextState.affade)) : null);
            } else {
                setSingle(/^AFDEN\d+$/i, null);
                setSingle(/^AFMIN\d+$/i, null);
                setSingle(/^AFMAX\d+$/i, null);
                setSingle(/^AFFADE\d+$/i, null);
            }
        }
        if (prevState.shp !== nextState.shp) {
            const shp = nextState.shp ? (nextState.shp.startsWith('SHP') ? nextState.shp : ('SHP' + nextState.shp)) : null;
            setSingle(/^SHP.+$/i, shp);
        }
        if (
            prevState.bitmapLeft !== nextState.bitmapLeft ||
            prevState.bitmapTop !== nextState.bitmapTop ||
            prevState.bitmapWidth !== nextState.bitmapWidth ||
            prevState.bitmapHeight !== nextState.bitmapHeight ||
            prevState.bitmapFrame !== nextState.bitmapFrame ||
            prevState.bitmapFrameCount !== nextState.bitmapFrameCount ||
            prevState.bitmapFps !== nextState.bitmapFps ||
            prevState.bitmapStepDirection !== nextState.bitmapStepDirection ||
            prevState.bitmapStepSize !== nextState.bitmapStepSize ||
            prevState.bitmapBehaviour !== nextState.bitmapBehaviour
        ) {
            setSingle(/^ABL-?\d+$/i, nextLayer.bitmap?.left !== null && nextLayer.bitmap?.left !== undefined ? ('ABL' + Math.round(nextLayer.bitmap.left)) : null);
            setSingle(/^ABT-?\d+$/i, nextLayer.bitmap?.top !== null && nextLayer.bitmap?.top !== undefined ? ('ABT' + Math.round(nextLayer.bitmap.top)) : null);
            setSingle(/^ABW\d+$/i, nextLayer.bitmap?.width !== null && nextLayer.bitmap?.width !== undefined ? ('ABW' + Math.round(nextLayer.bitmap.width)) : null);
            setSingle(/^ABH\d+$/i, nextLayer.bitmap?.height !== null && nextLayer.bitmap?.height !== undefined ? ('ABH' + Math.round(nextLayer.bitmap.height)) : null);
            setSingle(/^ABF\d+$/i, nextLayer.bitmap?.frame !== null && nextLayer.bitmap?.frame !== undefined ? ('ABF' + Math.round(nextLayer.bitmap.frame)) : null);
            setSingle(/^AAC\d+$/i, nextLayer.bitmap?.frameCount !== null && nextLayer.bitmap?.frameCount !== undefined ? ('AAC' + Math.round(nextLayer.bitmap.frameCount)) : null);
            setSingle(/^AAF\d+$/i, nextLayer.bitmap?.fps !== null && nextLayer.bitmap?.fps !== undefined ? ('AAF' + Math.round(nextLayer.bitmap.fps)) : null);
            setSingle(/^AAD[A-Z]$/i, nextLayer.bitmap?.stepDirection ? ('AAD' + String(nextLayer.bitmap.stepDirection).toUpperCase()) : null);
            setSingle(/^AAS\d+$/i, nextLayer.bitmap?.stepSize !== null && nextLayer.bitmap?.stepSize !== undefined ? ('AAS' + Math.round(nextLayer.bitmap.stepSize)) : null);
            setSingle(/^AAB.+$/i, nextLayer.bitmap?.behaviour ? ('AAB' + String(nextLayer.bitmap.behaviour).toUpperCase()) : null);
        }
        if (prevState.zlayer !== nextState.zlayer) {
            const { zprefixIdx, triggerIdx } = findPrefixTrigger();
            if (zprefixIdx >= 0) {
                if (nextState.zlayer !== 0) toks[zprefixIdx] = 'L' + Math.round(nextState.zlayer);
                else removeAt(zprefixIdx);
            } else {
                const zidx = findAll(/^L-?\d+$/i).find(i => i !== triggerIdx) ?? -1;
                if (nextState.zlayer !== 0) {
                    const ztok = 'L' + Math.round(nextState.zlayer);
                    if (zidx >= 0) toks[zidx] = ztok;
                    else toks.push(ztok);
                } else if (zidx >= 0) {
                    removeAt(zidx);
                }
            }
        }
        setBlink();
        setPlasma();
        setNumericToken(/^BPW\d+$/i, 'BPW', nextState.bpw, 50);
        setNumericToken(/^M\d+$/i, 'M', nextState.mhold, 0);
        setNumericToken(/^MAX\d+$/i, 'MAX', nextState.maxDur, 0);
        if (prevState.maxInt !== nextState.maxInt) {
            setSingle(/^I(#[0-9a-f]+|\d+)$/i, nextState.maxInt >= 0 && nextState.maxInt < 48 ? ('I' + Math.round(nextState.maxInt)) : null);
        }
        if (prevState.wait !== nextState.wait) {
            const waitTok = nextState.wait > 0 ? ('W' + Math.round(nextState.wait)) : null;
            const start = findPrefixTrigger().afterTriggerIdx;
            setSingle(/^W\d+$/i, waitTok, () => toks.length, start);
        }

        return toks.join(' ');
    },

    _layerToRaw(l) {
        const bitmap = l?.bitmap || {};
        const hasBitmap = ['left','top','width','height','frame','frameCount','fps','frameDelayMs','stepSize']
            .some(key => bitmap[key] !== null && bitmap[key] !== undefined && bitmap[key] !== '') ||
            !!bitmap.stepDirection || !!bitmap.behaviour;
        const useSourceColor = !!l?.useSourceColor || (!l?.color && (!!l?.shp || hasBitmap));
        if (!l || (!l.active && !l.color && !useSourceColor)) return '';
        const s = [];
        if (l._trigger) s.push(l._trigger);
        if (!useSourceColor && l.color) s.push(l.color);
        if (l.duration > 0) s.push(String(l.duration));
        if ((l._pulseCount || 0) > 0) s.push(String(l._pulseCount));
        const hasF = (l.f || 0) > 0;
        const hasFU = (l.fu || 0) > 0;
        const hasFD = (l.fd || 0) > 0;
        const isCombinedFade = hasF && hasFU && hasFD && l.fu === l.f && l.fd === l.f;
        if (isCombinedFade) {
            // Keep compact DOF form when FU/FD simply mirror F (common in imported configs).
            s.push('F' + l.f);
        } else {
            // If FU/FD diverge from F, prefer explicit FU/FD and avoid contradictory duplicates.
            if (hasFU) s.push('FU' + l.fu);
            if (hasFD) s.push('FD' + l.fd);
            if (!hasFU && !hasFD && hasF) s.push('F' + l.f);
        }
        if (l.at !== 0) s.push('AT' + l.at);
        if (l.ah !== 100) s.push('AH' + l.ah);
        if (l.al !== 0) s.push('AL' + l.al);
        if (l.aw !== 100) s.push('AW' + l.aw);
        if (l.dir) {
            const rawDir = (l._dirToken || '').toUpperCase();
            const normRaw = rawDir.replace(/^ASD/, 'AD');
            if (rawDir && normRaw === String(l.dir).toUpperCase()) s.push(rawDir);
            else s.push(l.dir);
        }
        if (l.as > 0) s.push('AS' + l.as);
        if (l.ass > 0) s.push('ASS' + l.ass);
        if (l.assMs > 0) s.push('ASSMS' + l.assMs);
        if (l.asa !== 0) s.push('ASA' + l.asa);
        if (l.afden > 0) { s.push('AFDEN' + l.afden); if (l.afmin !== 50) s.push('AFMIN' + l.afmin); if (l.afmax !== 150) s.push('AFMAX' + l.afmax); if (l.affade > 0) s.push('AFFADE' + l.affade); }
        if (l.shp) s.push(l.shp.startsWith('SHP') ? l.shp : 'SHP' + l.shp);
        if (bitmap.left !== null && bitmap.left !== undefined) s.push('ABL' + bitmap.left);
        if (bitmap.top !== null && bitmap.top !== undefined) s.push('ABT' + bitmap.top);
        if (bitmap.width !== null && bitmap.width !== undefined) s.push('ABW' + bitmap.width);
        if (bitmap.height !== null && bitmap.height !== undefined) s.push('ABH' + bitmap.height);
        if (bitmap.frame !== null && bitmap.frame !== undefined) s.push('ABF' + bitmap.frame);
        if (bitmap.frameCount !== null && bitmap.frameCount !== undefined) s.push('AAC' + bitmap.frameCount);
        if (bitmap.fps !== null && bitmap.fps !== undefined) s.push('AAF' + bitmap.fps);
        if (bitmap.stepDirection) s.push('AAD' + String(bitmap.stepDirection).toUpperCase());
        if (bitmap.stepSize !== null && bitmap.stepSize !== undefined) s.push('AAS' + bitmap.stepSize);
        if (bitmap.behaviour) s.push('AAB' + String(bitmap.behaviour).toUpperCase());
        if (l.zlayer !== 0) s.push('L' + l.zlayer);
        if (l.effect === 'Blink') { s.push('BLINK'); if (l.blink !== 200) s.push(String(l.blink)); }
        if (l.effect === 'Plasma') {
            const aps = Math.max(1, Math.min(1000, l.plasmaSpeed || 100));
            const apd = Math.max(1, Math.min(1000, l.plasmaDensity ?? l.plasmaScale ?? 100));
            s.push('APS' + aps);
            s.push('APD' + apd);
            const apc = this._normalizeApcToken(l.plasmaColor2 || this._extractApcFromExtra(l._extra));
            if (apc) s.push('APC' + apc);
        }
        if (l.bpw !== 50) s.push('BPW' + l.bpw);
        if (l.mhold > 0) s.push('M' + l.mhold);
        if (l.maxDur > 0) s.push('MAX' + l.maxDur);
        const iLevel = this._normalizeIntensityTokenValue(l.maxInt);
        if (iLevel >= 0 && iLevel < 48) s.push('I' + iLevel);
        if (l.wait > 0) s.push('W' + l.wait);
        if (l._extra && l._extra.length) l._extra.forEach(t => { if (!/^APC/i.test(t)) s.push(t); });
        return s.join(' ');
    },

    _refreshCardRow(portId, layerIdx) {
        const row = document.getElementById('bjlr-' + portId + '-' + layerIdx);
        if (!row) return;
        const sum = row.querySelector('.bj-lsum');
        if (!sum || sum === document.activeElement) return;
        const toy = this.importedToys.find(t => t.portId === portId);
        const layer = toy?.layers?.[layerIdx];
        if (layer) sum.textContent = layer._raw || this._layerToRaw(layer);
    },

    // 
    //  Issue 8: CHANGE TRACKING + RESET
    // 
    _updateCardChangeState(portId) {
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        const card = document.getElementById('bjc-' + portId); if (!card) return;
        const prevEdited = !!toy._edited;
        let hasChanges = false;
        toy.layers.forEach((l, i) => {
            const cur = l._raw || this._layerToRaw(l);
            const orig = l._originalRaw || '';
            const changed = (!orig) || (cur !== orig);
            if (changed) hasChanges = true;
            // Mark individual rows
            const row = document.getElementById('bjlr-' + portId + '-' + i);
            if (row) row.classList.toggle('bj-row-changed', changed);
        });
        const existing = card.querySelector('.bj-change-bar');
        if (hasChanges && !existing) {
            const bar = document.createElement('div'); bar.className = 'bj-change-bar';
            bar.innerHTML = '<span class="bj-change-warn">WARNING Edited</span>' +
                '<button class="bj-reset-btn" title="Reset all layers to original">RESET EFFECT</button>';
            bar.querySelector('.bj-reset-btn').onclick = () => this._resetCard(portId);
            card.appendChild(bar);
            card.classList.add('bj-changed');
        } else if (!hasChanges && existing) {
            existing.remove();
            card.classList.remove('bj-changed');
        }
        // Runtime edited state is based on edits since import baseline.
        toy._edited = hasChanges;
        const editMark = document.getElementById('bj-edit-mark-' + portId);
        if (editMark) editMark.style.display = hasChanges ? '' : 'none';
        if (prevEdited !== hasChanges) {
            this._renderFilterBar();
            this._applyFilter();
            this._filterSectionBtns();
        }
    },

    _revertAllChanges() {
        const edited = this.importedToys.filter(t => {
            return t.layers.some(l => {
                const cur = l._raw || this._layerToRaw(l);
                return (!l._originalRaw) || (cur !== l._originalRaw);
            });
        });
        if (!edited.length) { alert('No edited cards to revert.'); return; }
        if (!confirm('Revert ALL edits across ' + edited.length + ' card(s)? This cannot be undone.')) return;
        edited.forEach(t => this._resetCard(t.portId));
        this._renderFilterBar(); this._applyFilter();
        this._setStatus('Reverted ' + edited.length + ' edited card(s) to original state', '#4caf50');
    },

    _resetCard(portId) {
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        // Resetting a card must terminate New Effect mode for that same card.
        // Leaving it active can keep edit-mode guards engaged and suppress trigger playback.
        if (String(this._newEffectPort || '') === String(portId)) {
            this._cancelNewEffect(true);
        }
        this._clearCardPreviewRuntime(portId);
        // Remove added layers (no _originalRaw) and restore modified ones
        const cleaned = [];
        toy.layers.forEach((l) => {
            if (!l._originalRaw) return; // Skip added layers  they get removed
            const restored = this._parseLayer(l._originalRaw, this._parseContextForToy(toy));
            if (restored) {
                restored._originalRaw = l._originalRaw;
                restored._raw = l._originalRaw;
                cleaned.push(restored);
            } else {
                cleaned.push(l); // Keep as-is if parse fails
            }
        });
        toy.layers = cleaned;
        this.sectionLayers[toy.toyName] = cleaned;
        // Rebuild card visuals
        this._rebuildCardLayers(toy);
        this._rebuildCardTriggerBar(toy);
        if (Builder.activeSection === toy.toyName) {
            this._triggerScope = null; this._triggerScopeSection = null; this._scopePage = 0; this._activeTrigger = null;
            this._loadSectionLayers(toy.toyName);
        }
        this._regenerateSectionString(toy.toyName);
        this._updateCardChangeState(portId);
    },

    _clearCardPreviewRuntime(portId) {
        const pid = String(portId);
        const ownsLatch = String(this._latchedLoopPort || '') === pid || !!this.latchedToys[pid];
        const ownsTriggerLink = String(this._triggerLinkPort || '') === pid;
        const ownsFocus = String(this._activeToyPort || '') === pid;
        const scene = Builder._previewScene;
        const sceneOwnsPort = !!(scene && Array.isArray(scene.participants) &&
            scene.participants.some(p => String(p?.portId) === pid));
        const ownsFocusPreview = ownsFocus && !!this._inPreview;
        const hasCardRuntimeMarks =
            !!document.getElementById('bjm-' + pid)?.classList.contains('bj-firing') ||
            !!document.querySelector('#bjc-' + pid + ' .bj-firing-row');

        if (this.latchedToys[pid]) {
            delete this.latchedToys[pid];
            document.getElementById('bjl-' + pid)?.classList.remove('bj-firing');
        }
        if (String(this._latchedLoopPort || '') === pid) {
            this._stopLatchedLoop();
        }
        if (ownsTriggerLink) {
            this._setTriggerLinkMode(false);
        }
        if (ownsFocus) {
            this._activeTrigger = null;
        }

        this._indicateOff(pid);
        document.getElementById('bjm-' + pid)?.classList.remove('bj-firing');
        document.querySelectorAll('#bjc-' + pid + ' .bj-trig-btn.bj-trig-active')
            .forEach(btn => btn.classList.remove('bj-trig-active'));

        if (ownsLatch || ownsTriggerLink || sceneOwnsPort || ownsFocusPreview || hasCardRuntimeMarks) {
            this._clearBuilder();
            return;
        }
    },

    // 
    //  BUTTONS (Import/Export/Exit in Builder toolbar)
    // 
    _injectButtons() {
        const row = document.querySelector('.dob-export-row'); if (!row) return;
        const mk = (id, cls, txt, title, fn) => {
            const b = document.createElement('button');
            b.id = id; b.className = cls; b.textContent = txt; b.title = title; b.onclick = fn; return b;
        };
        let impBtn = document.getElementById('bjson-import-btn');
        if (!impBtn) {
            impBtn = mk('bjson-import-btn', 'dob-btn dob-btn-primary', '\u{1F4C1} Import JSON', 'Import DOF Config JSON or DirectOutputConfig INI (for variables)', null);
            row.insertBefore(impBtn, row.firstChild);
        }
        let expBtn = document.getElementById('bjson-export-btn');
        if (!expBtn) {
            expBtn = mk('bjson-export-btn', 'dob-btn dob-btn-amber', '\u{1F4BE} Export JSON', 'Export', null);
            expBtn.style.display = 'none';
            row.insertBefore(expBtn, row.firstChild);
        }
        let exitBtn = document.getElementById('bjson-exit-btn');
        if (!exitBtn) {
            exitBtn = mk('bjson-exit-btn', 'dob-btn dob-btn-danger dob-btn-sm', 'X Exit JSON', 'Restore normal Builder', null);
            exitBtn.style.display = 'none';
            row.insertBefore(exitBtn, row.firstChild);
        }
        let status = document.getElementById('bjson-status');
        if (!status) {
            status = document.createElement('span');
            status.id = 'bjson-status';
            status.style.cssText = 'font-size:0.6rem;color:#5a7a90;margin-left:6px;';
            row.insertBefore(status, row.firstChild);
        }
        let scope = document.getElementById('bjson-preview-scope');
        if (!scope) {
            scope = document.createElement('span');
            scope.id = 'bjson-preview-scope';
            scope.style.cssText = 'font-size:0.58rem;color:#4f738d;margin-left:8px;';
            row.insertBefore(scope, row.firstChild);
        }
        impBtn.onclick = () => document.getElementById('bjson-file-input')?.click();
        expBtn.onclick = () => this.handleExport();
        exitBtn.onclick = () => this.exitJsonMode();
        this._updatePreviewScopeStatus();
        this._setLegacyExamplesVisibility(this.jsonMode);
        if (this._examplePaletteState?.open) {
            this._ensureExamplesPalette();
            this._renderExamplesPalette();
        }
    },

    // 
    //  CSS
    // 
    _injectCSS() {
        if (this._cssInjected) return; this._cssInjected = true;
        const s = document.createElement('style'); s.id = 'bjson-css';
        s.textContent = `
:root { --bj-card-layer-max-h:110px; --bj-card-layer-max-h-two-col:110px; --bj-card-layer-min-h:22px; --bj-card-layer-max-h-max:55vh; }
/* Table title banner in JSON mode */
#bjson-table-title { display:none; align-items:center; justify-content:center; text-align:center; font-size:var(--dob-hdr-font-size,11px); font-weight:700; color:#f5a623; letter-spacing:1px; padding:0; margin:0; text-transform:uppercase; line-height:1; height:var(--dob-hdr-ctrl-h,20px); min-height:var(--dob-hdr-ctrl-h,20px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; justify-self:stretch; align-self:center; position:relative; top:-1px; }
.dob-json-mode #bjson-table-title { display:flex; }
.bj-genstr-resizing, .bj-genstr-resizing * { cursor:ns-resize !important; user-select:none !important; }
.bj-genstr-resize { height:12px; margin:2px 0 4px; border-top:1px solid #173147; background:linear-gradient(180deg, rgba(10,18,28,0.96) 0%, rgba(7,13,20,1) 100%); cursor:ns-resize; position:relative; border-radius:0 0 4px 4px; box-shadow:inset 0 1px 0 rgba(42,74,96,0.35); }
.bj-genstr-resize::before { content:''; position:absolute; left:50%; top:3px; transform:translateX(-50%); width:38px; height:4px; border-radius:999px; background:#3b617b; box-shadow:0 0 0 1px rgba(0,0,0,0.22), 0 0 8px rgba(0,188,212,0.14); }
.bj-genstr-resize:hover { background:linear-gradient(180deg, rgba(245,166,35,0.08) 0%, rgba(12,20,30,1) 100%); border-top-color:#2f5874; }
.bj-genstr-resize:hover::before { background:#f5a623; box-shadow:0 0 0 1px rgba(0,0,0,0.22), 0 0 10px rgba(245,166,35,0.22); }

/* Vertical strip rack */
#bjson-vstrips { background:#000; border:1px solid #0f2233; border-left:0; border-radius:0 2px 2px 0; padding:4px 3px; min-width:100px; max-width:180px; }
#bjson-vstrips .bj-vrack { display:flex; flex-direction:row; gap:2px; height:100%; }
#bjson-vstrips .bj-vcol { display:flex; flex-direction:column; align-items:center; flex:1; min-width:14px; gap:0; }
#bjson-vstrips .bj-vled { flex:1; width:100%; min-height:0; background:#111; border-bottom:1px solid rgba(0,0,0,0.3); }
#bjson-vstrips .bj-vlabel { font-size:5px; color:#4a6a80; max-width:22px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; padding:1px 0; }
#bjson-vstrips .bj-vcount { font-size:6px; color:#3a5a70; text-align:center; }
.bj-strip-toggle { font-size:0.5rem; padding:2px 6px; cursor:pointer; background:#0d1520; border:1px solid #1e2a3a; border-radius:3px; color:#5a9ab5; margin-bottom:3px; display:block; width:100%; text-align:center; }
.bj-strip-toggle:hover { background:#1a2a3a; border-color:#f5a623; color:#f5a623; }
.bj-strip-toggle.active { background:#f5a623; border-color:#f5a623; color:#0c1118; }
.bj-strip-toggle-row { display:flex; gap:3px; margin-bottom:3px; }
.bj-strip-toggle-row .bj-strip-toggle { margin-bottom:0; padding:1px 4px; flex:1; min-width:0; }
#bjson-vstrips.bj-strip-1px .bj-vled { width:3px; margin:0 auto; }
#bjson-vstrips.bj-strip-1px .bj-vcol { min-width:10px; }
/* Extended strip mode: 3rd flex child of dob-container alongside sidebar+workspace */
#bjson-vstrips.bj-strips-extended { flex:0 0 auto; min-width:110px; max-width:200px; width:150px; border-radius:0; border:none; border-left:1px solid #0f2233; overflow-y:auto; display:flex; flex-direction:column; align-self:stretch; }
#bjson-vstrips.bj-strips-extended .bj-vrack { flex:1; min-height:0; }

/* Filter bar */
.bj-filter-bar { display:flex; flex-wrap:wrap; gap:4px; padding:2px 0 1px; align-items:center; }
.bj-filter-pill { font-size:0.55rem; padding:2px 8px; border-radius:10px; cursor:pointer; border:1px solid #1e2a3a; background:#0d1520; color:#5a7a90; transition:all .12s; user-select:none; }
.bj-filter-pill:hover { border-color:#2a4a60; color:#8aacca; }
.bj-filter-pill.active { background:#1a2a3a; border-color:#f5a623; color:#f5a623; }
.bj-filter-pill.bj-pill-supported { border-color:#27543a; color:#7ddc9a; background:#0b1610; }
.bj-filter-pill.bj-pill-unsupported { border-color:#6a2020; color:#ff8a80; background:#180b0b; }
.bj-filter-pill.bj-pill-combo { border-color:#1d4f60; color:#6fdcff; background:#08141a; }
.bj-filter-pill.bj-pill-map { border-color:#5a4a10; color:#f5c04d; background:#151207; }
.bj-filter-pill.bj-pill-modified.active { border-color:#f5a623; color:#f5a623; }
.bj-filter-pill.bj-pill-edited.active { border-color:#00bcd4; color:#00bcd4; }
.bj-filter-pill.bj-pill-supported.active { border-color:#7ddc9a; color:#dff8e6; background:#173323; box-shadow:0 0 10px rgba(125,220,154,0.18); }
.bj-filter-pill.bj-pill-map.active { border-color:#f5c04d; color:#fff4c2; background:#352909; box-shadow:0 0 10px rgba(245,192,77,0.18); }
.bj-filter-pill.bj-pill-unsupported.active { border-color:#ff8a80; color:#ffe3e0; background:#3a1414; box-shadow:0 0 10px rgba(255,138,128,0.18); }
.bj-filter-pill.bj-pill-combo.active { border-color:#6fdcff; color:#e1fbff; background:#0d2c38; box-shadow:0 0 10px rgba(111,220,255,0.18); }
.bj-filter-pill .bj-pill-count { font-size:0.45rem; opacity:0.6; margin-left:2px; }
.bj-filter-toggle { font-size:0.5rem; color:#5a7a90; cursor:pointer; margin-left:4px; }
.bj-filter-toggle:hover { color:#f5a623; }
.bj-filter-actions { margin-left:auto; display:flex; align-items:center; gap:6px; }
.bj-clear-all-btn { font-size:0.55rem; padding:3px 12px; border-radius:10px; cursor:pointer; border:1px solid #5a2020; background:#1a0808; color:#e57373; margin-left:0; font-weight:600; letter-spacing:0.5px; transition:all .15s; }
.bj-clear-all-btn:hover { background:#3a1010; border-color:#ff5252; color:#fff; box-shadow:0 0 8px rgba(229,115,115,0.3); }
.bj-layout-bar { display:flex; flex-wrap:wrap; gap:6px; padding:2px 0 4px; align-items:center; }
.bj-layout-label { font-size:0.55rem; font-weight:700; color:#8aacca; letter-spacing:0.05em; text-transform:uppercase; }
.bj-layout-status { font-size:0.52rem; color:#5a7a90; padding:2px 8px; border-radius:10px; border:1px solid #1e2a3a; background:#0d1520; }
.bj-layout-status.bj-dirty { color:#f5c04d; border-color:#5a4a10; background:#151207; }
.bj-layout-actions { display:flex; flex-wrap:wrap; gap:5px; margin-left:auto; }
.bj-layout-btn { font-size:0.55rem; padding:3px 10px; border-radius:10px; cursor:pointer; border:1px solid #1e2a3a; background:#0d1520; color:#8aacca; font-weight:600; transition:all .15s; }
.bj-layout-btn:hover { border-color:#2a4a60; color:#f5a623; }
.bj-layout-btn:disabled { opacity:0.45; cursor:default; }
.bj-layout-btn-primary { border-color:#1d4f60; color:#6fdcff; background:#08141a; }
.bj-layout-btn-primary:hover { border-color:#6fdcff; color:#e1fbff; background:#0d2c38; }
.bj-layout-btn-warn { border-color:#5a4a10; color:#f5c04d; background:#151207; }
.bj-layout-btn-warn:hover { border-color:#f5c04d; color:#fff4c2; background:#352909; }

/* Cards */
.bj-cat-divider { grid-column:1/-1; font-size:0.58rem; color:#5a7a90; padding:3px 0 1px; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #1e2a3a; margin-top:2px; display:flex; align-items:center; gap:4px; }
.bj-cat-icon { font-size:0.7rem; }
.bj-cat-count { font-size:0.45rem; opacity:0.5; }
.bj-card-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:5px; margin-top:0; width:100%; min-width:0; }
.bj-card { background:#151d28; border:1px solid #1e2a3a; border-radius:3px; overflow:visible; transition:border-color .15s, box-shadow .15s; position:relative; cursor:default; min-width:0; }
.bj-card.bj-map-host-open { z-index:10050 !important; opacity:1 !important; isolation:isolate; }
.bj-card.bj-map-host-open.bj-card-unsupported,
.bj-card.bj-map-host-open.bj-empty { opacity:1 !important; }
.bj-card-resizing, .bj-card-resizing * { cursor:ns-resize !important; user-select:none !important; }
.bj-card:hover { border-color:#2a3a50; }
.bj-card.bj-focus { border-color:#00bcd4; box-shadow:0 0 12px rgba(0,188,212,0.4), 0 0 24px rgba(0,188,212,0.15); border-width:2px; }
.bj-card.bj-active { border-color:#f5a623; }
.bj-card.bj-sync-render { box-shadow: inset 0 0 0 1px #4ae168, 0 0 10px rgba(74,225,104,0.2); }
.bj-card.bj-max { grid-column:1/-1; }
.bj-card.bj-max .bj-layers { max-height:var(--bj-card-layer-max-h-max); }
.bj-card.bj-empty { opacity:0.45; }
.bj-card.bj-empty:hover { opacity:0.7; }
.bj-card.bj-hidden { display:none; }
.bj-card.bj-changed { border-color:#f57f17; }

/* Drag styles */
.bj-card.bj-dragging { opacity:0.4; border:1px dashed #f5a623; }
.bj-card.bj-drag-over { border-color:#00bcd4; box-shadow:0 0 12px rgba(0,188,212,0.5); border-style:dashed; }
.bj-drag-grip { width:14px; display:flex; align-items:center; justify-content:center; color:#3a5a70; font-size:12px; cursor:grab; border-right:1px solid #1e2a3a; user-select:none; flex-shrink:0; }
.bj-drag-grip:hover { color:#f5a623; background:#1a1408; }
.bj-card.bj-dragging .bj-drag-grip { cursor:grabbing; }

/* No Preview badge */
.bj-no-preview { display:inline-block; font-size:5px; padding:0 3px; border-radius:2px; margin-left:3px; vertical-align:middle; background:#2a1a08; color:#f57f17; border:1px solid #5a3a10; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
.bj-support-badge { display:inline-block; font-size:5px; padding:0 3px; border-radius:2px; margin-left:3px; vertical-align:middle; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
.bj-support-badge-map { background:#1f1a08; color:#f5c04d; border:1px solid #5a4a10; }
.bj-support-badge-bad { background:#2a1010; color:#ff8a80; border:1px solid #6a2020; }
.bj-support-badge-combo { background:#081b22; color:#6fdcff; border:1px solid #1d4f60; }

.bj-support-panel { display:none; margin:2px 0 4px; padding:3px 6px; background:#0a0f18; border:1px solid #1e2a3a; border-radius:3px; }
.bj-support-summary { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.bj-support-tag { font-size:0.5rem; padding:1px 5px; border-radius:10px; border:1px solid #2a3a4a; color:#7fa0b8; background:#0d1520; white-space:nowrap; }
.bj-support-ok { color:#7ddc9a; border-color:#27543a; }
.bj-support-map { color:#f5c04d; border-color:#5a4a10; }
.bj-support-bad { color:#ff8a80; border-color:#6a2020; }
.bj-support-combo { color:#6fdcff; border-color:#1d4f60; }
.bj-support-toggle { margin-left:auto; font-size:0.52rem; padding:2px 8px; color:#5a9ab5; background:#0d1520; border:1px solid #1e2a3a; border-radius:3px; cursor:pointer; }
.bj-support-toggle:hover { color:#f5a623; border-color:#f5a623; }
.bj-support-body { margin-top:4px; display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:6px; max-height:220px; overflow-y:auto; padding-right:2px; }
.bj-support-row { display:grid; grid-template-columns:minmax(0, 1fr); gap:5px; align-items:start; padding:5px 6px; background:#0d1520; border:1px solid #182433; border-radius:3px; min-height:70px; }
.bj-support-meta { flex:1; min-width:0; }
.bj-support-name { font-size:0.58rem; color:#d9e1e8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bj-support-note { font-size:0.48rem; color:#7a9aaa; margin-top:1px; line-height:1.2; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.bj-support-controls { display:flex; flex-direction:column; gap:4px; min-width:0; width:100%; }
.bj-support-pickers { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:4px; }
.bj-support-select { background:#080e15; color:#e0e0e0; border:1px solid #2a4a60; border-radius:3px; padding:2px 6px; font-size:0.52rem; }
.bj-support-select:focus { outline:none; border-color:#f5a623; }
.bj-support-borrow { background:#081119; color:#9fd1e0; border:1px solid #25455a; border-radius:3px; padding:2px 6px; font-size:0.52rem; }
.bj-support-borrow:focus { outline:none; border-color:#00bcd4; }
.bj-support-strips { display:flex; flex-wrap:wrap; gap:6px; }
.bj-support-strip { font-size:0.5rem; color:#8aa4b8; white-space:nowrap; cursor:pointer; }
.bj-support-strip input { accent-color:#f5a623; }
.bj-support-body::-webkit-scrollbar { width:8px; }
.bj-support-body::-webkit-scrollbar-thumb { background:#233448; border-radius:6px; }
.bj-support-unsupported { border-top:1px solid #16202c; padding-top:6px; }
.bj-support-subhdr { font-size:0.5rem; color:#f5a623; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:4px; }
.bj-support-list { display:flex; gap:4px; flex-wrap:wrap; }
.bj-support-chip { font-size:0.48rem; color:#c49797; background:#1a1010; border:1px solid #4a2020; border-radius:10px; padding:1px 6px; }

/* @variable@ highlight in layer text */
.bj-has-var { border-left:2px solid #9c27b0 !important; padding-left:4px !important; }

/* Toy Icon Bar */
.bj-toy-icon-bar { display:flex; align-items:center; gap:3px; padding:4px 8px; background:#0a0f18; border:1px solid #1e2a3a; border-radius:3px; margin:4px 0; flex-wrap:wrap; font-size:0.55rem; }
.bj-tib-label { color:#5a7a90; font-size:0.5rem; text-transform:uppercase; letter-spacing:0.5px; margin-right:2px; white-space:nowrap; }
.bj-tib-icon { cursor:pointer; font-size:0.7rem; transition:all .15s; padding:1px 2px; border-radius:2px; }
.bj-tib-icon:hover { background:#1a2a3a; transform:scale(1.3); }
.bj-tib-icon.bj-tib-empty { opacity:0.3; }
.bj-tib-icon.bj-tib-active { transform:scale(1.4); }
.bj-tib-spacer { width:8px; height:1px; border-right:1px solid #1e2a3a; margin:0 2px; }
.bj-tib-strip-status { margin-left:auto; font-size:0.45rem; white-space:nowrap; }

.bj-card-hdr { background:#111820; border-bottom:1px solid #1e2a3a; }
.bj-hdr-row1 { display:flex; align-items:center; padding:2px 4px; gap:4px; min-height:26px; }
.bj-hdr-row2 { display:flex; align-items:center; padding:2px 6px 3px; gap:6px; border-top:1px solid #151d28; min-height:22px; flex-wrap:wrap; }
.bj-drag-grip { width:16px; display:flex; align-items:center; justify-content:center; color:#3a5a70; font-size:14px; cursor:grab; user-select:none; flex-shrink:0; }
.bj-drag-grip:hover { color:#f5a623; }
.bj-card.bj-dragging .bj-drag-grip { cursor:grabbing; }
.bj-card-name2 { flex:1; font-size:0.74rem; color:#e0e4e8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bj-beacon-swatches { display:inline-flex; align-items:center; gap:3px; margin-left:auto; }
.bj-beacon-swatch { width:10px; height:10px; padding:0; border-radius:2px; border:1px solid rgba(255,255,255,0.18); cursor:pointer; box-shadow:inset 0 0 0 1px rgba(0,0,0,0.18); }
.bj-beacon-swatch:hover { transform:translateY(-1px); border-color:#f5c04d; }
.bj-beacon-swatch.active { border-color:#f5c04d; box-shadow:0 0 0 1px rgba(245,166,35,0.35), 0 0 8px rgba(245,166,35,0.18); }
.bj-port-badge { font-size:0.58rem; color:#7e9ab0; font-family:monospace; white-space:nowrap; flex-shrink:0; }
.bj-card.bj-card-unsupported { opacity:0.72; border-color:#4a2020; }
.bj-card.bj-card-needs-input { border-color:#5a4a10; box-shadow:0 0 0 1px rgba(245,166,35,0.12); }
.bj-card-acts2 { display:flex; gap:3px; flex-shrink:0; margin-left:4px; }
.bj-act-btn2 { background:#0c1824; border:1px solid #1e2a3a; color:#00bcd4; font-size:0.78rem; width:24px; height:20px; display:inline-flex; align-items:center; justify-content:center; padding:0; cursor:pointer; border-radius:2px; line-height:1; }
.bj-act-btn2:hover { border-color:#00bcd4; background:#0a2030; }
.bj-act-btn2.active, .bj-act-btn-examples.active { border-color:#f5a623; color:#ffd37a; background:#231808; box-shadow:0 0 10px rgba(245,166,35,0.18); }
.bj-act-btn2:disabled { opacity:0.42; cursor:not-allowed; border-color:#243140; color:#547086; background:#0d141d; }
.bj-act-btn-examples { color:#f5c04d; font-size:0.56rem; font-weight:700; letter-spacing:0.4px; width:28px; }
.bj-act-btn-dup, .bj-act-btn-dup-remove { font-size:0.5rem; font-weight:700; letter-spacing:0.25px; width:28px; }
.bj-act-btn-dup-remove { color:#e57373; }
.bj-act-ico { font-size:0.8rem; pointer-events:none; }
.bj-ctrl-btn { height:22px; padding:0 9px; font-size:0.6rem; font-weight:700; border-radius:4px; cursor:pointer; border:1px solid #3a2a00; background:#1a1500; color:#f5a623; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; line-height:1; letter-spacing:0.25px; }
.bj-ctrl-btn:hover { border-color:#f5a623; background:#2a2000; }
.bj-ctrl-btn.bj-firing { background:#f5a623; color:#0d1a26; border-color:#f5a623; }
.bj-ctrl-btn:disabled, .bj-ctrl-btn.bj-disabled { opacity:0.5; cursor:not-allowed; border-color:#2a3342; color:#5a7a90; background:#0f141c; }
.bj-ctrl-btn:disabled:hover, .bj-ctrl-btn.bj-disabled:hover { border-color:#2a3342; background:#0f141c; }
.bj-ctrl-m { min-width:28px; border-color:#24506a; color:#7fdcff; background:#081622; border-radius:4px 4px 4px 9px; }
.bj-ctrl-m:hover, .bj-ctrl-m.active { border-color:#59cfff; color:#dff8ff; background:#0f2634; }
.bj-ctrl-l { min-width:28px; border-color:#20615c; color:#7ee6d4; background:#081917; border-radius:12px; }
.bj-ctrl-l:hover, .bj-ctrl-l.active { border-color:#5ad8c0; color:#e7fffa; background:#0f2724; }
.bj-ctrl-new { min-width:58px; color:#ffd37a; border-color:#7a5612; background:#1b1406; border-radius:4px; }
.bj-ctrl-new:hover { border-color:#f5c04d; color:#fff0c9; background:#2a1d07; }
.bj-sync-label2 { display:inline-flex; align-items:center; gap:3px; font-size:0.55rem; color:#5a7a90; cursor:pointer; white-space:nowrap; }
.bj-sync-label2:hover { color:#4ae168; }
.bj-sync-cb2 { width:12px; height:12px; margin:0; cursor:pointer; accent-color:#4ae168; }
.bj-hdr-nav-hint { color:#7a9aaa; font-size:0.55rem; font-style:italic; }
.bj-indicator2 { width:8px; height:8px; border-radius:50%; background:#1a2030; flex-shrink:0; transition:all .15s; }
.bj-card-map { margin-left:auto; position:relative; display:flex; align-items:center; justify-content:flex-end; z-index:2; }
.bj-card.bj-map-host-open .bj-card-map { z-index:10060; }
.bj-map-btn { min-width:42px; height:18px; padding:0 8px; border-radius:10px; border:1px solid #2a4a60; background:#081119; color:#9fd1e0; font-size:0.52rem; font-weight:700; cursor:pointer; letter-spacing:0.2px; }
.bj-map-btn:hover, .bj-card-map.bj-open .bj-map-btn { border-color:#f5a623; color:#f5c04d; background:#101922; }
.bj-map-pop { position:fixed; top:0; left:0; z-index:12060; width:240px; padding:6px; border-radius:6px; border:1px solid #264055; background:#09111a !important; background-image:none !important; opacity:1 !important; isolation:isolate; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; box-shadow:0 10px 24px rgba(0,0,0,0.45); display:none; }
.bj-card-map.bj-map-up .bj-map-pop { top:0; bottom:auto; }
.bj-card-map.bj-open .bj-map-pop { display:block; }
.bj-map-note { font-size:0.48rem; color:#8ea5b8; line-height:1.2; margin-bottom:6px; cursor:move; user-select:none; }
.bj-map-group { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
.bj-map-chip { height:18px; padding:0 7px; border-radius:10px; border:1px solid #213748; background:#0d1520; color:#9fb7ca; font-size:0.48rem; cursor:pointer; }
.bj-map-chip:hover { border-color:#f5a623; color:#f5c04d; }
.bj-map-chip.active { border-color:#f5a623; background:#2a2008; color:#ffd37a; }
.bj-map-subhdr { font-size:0.45rem; color:#5f7e95; text-transform:uppercase; letter-spacing:0.5px; margin:2px 0 4px; }
.bj-map-borrow { width:100%; height:22px; background:#081119; color:#dbe6ee; border:1px solid #25455a; border-radius:4px; padding:0 6px; font-size:0.5rem; }
.bj-map-borrow:focus { outline:none; border-color:#f5a623; }
.bj-map-borrow-groups { display:flex; flex-direction:column; gap:5px; margin-bottom:6px; }
.bj-map-borrow-group { border:1px solid #1e2d3e; border-radius:4px; background:#0d1520; overflow:hidden; }
.bj-map-borrow-summary { cursor:pointer; list-style:none; padding:4px 7px; font-size:0.5rem; color:#9fb7ca; font-weight:700; }
.bj-map-borrow-summary::-webkit-details-marker { display:none; }
.bj-map-borrow-summary::before { content:'>'; color:#5f7e95; margin-right:6px; display:inline-block; transform:translateY(-1px); }
.bj-map-borrow-group[open] .bj-map-borrow-summary::before { transform:rotate(90deg) translateX(1px); }
.bj-map-borrow-hint { padding:0 7px 4px; font-size:0.44rem; color:#678096; line-height:1.25; }
.bj-map-borrow-list { display:flex; flex-direction:column; gap:4px; padding:0 6px 6px; }
.bj-map-borrow-opt { width:100%; min-height:22px; text-align:left; border:1px solid #203548; border-radius:4px; background:#0b121a; color:#dbe6ee; font-size:0.48rem; padding:3px 7px; cursor:pointer; }
.bj-map-borrow-opt:hover { border-color:#f5a623; color:#fff0c9; background:#171d26; }
.bj-map-strips { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
.bj-map-strip { font-size:0.47rem; color:#8aa4b8; padding:1px 6px; border:1px solid #203548; border-radius:9px; background:#0d1520; cursor:pointer; user-select:none; }
.bj-map-strip:hover { border-color:#00bcd4; color:#a5ebf4; }
.bj-map-strip.active { border-color:#f5a623; color:#ffd37a; background:#221907; }
.bj-map-strip input { display:none; }
.bj-ml { display:flex; flex-direction:column; border-right:1px solid #1e2a3a; }
.bj-ml-btn { width:20px; height:14px; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; cursor:pointer; border:none; color:#5a7a90; background:transparent; transition:all .12s; }
.bj-ml-btn:first-child { border-bottom:1px solid #1e2a3a; }
.bj-ml-btn:hover { color:#f5a623; background:#2a1a08; }
.bj-ml-btn.bj-firing { color:#fff; background:#f5a623; }
.bj-card-info { flex:1; padding:1px 5px; min-width:0; }
.bj-card-port { font-size:0.5rem; color:#5a7a90; font-family:monospace; }
.bj-type-badge { display:inline-block; font-size:6px; padding:0 3px; border-radius:2px; font-weight:600; text-transform:uppercase; margin-left:3px; vertical-align:middle; }
.bj-badge-mx { background:#0a2a30; color:#00bcd4; } .bj-badge-rgb { background:#2a1a08; color:#f5a623; }
.bj-badge-flasher { background:#2a1a08; color:#ff9800; } .bj-badge-bumper { background:#2a0a18; color:#e91e63; }
.bj-badge-strobe { background:#18222c; color:#dfe6ee; } .bj-badge-solenoid { background:#1a2a10; color:#8bc34a; } .bj-badge-button { background:#1a0a2a; color:#9c27b0; }
.bj-badge-other { background:#1a1a1a; color:#607d8b; }
.bj-badge-disp { display:inline-block; font-size:5px; padding:0 2px; border-radius:2px; margin-left:2px; vertical-align:middle; border:1px solid #2a3a50; color:#4a6a80; }
.bj-mod-star { color:#f5a623; font-size:7px; margin-left:2px; }
.bj-edit-mark { color:#00bcd4; font-size:7px; margin-left:2px; }
.bj-card-name { font-size:0.65rem; color:#e0e4e8; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bj-indicator { width:8px; height:8px; border-radius:4px; background:#1a2030; border:1px solid #1e2a3a; margin-right:4px; flex-shrink:0; transition:all .2s; }
.bj-card-acts { display:flex; flex-direction:column; border-left:1px solid #1e2a3a; }
.bj-act-btn { width:18px; height:14px; display:flex; align-items:center; justify-content:center; font-size:7px; cursor:pointer; border:none; color:#5a7a90; background:transparent; }
.bj-act-btn:hover { color:#f5a623; background:#2a1a08; }
.bj-act-btn:first-child { border-bottom:1px solid #1e2a3a; }

/* Issue 1: Wrapping trigger toolbar  ALL triggers visible */
.bj-toolbar { display:flex; align-items:center; gap:2px; padding:2px 4px; background:#0d1520; border-bottom:1px solid #0a0f18; font-size:0.5rem; flex-wrap:wrap; }
.bj-toolbar label { color:#5a7a90; cursor:pointer; white-space:nowrap; flex-shrink:0; }
.bj-toolbar label:hover { color:#f5a623; }
.bj-toolbar .bj-sep { width:1px; height:10px; background:#1e2a3a; margin:0 2px; flex-shrink:0; }
.bj-trig-btn { color:#00bcd4; cursor:pointer; font-size:0.45rem; padding:1px 3px; border-radius:2px; transition:background .1s; white-space:nowrap; border:1px solid transparent; }
.bj-trig-btn:hover { background:#0a2a30; border-color:#0a3a40; }
.bj-trig-btn.bj-trig-active { background:#0a3a40; color:#fff; border-color:#00bcd4; }
.bj-trig-btn.bj-trig-disabled { color:#5a7a90; border-color:#1a2430; cursor:not-allowed; opacity:0.55; }
.bj-trig-btn.bj-trig-disabled:hover { background:transparent; border-color:#1a2430; }
.bj-nav-hint { color:#7a9aaa; font-size:0.55rem; font-style:italic; margin-left:6px; white-space:nowrap; flex-shrink:0; }
.bj-card-nav-hint { color:#7a9aaa; font-size:0.55rem; font-style:italic; margin-left:6px; }

.bj-layers { min-height:var(--bj-card-layer-min-h); max-height:var(--bj-card-layer-max-h); overflow-y:auto; scrollbar-width:thin; scrollbar-color:#2a3a50 transparent; }
.bj-layer-row { display:flex; align-items:center; padding:0px 3px 0px 1px; border-bottom:1px solid #0a0f18; font-family:'Consolas','SF Mono',monospace; font-size:0.55rem; cursor:default; transition:background .08s; }
.bj-layer-row:hover { background:#1a2433; }
.bj-layer-row:last-child { border-bottom:none; }
.bj-layer-row.bj-row-selected { background:#13263a; box-shadow:inset 0 0 0 1px rgba(0,188,212,0.35); }
.bj-layer-row.bj-firing-row { background:#1a2a18; }
.bj-layer-row.bj-row-changed { border-left:2px solid #f5a623; }
.bj-lcb { width:10px; height:10px; accent-color:#f5a623; cursor:pointer; flex-shrink:0; margin-right:2px; }
.bj-lnum { width:14px; text-align:right; color:#5a7a90; font-size:7px; margin-right:2px; flex-shrink:0; }
.bj-lsum { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#c8ccd0; outline:none; cursor:text; padding:0 2px; border-radius:2px; transition:background .1s; }
.bj-lsum:focus { white-space:pre-wrap; word-break:break-all; overflow:visible; background:#0d1a28; box-shadow:inset 0 0 0 1px #2a4a60; }
.bj-play-btn { width:18px; height:16px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#56d97d; cursor:pointer; flex-shrink:0; border:1px solid transparent; background:transparent; border-radius:4px; }
.bj-play-btn:hover { color:#effff3; background:#14311d; border-color:#2a6d40; box-shadow:0 0 8px rgba(86,217,125,0.18); }

/* Issue 8: Change bar */
.bj-change-bar { display:flex; align-items:center; justify-content:space-between; padding:2px 6px; background:#1a1408; border-top:1px solid #3a2a10; }
.bj-change-warn { font-size:0.5rem; color:#f5a623; }
.bj-reset-btn { font-size:0.48rem; color:#e57373; background:transparent; border:1px solid #5a2020; border-radius:3px; padding:1px 6px; cursor:pointer; font-weight:600; }
.bj-reset-btn:hover { background:#2a1010; border-color:#e57373; color:#fff; }

/* Issue 3: Physical toy flash animation */
@keyframes bj-flash-pulse { 0%{box-shadow:0 0 0 rgba(255,152,0,0)} 30%{box-shadow:0 0 14px rgba(255,152,0,0.7)} 100%{box-shadow:0 0 0 rgba(255,152,0,0)} }
.bj-card.bj-phys-flash { animation: bj-flash-pulse 0.4s ease-out; }
/* Apply button flash */
@keyframes bj-applied-glow { 0%{box-shadow:0 0 0 rgba(76,175,80,0);background:#1a3a1a} 30%{box-shadow:0 0 16px rgba(76,175,80,0.8);background:#2e7d32} 100%{box-shadow:0 0 0 rgba(76,175,80,0);background:''} }
.bj-applied-flash { animation: bj-applied-glow 1.2s ease-out !important; }

/* New Effect panel  inside card title area */
.bj-ne-bar { display:none; background:#0d1520; border:1px solid #1e3a4a; border-radius:3px; padding:5px 8px; margin:4px 0; font-size:0.52rem; }
.bj-ne-bar.bj-ne-active { display:flex; flex-wrap:wrap; align-items:center; gap:5px; border-color:#f5a623; box-shadow:inset 0 0 12px rgba(245,166,35,0.08); }
.bj-ne-check { accent-color:#f5a623; cursor:pointer; }
.bj-ne-label { color:#f5a623; font-weight:700; font-size:0.55rem; cursor:pointer; letter-spacing:0.5px; }
.bj-ne-trigger { background:#080e15; color:#e0e0e0; border:1px solid #2a4a60; border-radius:3px; padding:2px 4px; font-size:0.52rem; width:65px; font-family:monospace; }
.bj-ne-trigger:focus { border-color:#f5a623; outline:none; }
.bj-ne-input { background:#080e15; color:#e0e0e0; border:1px solid #2a4a60; border-radius:3px; padding:2px 6px; font-size:0.5rem; flex:1; min-width:160px; font-family:monospace; }
.bj-ne-input:focus { border-color:#f5a623; outline:none; }
.bj-ne-add { background:#1a3a1a; color:#4caf50; border:1px solid #2e5a2e; border-radius:3px; padding:2px 10px; cursor:pointer; font-weight:700; font-size:0.52rem; }
.bj-ne-add:hover { background:#2e7d32; color:#fff; }
.bj-ne-clear-draft { min-width:24px; height:20px; background:#1a0808; color:#ff8a80; border:1px solid #6a2020; border-radius:3px; padding:0 8px; cursor:pointer; font-weight:700; font-size:0.58rem; line-height:1; }
.bj-ne-clear-draft:hover { background:#3a1010; color:#fff; box-shadow:0 0 8px rgba(255,138,128,0.16); }
.bj-ne-cancel { background:#1a0808; color:#e57373; border:1px solid #5a2020; border-radius:3px; padding:2px 8px; cursor:pointer; font-size:0.52rem; }
.bj-ne-cancel:hover { background:#3a1010; color:#fff; }
.bj-ne-hint { color:#5a7a90; font-size:0.43rem; width:100%; margin-top:2px; }
.dob-json-mode .dob-acc[data-acc-id="examples"],
.dob-json-mode #dob-acc-examples-body,
.dob-json-mode #dob-examples-grid,
.dob-json-mode #dob-ex-toggle,
.dob-json-mode #dob-examples-count { display:none !important; }
/* Card editing mode */
.bj-card.bj-editing { border-color:#f5a623 !important; box-shadow:0 0 14px rgba(245,166,35,0.25) !important; }
.bj-new-row { background:#0a1a08 !important; border-left:3px solid #f5a623 !important; }
@keyframes bj-new-row-flash { 0%{background:#1a3a10} 50%{background:#2e5a1e} 100%{background:#0a1a08} }
.bj-new-row-added { animation: bj-new-row-flash 1.5s ease-out; border-left:3px solid #4caf50 !important; }
.bj-ne-card-btn { color:#f5a623; cursor:pointer; font-size:0.5rem; padding:1px 4px; border-radius:2px; border:1px solid #3a2a00; background:#1a1500; margin-left:2px; }
.bj-ne-card-btn:hover { background:#2a2000; border-color:#f5a623; }
.bj-sync-label { color:#5a7a90; cursor:pointer; font-size:0.45rem; padding:0 3px; display:inline-flex; align-items:center; gap:2px; margin-left:3px; white-space:nowrap; }
.bj-sync-label:hover { color:#4ae168; }
.bj-sync-cb { width:10px; height:10px; margin:0; cursor:pointer; accent-color:#4ae168; }

/* Phase A: Trigger highlight (cyan glow on scoped rows) */
.bj-layer-row.bj-trig-highlight { background:#0a1a28; box-shadow:inset 0 0 8px rgba(0,188,212,0.15); border-left:2px solid #00bcd4; }
/* Phase A: Modified row (cyan glow per user spec) */
.bj-layer-row.bj-row-changed { border-left:2px solid #00bcd4; box-shadow:inset 0 0 10px rgba(0,188,212,0.2); }
/* Phase A: Two-column card layout */
/* Phase A+B: Two-column card layout  column-first (sequential triggers in same column) */
.bj-layers.bj-two-col { column-count:2; column-gap:4px; max-height:var(--bj-card-layer-max-h-two-col); }
.bj-card.bj-max .bj-layers.bj-two-col { max-height:var(--bj-card-layer-max-h-max); }
.bj-layers.bj-two-col .bj-layer-row { break-inside:avoid; font-size:0.5rem; padding:1px 2px 1px 1px; }
.bj-layers.bj-two-col .bj-lsum { font-size:0.48rem; }
.bj-card-resize { height:8px; border-top:1px solid #101822; background:linear-gradient(180deg, rgba(8,13,20,0) 0%, rgba(8,13,20,0.9) 100%); cursor:ns-resize; position:relative; }
.bj-card-resize:hover { background:linear-gradient(180deg, rgba(245,166,35,0.05) 0%, rgba(245,166,35,0.14) 100%); }
.bj-card-resize::before { content:''; position:absolute; left:50%; top:2px; transform:translateX(-50%); width:26px; height:3px; border-radius:2px; background:#274055; box-shadow:0 0 0 1px rgba(0,0,0,0.18); }
.bj-card-resize:hover::before { background:#f5a623; }
/* B3: Delete button on added rows */
.bj-del-btn { width:18px; height:16px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#ff8a80; cursor:pointer; flex-shrink:0; border:1px solid transparent; background:transparent; border-radius:4px; margin-left:2px; opacity:0.9; }
.bj-del-btn:hover { opacity:1; background:#2a1010; border-color:#6a2020; box-shadow:0 0 8px rgba(255,138,128,0.16); }
.bj-ex-win { position:fixed; z-index:1200; display:none; flex-direction:column; min-width:340px; min-height:260px; max-width:calc(100vw - 24px); max-height:calc(100vh - 24px); resize:both; overflow:hidden; border:1px solid #1e3a4a; border-radius:6px; background:#101821; box-shadow:0 18px 40px rgba(0,0,0,0.45); }
.bj-ex-win.bj-ex-dragging { user-select:none; }
.bj-ex-win.bj-ex-preview-live { box-shadow:0 18px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(86,217,125,0.3), 0 0 18px rgba(86,217,125,0.15); }
.bj-ex-win-hdr { display:flex; align-items:center; gap:8px; padding:7px 9px; border-bottom:1px solid #1e2a3a; background:#121b24; cursor:move; user-select:none; }
.bj-ex-win-title-wrap { min-width:0; flex:1; }
.bj-ex-win-title { font-size:0.72rem; font-weight:700; color:#e5edf3; letter-spacing:0.25px; }
.bj-ex-win-sub { font-size:0.52rem; color:#7e9ab0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
.bj-ex-win-modes { display:flex; gap:4px; }
.bj-ex-mode-btn { min-width:28px; }
.bj-ex-win-close { color:#ff8a80; }
.bj-ex-win-close:hover { border-color:#ff8a80; background:#2a1010; }
.bj-ex-win-body { flex:1; min-height:0; overflow:auto; background:#0f161f; }
.bj-ex-empty { padding:12px; color:#7a92a6; font-size:0.58rem; }
.bj-ex-list { display:flex; flex-direction:column; gap:4px; padding:8px; }
.bj-ex-row { display:flex; align-items:flex-start; gap:8px; padding:6px 7px; border:1px solid #1b2a39; border-radius:4px; background:#111a24; cursor:pointer; transition:border-color .12s, background .12s, box-shadow .12s; }
.bj-ex-row:hover { border-color:#2d4d62; background:#14202d; }
.bj-ex-row.active { border-color:#f5a623; background:#1b2430; box-shadow:inset 0 0 0 1px rgba(245,166,35,0.18); }
.bj-ex-row.bj-ex-row-copied { border-color:#4caf50; background:#15311c; box-shadow:0 0 10px rgba(76,175,80,0.2); }
.bj-ex-row-play { margin-top:1px; }
.bj-ex-row-meta { min-width:0; flex:1; }
.bj-ex-row-name { font-size:0.6rem; color:#eef3f7; font-weight:700; letter-spacing:0.15px; }
.bj-ex-row-code { margin-top:2px; font-size:0.5rem; color:#8fa8bb; font-family:'Consolas','SF Mono',monospace; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bj-ex-win-footer { display:flex; align-items:center; gap:8px; padding:7px 9px; border-top:1px solid #1e2a3a; background:#121b24; }
.bj-ex-foot-note { min-width:0; flex:1; font-size:0.5rem; color:#7e9ab0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bj-ex-load-btn { min-width:128px; }
/* B1: Revert All button */
.bj-revert-all-btn { font-size:0.48rem; color:#e57373; background:transparent; border:1px solid #5a2020; border-radius:3px; padding:1px 8px; cursor:pointer; font-weight:600; white-space:nowrap; }
.bj-revert-all-btn:hover { background:#2a1010; border-color:#e57373; color:#fff; }
.bj-reset-all-btn { font-size:0.48rem; color:#f5a623; background:transparent; border:1px solid #6a4a12; border-radius:3px; padding:1px 8px; cursor:pointer; font-weight:600; white-space:nowrap; }
.bj-reset-all-btn:hover { background:#2a1a08; border-color:#f5a623; color:#fff; }
`;
        document.head.appendChild(s);
    },

    // 
    //  GENSTR EDITABLE  Allow pasting/editing DOF code in Generated DOF String
    // 
    _hookGenStr() {
        const gs = document.getElementById('dob-genstr'); if (!gs) return;
        if (gs._bjsonHooked) return; // Prevent double-hooking on re-import
        gs._bjsonHooked = true;
        gs.contentEditable = 'true';
        gs.style.cursor = 'text';
        gs.title = 'Paste or type DOF code here  press Enter to apply';
        gs.addEventListener('focus', () => {
            gs._bjsonEditing = true;
            this._setGenStrHighlight(null);
        });
        // On Enter: parse pasted code back into Builder layers
        gs.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._applyGenStrEdit(gs.textContent.trim());
                gs.blur();
            }
            if (e.key === 'Escape') { e.preventDefault(); gs.blur(); }
        });
        gs.addEventListener('blur', () => {
            gs._bjsonEditing = false;
            const txt = gs.textContent.trim();
            if (txt && !txt.startsWith('-') && txt !== this._lastGenStr) {
                this._applyGenStrEdit(txt);
            }
            this._syncGenStrHighlightToCurrentLayer();
        });
        // Track last generated string to detect user edits vs auto-generated
        if (!this._genStrTracked) {
            this._lastGenStr = gs.textContent?.trim() || '';
            this._genStrTracked = true;
        }
    },

    _unhookGenStr() {
        const gs = document.getElementById('dob-genstr'); if (!gs) return;
        gs.contentEditable = 'false';
        gs.style.cursor = '';
        gs.title = '';
        gs._bjsonEditing = false;
        gs._bjsonHooked = false;
    },

    _loadBuilderLayersFromText(text, opts = {}) {
        if (!text || text.startsWith('-')) return false;
        if (!this.jsonMode) return false;
        const parsed = this._parseEffectString(text, opts.parseContext);
        if (!parsed.length) return false;
        // Load into Builder
        this._suppressSync = true;
        this._inPreview = false;
        if (parsed.length > Builder.NUM_LAYERS) {
            this._origNumLayers = Builder.NUM_LAYERS;
            Builder.NUM_LAYERS = parsed.length;
            while (Builder.layers.length < Builder.NUM_LAYERS) Builder.layers.push(Builder._defaultLayer());
        }
        for (let i = 0; i < Builder.NUM_LAYERS; i++) {
            Builder.layers[i] = i < parsed.length ? this._cloneLayerForBuilder(parsed[i]) : Builder._defaultLayer();
        }
        Builder.currentLayerIdx = 0;
        Builder.loadLayerToUI(0);
        Builder._initSparkleState();
        Builder._updateTabIndicators();
        Builder._updateZLabels();
        Builder._updateGenStr();
        this._suppressSync = false;
        // If in New Effect mode, sync to panel
        if (this._newEffectPort) {
            const txtInput = document.getElementById('bj-ne-text');
            if (txtInput && opts.syncNewEffectText !== false) txtInput.value = text;
        }
        // BUG FIX: Write loaded layers back to sectionLayers so Apply/Export see them
        if (opts.writeBack !== false && Builder.activeSection) {
            this._writeBackLayers(Builder.activeSection);
        }
        console.log('[BuilderJSON] Applied pasted DOF code:', parsed.length, 'layers');
        return true;
    },

    _applyGenStrEdit(text) {
        this._clearPreservedDraftRawText();
        this._loadBuilderLayersFromText(text, { writeBack: true });
    },

    _exampleTypeForToy(toy) {
        if (!toy) return null;
        if (toy._display === 'strip') return 'strip';
        if (toy._display === 'matrix' || toy._display === 'both') return 'matrix';
        return null;
    },

    _exampleDisplayLabel(type) {
        return type === 'strip' ? 'Strip Effects' : 'Matrix Effects';
    },

    _getExampleLibraryForType(type) {
        return Array.isArray(window[type === 'strip' ? 'EXAMPLE_LIBRARY_STRIP' : 'EXAMPLE_LIBRARY_MATRIX'])
            ? window[type === 'strip' ? 'EXAMPLE_LIBRARY_STRIP' : 'EXAMPLE_LIBRARY_MATRIX']
            : [];
    },

    _ensureExamplePaletteSelection(type) {
        if (!this._examplePaletteState) this._loadExamplePalettePreference();
        const lib = this._getExampleLibraryForType(type);
        if (!lib.length) {
            this._examplePaletteState.selectedName = '';
            return null;
        }
        let selected = lib.find(row => Array.isArray(row) && String(row[0] || '') === this._examplePaletteState.selectedName);
        if (!selected) {
            selected = lib.find(row => Array.isArray(row) && String(row[0] || '').trim());
            this._examplePaletteState.selectedName = String(selected?.[0] || '');
        }
        return selected || null;
    },

    _previewSelectedExampleFromPalette() {
        if (!this._examplePaletteState) return;
        const selected = this._ensureExamplePaletteSelection(this._examplePaletteState.type);
        const code = String(selected?.[1] || '').trim();
        if (!code) return;
        this._previewExampleForRow(code);
    },

    _copyExampleCode(code, rowEl = null) {
        const flash = () => {
            if (!rowEl) return;
            rowEl.classList.add('bj-ex-row-copied');
            setTimeout(() => rowEl.classList.remove('bj-ex-row-copied'), 550);
        };
        const text = String(code || '').trim();
        if (!text) return;
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(flash).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch(e) {}
                ta.remove();
                flash();
            });
            return;
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        ta.remove();
        flash();
    },

    _extractTriggerFromEffectString(text) {
        const first = String(text || '').split(/\s*\/\s*/).find(Boolean);
        if (!first) return '';
        const m = first.trim().match(/^(?:(?:W\d+|S\d+|ON|E\d+)(?:\|(?:W\d+|S\d+|ON|E\d+))*)/i);
        return m ? m[0].toUpperCase() : '';
    },

    _buildSceneForExplicitLayers(toy, layers) {
        const scene = {
            matrixLayers: [],
            stripLayersByIndex: {},
            toyLayers: [],
            participants: [],
            unresolvedStripRoutes: []
        };
        if (!toy) return scene;
        const renderSurface = this._sceneRenderSurface(toy);
        if (!renderSurface) return scene;
        const previewLayers = this._buildToyPreviewLayers(toy, layers);
        if (!previewLayers.length) return scene;
        scene.participants.push({ portId: toy.portId, toyName: toy.toyName, display: toy._display, rendered: true });
        if (renderSurface === 'strip') {
            const strips = (typeof App !== 'undefined') && App.data?.cabinet?.strips;
            const stripCount = (strips && strips.length) ? strips.length : 1;
            const mapped = this._getEffectiveStripIndices(toy, 'examplePreview');
            const targets = Array.isArray(mapped) ? mapped.filter(si => si >= 0 && si < stripCount) : [];
            if (!targets.length) {
                scene.unresolvedStripRoutes.push({ portId: toy.portId, toyName: toy.toyName });
                this._warnUnresolvedStripRoute(toy, 'examplePreview');
                return scene;
            }
            targets.forEach(si => {
                if (!scene.stripLayersByIndex[si]) scene.stripLayersByIndex[si] = [];
                previewLayers.forEach((layer, idx) => {
                    scene.stripLayersByIndex[si].push({
                        ...layer,
                        _sceneIdx: idx,
                        _stripStartPct: layer.at,
                        _stripLenPct: layer.ah
                    });
                });
            });
            return scene;
        }
        previewLayers.forEach((layer, idx) => scene.matrixLayers.push({ ...layer, _sceneIdx: idx }));
        return scene;
    },

    _stopExamplePreview(opts = {}) {
        const hadExamplePreview = !!(this._examplePalettePreviewKey || this._examplePalettePreviewPort != null || this._examplePalettePreviewTimer);
        if (!hadExamplePreview) return;
        if (this._examplePalettePreviewTimer) {
            clearTimeout(this._examplePalettePreviewTimer);
            this._examplePalettePreviewTimer = null;
        }
        const previewPort = this._examplePalettePreviewPort;
        this._examplePalettePreviewKey = '';
        this._examplePalettePreviewPort = null;
        this._setPreviewScene(null);
        if (opts.restore !== false) {
            const restored = this._restoreScopedPreviewAfterLayerLoad(Builder.activeSection || null);
            if (!restored && previewPort != null) this._indicateOff(previewPort);
        } else if (previewPort != null) {
            this._indicateOff(previewPort);
        }
        const palette = document.getElementById('bjson-examples-palette');
        palette?.classList.remove('bj-ex-preview-live');
    },

    _previewExampleForRow(code) {
        if (!this._examplePaletteState?.portId) return;
        const toy = this.importedToys.find(t => String(t.portId) === String(this._examplePaletteState.portId));
        if (!toy) return;
        if (this._toyBlockedFromPreview(toy)) return;
        const parsed = this._parseEffectString(code, this._parseContextForToy(toy));
        if (!parsed.length) return;
        const loop = this._examplePaletteState.mode === 'latched';
        const previewKey = String(toy.portId) + '|' + code;
        if (loop && this._examplePalettePreviewKey === previewKey) {
            this._stopExamplePreview();
            return;
        }
        this._stopExamplePreview({ restore: true });
        this._setFocus(toy.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
        const scene = this._buildSceneForExplicitLayers(toy, parsed);
        if (!scene.matrixLayers.length && !Object.keys(scene.stripLayersByIndex || {}).length) return;
        this._examplePalettePreviewKey = previewKey;
        this._examplePalettePreviewPort = toy.portId;
        this._setPreviewScene(scene);
        Builder._resetPreviewTiming();
        this._indicateOn(toy.portId, this._resolveHex(parsed[0]?.color || 'White'));
        const palette = document.getElementById('bjson-examples-palette');
        palette?.classList.add('bj-ex-preview-live');
        if (!loop) {
            const duration = Math.max(...parsed.map(layer => this._calcLayerCycleDuration(layer)), 300);
            this._examplePalettePreviewTimer = setTimeout(() => this._stopExamplePreview(), duration);
        }
    },

    _loadSelectedExampleToBuilder() {
        if (!this._examplePaletteState?.portId) return;
        const toy = this.importedToys.find(t => String(t.portId) === String(this._examplePaletteState.portId));
        if (!toy) return;
        const selected = this._ensureExamplePaletteSelection(this._examplePaletteState.type);
        const code = String(selected?.[1] || '').trim();
        if (!code) return;
        this._stopExamplePreview();
        this._clearCardSelectionForDraft(toy.portId);
        this._startNewEffect(toy.portId);
        this._setPreservedDraftRawText(code);
        const trigger = this._extractTriggerFromEffectString(code);
        this._newEffectTrigger = trigger;
        const trigInput = document.getElementById('bj-ne-trig');
        if (trigInput) trigInput.value = trigger;
        const txtInput = document.getElementById('bj-ne-text');
        if (txtInput) txtInput.value = code;
        this._loadBuilderLayersFromText(code, {
            writeBack: false,
            syncNewEffectText: false,
            parseContext: this._parseContextForToy(toy)
        });
        this._applyPreservedDraftRawToUi();
        this._syncNewEffectFromBuilder();
    },

    _clearCardSelectionForDraft(portId) {
        const pid = String(portId);
        const card = document.getElementById('bjc-' + pid);
        card?.querySelectorAll('.bj-lcb').forEach(cb => { cb.checked = false; });
        card?.querySelectorAll('.bj-layer-row').forEach(row => {
            row.classList.remove('bj-row-selected', 'bj-trig-highlight', 'bj-firing-row');
        });
        card?.querySelectorAll('.bj-trig-btn').forEach(btn => btn.classList.remove('bj-trig-active'));
        if (String(this._activeToyPort || '') === pid) {
            this._activeTrigger = null;
        }
    },

    _renderExamplesPalette() {
        const panel = document.getElementById('bjson-examples-palette');
        if (!panel || !this._examplePaletteState) return;
        const state = this._examplePaletteState = this._normalizeExamplePaletteState(this._examplePaletteState);
        panel.style.left = state.left + 'px';
        panel.style.top = state.top + 'px';
        panel.style.width = state.width + 'px';
        panel.style.height = state.height + 'px';
        panel.style.display = state.open ? 'flex' : 'none';

        const titleEl = panel.querySelector('.bj-ex-win-title');
        const subEl = panel.querySelector('.bj-ex-win-sub');
        const listEl = panel.querySelector('.bj-ex-list');
        const emptyEl = panel.querySelector('.bj-ex-empty');
        const loadBtn = panel.querySelector('.bj-ex-load-btn');
        const previewModeBtns = panel.querySelectorAll('.bj-ex-mode-btn');
        const portId = state.portId;
        const toy = this.importedToys.find(t => String(t.portId) === String(portId));
        const type = state.type;
        const typeLabel = this._exampleDisplayLabel(type);
        if (titleEl) titleEl.textContent = 'Examples';
        if (subEl) subEl.textContent = toy ? (typeLabel + '  ' + toy.toyName) : typeLabel;
        previewModeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.mode));

        const selected = this._ensureExamplePaletteSelection(type);
        const lib = this._getExampleLibraryForType(type);
        document.querySelectorAll('.bj-act-btn-examples').forEach(btn => {
            btn.classList.toggle('active', state.open && String(btn.dataset.port || '') === String(portId || ''));
        });
        if (emptyEl) emptyEl.style.display = lib.length ? 'none' : '';
        if (loadBtn) {
            loadBtn.disabled = !selected || !toy;
            loadBtn.textContent = selected ? ('Load "' + String(selected[0]) + '"') : 'Load to Builder';
        }
        if (!listEl) return;
        listEl.innerHTML = '';
        lib.forEach((row) => {
            if (!Array.isArray(row) || !String(row[0] || '').trim()) return;
            const name = String(row[0] || '').trim();
            const code = String(row[1] || '').trim();
            const item = document.createElement('div');
            item.dataset.name = name;
            item.className = 'bj-ex-row' + (name === this._examplePaletteState.selectedName ? ' active' : '');
            item.title = 'Double-click row to copy the DOF code';
            item.onclick = () => {
                this._examplePaletteState.selectedName = name;
                this._saveExamplePalettePreference();
                this._syncExamplesPaletteSelectionUi();
            };
            item.ondblclick = () => this._copyExampleCode(code, item);

            const play = document.createElement('button');
            play.className = 'bj-play-btn bj-ex-row-play';
            play.textContent = '>';
            play.title = 'Preview on the active ' + type + ' surface';
            play.onclick = (e) => {
                e.stopPropagation();
                this._examplePaletteState.selectedName = name;
                this._saveExamplePalettePreference();
                this._syncExamplesPaletteSelectionUi();
                this._previewExampleForRow(code);
            };

            const meta = document.createElement('div');
            meta.className = 'bj-ex-row-meta';
            const nm = document.createElement('div');
            nm.className = 'bj-ex-row-name';
            nm.textContent = name;
            const snippet = document.createElement('div');
            snippet.className = 'bj-ex-row-code';
            snippet.textContent = code;
            meta.appendChild(nm);
            meta.appendChild(snippet);
            item.appendChild(play);
            item.appendChild(meta);
            listEl.appendChild(item);
        });
        this._syncExamplesPaletteSelectionUi();
    },

    _syncExamplesPaletteSelectionUi() {
        const panel = document.getElementById('bjson-examples-palette');
        if (!panel || !this._examplePaletteState) return;
        const selectedName = String(this._examplePaletteState.selectedName || '');
        panel.querySelectorAll('.bj-ex-row').forEach(row => {
            row.classList.toggle('active', String(row.dataset.name || '') === selectedName);
        });
        const loadBtn = panel.querySelector('.bj-ex-load-btn');
        if (loadBtn) {
            const type = this._examplePaletteState.type;
            const selected = this._ensureExamplePaletteSelection(type);
            const toy = this.importedToys.find(t => String(t.portId) === String(this._examplePaletteState.portId));
            loadBtn.disabled = !selected || !toy;
            loadBtn.textContent = selected ? ('Load "' + String(selected[0]) + '"') : 'Load to Builder';
        }
    },

    _ensureExamplesPalette() {
        let panel = document.getElementById('bjson-examples-palette');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'bjson-examples-palette';
        panel.className = 'bj-ex-win';
        panel.innerHTML = `
            <div class="bj-ex-win-hdr">
                <div class="bj-ex-win-title-wrap">
                    <div class="bj-ex-win-title">Examples</div>
                    <div class="bj-ex-win-sub">Matrix Effects</div>
                </div>
                <div class="bj-ex-win-modes">
                    <button class="bj-ctrl-btn bj-ctrl-m bj-ex-mode-btn" data-mode="momentary" title="Momentary preview">M</button>
                    <button class="bj-ctrl-btn bj-ctrl-l bj-ex-mode-btn" data-mode="latched" title="Latched preview">L</button>
                </div>
                <button class="bj-act-btn2 bj-ex-win-close" title="Close examples" aria-label="Close examples">X</button>
            </div>
            <div class="bj-ex-win-body">
                <div class="bj-ex-empty">No examples available for this display type.</div>
                <div class="bj-ex-list"></div>
            </div>
            <div class="bj-ex-win-footer">
                <div class="bj-ex-foot-note">Row click selects. Double-click copies. Use &gt; to preview.</div>
                <button class="bj-ne-add bj-ex-load-btn">Load to Builder</button>
            </div>
        `;
        document.body.appendChild(panel);

        const hdr = panel.querySelector('.bj-ex-win-hdr');
        hdr?.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            this._examplePaletteDragState = {
                startX: e.clientX,
                startY: e.clientY,
                left: this._examplePaletteState?.left || panel.offsetLeft,
                top: this._examplePaletteState?.top || panel.offsetTop
            };
            panel.classList.add('bj-ex-dragging');
        });
        document.addEventListener('pointermove', (e) => {
            if (!this._examplePaletteDragState || !this._examplePaletteState) return;
            const next = {
                ...this._examplePaletteState,
                left: this._examplePaletteDragState.left + (e.clientX - this._examplePaletteDragState.startX),
                top: this._examplePaletteDragState.top + (e.clientY - this._examplePaletteDragState.startY)
            };
            this._examplePaletteState = this._normalizeExamplePaletteState(next);
            panel.style.left = this._examplePaletteState.left + 'px';
            panel.style.top = this._examplePaletteState.top + 'px';
        });
        document.addEventListener('pointerup', () => {
            if (!this._examplePaletteDragState) return;
            this._examplePaletteDragState = null;
            panel.classList.remove('bj-ex-dragging');
            this._saveExamplePalettePreference();
        });
        panel.querySelector('.bj-ex-win-close')?.addEventListener('click', () => {
            this._stopExamplePreview();
            if (!this._examplePaletteState) return;
            this._examplePaletteState.open = false;
            this._saveExamplePalettePreference();
            this._renderExamplesPalette();
        });
        panel.querySelectorAll('.bj-ex-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this._examplePaletteState) return;
                this._examplePaletteState.mode = btn.dataset.mode === 'latched' ? 'latched' : 'momentary';
                this._saveExamplePalettePreference();
                this._renderExamplesPalette();
                this._previewSelectedExampleFromPalette();
            });
        });
        panel.querySelector('.bj-ex-load-btn')?.addEventListener('click', () => this._loadSelectedExampleToBuilder());

        if (typeof ResizeObserver !== 'undefined') {
            this._examplePaletteResizeObserver = new ResizeObserver(entries => {
                const entry = entries?.[0];
                if (!entry || !this._examplePaletteState) return;
                this._examplePaletteState = this._normalizeExamplePaletteState({
                    ...this._examplePaletteState,
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
                this._saveExamplePalettePreference();
            });
            this._examplePaletteResizeObserver.observe(panel);
        }
        this._renderExamplesPalette();
        return panel;
    },

    _openExamplesPalette(portId) {
        const toy = this.importedToys.find(t => String(t.portId) === String(portId));
        const type = this._exampleTypeForToy(toy);
        if (!toy || !type) return;
        if (!this._examplePaletteState) this._loadExamplePalettePreference();
        const next = {
            ...this._examplePaletteState,
            open: true,
            portId: String(portId),
            type
        };
        if (next.type !== this._examplePaletteState.type) next.selectedName = '';
        this._examplePaletteState = this._normalizeExamplePaletteState(next);
        this._ensureExamplePaletteSelection(type);
        this._saveExamplePalettePreference();
        this._ensureExamplesPalette();
        this._renderExamplesPalette();
    },

    // 
    //  IMPORT  JSON config + optional INI variables
    // 
    handleImport(input) {
        const file = input.files[0]; if (!file) return;
        this.importConfigFile(file).catch(err => {
            alert('JSON import failed: ' + (err?.message || err));
        }).finally(() => {
            input.value = '';
        });
    },

    async importConfigFile(file, opts = {}) {
        if (!file) return false;
        const text = await file.text();
        if (file.name.toLowerCase().endsWith('.ini')) {
            this._parseVariablesFromINI(text);
            return true;
        }
        let json = null;
        try {
            json = JSON.parse(text);
        } catch (err) {
            alert('JSON parse error: ' + err.message);
            return false;
        }
        if (!json?.config) {
            alert('Invalid JSON  missing config.');
            return false;
        }
        this._processImport(json, { preserveBitmapCache: !!opts.preserveBitmapCache });
        if (opts.checkShapes !== false) this._checkShapeFiles();
        if (opts.cacheWorkspace !== false && typeof App !== 'undefined' && typeof App._cacheWorkspaceSlot === 'function') {
            try {
                await App._cacheWorkspaceSlot('bj-f-json', [file], file.name || 'table-config.json');
            } catch (e) {
                console.warn('[BuilderJSON] Could not cache imported JSON file:', e);
            }
        }
        return true;
    },

    // Check for shape atlas + warn user if missing
    _checkShapeFiles() {
        const hasShapes = (typeof App !== 'undefined') && App.data?.shapes?.size > 0;
        const hasAtlas = (typeof App !== 'undefined') && !!App.data?.shapeAtlas;
        const rom = this.importedConfig?.rom?.toLowerCase() || '';
        const codeBlob = this.importedToys.map(t => t.rawUser || '').join(' / ');
        let report = null;
        if (typeof App !== 'undefined' && typeof App._checkShapeFilesNeeded === 'function') {
            report = App._checkShapeFilesNeeded(codeBlob, rom);
            if (report?.missingRefs?.length) {
                alert(
                    'Wrong Shape Pack Or Missing Shape Definitions\n\n' +
                    'The loaded shape set does not contain these referenced shapes:\n' +
                    report.missingRefs.slice(0, 12).map(name => '  - ' + name).join('\n') +
                    (report.missingRefs.length > 12 ? '\n  - ...' : '') +
                    '\n\nLoad the correct DirectOutputShapes.xml and DirectOutputShapes.png, then re-import the JSON.'
                );
            }
        }
        if (!hasShapes || !hasAtlas) {
            const missing = [];
            if (!hasShapes) missing.push('DirectOutputShapes.xml');
            if (!hasAtlas) missing.push('DirectOutputShapes.png');
            alert(
                'Shape files not loaded\n\n' +
                'Missing: ' + missing.join(', ') + '\n\n' +
                'Shape variables (@strblft@, @flasherclo@, etc.) will use fallback ' +
                'rendering which may not be accurate.\n\n' +
                'For correct shape rendering, go back to the Simulator and load ' +
                'DirectOutputShapes.xml and DirectOutputShapes.png first, then re-import your JSON.'
            );
        }
    },

    _checkToyShapeAvailability(toy, trigger = null) {
        if (!toy || typeof App === 'undefined' || typeof App._checkShapeFilesNeeded !== 'function') return;
        const rom = this.importedConfig?.rom?.toLowerCase() || '';
        const relevant = (toy.layers || [])
            .filter(layer => !trigger || layer._trigger === trigger)
            .map(layer => layer._raw || this._layerToRaw(layer))
            .filter(Boolean)
            .join(' / ');
        if (!relevant) return;
        const report = App._checkShapeFilesNeeded(relevant, rom);
        const warnKey = [
            this.importedConfig?.table || '',
            toy.portId,
            trigger || 'all',
            (report?.missingFiles || []).join(','),
            (report?.missingRefs || []).join(',')
        ].join('|');
        if (report?.missingFiles?.length || report?.missingRefs?.length) {
            const parts = [];
            if (report.missingFiles?.length) {
                parts.push(
                    'Missing shape files:\n' +
                    report.missingFiles.map(name => '  - ' + name).join('\n')
                );
            }
            if (report.missingRefs?.length) {
                parts.push(
                    'Missing shape definitions:\n' +
                    report.missingRefs.slice(0, 16).map(name => '  - ' + name).join('\n') +
                    (report.missingRefs.length > 16 ? '\n  - ...' : '')
                );
            }
            this._setStatus(
                'Missing shapes for ' + toy.toyName + (trigger ? (' ' + trigger) : '') + '.',
                '#f5a623'
            );
            if (warnKey && !this._shapeAlertCache[warnKey]) {
                this._shapeAlertCache[warnKey] = true;
                alert(
                    'Shape Warning: ' + toy.toyName + (trigger ? (' [' + trigger + ']') : '') + '\n\n' +
                    parts.join('\n\n') +
                    '\n\nLoad the matching DirectOutputShapes.xml and DirectOutputShapes.png pack, then try the trigger again.'
                );
            }
            return report;
        }
        return report;
    },

    // Parse [Variables DOF] section from DirectOutputConfig*.ini
    _parseVariablesFromINI(text) {
        const lines = text.replace(/\r/g, '').split('\n');
        let inSection = false;
        const vars = {};
        for (const line of lines) {
            if (line.trim().toLowerCase() === '[variables dof]') { inSection = true; continue; }
            if (inSection && line.trim().startsWith('[')) break; // Next section
            if (!inSection) continue;
            const eq = line.indexOf('=');
            if (eq < 0) continue;
            const name = line.slice(0, eq).trim().toLowerCase();
            const value = line.slice(eq + 1).trim();
            if (!name || !value) continue;
            vars[name] = this._parseVarDefinition(name, value);
        }
        this._userVariables = vars;
        const count = Object.keys(vars).length;
        this._setStatus('Variables loaded: ' + count + ' definitions from INI');
        console.log('[BuilderJSON] Parsed', count, 'variables from INI:', Object.keys(vars));
    },

    // Parse a single variable definition line into position/shape/color data
    _parseVarDefinition(name, value) {
        const result = {};
        const toks = value.split(/\s+/);
        for (const t of toks) {
            if (/^AH\d+$/i.test(t)) result.ah = parseInt(t.slice(2));
            else if (/^AL-?\d+$/i.test(t)) result.al = parseInt(t.slice(2));
            else if (/^AT-?\d+$/i.test(t)) result.at = parseInt(t.slice(2));
            else if (/^AW\d+$/i.test(t)) result.aw = parseInt(t.slice(2));
            else if (/^SHP\w+$/i.test(t)) result.shp = t;
            else if (/^I\d+$/i.test(t)) result.intensity = this._normalizeIntensityTokenValue(parseInt(t.slice(1)));
            else if (/^\d+$/i.test(t) && !result.duration) result.duration = parseInt(t);
            else if (!/^AD[DULR]$/i.test(t) && !/^AS\d/i.test(t) && !/^F[UD]?\d/i.test(t) &&
                     !/^BPW\d/i.test(t) && !/^BLINK/i.test(t) && !/^W\d/i.test(t) && !/^M\d/i.test(t) &&
                     !/^L-?\d/i.test(t)) {
                // Likely a color name
                if (!result.color) { result.color = t; result.hex = this._resolveHex(t); }
            }
        }
        // Mark non-renderable (just timing/intensity, no visual)
        if (!result.ah && !result.al && !result.aw && !result.shp && !result.color) {
            result._nonRenderable = true;
        }
        return result;
    },

    _parseContextForToy(toyOrName, fallbackType = '') {
        const toyName = typeof toyOrName === 'string'
            ? toyOrName
            : String(toyOrName?.toyName || '');
        const toyType = String(
            typeof toyOrName === 'object' && toyOrName?._type
                ? toyOrName._type
                : (fallbackType || this._classifyToy(toyName))
        ).toLowerCase();
        return { toyName, toyType };
    },

    _detectFormat(json) {
        const entries = Object.values(json.config || {});
        if (entries.some(e => 'public' in e)) return 'public_config';
        return entries.length > 20 ? 'all_user' : 'modded_only';
    },

    _processImport(json, opts = {}) {
        this.clearTableBitmap({ silent: true, preserveCache: !!opts.preserveBitmapCache });
        this.importedConfig = json;
        this.importFormat = this._detectFormat(json);
        this.importedToys = [];
        this._shapeAlertCache = {};
        this._loadSupportOverrides(json.table || '');

        for (const [portId, entry] of Object.entries(json.config || {})) {
            const rawUser = (entry.user || '').trim();
            const rawPublic = (entry.public || '').trim();
            const toyName = entry.toy || ('Port ' + portId);
            const toyType = this._classifyToy(toyName);
            const layers = this._parseEffectString(rawUser, this._parseContextForToy(toyName, toyType));
            // Issue 8: stamp each layer with its original raw text
            layers.forEach(l => { l._originalRaw = l._raw; });
            const cat = this._categorizeToy(toyName);
            const importModified = this.importFormat === 'public_config' ? (rawPublic !== rawUser) : false;
            this.importedToys.push({
                portId, toyName, rawUser, rawPublic, layers,
                _type: toyType, _cat: cat,
                _modified: importModified, // Import-time Public vs User delta
                _edited: false,            // Runtime edits after import
                _display: null,
                _support: null
            });
        }

        this.importedToys.forEach(toy => this._applySupportToToy(toy));
        this._supportPanelOpen = false;

        const catOrder = { mx:0, rgb:1, flasher:2, bumper:3, strobe:4, solenoid:5, button:6, other:7 };
        this.importedToys.sort((a, b) => {
            const ca = catOrder[a._cat] ?? 9, cb = catOrder[b._cat] ?? 9;
            return ca !== cb ? ca - cb : parseInt(a.portId) - parseInt(b.portId);
        });

        if (!this.originalSections) {
            this.originalSections = [...Builder.SECTIONS];
            this.originalSingleSections = [...Builder.SINGLE_SECTIONS];
        }
        this._rebuildImportedToySections();
        this.jsonMode = true; this.latchedToys = {}; this._activeToyPort = null; this._activeTrigger = null;
        this._catFilter = 'all'; this._showEmpty = false;

        document.getElementById('dob-view')?.classList.add('dob-json-mode');
        this._setLegacyExamplesVisibility(true);
        // Feature: Show table name in title bar
        this._showTableTitle(this.importedConfig?.table || 'Untitled');
        this._rebuildSectionBtns();
        Builder.renderStaging();
        this._loadSectionLayers(Builder.activeSection);
        this._loadStripLayoutPreference(this._currentTableName());
        this._enableVerticalStrips();
        this._renderToyIconBar();
        this._renderFilterBar();
        this._renderSupportPanel();
        this._renderCards();
        this._hookGenStr();
        this._refreshBitmapUiState();

        this.tryAutoLoadRomBitmap().catch(err => {
            console.warn('[BuilderJSON] Could not auto-load ROM bitmap after JSON import:', err);
        });

        const total = this.importedToys.reduce((s, t) => s + t.layers.length, 0);
        const modCount = this.importedToys.filter(t => t._modified).length;
        const supportCounts = this._collectSupportCounts();
        const fmtLabel = { modded_only:'Modded', all_user:'All Settings', public_config:'Public+User' }[this.importFormat] || '?';
        this._setStatus(
            (json.table||'?') + ' | ' + (json.rom||'?') + ' | ' +
            this.importedToys.length + ' toys (' + modCount + ' mod) | ' +
            total + ' layers | ' + fmtLabel +
            (supportCounts.unsupported ? ' | ' + supportCounts.unsupported + ' unsupported' : '') +
            (supportCounts.needs_input ? ' | ' + supportCounts.needs_input + ' need input' : ''),
            '#f5a623'
        );
        ['bjson-export-btn','bjson-exit-btn'].forEach(id => {
            const e = document.getElementById(id); if (e) e.style.display = '';
        });
        Builder._saveState();
    },

    _rebuildImportedToySections(preferredSection = '') {
        this.sectionLayers = {};
        this.layerWindow = {};
        this.importedToys.forEach(t => {
            this.sectionLayers[t.toyName] = t.layers;
            this.layerWindow[t.toyName] = this.layerWindow[t.toyName] || { start: 0 };
        });
        Builder.SECTIONS = this.importedToys.map(t => t.toyName);
        Builder.SINGLE_SECTIONS = this.importedToys.filter(t => t._type !== 'mx').map(t => t.toyName);
        Builder.sectionConfigs = {};
        this.importedToys.forEach(t => {
            const raw = (this.sectionLayers[t.toyName] || [])
                .filter(l => l.active !== false)
                .map(l => l._raw || this._layerToRaw(l))
                .filter(Boolean)
                .join('/');
            Builder.sectionConfigs[t.toyName] = raw;
            t.rawUser = raw;
        });
        const desiredSection = preferredSection && Builder.SECTIONS.includes(preferredSection)
            ? preferredSection
            : (Builder.SECTIONS.includes(Builder.activeSection) ? Builder.activeSection : (Builder.SECTIONS[0] || ''));
        Builder.activeSection = desiredSection;
    },

    _canDuplicatePreviewToy(toy) {
        return !!toy && !toy._previewOnly && (this._isStrobeToy(toy) || this._isBeaconToy(toy));
    },

    _findPreviewDuplicateForSource(sourcePortId) {
        return this.importedToys.find(t => t._previewOnly && String(t._sourcePortId) === String(sourcePortId)) || null;
    },

    _cloneLayersForPreviewToy(sourceToy) {
        return (sourceToy.layers || []).map(layer => {
            const raw = layer?._raw || this._layerToRaw(layer);
            const parsed = raw ? this._parseLayer(raw, this._parseContextForToy(sourceToy)) : null;
            const clone = parsed ? parsed : { ...layer };
            clone._extra = [...(clone._extra || layer?._extra || [])];
            clone._raw = raw;
            clone._originalRaw = layer?._originalRaw || raw;
            return clone;
        });
    },

    _buildPreviewToyDuplicate(sourceToy) {
        const duplicateIndex = 2;
        const dupPortId = String(sourceToy.portId) + '-dup1';
        return {
            portId: dupPortId,
            toyName: sourceToy.toyName + ' ' + duplicateIndex,
            rawUser: (sourceToy.rawUser || '').trim(),
            rawPublic: sourceToy.rawPublic,
            layers: this._cloneLayersForPreviewToy(sourceToy),
            _type: sourceToy._type,
            _cat: sourceToy._cat,
            _modified: false,
            _edited: false,
            _display: sourceToy._display,
            _support: sourceToy._support ? { ...sourceToy._support } : null,
            _previewOnly: true,
            _sourcePortId: sourceToy.portId,
            _portLabel: String(sourceToy.portId) + '.2'
        };
    },

    _insertCardOrderAfter(sourcePortId, insertPortId) {
        this._cardOrder = Array.isArray(this._cardOrder) ? [...this._cardOrder] : this.importedToys.map(t => t.portId);
        this._cardOrder = this._cardOrder.filter(pid => String(pid) !== String(insertPortId));
        const srcIdx = this._cardOrder.findIndex(pid => String(pid) === String(sourcePortId));
        if (srcIdx < 0) this._cardOrder.push(insertPortId);
        else this._cardOrder.splice(srcIdx + 1, 0, insertPortId);
        this._markLayoutDirty();
    },

    _removePortFromCardOrder(portId) {
        this._cardOrder = (Array.isArray(this._cardOrder) ? this._cardOrder : []).filter(pid => String(pid) !== String(portId));
        this._markLayoutDirty();
    },

    _addPreviewToyDuplicate(sourcePortId) {
        const sourceToy = this.importedToys.find(t => String(t.portId) === String(sourcePortId));
        if (!this._canDuplicatePreviewToy(sourceToy)) return;
        const existing = this._findPreviewDuplicateForSource(sourceToy.portId);
        if (existing) {
            this._renderCards();
            this._setBuilderSectionButtons();
            Builder.renderStaging();
            this._setFocus(existing.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
            return;
        }
        const duplicate = this._buildPreviewToyDuplicate(sourceToy);
        const sourceIdx = this.importedToys.findIndex(t => String(t.portId) === String(sourceToy.portId));
        this.importedToys.splice(sourceIdx + 1, 0, duplicate);
        this._insertCardOrderAfter(sourceToy.portId, duplicate.portId);
        this._rebuildImportedToySections(duplicate.toyName);
        this._renderCards();
        this._setBuilderSectionButtons();
        Builder.renderStaging();
        this._setFocus(duplicate.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
    },

    _removePreviewToyDuplicate(portId) {
        const duplicate = this.importedToys.find(t => String(t.portId) === String(portId) && t._previewOnly);
        if (!duplicate) return;
        if (String(this._newEffectPort || '') === String(portId)) this._cancelNewEffect(true);
        this._clearCardPreviewRuntime(portId);
        delete this._beaconPreviewColors[String(portId)];
        this.importedToys = this.importedToys.filter(t => String(t.portId) !== String(portId));
        delete this.sectionLayers[duplicate.toyName];
        delete this.layerWindow[duplicate.toyName];
        delete Builder.sectionConfigs[duplicate.toyName];
        this._removePortFromCardOrder(portId);
        const focusToy = this.importedToys.find(t => String(t.portId) === String(duplicate._sourcePortId)) || this.importedToys[0] || null;
        this._rebuildImportedToySections(focusToy?.toyName || '');
        this._renderCards();
        this._setBuilderSectionButtons();
        Builder.renderStaging();
        if (focusToy) this._setFocus(focusToy.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
    },

    _setStatus(msg, c) { const el = document.getElementById('bjson-status'); if (el) { el.textContent = msg; el.style.color = c || '#5a7a90'; } },

    _normToyName(name) {
        return String(name || '').toLowerCase().replace(/[\s_\-]+/g, '').trim();
    },

    _supportStorageKey(tableName = '') {
        const capKey = (typeof App !== 'undefined' && App.data?.cabinetCapabilities?.cabinetKey) || 'no-cabinet';
        return 'bjson-support-map::' + (tableName || 'untitled') + '::' + capKey;
    },

    _loadSupportOverrides(tableName = '') {
        try {
            const raw = localStorage.getItem(this._supportStorageKey(tableName));
            this._supportOverrides = raw ? JSON.parse(raw) : {};
        } catch {
            this._supportOverrides = {};
        }
    },

    _saveSupportOverrides(tableName = '') {
        try {
            localStorage.setItem(this._supportStorageKey(tableName), JSON.stringify(this._supportOverrides || {}));
        } catch {}
    },

    _getSupportOverride(portId) {
        return this._supportOverrides?.[String(portId)] || null;
    },

    _collectSupportCounts() {
        const counts = { supported: 0, unsupported: 0, needs_input: 0, combo: 0 };
        this.importedToys.forEach(toy => {
            const status = toy._support?.status || 'unsupported';
            counts[status] = (counts[status] || 0) + 1;
            if (toy._support?.viaCombo) counts.combo++;
        });
        return counts;
    },

    _resolveToySupport(toyRef) {
        const toy = (toyRef && typeof toyRef === 'object')
            ? toyRef
            : { portId: toyRef, toyName: '' };
        const toyId = parseInt(toy.portId, 10);
        const catalogById = (typeof window !== 'undefined' && window.__DOF_TOY_BY_ID) ? window.__DOF_TOY_BY_ID : new Map();
        const catalogByName = (typeof window !== 'undefined' && window.__DOF_TOY_BY_NAME) ? window.__DOF_TOY_BY_NAME : new Map();
        const meta = catalogById.get(toyId) || catalogByName.get(this._normToyName(toy.toyName)) || null;
        const override = this._getSupportOverride(toy.portId);
        const caps = (typeof App !== 'undefined') ? (App.data?.cabinetCapabilities || null) : null;
        const assignments = caps?.toyAssignments?.get?.(toyId) || [];
        const uniqueSurfaces = [...new Set(assignments.map(a => a.surface).filter(Boolean))];
        const viaCombo = assignments.some(a => a.viaCombo);
        const surfaceHints = uniqueSurfaces.filter(s => s !== 'unknown');
        const isCustom = /custom\s+(output|rgb|mx)/i.test(meta?.name || toy.toyName || '');
        const isStrobe = this._isStrobeToy(toy);
        const missingCabinetProfile = !caps?.updatedAt;

        if (override?.display) {
            const overrideStripIndices = Array.isArray(override.stripIndices) ? override.stripIndices : [];
            if (override.display === 'strip' && !overrideStripIndices.length) {
                return {
                    status: 'needs_input',
                    display: 'strip',
                    stripIndices: [],
                    viaCombo,
                    source: 'query',
                    assignments,
                    note: 'Select one or more cabinet strips for this mapping.'
                };
            }
            return {
                status: 'supported',
                display: override.display,
                stripIndices: overrideStripIndices,
                viaCombo,
                source: 'override',
                assignments,
                note: override.display === 'strip'
                    ? 'Mapped by user to ' + ((override.stripNames || []).join(', ') || 'selected strip')
                    : 'Mapped by user to ' + override.display
            };
        }

        if (missingCabinetProfile) {
            return {
                status: 'needs_input',
                display: null,
                stripIndices: [],
                viaCombo: false,
                source: 'missing-profile',
                assignments,
                note: 'Load Cabinet.xml and Cabinet JSON to validate this toy against your cabinet.'
            };
        }

        if (!assignments.length) {
            return {
                status: 'unsupported',
                display: null,
                stripIndices: [],
                viaCombo: false,
                source: 'cabinet',
                assignments,
                note: 'This toy is not assigned in the current cabinet profile.'
            };
        }

        if (surfaceHints.length === 1 && !uniqueSurfaces.includes('unknown')) {
            return {
                status: 'supported',
                display: surfaceHints[0],
                stripIndices: [],
                viaCombo,
                source: viaCombo ? 'combo' : 'cabinet',
                assignments,
                note: viaCombo
                    ? 'Resolved via cabinet combo assignment.'
                    : 'Resolved from cabinet assignments.'
            };
        }

        if (
            isStrobe &&
            !uniqueSurfaces.includes('unknown') &&
            surfaceHints.length === 2 &&
            surfaceHints.includes('physical') &&
            surfaceHints.includes('matrix')
        ) {
            return {
                status: 'supported',
                display: 'both',
                stripIndices: [],
                viaCombo,
                source: viaCombo ? 'combo' : 'cabinet',
                assignments,
                note: 'Resolved from cabinet assignments to both physical and matrix preview.'
            };
        }

        if (isCustom || viaCombo || surfaceHints.length !== 1 || uniqueSurfaces.includes('unknown')) {
            const reason = uniqueSurfaces.includes('unknown')
                ? 'Cabinet files do not fully identify the target surface for this assignment.'
                : surfaceHints.length > 1
                    ? 'This toy resolves to multiple surfaces in the current cabinet data.'
                    : viaCombo
                        ? 'This toy is only available through a combo assignment and needs confirmation.'
                        : 'This custom toy needs an explicit display surface.';
            return {
                status: 'needs_input',
                display: surfaceHints.length === 1 ? surfaceHints[0] : null,
                stripIndices: [],
                viaCombo,
                source: 'query',
                note: reason,
                assignments
            };
        }

        return {
            status: 'supported',
            display: surfaceHints[0] || null,
            stripIndices: [],
            viaCombo,
            source: 'cabinet',
            assignments,
            note: 'Resolved from cabinet assignments.'
        };
    },

    _applySupportToToy(toy) {
        toy._support = this._resolveToySupport(toy);
        toy._display = this._getDisplayTarget(toy.toyName, toy.portId, toy._support);
    },

    _refreshSupportState(opts = {}) {
        if (!Array.isArray(this.importedToys) || !this.importedToys.length) return;
        this.importedToys.forEach(toy => this._applySupportToToy(toy));
        this._renderFilterBar();
        this._renderSupportPanel();
        this._renderCards();
        this._filterSectionBtns();
        this._enableVerticalStrips();
        this._renderToyIconBar();
        this._setLegacyExamplesVisibility(this.jsonMode);
        this._restoreSupportUiAfterRefresh(opts);
    },

    _toyBlockedFromPreview(toy) {
        if (this._isEmissivePhysicalToy(toy)) return false;
        const status = toy?._support?.status;
        return status === 'unsupported' || status === 'needs_input';
    },

    _supportToOverridePayload(support) {
        const payload = {
            display: support?.display || '',
            stripIndices: [],
            stripNames: []
        };
        if (payload.display !== 'strip') return payload;
        const strips = (typeof App !== 'undefined' && Array.isArray(App.data?.cabinet?.strips)) ? App.data.cabinet.strips : [];
        const indices = new Set();
        (support?.stripIndices || []).forEach(idx => {
            if (Number.isFinite(idx)) indices.add(idx);
        });
        (support?.assignments || []).forEach(a => {
            if (a.surface !== 'strip') return;
            const idx = strips.findIndex(s => s.name === a.outputName);
            if (idx >= 0) indices.add(idx);
        });
        payload.stripIndices = [...indices].sort((a, b) => a - b);
        payload.stripNames = payload.stripIndices.map(i => strips[i]?.name).filter(Boolean);
        return payload;
    },

    _borrowGroupKeyForToy(sourceToy) {
        const display = String(sourceToy?._support?.display || '').toLowerCase();
        if (display === 'strip') return 'strip';
        if (display === 'indicator') return 'indicator';
        if (display === 'physical' || display === 'both') return 'physical';
        return 'matrix';
    },

    _borrowGroupMeta(key) {
        if (key === 'strip') return { label: 'LED Strip', hint: 'Preview routes that target cabinet strips.' };
        if (key === 'indicator') return { label: 'Indicator / RGB', hint: 'Single RGB indicator or RGB toy routes.' };
        if (key === 'physical') return { label: 'Physical', hint: 'Physical toys, including emissive physical devices such as strobes.' };
        return { label: 'Matrix / MX', hint: 'Matrix-addressable or MX surface routes.' };
    },

    _getBorrowableSupportToys(currentToy) {
        return this.importedToys.filter(t => {
            if (!t || t.portId === currentToy?.portId) return false;
            if (t._support?.status !== 'supported') return false;
            return !!t._support?.display;
        });
    },

    _showSupportBlock(toy, actionLabel) {
        if (!toy) return true;
        if (this._isEmissivePhysicalToy(toy)) return false;
        const status = toy._support?.status;
        if (status !== 'unsupported' && status !== 'needs_input') return false;
        this._setFocus(toy.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
        setTimeout(() => this._toggleCardMapMenu(toy.portId), 0);
        const prefix = status === 'unsupported' ? 'Cabinet does not support' : 'Mapping input needed for';
        this._setStatus(prefix + ' ' + toy.toyName + '. ' + (toy._support?.note || actionLabel || ''), '#f5a623');
        return true;
    },

    _updateSupportOverride(portId, patch, opts = {}) {
        const key = String(portId);
        const current = { ...(this._supportOverrides?.[key] || {}) };
        const next = { ...current, ...patch };
        if (!next.display) delete this._supportOverrides[key];
        else this._supportOverrides[key] = next;
        this._saveSupportOverrides(this.importedConfig?.table || '');
        this._refreshSupportState(opts);
    },

    _restoreSupportUiAfterRefresh(opts = {}) {
        const focusPort = opts.focusPort != null ? String(opts.focusPort) : (this._activeToyPort != null ? String(this._activeToyPort) : '');
        const maxPort = opts.preserveMaxPort != null ? String(opts.preserveMaxPort) : '';
        const reopenMapPort = opts.reopenMapPort != null ? String(opts.reopenMapPort) : '';
        this._queueOpenMapMenuReposition();
        requestAnimationFrame(() => this._applyStripLayoutMode());
        if (focusPort) {
            this._setFocus(focusPort, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
        }
        if (maxPort) {
            const card = document.getElementById('bjc-' + maxPort);
            if (card && !card.classList.contains('bj-max')) {
                this.toggleMaximize(maxPort);
            }
        }
        if (reopenMapPort) {
            setTimeout(() => {
                const wrap = document.getElementById('bjmap-' + reopenMapPort);
                if (!wrap) return;
                wrap.classList.remove('bj-open');
                this._toggleCardMapMenu(reopenMapPort);
            }, 0);
        }
    },

    _closeAllMapMenus(exceptPortId = null) {
        document.querySelectorAll('.bj-card-map.bj-open').forEach(el => {
            if (exceptPortId && el.dataset.port === String(exceptPortId)) return;
            el.classList.remove('bj-open');
            el.closest('.bj-card')?.classList.remove('bj-map-host-open');
            delete el.dataset.mapDetached;
            const pop = el.querySelector('.bj-map-pop');
            if (pop) {
                pop.style.left = '';
                pop.style.top = '';
            }
        });
    },

    _setLegacyExamplesVisibility(hidden) {
        const nodes = [
            document.querySelector('.dob-acc[data-acc-id="examples"]'),
            document.getElementById('dob-acc-examples-body'),
            document.getElementById('dob-examples-grid'),
            document.getElementById('dob-ex-toggle'),
            document.getElementById('dob-examples-count')
        ].filter(Boolean);
        if (!nodes.length) return;
        nodes.forEach(node => {
            node.style.display = hidden ? 'none' : '';
            if (hidden) node.setAttribute('aria-hidden', 'true');
            else node.removeAttribute('aria-hidden');
        });
    },

    _toggleCardMapMenu(portId) {
        const wrap = document.getElementById('bjmap-' + portId);
        if (!wrap) return;
        const card = wrap.closest('.bj-card');
        const willOpen = !wrap.classList.contains('bj-open');
        this._closeAllMapMenus(wrap.dataset.port);
        wrap.classList.toggle('bj-open', willOpen);
        card?.classList.toggle('bj-map-host-open', willOpen);
        wrap.classList.remove('bj-map-up');
        if (willOpen) delete wrap.dataset.mapDetached;
        if (!willOpen) return;
        requestAnimationFrame(() => this._positionCardMapMenu(wrap));
    },

    _shouldShowCardRouting(toy) {
        if (toy?._previewOnly) return false;
        if (this._isBeaconToy(toy)) return false;
        if (!toy?._support) return false;
        return toy._support.status === 'unsupported' ||
            toy._support.status === 'needs_input' ||
            toy._support.source === 'override';
    },

    _mapButtonLabel(toy, override = null) {
        const display = override?.display || '';
        if (display === 'matrix') return 'Matrix';
        if (display === 'strip') return 'Strip';
        if (display === 'indicator') return 'RGB';
        if (display === 'physical') return 'Phys';
        if (display === 'both') return 'Both';
        if (toy?._support?.status === 'needs_input') return 'Map?';
        return 'Map';
    },

    _buildCardSupportControls(toy) {
        if (!this._shouldShowCardRouting(toy)) return null;

        const wrap = document.createElement('div');
        wrap.className = 'bj-card-map';
        wrap.id = 'bjmap-' + toy.portId;
        wrap.dataset.port = String(toy.portId);

        const override = this._getSupportOverride(toy.portId) || {};
        const currentDisplay = override.display || '';

        const mapBtn = document.createElement('button');
        mapBtn.className = 'bj-map-btn';
        mapBtn.textContent = this._mapButtonLabel(toy, override);
        mapBtn.title = toy._support?.note || 'Map or borrow a preview route for this toy';
        mapBtn.onclick = (e) => {
            e.stopPropagation();
            this._toggleCardMapMenu(toy.portId);
        };
        mapBtn.onmousedown = (e) => e.stopPropagation();
        mapBtn.onpointerdown = (e) => e.stopPropagation();
        wrap.appendChild(mapBtn);

        const pop = document.createElement('div');
        pop.className = 'bj-map-pop';
        pop.onclick = (e) => e.stopPropagation();
        pop.onmousedown = (e) => e.stopPropagation();
        pop.onpointerdown = (e) => e.stopPropagation();

        const note = document.createElement('div');
        note.className = 'bj-map-note';
        note.textContent = toy._support?.note || 'Choose how this toy should preview.';
        note.title = 'Drag to reposition this mapping window';
        note.onpointerdown = (e) => {
            if (typeof e.button === 'number' && e.button !== 0) return;
            e.stopPropagation();
            wrap.dataset.mapDetached = '1';
            this._mapDragState = {
                pop,
                startX: e.clientX,
                startY: e.clientY,
                startLeft: pop.offsetLeft,
                startTop: pop.offsetTop
            };
        };
        pop.appendChild(note);

        const routeHdr = document.createElement('div');
        routeHdr.className = 'bj-map-subhdr';
        routeHdr.textContent = 'Route';
        pop.appendChild(routeHdr);

        const routeGroup = document.createElement('div');
        routeGroup.className = 'bj-map-group';
        const routeOptions = [
            { value: 'matrix', label: 'Matrix' },
            { value: 'strip', label: 'Strip' },
            { value: 'indicator', label: 'RGB Toy' },
            { value: 'physical', label: 'Physical' },
            ...(this._allowsDualEmissiveRouting(toy) ? [{ value: 'both', label: 'Both' }] : []),
            { value: '', label: 'Clear' }
        ];
        routeOptions.forEach(opt => {
            const chip = document.createElement('button');
            chip.className = 'bj-map-chip' + (currentDisplay === opt.value ? ' active' : '');
            chip.textContent = opt.label;
            chip.onclick = () => {
                const existing = this._getSupportOverride(toy.portId) || {};
                this._updateSupportOverride(toy.portId, {
                    display: opt.value,
                    stripIndices: opt.value === 'strip' ? (existing.stripIndices || []) : [],
                    stripNames: opt.value === 'strip' ? (existing.stripNames || []) : []
                }, {
                    focusPort: toy.portId,
                    preserveMaxPort: document.getElementById('bjc-' + toy.portId)?.classList.contains('bj-max') ? toy.portId : '',
                    reopenMapPort: opt.value === 'strip' ? toy.portId : ''
                });
            };
            routeGroup.appendChild(chip);
        });
        pop.appendChild(routeGroup);

        const borrowable = this._getBorrowableSupportToys(toy);
        if (borrowable.length) {
            const borrowHdr = document.createElement('div');
            borrowHdr.className = 'bj-map-subhdr';
            borrowHdr.textContent = 'Borrow Route';
            pop.appendChild(borrowHdr);
            const borrowWrap = document.createElement('div');
            borrowWrap.className = 'bj-map-borrow-groups';
            ['matrix', 'strip', 'indicator', 'physical'].forEach(groupKey => {
                const members = borrowable.filter(sourceToy => this._borrowGroupKeyForToy(sourceToy) === groupKey);
                if (!members.length) return;
                const meta = this._borrowGroupMeta(groupKey);
                const details = document.createElement('details');
                details.className = 'bj-map-borrow-group';
                details.open = groupKey === 'matrix' || groupKey === 'strip';
                const summary = document.createElement('summary');
                summary.className = 'bj-map-borrow-summary';
                summary.textContent = meta.label + ' (' + members.length + ')';
                details.appendChild(summary);
                const hint = document.createElement('div');
                hint.className = 'bj-map-borrow-hint';
                hint.textContent = meta.hint;
                details.appendChild(hint);
                const list = document.createElement('div');
                list.className = 'bj-map-borrow-list';
                members.forEach(sourceToy => {
                    const route = sourceToy._support?.display === 'strip'
                        ? ((this._supportToOverridePayload(sourceToy._support).stripNames || []).join(', ') || 'strip')
                        : sourceToy._support?.display || 'target';
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'bj-map-borrow-opt';
                    btn.textContent = sourceToy.toyName + ' -> ' + route;
                    btn.title = 'Borrow route from ' + sourceToy.toyName;
                    btn.onclick = () => {
                        this._updateSupportOverride(toy.portId, this._supportToOverridePayload(sourceToy._support), {
                            focusPort: toy.portId,
                            preserveMaxPort: document.getElementById('bjc-' + toy.portId)?.classList.contains('bj-max') ? toy.portId : ''
                        });
                    };
                    list.appendChild(btn);
                });
                details.appendChild(list);
                borrowWrap.appendChild(details);
            });
            pop.appendChild(borrowWrap);
        }

        const strips = (typeof App !== 'undefined' && Array.isArray(App.data?.cabinet?.strips)) ? App.data.cabinet.strips : [];
        if (currentDisplay === 'strip' && strips.length) {
            const stripHdr = document.createElement('div');
            stripHdr.className = 'bj-map-subhdr';
            stripHdr.textContent = 'Strip Targets';
            pop.appendChild(stripHdr);

            const stripWrap = document.createElement('div');
            stripWrap.className = 'bj-map-strips';
            const activeIndices = new Set(Array.isArray(override.stripIndices) ? override.stripIndices : []);
            strips.forEach((strip, idx) => {
                const label = document.createElement('label');
                label.className = 'bj-map-strip' + (activeIndices.has(idx) ? ' active' : '');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = activeIndices.has(idx);
                cb.onchange = () => {
                    const existing = this._getSupportOverride(toy.portId) || {};
                    const current = new Set(Array.isArray(existing.stripIndices) ? existing.stripIndices : []);
                    if (cb.checked) current.add(idx); else current.delete(idx);
                    const indices = [...current].sort((a, b) => a - b);
                    this._updateSupportOverride(toy.portId, {
                        display: 'strip',
                        stripIndices: indices,
                        stripNames: indices.map(i => strips[i]?.name).filter(Boolean)
                    }, {
                        focusPort: toy.portId,
                        preserveMaxPort: document.getElementById('bjc-' + toy.portId)?.classList.contains('bj-max') ? toy.portId : ''
                    });
                };
                label.appendChild(cb);
                label.appendChild(document.createTextNode(strip.name));
                stripWrap.appendChild(label);
            });
            pop.appendChild(stripWrap);
        }

        wrap.appendChild(pop);
        return { wrap };
    },

    _buildSupportMappingRow(toy) {
        const row = document.createElement('div');
        row.className = 'bj-support-row';
        const meta = document.createElement('div');
        meta.className = 'bj-support-meta';
        meta.innerHTML = '<div class="bj-support-name">P:' + toy.portId + ' ' + this._esc(toy.toyName) + '</div>' +
            '<div class="bj-support-note">' + this._esc(toy._support?.note || '') + '</div>';
        row.appendChild(meta);

        const controls = document.createElement('div');
        controls.className = 'bj-support-controls';
        const override = this._getSupportOverride(toy.portId);

        const sel = document.createElement('select');
        sel.className = 'bj-support-select';
        [
            { value: '', label: 'No Mapping' },
            { value: 'matrix', label: 'Route To Matrix' },
            { value: 'strip', label: 'Route To Strip' },
            { value: 'indicator', label: 'Route To RGB Toy' },
            { value: 'physical', label: 'Route To Physical Only' },
            ...(this._allowsDualEmissiveRouting(toy) ? [{ value: 'both', label: 'Route To Both' }] : [])
        ].forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            sel.appendChild(o);
        });
        sel.value = override?.display || '';
        controls.appendChild(sel);

        const borrow = document.createElement('select');
        borrow.className = 'bj-support-borrow';
        const borrowDefault = document.createElement('option');
        borrowDefault.value = '';
        borrowDefault.textContent = 'Borrow Route From Supported Toy...';
        borrow.appendChild(borrowDefault);
        this._getBorrowableSupportToys(toy).forEach(sourceToy => {
            const o = document.createElement('option');
            o.value = String(sourceToy.portId);
            const route = sourceToy._support?.display === 'strip'
                ? ((this._supportToOverridePayload(sourceToy._support).stripNames || []).join(', ') || 'strip')
                : sourceToy._support?.display || 'target';
            o.textContent = sourceToy.toyName + ' -> ' + route;
            borrow.appendChild(o);
        });
        borrow.onchange = () => {
            const source = this.importedToys.find(t => String(t.portId) === borrow.value);
            if (!source) return;
            this._updateSupportOverride(toy.portId, this._supportToOverridePayload(source._support));
        };
        controls.appendChild(borrow);

        const strips = (typeof App !== 'undefined' && Array.isArray(App.data?.cabinet?.strips)) ? App.data.cabinet.strips : [];
        const stripWrap = document.createElement('div');
        stripWrap.className = 'bj-support-strips';
        const activeIndices = new Set(Array.isArray(override?.stripIndices) ? override.stripIndices : []);
        stripWrap.style.display = sel.value === 'strip' ? '' : 'none';
        strips.forEach((strip, idx) => {
            const label = document.createElement('label');
            label.className = 'bj-support-strip';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = activeIndices.has(idx);
            cb.onchange = () => {
                const current = new Set(Array.isArray(this._getSupportOverride(toy.portId)?.stripIndices) ? this._getSupportOverride(toy.portId).stripIndices : []);
                if (cb.checked) current.add(idx); else current.delete(idx);
                const indices = [...current].sort((a, b) => a - b);
                this._updateSupportOverride(toy.portId, {
                    display: 'strip',
                    stripIndices: indices,
                    stripNames: indices.map(i => strips[i]?.name).filter(Boolean)
                });
            };
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + strip.name));
            stripWrap.appendChild(label);
        });
        controls.appendChild(stripWrap);

        sel.onchange = () => {
            const display = sel.value || '';
            stripWrap.style.display = display === 'strip' ? '' : 'none';
            this._updateSupportOverride(toy.portId, {
                display,
                stripIndices: display === 'strip' ? (this._getSupportOverride(toy.portId)?.stripIndices || []) : [],
                stripNames: display === 'strip' ? (this._getSupportOverride(toy.portId)?.stripNames || []) : []
            });
        };

        row.appendChild(controls);
        return row;
    },

    _renderSupportPanel() {
        let panel = document.getElementById('bjson-support-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'bjson-support-panel';
            panel.className = 'bj-support-panel';
        }
        if (!panel) return;
        panel.style.display = 'none';
        panel.innerHTML = '';
    },

    // 
    //  CATEGORIZATION
    // 
    _classifyToy(n) {
        const l = n.toLowerCase();
        if (/\bmx\b/i.test(l)) return 'mx';
        if (/\brgb\b/i.test(l)) return 'rgb';
        return 'phys';
    },
    _categorizeToy(n) {
        const l = n.toLowerCase();
        if (/\bmx\b/i.test(l)) return 'mx';
        if (/\brgb\b/i.test(l)) return 'rgb';
        if (/flasher/i.test(l)) return 'flasher';
        if (/bumper/i.test(l)) return 'bumper';
        if (/strobe|beacon/i.test(l)) return 'strobe';
        if (/knocker|shaker|gear|slingshot|fan|bell|topper/i.test(l)) return 'solenoid';
        if (/button|flipper|coin|launch|start|exit/i.test(l)) return 'button';
        return 'other';
    },

    // 
    //  VERTICAL STRIPS
    // 
    _enableVerticalStrips() {
        const wasExtended = !!this._stripExtended;
        const wasOnePx = !!this._stripOnePx;
        // Create the display grid wrapper + vstrips panel if they don't exist
        let grid = document.getElementById('bjson-display-grid');
        let vs = document.getElementById('bjson-vstrips');
        const mxViewport = document.getElementById('dob-mx-viewport');
        if (!mxViewport) return;

        // Cabinet mappings can change after import; keep display routing in sync.
        if (Array.isArray(this.importedToys) && this.importedToys.length) {
            this.importedToys.forEach(toy => {
                toy._display = this._getDisplayTarget(toy.toyName, toy.portId);
            });
        }

        if (!grid) {
            grid = document.createElement('div');
            grid.id = 'bjson-display-grid';
            grid.style.cssText = 'display:grid; grid-template-columns:1fr auto; gap:0;';
            // Wrap the matrix viewport in the grid
            mxViewport.parentNode.insertBefore(grid, mxViewport);
            grid.appendChild(mxViewport);
        }
        if (!vs) {
            vs = document.createElement('div');
            vs.id = 'bjson-vstrips';
            grid.appendChild(vs);
        } else if (vs.parentNode !== grid) {
            grid.appendChild(vs);
        }

        // Hide original horizontal strip display
        const stHeader = document.querySelector('#dob-st-label')?.closest('.dob-preview-header');
        if (stHeader) stHeader.style.display = 'none';
        ['dob-strip-checks','dob-st-viewport'].forEach(id => {
            const el = document.getElementById(id); if (el) el.style.display = 'none';
        });
        const hRack = document.getElementById('dob-strip-rack');
        if (hRack) hRack.innerHTML = '';
        Builder._stripLedElsByStrip = [];
        vs.style.display = ''; vs.innerHTML = '';

        const cabinetStrips = (typeof App !== 'undefined') && App.data?.cabinet?.strips;
        const rack = document.createElement('div'); rack.className = 'bj-vrack';
        Builder._stripLedElsByStrip = [];
        Builder._stripColorCacheByStrip = [];

        if (cabinetStrips && cabinetStrips.length) {
            cabinetStrips.forEach(s => { Builder._stripChecked[s.name] = true; });
            Builder._stripVisible = true;
            cabinetStrips.forEach((s, idx) => {
                const col = document.createElement('div'); col.className = 'bj-vcol';
                const cnt = document.createElement('div'); cnt.className = 'bj-vcount'; cnt.textContent = '(' + s.leds + ')';
                col.appendChild(cnt);
                const ledRefs = new Array(s.leds);
                const ledCache = new Int32Array(s.leds);
                ledCache.fill(-1);
                for (let i = 0; i < s.leds; i++) {
                    const led = document.createElement('div'); led.className = 'bj-vled';
                    led.id = 'dob-str-' + idx + '-' + i;
                    col.appendChild(led);
                    ledRefs[i] = led;
                }
                Builder._stripLedElsByStrip[idx] = ledRefs;
                Builder._stripColorCacheByStrip[idx] = ledCache;
                const label = document.createElement('div'); label.className = 'bj-vlabel'; label.title = s.name;
                label.textContent = s.name.replace(/Sideboard /,'Sb').replace(/Speaker /,'Sp').replace(/Backglass /,'Bg').replace(/ Left/,'L').replace(/ Right/,'R').replace(/ Rear/,'R');
                col.appendChild(label); rack.appendChild(col);
            });
            console.log('[BuilderJSON] Vertical strips (cabinet): ' + cabinetStrips.length + ' strips');
        } else {
            Builder._stripVisible = true;
            const ledCount = Builder.previewStrip || 138;
            const col = document.createElement('div'); col.className = 'bj-vcol';
            const cnt = document.createElement('div'); cnt.className = 'bj-vcount'; cnt.textContent = '(' + ledCount + ')';
            col.appendChild(cnt);
            const ledRefs = new Array(ledCount);
            const ledCache = new Int32Array(ledCount);
            ledCache.fill(-1);
            for (let i = 0; i < ledCount; i++) {
                const led = document.createElement('div'); led.className = 'bj-vled';
                led.id = 'dob-str-0-' + i;
                col.appendChild(led);
                ledRefs[i] = led;
            }
            Builder._stripLedElsByStrip[0] = ledRefs;
            Builder._stripColorCacheByStrip[0] = ledCache;
            const label = document.createElement('div'); label.className = 'bj-vlabel'; label.textContent = 'Strip';
            col.appendChild(label); rack.appendChild(col);
            console.log('[BuilderJSON] Vertical strips (fallback): 1 strip, ' + ledCount + ' LEDs');
        }
        vs.appendChild(rack);
        this._syncVerticalStripBindings(true);

        // Split controls at top
        const controls = document.createElement('div');
        controls.className = 'bj-strip-toggle-row';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'bj-strip-toggle';
        toggleBtn.id = 'bj-strip-mode-btn';
        toggleBtn.textContent = '<>';
        toggleBtn.title = 'Toggle between compact and full-height strip display';
        toggleBtn.onclick = () => this._toggleStripMode();
        controls.appendChild(toggleBtn);

        const widthBtn = document.createElement('button');
        widthBtn.className = 'bj-strip-toggle';
        widthBtn.id = 'bj-strip-width-btn';
        widthBtn.textContent = '1px';
        widthBtn.title = 'Toggle narrow 1px strip LED bars';
        widthBtn.onclick = () => this._toggleStripWidth();
        controls.appendChild(widthBtn);

        vs.insertBefore(controls, vs.firstChild);

        this._stripExtended = wasExtended;
        this._stripOnePx = wasOnePx;
        this._applyStripLayoutMode();
    },

    _toggleStripMode() {
        const vs = document.getElementById('bjson-vstrips'); if (!vs) return;
        this._stripExtended = !this._stripExtended;
        this._applyStripLayoutMode();
        this._markLayoutDirty();

        // Force matrix re-measure after layout mode changes.
        if (typeof Builder !== 'undefined') {
            Builder._ensureMatrixResizeObserver?.();
            Builder._scheduleMatrixGridRebuild?.();
            requestAnimationFrame(() => Builder._scheduleMatrixGridRebuild?.());
        }
    },

    _toggleStripWidth() {
        const vs = document.getElementById('bjson-vstrips'); if (!vs) return;
        const btn = document.getElementById('bj-strip-width-btn');
        this._stripOnePx = !this._stripOnePx;
        vs.classList.toggle('bj-strip-1px', this._stripOnePx);
        if (btn) btn.classList.toggle('active', this._stripOnePx);
        this._markLayoutDirty();
    },

    // 
    //  TOY ICON BAR  non-dimensional toys shown as indicators below matrix
    // 
    _renderToyIconBar() {
        let bar = document.getElementById('bjson-toy-icons');
        if (!bar) {
            bar = document.createElement('div'); bar.id = 'bjson-toy-icons'; bar.className = 'bj-toy-icon-bar';
            // Insert after matrix/strip display grid, before filter bar
            const grid = document.getElementById('bjson-display-grid');
            if (grid?.parentNode) grid.parentNode.insertBefore(bar, grid.nextSibling);
        }
        bar.innerHTML = ''; bar.style.display = '';

        // Collect non-dimensional toys (physical, indicator, and named variable toys)
        const iconToys = this.importedToys.filter(t =>
            t._display === 'physical' || t._display === 'indicator' ||
            t._cat === 'flasher' || t._cat === 'bumper' || t._cat === 'strobe' || t._cat === 'solenoid' || t._cat === 'button'
        );
        if (!iconToys.length) { bar.style.display = 'none'; return; }

        // Group by category
        const groups = {};
        iconToys.forEach(t => { (groups[t._cat] = groups[t._cat] || []).push(t); });

        const catOrder = ['rgb','flasher','bumper','strobe','solenoid','button','other'];
        catOrder.forEach(cat => {
            const toys = groups[cat]; if (!toys?.length) return;
            const def = this.CATS[cat] || this.CATS.other;
            // Category label
            const label = document.createElement('span'); label.className = 'bj-tib-label';
            label.style.color = def.color; label.textContent = def.icon + ' ' + def.label;
            bar.appendChild(label);
            // Toy icons
            toys.forEach(toy => {
                const isEmpty = !toy.rawUser || !toy.rawUser.trim();
                const icon = document.createElement('span');
                icon.className = 'bj-tib-icon' + (isEmpty ? ' bj-tib-empty' : '');
                icon.id = 'bjtib-' + toy.portId;
                icon.title = toy.toyName + ' (Port ' + (toy._portLabel || toy.portId) + ')' + (isEmpty ? '  empty' : '');
                icon.textContent = def.icon;
                const baseColor = this._isStrobeToy(toy) ? '#dfe6ee' : def.color;
                icon.style.color = isEmpty ? '#2a3a50' : baseColor;
                // Click to focus the card
                icon.onclick = () => {
                    this._setFocus(toy.portId);
                    const card = document.getElementById('bjc-' + toy.portId);
                    if (card) {
                        this._scrollElementIntoWorkspaceView(card, { align:'nearest' });
                        this._resetDocumentScrollIfNeeded();
                    }
                };
                bar.appendChild(icon);
            });
            // Spacer between groups
            const sp = document.createElement('span'); sp.className = 'bj-tib-spacer';
            bar.appendChild(sp);
        });

        // Strip status indicator
        const hasStrips = (typeof App !== 'undefined') && App.data?.cabinet?.strips?.length;
        const stripStatus = document.createElement('span'); stripStatus.className = 'bj-tib-strip-status';
        stripStatus.textContent = hasStrips ? '| Strips: Active' : '| Strips: Load Cabinet JSON';
        stripStatus.style.color = hasStrips ? '#4caf50' : '#f57f17';
        bar.appendChild(stripStatus);
    },

    // Update toy icon bar indicator when toy fires
    _toyIconOn(portId, color) {
        const icon = document.getElementById('bjtib-' + portId);
        if (icon) {
            icon.style.color = color || '#f5a623';
            icon.style.textShadow = '0 0 8px ' + (color || '#f5a623');
            icon.classList.add('bj-tib-active');
        }
    },
    _toyIconOff(portId) {
        const icon = document.getElementById('bjtib-' + portId);
        if (icon) {
            const toy = this.importedToys.find(t => t.portId === portId);
            const def = toy ? (this.CATS[toy._cat] || this.CATS.other) : this.CATS.other;
            icon.style.color = this._isStrobeToy(toy) ? '#dfe6ee' : def.color;
            icon.style.textShadow = 'none';
            icon.classList.remove('bj-tib-active');
        }
    },

    _disableVerticalStrips() {
        const grid = document.getElementById('bjson-display-grid');
        const vs = document.getElementById('bjson-vstrips');
        // Unwrap: move matrix viewport back to its original parent
        if (grid) {
            const mxViewport = document.getElementById('dob-mx-viewport');
            if (mxViewport && grid.parentNode) {
                grid.parentNode.insertBefore(mxViewport, grid);
            }
            grid.remove();
        }
        if (vs) {
            vs.classList.remove('bj-strips-extended');
            vs.remove();
        }
        // Restore original strip display
        const stHeader = document.querySelector('#dob-st-label')?.closest('.dob-preview-header');
        if (stHeader) stHeader.style.display = '';
        ['dob-strip-checks','dob-st-viewport'].forEach(id => {
            const el = document.getElementById(id); if (el) el.style.display = '';
        });
        Builder._buildStripRack();
    },

    // 
    //  FILTER BAR  Issue 5 (Clear All) + Issue 6 (Section filtering)
    // 
    _renderFilterBar() {
        let bar = document.getElementById('bjson-filter-bar');
        if (!bar) {
            bar = document.createElement('div'); bar.id = 'bjson-filter-bar'; bar.className = 'bj-filter-bar';
            // B2: Place filter bar in Target Section area (after section buttons)
            const secBtns = document.getElementById('dob-section-btns');
            if (secBtns) secBtns.parentNode.insertBefore(bar, secBtns.nextSibling);
            else { const wrap = document.getElementById('bjson-card-wrap'); if (wrap) wrap.parentNode.insertBefore(bar, wrap); }
        }
        bar.innerHTML = ''; bar.style.display = '';
        const counts = { all: this.importedToys.length, supported: 0, modified: 0, edited: 0, unsupported: 0, needs_input: 0, combo: 0 };
        for (const c of Object.keys(this.CATS)) counts[c] = 0;
        this.importedToys.forEach(t => {
            counts[t._cat] = (counts[t._cat]||0) + 1;
            if (t._modified) counts.modified++;
            if (t._edited) counts.edited++;
            if (t._support?.status === 'supported') counts.supported++;
            if (t._support?.status === 'unsupported') counts.unsupported++;
            if (t._support?.status === 'needs_input') counts.needs_input++;
            if (t._support?.viaCombo) counts.combo++;
        });

        const mkPill = (key, label, count, extraCls = '') => {
            const p = document.createElement('span');
            p.className = 'bj-filter-pill' + (extraCls ? (' ' + extraCls) : '') + (this._catFilter === key ? ' active' : '');
            p.innerHTML = label + ' <span class="bj-pill-count">' + count + '</span>';
            p.onclick = () => {
                this._catFilter = key;
                this._renderFilterBar();
                this._applyFilter();
                this._filterSectionBtns(); // Issue 6
            };
            bar.appendChild(p);
        };
        mkPill('all', 'All', counts.all);
        if (counts.supported > 0) mkPill('supported', 'OK Supported', counts.supported, 'bj-pill-supported');
        if (counts.modified > 0) mkPill('modified', '* Modified', counts.modified, 'bj-pill-modified');
        mkPill('edited', '~ Edited', counts.edited, 'bj-pill-edited');
        if (counts.needs_input > 0) mkPill('needs_input', '? Map Input', counts.needs_input, 'bj-pill-map');
        if (counts.unsupported > 0) mkPill('unsupported', 'X Unsupported', counts.unsupported, 'bj-pill-unsupported');
        if (counts.combo > 0) mkPill('combo', '<> Combo', counts.combo, 'bj-pill-combo');
        for (const [key, def] of Object.entries(this.CATS)) {
            if (counts[key] > 0) mkPill(key, def.icon + ' ' + def.label, counts[key]);
        }

        // Empty toggle
        const toggle = document.createElement('span'); toggle.className = 'bj-filter-toggle';
        toggle.textContent = this._showEmpty ? 'v Hide empty' : '> Show empty';
        toggle.onclick = () => {
            this._showEmpty = !this._showEmpty;
            this._renderFilterBar(); this._applyFilter(); this._filterSectionBtns();
        };
        bar.appendChild(toggle);
        const actions = document.createElement('span');
        actions.className = 'bj-filter-actions';

        // Issue 5: Clear All Effects
        const clearBtn = document.createElement('button'); clearBtn.className = 'bj-clear-all-btn';
        clearBtn.textContent = 'X CLEAR ALL EFFECTS';
        clearBtn.onclick = () => this.clearAllEffects();
        actions.appendChild(clearBtn);

        // Revert all modified cards to imported baseline
        const revertBtn = document.createElement('button'); revertBtn.className = 'bj-revert-all-btn';
        revertBtn.textContent = 'REVERT ALL';
        revertBtn.title = 'Revert all modified cards to original state';
        revertBtn.onclick = () => this._revertAllChanges();
        actions.appendChild(revertBtn);

        // Global Builder reset
        const resetBtn = document.createElement('button'); resetBtn.className = 'bj-reset-all-btn';
        resetBtn.textContent = 'RESET';
        resetBtn.title = 'Factory reset DOF Builder state';
        resetBtn.onclick = () => Builder.factoryReset();
        actions.appendChild(resetBtn);

        bar.appendChild(actions);
    },

    _currentTableName() {
        return this.importedConfig?.table || '';
    },

    _tableCardOrderStorageKey(tableName) {
        return tableName ? ('bjson-order-' + tableName.replace(/\s+/g, '_')) : '';
    },

    _globalCardOrderStorageKey() {
        return 'bjson-order-global';
    },

    _loadStoredCardOrder(key) {
        if (!key) return null;
        try {
            const s = localStorage.getItem(key);
            return s ? JSON.parse(s) : null;
        } catch(e) {
            return null;
        }
    },

    _saveStoredCardOrder(key, order) {
        if (!key || !Array.isArray(order) || !order.length) return;
        try {
            localStorage.setItem(key, JSON.stringify(order));
        } catch(e) { /* storage full or unavailable */ }
    },

    _deleteStoredCardOrder(key) {
        if (!key) return;
        try { localStorage.removeItem(key); } catch(e) {}
    },

    _defaultToyCategoryOrder() {
        return { mx:0, rgb:1, flasher:2, bumper:3, strobe:4, solenoid:5, button:6, other:7 };
    },

    _getDefaultOrderedToys(toys) {
        const catOrder = this._defaultToyCategoryOrder();
        return [...(toys || [])].sort((a, b) => {
            const ca = catOrder[a?._cat] ?? 999;
            const cb = catOrder[b?._cat] ?? 999;
            if (ca !== cb) return ca - cb;
            return String(a?.toyName || '').localeCompare(String(b?.toyName || ''));
        });
    },

    _normalizeCardOrder(order, defaultPortIds) {
        const fallback = Array.isArray(defaultPortIds) ? defaultPortIds.map(pid => String(pid)) : [];
        if (!Array.isArray(order) || !order.length) return fallback.length ? fallback : null;
        const allowed = new Set(fallback);
        const seen = new Set();
        const normalized = [];
        order.forEach(pid => {
            const key = String(pid);
            if (!allowed.has(key) || seen.has(key)) return;
            seen.add(key);
            normalized.push(key);
        });
        fallback.forEach(pid => {
            if (seen.has(pid)) return;
            seen.add(pid);
            normalized.push(pid);
        });
        return normalized.length ? normalized : null;
    },

    _resolveCardOrder(tableName, defaultPortIds) {
        const tableOrder = this._loadStoredCardOrder(this._tableCardOrderStorageKey(tableName));
        if (Array.isArray(tableOrder) && tableOrder.length) {
            return {
                order: this._normalizeCardOrder(tableOrder, defaultPortIds),
                source: 'table'
            };
        }
        const globalOrder = this._loadStoredCardOrder(this._globalCardOrderStorageKey());
        if (Array.isArray(globalOrder) && globalOrder.length) {
            return {
                order: this._normalizeCardOrder(globalOrder, defaultPortIds),
                source: 'global'
            };
        }
        return {
            order: this._normalizeCardOrder(defaultPortIds, defaultPortIds),
            source: 'default'
        };
    },

    _setLayoutNote(message = '') {
        this._layoutNote = message || '';
        if (this._layoutNoteTimer) clearTimeout(this._layoutNoteTimer);
        if (this._layoutNote) {
            this._layoutNoteTimer = setTimeout(() => {
                this._layoutNote = '';
                this._renderLayoutBar();
            }, 2200);
        } else {
            this._layoutNoteTimer = null;
        }
        this._renderLayoutBar();
    },

    _layoutStatusText() {
        if (this._layoutNote) return this._layoutNote;
        const base = this._layoutSource === 'table'
            ? 'Table layout active'
            : this._layoutSource === 'global'
                ? 'Global layout active'
                : 'Default layout active';
        return this._layoutDirty ? (base + ' - unsaved changes') : base;
    },

    _markLayoutDirty() {
        this._layoutDirty = true;
        this._layoutNote = '';
        if (this._layoutNoteTimer) {
            clearTimeout(this._layoutNoteTimer);
            this._layoutNoteTimer = null;
        }
        this._renderLayoutBar();
    },

    _renderLayoutBar() {
        const wrap = document.getElementById('bjson-card-wrap');
        if (!wrap) return;
        let bar = document.getElementById('bjson-layout-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'bjson-layout-bar';
            bar.className = 'bj-layout-bar';
        }
        const anchorParent = wrap.parentNode;
        const filterBar = document.getElementById('bjson-filter-bar');
        if (anchorParent && bar.parentNode !== anchorParent) anchorParent.insertBefore(bar, wrap);
        if (anchorParent && filterBar && filterBar.parentNode === anchorParent) {
            if (filterBar.nextSibling !== bar) anchorParent.insertBefore(bar, wrap);
        }
        bar.style.display = this.jsonMode ? '' : 'none';
        if (!this.jsonMode) return;

        bar.innerHTML = '';
        const tableName = this._currentTableName();

        const label = document.createElement('span');
        label.className = 'bj-layout-label';
        label.textContent = 'Layout';
        bar.appendChild(label);

        const status = document.createElement('span');
        status.className = 'bj-layout-status' + (this._layoutDirty ? ' bj-dirty' : '');
        status.textContent = this._layoutStatusText();
        bar.appendChild(status);

        const actions = document.createElement('div');
        actions.className = 'bj-layout-actions';

        const saveGlobalBtn = document.createElement('button');
        saveGlobalBtn.className = 'bj-layout-btn bj-layout-btn-primary';
        saveGlobalBtn.textContent = 'Save Global Layout';
        saveGlobalBtn.title = 'Save the current card order and strip display as the fallback layout for tables without a table-specific layout.';
        saveGlobalBtn.onclick = () => this.saveGlobalLayout();
        actions.appendChild(saveGlobalBtn);

        const saveTableBtn = document.createElement('button');
        saveTableBtn.className = 'bj-layout-btn';
        saveTableBtn.textContent = 'Save Table Layout';
        saveTableBtn.title = 'Save the current card order and strip display only for this table.';
        saveTableBtn.disabled = !tableName;
        saveTableBtn.onclick = () => this.saveTableLayout();
        actions.appendChild(saveTableBtn);

        const resetTableBtn = document.createElement('button');
        resetTableBtn.className = 'bj-layout-btn bj-layout-btn-warn';
        resetTableBtn.textContent = 'Reset Table Layout';
        resetTableBtn.title = 'Remove the saved table-specific card order and strip display so this table falls back to the global or default layout.';
        resetTableBtn.disabled = !tableName;
        resetTableBtn.onclick = () => this.resetTableLayout();
        actions.appendChild(resetTableBtn);

        bar.appendChild(actions);
    },

    saveGlobalLayout() {
        if (!Array.isArray(this._cardOrder) || !this._cardOrder.length) return;
        const tableName = this._currentTableName();
        const hasTableOverride = !!this._loadStoredCardOrder(this._tableCardOrderStorageKey(tableName));
        this._saveStoredCardOrder(this._globalCardOrderStorageKey(), this._cardOrder);
        this._saveStripLayoutPreference({ mode: 'global' });
        if (!hasTableOverride) {
            this._layoutSource = 'global';
            this._layoutDirty = false;
        }
        this._setLayoutNote('Global layout saved');
    },

    saveTableLayout() {
        const tableName = this._currentTableName();
        if (!tableName || !Array.isArray(this._cardOrder) || !this._cardOrder.length) return;
        this._saveStoredCardOrder(this._tableCardOrderStorageKey(tableName), this._cardOrder);
        this._saveStripLayoutPreference({ mode: 'table', tableName });
        this._layoutSource = 'table';
        this._layoutDirty = false;
        this._setLayoutNote('Table layout saved');
    },

    resetTableLayout() {
        const tableName = this._currentTableName();
        if (!tableName) return;
        this._deleteStoredCardOrder(this._tableCardOrderStorageKey(tableName));
        this._clearTableStripLayoutPreference(tableName);
        this._loadStripLayoutPreference(tableName);
        this._applyStripLayoutMode();
        this._layoutDirty = false;
        this._layoutNote = '';
        if (this._layoutNoteTimer) {
            clearTimeout(this._layoutNoteTimer);
            this._layoutNoteTimer = null;
        }
        this._renderCards();
        this._setLayoutNote('Table layout reset');
    },

    _applyFilter() {
        this.importedToys.forEach(t => {
            const card = document.getElementById('bjc-' + t.portId); if (!card) return;
            const catMatch = this._catFilter === 'all' || this._catFilter === t._cat ||
                (this._catFilter === 'supported' && t._support?.status === 'supported') ||
                (this._catFilter === 'modified' && t._modified) ||
                (this._catFilter === 'edited' && t._edited) ||
                (this._catFilter === 'unsupported' && t._support?.status === 'unsupported') ||
                (this._catFilter === 'needs_input' && t._support?.status === 'needs_input') ||
                (this._catFilter === 'combo' && t._support?.viaCombo);
            const isEmpty = !t.rawUser || !t.rawUser.trim();
            card.classList.toggle('bj-hidden', !(catMatch && (this._showEmpty || !isEmpty)));
        });
        // Update category dividers visibility
        document.querySelectorAll('.bj-cat-divider').forEach(div => {
            const cat = div.dataset.cat;
            const hasVisible = !!document.querySelector('.bj-card[data-port]:not(.bj-hidden)');
            // Check if any cards of this category are visible after this divider
            let next = div.nextElementSibling;
            let anyVisible = false;
            while (next && !next.classList.contains('bj-cat-divider')) {
                if (next.classList.contains('bj-card') && !next.classList.contains('bj-hidden')) anyVisible = true;
                next = next.nextElementSibling;
            }
            div.style.display = anyVisible ? '' : 'none';
        });
    },

    // Issue 6: Section buttons match active filter
    _filterSectionBtns() {
        document.querySelectorAll('.dob-sec-btn').forEach(btn => {
            const sName = btn.dataset.section;
            const toy = this.importedToys.find(t => t.toyName === sName); if (!toy) return;
            const catMatch = this._catFilter === 'all' || this._catFilter === toy._cat ||
                (this._catFilter === 'supported' && toy._support?.status === 'supported') ||
                (this._catFilter === 'modified' && toy._modified) ||
                (this._catFilter === 'edited' && toy._edited) ||
                (this._catFilter === 'unsupported' && toy._support?.status === 'unsupported') ||
                (this._catFilter === 'needs_input' && toy._support?.status === 'needs_input') ||
                (this._catFilter === 'combo' && toy._support?.viaCombo);
            const isEmpty = !toy.rawUser || !toy.rawUser.trim();
            btn.style.display = (catMatch && (this._showEmpty || !isEmpty)) ? '' : 'none';
        });
    },

    // Issue 5: Clear all active effects, latches, focus, AND checkboxes
    clearAllEffects() {
        if (this._newEffectPort) this._cancelNewEffect();
        Object.keys(this.latchedToys).forEach(p => {
            delete this.latchedToys[p];
            document.getElementById('bjl-' + p)?.classList.remove('bj-firing');
            this._indicateOff(p);
        });
        this.activeTimers.forEach(t => clearTimeout(t));
        this.activeTimers = [];
        // v13.13.25: Removed _promoteCard/_demoteCard  cards stay in grid position
        this._activeToyPort = null;
        this._activeTrigger = null;
        this._inPreview = false;
        document.querySelectorAll('.bj-card.bj-focus').forEach(c => c.classList.remove('bj-focus'));
        document.querySelectorAll('.bj-trig-btn.bj-trig-active').forEach(b => b.classList.remove('bj-trig-active'));
        document.querySelectorAll('.bj-card.bj-active').forEach(c => c.classList.remove('bj-active'));
        // Issue 5: Uncheck ALL layer checkboxes across ALL cards
        document.querySelectorAll('.bj-lcb').forEach(cb => { cb.checked = false; });
        // Reset all toy icon bar indicators
        document.querySelectorAll('.bj-tib-icon.bj-tib-active').forEach(i => {
            i.classList.remove('bj-tib-active'); i.style.textShadow = 'none';
        });
        this._clearBuilder();
    },

    // 
    //  CARD UI  flat grid with drag-reorder + order persistence
    // 
    _renderCards() {
        const wrap = document.getElementById('bjson-card-wrap'); if (!wrap) return;
        wrap.style.display = ''; wrap.innerHTML = '';

        const tableName = this._currentTableName();
        const defaultOrdered = this._getDefaultOrderedToys(this.importedToys);
        const resolved = this._resolveCardOrder(tableName, defaultOrdered.map(t => t.portId));
        this._cardOrder = resolved.order;
        this._layoutSource = resolved.source;
        this._layoutDirty = false;
        let ordered = [...defaultOrdered];
        if (this._cardOrder && this._cardOrder.length) {
            const posMap = {};
            this._cardOrder.forEach((pid, i) => { posMap[String(pid)] = i; });
            ordered.sort((a, b) => {
                const pa = posMap[String(a.portId)] ?? 9999;
                const pb = posMap[String(b.portId)] ?? 9999;
                if (pa !== pb) return pa - pb;
                return 0;
            });
        }

        // Build flat grid
        const grid = document.createElement('div');
        grid.className = 'bj-card-grid'; grid.id = 'bjson-card-grid';
        let lastCat = '';
        ordered.forEach(toy => {
            // Category divider when category changes
            if (toy._cat !== lastCat) {
                lastCat = toy._cat;
                const def = this.CATS[toy._cat] || this.CATS.other;
                const catCount = ordered.filter(t => t._cat === toy._cat).length;
                const hdr = document.createElement('div');
                hdr.className = 'bj-cat-divider'; hdr.dataset.cat = toy._cat;
                hdr.innerHTML = '<span class="bj-cat-icon" style="color:' + def.color + '">' + def.icon + '</span> ' +
                    def.label + ' <span class="bj-cat-count">(' + catCount + ')</span>';
                grid.appendChild(hdr);
            }
            this._buildCard(toy, grid);
        });
        wrap.appendChild(grid);
        this._renderLayoutBar();

        this._applyFilter();
    },

    _buildCard(toy, grid) {
        const isEmpty = !toy.rawUser || !toy.rawUser.trim();
        const hasNonRenderable = this._hasNonRenderableVars(toy);
        const blocked = this._toyBlockedFromPreview(toy);
        const card = document.createElement('div');
        card.className = 'bj-card' +
            (isEmpty ? ' bj-empty' : '') +
            (!this._showEmpty && isEmpty ? ' bj-hidden' : '') +
            (toy._support?.status === 'unsupported' ? ' bj-card-unsupported' : '') +
            (toy._support?.status === 'needs_input' ? ' bj-card-needs-input' : '');
        card.id = 'bjc-' + toy.portId;
        card.dataset.port = toy.portId;

        //  Drag handle + draggable 
        // Only enable draggable when grip is mousedown'd (prevents hijacking text select, sliders, etc.)
        card.addEventListener('dragstart', (e) => {
            // Only allow drag if initiated from grip
            if (!card.draggable) { e.preventDefault(); return; }
            this._dragSrc = toy.portId;
            card.classList.add('bj-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', toy.portId);
        });
        card.addEventListener('dragend', () => {
            card.draggable = false;
            card.classList.remove('bj-dragging');
            document.querySelectorAll('.bj-drag-over').forEach(c => c.classList.remove('bj-drag-over'));
            this._dragSrc = null;
            this._clearCardDragPrime(toy.portId);
        });
        card.addEventListener('dragover', (e) => {
            e.preventDefault(); e.dataTransfer.dropEffect = 'move';
            if (this._dragSrc && this._dragSrc !== toy.portId) card.classList.add('bj-drag-over');
        });
        card.addEventListener('dragleave', () => { card.classList.remove('bj-drag-over'); });
        card.addEventListener('drop', (e) => {
            e.preventDefault(); card.classList.remove('bj-drag-over');
            if (!this._dragSrc || this._dragSrc === toy.portId) return;
            this._reorderCard(this._dragSrc, toy.portId);
        });

        // Bug 1+3: Clicking ANYWHERE on card transfers focus + syncs Target Section
        card.addEventListener('mousedown', (e) => {
            if (this._dragPrimedPort === toy.portId ||
                e.target.closest('.bj-drag-grip') ||
                e.target.closest('.bj-card-resize') ||
                e.target.closest('.bj-card-map') ||
                e.target.closest('.bj-toolbar') ||
                e.target.closest('button') ||
                e.target.closest('input') ||
                e.target.closest('select') ||
                e.target.closest('[contenteditable="true"]')) {
                return;
            }
            if (this._activeToyPort !== toy.portId) this._setFocus(toy.portId);
        });
        card.addEventListener('mouseup', () => {
            card.draggable = false;
            this._clearCardDragPrime(toy.portId);
        });

        //  Header  Two-row layout 
        const hdr = document.createElement('div'); hdr.className = 'bj-card-hdr';

        // ROW 1: Identity
        const row1 = document.createElement('div'); row1.className = 'bj-hdr-row1';
        const grip = document.createElement('div'); grip.className = 'bj-drag-grip'; grip.textContent = '::';
        grip.title = 'Drag to reorder';
        const armGripDrag = (e) => {
            e.stopPropagation();
            this._armCardDrag(toy.portId);
            card.draggable = true;
        };
        grip.addEventListener('pointerdown', armGripDrag);
        grip.addEventListener('mousedown', armGripDrag);
        grip.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        row1.appendChild(grip);
        const nameDiv = document.createElement('div'); nameDiv.className = 'bj-card-name2';
        nameDiv.textContent = toy.toyName;
        row1.appendChild(nameDiv);
        if (this._isBeaconToy(toy)) {
            const swatches = document.createElement('div');
            swatches.className = 'bj-beacon-swatches';
            const activeHex = this._beaconPreviewHex(toy.portId);
            this._beaconSwatchDefs().forEach(def => {
                const sw = document.createElement('button');
                sw.type = 'button';
                sw.className = 'bj-beacon-swatch' + (String(def.hex).toLowerCase() === String(activeHex).toLowerCase() ? ' active' : '');
                sw.dataset.hex = def.hex;
                sw.title = 'Beacon preview color';
                sw.style.background = def.hex;
                sw.onclick = (e) => {
                    e.stopPropagation();
                    this._applyBeaconPreviewColor(toy.portId, def.hex);
                };
                swatches.appendChild(sw);
            });
            row1.appendChild(swatches);
        }
        const ind = document.createElement('div'); ind.className = 'bj-indicator2'; ind.id = 'bji-' + toy.portId;
        row1.appendChild(ind);
        const portBadge = document.createElement('span'); portBadge.className = 'bj-port-badge';
        const dispLabels = { matrix:'MX MX', strip:'| ST', indicator:'o RGB', physical:'! PHYS', both:'MX+P' };
        portBadge.innerHTML = 'P:' + (toy._portLabel || toy.portId) + ' <span class="bj-type-badge bj-badge-' + toy._cat + '">' +
            toy._cat.toUpperCase().slice(0,4) + '</span> ' + (dispLabels[toy._display] || '');
        const starHtml = toy._modified ? '<span class="bj-mod-star" title="Public/User differ in imported JSON">*</span>' : '';
        const editHtml = '<span class="bj-edit-mark" id="bj-edit-mark-' + toy.portId + '" style="display:' + (toy._edited ? '' : 'none') + '" title="Edited after import">~</span>';
        const noPreviewHtml = hasNonRenderable ? '<span class="bj-no-preview" title="Contains @variables@ that cannot be previewed">No Preview</span>' : '';
        portBadge.innerHTML += starHtml + editHtml + noPreviewHtml;
        row1.appendChild(portBadge);
        const acts = document.createElement('div'); acts.className = 'bj-card-acts2';
        const maxBtn = document.createElement('button'); maxBtn.className = 'bj-act-btn2'; maxBtn.innerHTML = '<span class="bj-act-ico" aria-hidden="true">&#x26F6;</span>'; maxBtn.title = 'Maximize'; maxBtn.setAttribute('aria-label', 'Maximize');
        maxBtn.onmousedown = (e) => { e.stopPropagation(); };
        maxBtn.onclick = () => this.toggleMaximize(toy.portId);
        const editBtn = document.createElement('button'); editBtn.className = 'bj-act-btn2'; editBtn.innerHTML = '<span class="bj-act-ico" aria-hidden="true">&#x270E;</span>'; editBtn.title = 'Edit in Builder'; editBtn.setAttribute('aria-label', 'Edit in Builder');
        editBtn.onclick = () => this.editInBuilder(toy.toyName);
        acts.appendChild(maxBtn);
        acts.appendChild(editBtn);
        if (this._canDuplicatePreviewToy(toy)) {
            const dupBtn = document.createElement('button');
            dupBtn.className = 'bj-act-btn2 bj-act-btn-dup';
            dupBtn.textContent = '2X';
            dupBtn.title = this._findPreviewDuplicateForSource(toy.portId)
                ? 'Preview duplicate already exists'
                : 'Add preview duplicate';
            dupBtn.disabled = !!this._findPreviewDuplicateForSource(toy.portId);
            dupBtn.onclick = (e) => {
                e.stopPropagation();
                this._addPreviewToyDuplicate(toy.portId);
            };
            acts.appendChild(dupBtn);
        } else if (toy._previewOnly) {
            const remBtn = document.createElement('button');
            remBtn.className = 'bj-act-btn2 bj-act-btn-dup-remove';
            remBtn.textContent = 'X2';
            remBtn.title = 'Remove preview duplicate';
            remBtn.onclick = (e) => {
                e.stopPropagation();
                this._removePreviewToyDuplicate(toy.portId);
            };
            acts.appendChild(remBtn);
        }
        const exampleType = this._exampleTypeForToy(toy);
        if (exampleType) {
            const exBtn = document.createElement('button');
            exBtn.className = 'bj-act-btn2 bj-act-btn-examples';
            exBtn.textContent = 'FX';
            exBtn.title = 'Open ' + this._exampleDisplayLabel(exampleType);
            exBtn.setAttribute('aria-label', 'Open ' + this._exampleDisplayLabel(exampleType));
            exBtn.dataset.port = toy.portId;
            exBtn.onclick = (e) => {
                e.stopPropagation();
                this._openExamplesPalette(toy.portId);
            };
            acts.appendChild(exBtn);
        }
        row1.appendChild(acts);
        hdr.appendChild(row1);

        // ROW 2: Controls
        const row2 = document.createElement('div'); row2.className = 'bj-hdr-row2';
        const mBtn = document.createElement('button'); mBtn.className = 'bj-ctrl-btn bj-ctrl-m'; mBtn.textContent = 'M'; mBtn.id = 'bjm-' + toy.portId;
        mBtn.title = 'Momentary  fire once through full cycle';
        mBtn.onclick = () => this.fireMomentary(toy.portId);
        const lBtn = document.createElement('button'); lBtn.className = 'bj-ctrl-btn bj-ctrl-l'; lBtn.textContent = 'L'; lBtn.title = 'Latched  toggle on/off'; lBtn.id = 'bjl-' + toy.portId;
        lBtn.onclick = () => this.toggleLatch(toy.portId);
        if (blocked) {
            mBtn.disabled = true;
            lBtn.disabled = true;
            mBtn.classList.add('bj-disabled');
            lBtn.classList.add('bj-disabled');
            mBtn.title = toy._support?.note || 'This toy cannot preview in the current cabinet profile.';
            lBtn.title = toy._support?.note || 'This toy cannot preview in the current cabinet profile.';
        }
        if (this._triggerLinkMode) {
            lBtn.disabled = true;
            lBtn.classList.add('bj-disabled');
            lBtn.title = 'Latch disabled while Trigger Link preview is active';
        }
        const neBtn = document.createElement('button'); neBtn.className = 'bj-ctrl-btn bj-ctrl-new'; neBtn.textContent = '+ New';
        neBtn.title = 'Add a new effect layer to this toy';
        neBtn.onclick = (e) => { e.stopPropagation(); this._startNewEffect(toy.portId); };
        const syncWrap = document.createElement('label'); syncWrap.className = 'bj-sync-label2';
        syncWrap.title = 'Include this card in Sync All  uncheck to exclude from linked trigger firing';
        const syncCb = document.createElement('input'); syncCb.type = 'checkbox'; syncCb.checked = this._isCardSyncChecked(toy.portId);
        syncCb.id = 'bj-sync-cb-' + toy.portId; syncCb.className = 'bj-sync-cb2';
        syncCb.onchange = (e) => { this._setCardSyncChecked(toy.portId, e.target.checked); e.stopPropagation(); };
        syncCb.onclick = (e) => e.stopPropagation();
        syncCb.onmousedown = (e) => e.stopPropagation();
        syncWrap.appendChild(syncCb); syncWrap.appendChild(document.createTextNode(' Sync'));
        const trigCount = new Set(toy.layers.map(l => l._trigger).filter(Boolean)).size;
        row2.appendChild(mBtn); row2.appendChild(lBtn); row2.appendChild(neBtn); row2.appendChild(syncWrap);
        if (trigCount > 5) {
            const hint = document.createElement('span'); hint.className = 'bj-hdr-nav-hint';
            hint.textContent = '<- -> browse effects';
            row2.appendChild(hint);
        }
        const routeUi = this._buildCardSupportControls(toy);
        if (routeUi?.wrap) row2.appendChild(routeUi.wrap);
        hdr.appendChild(row2);
        card.appendChild(hdr);

        //  Trigger toolbar  ALL triggers, numeric sort, wrapping 
        const trigs = [...new Set(toy.layers.map(l => l._trigger).filter(Boolean))];
        trigs.sort((a, b) => {
            const pa = a.match(/^([A-Z]+)(\d+)$/i), pb = b.match(/^([A-Z]+)(\d+)$/i);
            if (pa && pb) {
                if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
                return parseInt(pa[2]) - parseInt(pb[2]);
            }
            return a.localeCompare(b);
        });
        const toolbar = document.createElement('div'); toolbar.className = 'bj-toolbar';
        toolbar.addEventListener('mousedown', (e) => e.stopPropagation());
        const allLbl = document.createElement('label'); allLbl.textContent = 'All';
        allLbl.onclick = () => this.selectAll(toy.portId, true);
        const noneLbl = document.createElement('label'); noneLbl.textContent = 'None';
        noneLbl.onclick = () => this.selectAll(toy.portId, false);
        toolbar.appendChild(allLbl); toolbar.appendChild(document.createTextNode(' ')); toolbar.appendChild(noneLbl);
        toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'bj-sep' }));
        trigs.forEach(t => {
            const tb = document.createElement('span'); tb.className = 'bj-trig-btn';
            tb.textContent = t; tb.dataset.port = toy.portId; tb.dataset.trig = t;
            if (blocked) {
                tb.classList.add('bj-trig-disabled');
                tb.title = toy._support?.note || 'This trigger cannot preview in the current cabinet profile.';
            }
            tb.onclick = () => this.fireTrigger(toy.portId, t, tb);
            toolbar.appendChild(tb);
        });
        if (trigs.length > 5) {
            const hint = document.createElement('span');
            hint.className = 'bj-nav-hint';
            hint.textContent = '<- -> keys to browse';
            hint.title = 'Use Left/Right arrow keys to step through triggers sequentially';
            toolbar.appendChild(hint);
        }
        card.appendChild(toolbar);

        //  Layer list 
        const layerDiv = document.createElement('div'); layerDiv.className = 'bj-layers bj-two-col'; layerDiv.id = 'bjlayers-' + toy.portId;
        if (!toy.layers.length) {
            layerDiv.innerHTML = '<div class="bj-layer-row"><div class="bj-lsum" style="color:#5a7a90;font-style:italic;">Empty</div></div>';
        } else {
            toy.layers.forEach((layer, idx) => {
                const row = document.createElement('div'); row.className = 'bj-layer-row'; row.id = 'bjlr-' + toy.portId + '-' + idx;
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.className = 'bj-lcb'; cb.checked = true;
                cb.dataset.port = toy.portId; cb.dataset.idx = idx;
                cb.onchange = () => this._onCheckboxChanged(toy.portId, idx, cb.checked);
                const num = document.createElement('div'); num.className = 'bj-lnum'; num.textContent = idx + 1;
                const sum = document.createElement('div'); sum.className = 'bj-lsum';
                sum.contentEditable = 'true'; sum.spellcheck = false;
                sum.textContent = layer._raw || this._layerToRaw(layer);
                sum.dataset.port = toy.portId; sum.dataset.idx = idx;
                // Highlight @variable@ tokens visually
                if (layer._extra?.some(t => /^@\w+@$/.test(t))) {
                    sum.classList.add('bj-has-var');
                }
                sum.onblur = () => this._onCardRowEdited(toy.portId, idx, sum.textContent);
                sum.onkeydown = (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); sum.blur(); }
                    if (e.key === 'Escape') { e.preventDefault(); sum.textContent = (toy.layers[idx]?._originalRaw) || ''; sum.blur(); }
                };
                const play = document.createElement('button'); play.className = 'bj-play-btn'; play.textContent = '>'; play.title = 'Preview';
                if (blocked) {
                    play.disabled = true;
                    play.title = toy._support?.note || 'This layer cannot preview in the current cabinet profile.';
                }
                play.onclick = () => this.previewLayer(toy.portId, idx);
                row.appendChild(cb); row.appendChild(num); row.appendChild(sum); row.appendChild(play);
                // B3: Delete button for every row (original and added layers)
                    const del = document.createElement('button'); del.className = 'bj-del-btn'; del.textContent = 'X'; del.title = 'Delete this layer';
                    del.onclick = (e) => { e.stopPropagation(); this._deleteLayer(toy.portId, idx); };
                    row.appendChild(del);

                layerDiv.appendChild(row);
            });
        }
        card.appendChild(layerDiv);
        const resizeGrip = document.createElement('div');
        resizeGrip.className = 'bj-card-resize';
        resizeGrip.title = 'Drag to resize all cards';
        resizeGrip.addEventListener('pointerdown', (e) => this._startCardResize(e, card.classList.contains('bj-max') ? 'max' : 'normal'));
        resizeGrip.addEventListener('mousedown', (e) => this._startCardResize(e, card.classList.contains('bj-max') ? 'max' : 'normal'));
        resizeGrip.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (card.classList.contains('bj-max')) this._resetCardMaxHeightPreference();
            else this._applyCardHeightPreference(110, { persist: true });
        });
        card.appendChild(resizeGrip);
        grid.appendChild(card);
    },

    _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },

    _deleteLayer(portId, layerIdx) {
        if (!confirm('Delete layer ' + (layerIdx + 1) + '? This cannot be undone.')) return;
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        toy.layers.splice(layerIdx, 1);
        this.sectionLayers[toy.toyName] = toy.layers;
        // Rebuild card rows and trigger bar
        this._rebuildCardLayers(toy);
        this._rebuildCardTriggerBar(toy);
        if (Builder.activeSection === toy.toyName) {
            this._triggerScope = null; this._triggerScopeSection = null; this._scopePage = 0; this._activeTrigger = null;
            this._loadSectionLayers(toy.toyName);
        }
        this._regenerateSectionString(toy.toyName);
        this._updateCardChangeState(portId);
    },

    _onCardRowEdited(portId, layerIdx, newText) {
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        this._editTargetPort = portId;
        this._editTargetMasterIdx = layerIdx;
        const trimmed = newText.trim();
        const oldLayer = toy.layers[layerIdx];
        // Bug 2 fix: bail if text hasn't actually changed  prevents false "Modified" flags
        const currentRaw = oldLayer?._raw || this._layerToRaw(oldLayer);
        if (trimmed === currentRaw) return;
        const newLayer = this._parseLayer(trimmed, this._parseContextForToy(toy)); if (!newLayer) return;
        if (!newLayer._trigger && oldLayer?._trigger) newLayer._trigger = oldLayer._trigger;
        newLayer._raw = trimmed;
        newLayer._originalRaw = oldLayer?._originalRaw || '';
        toy.layers[layerIdx] = newLayer;
        this.sectionLayers[toy.toyName][layerIdx] = newLayer;
        if (toy.toyName === Builder.activeSection) {
            // Find which Builder slot maps to this master index
            let bi = -1;
            for (let i = 0; i < Builder.NUM_LAYERS; i++) { if (this._getMasterIndex(i) === layerIdx) { bi = i; break; } }
            if (bi >= 0 && bi < Builder.NUM_LAYERS) {
                Builder.layers[bi] = { ...newLayer };
                if (bi === Builder.currentLayerIdx) Builder.loadLayerToUI(bi);
                Builder._updateTabIndicators(); Builder._updateZLabels(); Builder._updateGenStr(); Builder._initSparkleState();
            }
        }
        this._regenerateSectionString(toy.toyName);
        this._updateCardChangeState(portId);
    },

    // 
    //  FIRE / LATCH / TRIGGER  with FOCUS CONTROL (Issue 4) + SECTION SYNC (Issue 6)
    // 
    _setFocus(portId, opts = {}) {
        const switchingToy = !!(this._activeToyPort && this._activeToyPort !== portId);
        const suppressSectionScroll = !!opts.skipSectionScroll || this._dragPrimedPort === portId;

        // Cancel New Effect mode only when moving to a different card.
        if (switchingToy && this._newEffectPort && this._newEffectPort !== portId) this._cancelNewEffect(false);

        // Clear previous toy UI state when moving focus.
        if (switchingToy) {
            this._indicateOff(this._activeToyPort);
            if (this.latchedToys[this._activeToyPort]) {
                delete this.latchedToys[this._activeToyPort];
                document.getElementById('bjl-' + this._activeToyPort)?.classList.remove('bj-firing');
            }
            document.getElementById('bjc-' + this._activeToyPort)?.classList.remove('bj-focus');
            if (!opts.preserveTrigger) {
                document.querySelectorAll('#bjc-' + this._activeToyPort + ' .bj-trig-btn.bj-trig-active')
                    .forEach(b => b.classList.remove('bj-trig-active'));
            }
            document.querySelectorAll('[id^="bjlr-' + this._activeToyPort + '-"].bj-firing-row')
                .forEach(r => r.classList.remove('bj-firing-row'));
        }

        this._activeToyPort = portId;
        if (switchingToy) {
            this._editTargetPort = portId;
            this._editTargetMasterIdx = null;
        }
        if (switchingToy && !opts.preserveTrigger) {
            this._activeTrigger = null;
            this._setTriggerLinkMode(false);
        }

        document.querySelectorAll('.bj-card.bj-focus').forEach(c => c.classList.remove('bj-focus'));
        document.getElementById('bjc-' + portId)?.classList.add('bj-focus');

        const toy = this.importedToys.find(t => t.portId === portId);
        if (toy && toy.toyName !== Builder.activeSection) {
            if (Builder.activeSection) this._writeBackLayers(Builder.activeSection);
            if (opts.clearPreview !== false) this._clearBuilder();
            Builder.activeSection = toy.toyName;
            document.querySelectorAll('.dob-sec-btn').forEach(b => {
                const isActive = b.dataset.section === toy.toyName;
                b.classList.toggle('active', isActive);
                if (isActive && !suppressSectionScroll) b.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'nearest' });
            });
            Builder._checkSingleLock();
            this._loadSectionLayers(toy.toyName);
        }

        this._updatePreviewScopeStatus();
    },

    // v13.13.25: _promoteCard/_demoteCard removed  cards stay in their grid position.
    // Focused card is highlighted with bj-focus class and scrolled into view.
    // This fixes drag-to-reorder by keeping cards in their persisted grid order.

    _onCheckboxChanged(portId, changedIdx = null, changedChecked = null) {
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        // Always bind checkbox actions to this card first so Generated DOF String,
        // layer mapping, and edit target all point at the same toy.
        if (this._activeToyPort !== portId || toy.toyName !== Builder.activeSection) {
            this._setFocus(portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
        }
        this._regenerateSectionString(toy.toyName);

        // Keep Builder panel bound to the currently checked card line(s) for the active section.
        if (toy.toyName !== Builder.activeSection) return;

        // If a preview just ran, Builder.layers may still hold transient/default data.
        // Restore real section layers before using checkbox state to drive the editor.
        if (this._inPreview) {
            this._loadSectionLayers(toy.toyName);
        }

        // Checkbox changes are selection-only operations and must never persist layer content.
        const prevSuppress = this._suppressSync;
        this._suppressSync = true;
        try {
            const checked = [];
            document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => {
                if (!cb.checked) return;
                const idx = parseInt(cb.dataset.idx, 10);
                if (Number.isFinite(idx)) checked.push(idx);
            });
            const checkedSet = new Set(checked);

            // Visual cue: keep selected row highlight in sync with checkboxes.
            const allRows = document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').length;
            document.querySelectorAll('#bjc-' + portId + ' .bj-layer-row')
                .forEach(r => r.classList.remove('bj-row-selected'));
            if (checked.length > 0 && checked.length < allRows) {
                checked.forEach(idx => {
                    document.getElementById('bjlr-' + portId + '-' + idx)?.classList.add('bj-row-selected');
                });
            }

            // Decide which checked line should drive the editor controls.
            let targetMaster = null;
            if (checked.length === 1) {
                targetMaster = checked[0];
            } else if (checked.length > 1) {
                const currentMaster = this._getMasterIndex(Builder.currentLayerIdx);
                if (changedChecked === true && Number.isFinite(changedIdx) && checkedSet.has(changedIdx)) {
                    targetMaster = changedIdx;
                } else if (checkedSet.has(currentMaster)) {
                    targetMaster = currentMaster;
                } else {
                    targetMaster = checked[0];
                }
            }

            if (targetMaster !== null) {
                // Critical mapping fix: if the selected master row is outside the
                // current tab window/page (e.g. row 7 while showing layers 1-6),
                // move the window first so edits apply to the intended row.
                this._ensureMasterVisible(toy.toyName, targetMaster);
                const targetBuilder = this._getBuilderIndexForMaster(targetMaster);
                if (targetBuilder >= 0 && targetBuilder < Builder.NUM_LAYERS) {
                    Builder.currentLayerIdx = targetBuilder;
                }
            }

            // Explicit row-target mode is only valid for single checked row.
            if (checked.length === 1) {
                this._editTargetPort = portId;
                this._editTargetMasterIdx = checked[0];
            } else if (checked.length === 0) {
                this._editTargetPort = portId;
                this._editTargetMasterIdx = null;
            } else {
                this._editTargetPort = portId;
                this._editTargetMasterIdx = null;
            }

            Builder.loadLayerToUI(Builder.currentLayerIdx);
            Builder._updateTabIndicators();
            Builder._updateZLabels();
            this._updateJsonGenStrFromCheckedRows(toy.toyName);
        } finally {
            this._suppressSync = prevSuppress;
        }
    },

    _ensureMasterVisible(sectionName, masterIdx) {
        if (!Number.isFinite(masterIdx) || masterIdx < 0) return;
        const all = this.sectionLayers[sectionName] || [];
        if (!all.length) return;

        // Trigger-scope mode uses paged scope indices, not layerWindow.start.
        if (this._triggerScope && this._triggerScopeSection === sectionName) {
            const pos = this._triggerScope.indexOf(masterIdx);
            if (pos < 0) return;
            const tabs = Math.max(1, Math.min(this._triggerScope.length, this._tabsPerPage));
            const neededPage = Math.floor(pos / tabs);
            if (neededPage !== this._scopePage) {
                this._writeBackLayers(sectionName);
                this._scopePage = neededPage;
                this._loadSectionLayers(sectionName);
            }
            return;
        }

        const pageSize = Math.max(1, Builder.NUM_LAYERS || 6);
        const cur = this.layerWindow[sectionName] || { start: 0 };
        if (masterIdx >= cur.start && masterIdx < (cur.start + pageSize)) return;

        // Match existing non-scoped window behavior (shiftWindow): allow anchoring
        // directly on the selected master row even when fewer than pageSize remain.
        const maxStart = Math.max(0, all.length - 1);
        const newStart = Math.max(0, Math.min(maxStart, masterIdx));
        this.layerWindow[sectionName] = { start: newStart };
        this._loadSectionLayers(sectionName);
    },

    _getBuilderIndexForMaster(masterIdx) {
        for (let i = 0; i < Builder.NUM_LAYERS; i++) {
            if (this._getMasterIndex(i) === masterIdx) return i;
        }
        return -1;
    },

    _captureCheckedRowSet(portId) {
        const checked = new Set();
        document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => {
            if (!cb.checked) return;
            const idx = parseInt(cb.dataset.idx, 10);
            if (Number.isFinite(idx)) checked.add(idx);
        });
        return checked;
    },

    _buildInsertedCheckedRowSet(checked, insertIdx) {
        const shifted = new Set();
        checked.forEach(idx => shifted.add(idx >= insertIdx ? idx + 1 : idx));
        shifted.add(insertIdx);
        return shifted;
    },

    _cloneCommittedLayerForInsert(layer, toy, opts = {}) {
        const markAsNew = opts.markAsNew !== false;
        if (!layer) {
            const blank = Builder._defaultLayer();
            blank._trigger = opts.trigger || this._activeTrigger || '';
            blank._extra = [];
            blank._raw = '';
            blank._originalRaw = markAsNew ? '' : blank._raw;
            return blank;
        }
        const raw = layer._raw || this._layerToRaw(layer);
        const parsed = raw ? this._parseLayer(raw, this._parseContextForToy(toy)) : null;
        const clone = parsed ? parsed : { ...layer };
        clone._extra = [...(clone._extra || layer._extra || [])];
        clone._raw = raw;
        clone._originalRaw = markAsNew ? '' : (layer._originalRaw || raw);
        return clone;
    },

    _commitInsertedLayer(portId, insertIdx, newLayer) {
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        const checked = this._buildInsertedCheckedRowSet(this._captureCheckedRowSet(portId), insertIdx);
        toy.layers.splice(insertIdx, 0, newLayer);
        this.sectionLayers[toy.toyName] = toy.layers;
        this._rebuildCardLayers(toy, insertIdx, 1, { checkedIndices: checked });
        this._rebuildCardTriggerBar(toy);
        this._editTargetPort = portId;
        this._editTargetMasterIdx = insertIdx;
        if (Builder.activeSection === toy.toyName) {
            this._loadSectionLayers(toy.toyName);
            this._onCheckboxChanged(portId, insertIdx, true);
        }
        this._regenerateSectionString(toy.toyName);
        this._updateCardChangeState(portId);
    },

    _jsonCopyLayer() {
        const portId = this._activeToyPort;
        const toy = this.importedToys.find(t => t.portId === portId && t.toyName === Builder.activeSection);
        if (!toy || !toy.layers.length) return;
        const masterIdx = this._resolveMasterIndex(Builder.currentLayerIdx, toy.layers, toy.toyName);
        if (masterIdx < 0 || masterIdx >= toy.layers.length) return;
        const insertIdx = masterIdx + 1;
        const newLayer = this._cloneCommittedLayerForInsert(toy.layers[masterIdx], toy, { markAsNew: true });
        this._commitInsertedLayer(portId, insertIdx, newLayer);
    },

    _jsonAddLayer() {
        const portId = this._activeToyPort;
        const toy = this.importedToys.find(t => t.portId === portId && t.toyName === Builder.activeSection);
        if (!toy) return;
        const currentMaster = toy.layers.length
            ? this._resolveMasterIndex(Builder.currentLayerIdx, toy.layers, toy.toyName)
            : -1;
        const insertIdx = currentMaster >= 0 ? (currentMaster + 1) : toy.layers.length;
        const trigger = this._activeTrigger || toy.layers[currentMaster]?._trigger || '';
        const newLayer = this._cloneCommittedLayerForInsert(null, toy, { markAsNew: true, trigger });
        this._commitInsertedLayer(portId, insertIdx, newLayer);
    },

    _jsonRemoveLayer() {
        const portId = this._activeToyPort;
        const toy = this.importedToys.find(t => t.portId === portId && t.toyName === Builder.activeSection);
        if (!toy || !toy.layers.length) return;
        const builderIdx = Math.max(0, Builder.NUM_LAYERS - 1);
        const masterIdx = this._resolveMasterIndex(builderIdx, toy.layers, toy.toyName);
        if (masterIdx < 0 || masterIdx >= toy.layers.length) return;
        this._deleteLayer(portId, masterIdx);
    },

    _setTriggerLinkMode(active, portId = null, trigger = null) {
        this._triggerLinkMode = !!active;
        this._triggerLinkPort = active ? (portId || null) : null;
        this._triggerLinkTrigger = active ? (trigger || null) : null;
        document.querySelectorAll('.bj-ctrl-l').forEach(btn => {
            btn.disabled = !!active;
            btn.classList.toggle('bj-disabled', !!active);
            btn.title = active ? 'Latch disabled while Trigger Link preview is active' : 'Latched  toggle on/off';
        });
    },

    _clearLatchedCards() {
        this._stopLatchedLoop();
        Object.keys(this.latchedToys).forEach(p => {
            delete this.latchedToys[p];
            document.getElementById('bjl-' + p)?.classList.remove('bj-firing');
            this._indicateOff(p);
        });
    },

    _getSelectedLayers(portId) {
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return [];
        const sel = [];
        document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => {
            if (cb.checked) sel.push(parseInt(cb.dataset.idx));
        });
        return sel.map(i => {
            const layer = toy.layers[i];
            if (!layer) return null;
            return this._expandLayerForPreview(layer) || layer;
        }).filter(Boolean);
    },

    _getTriggerContext(portId, layers) {
        const toy = this.importedToys.find(t => t.portId === portId);
        if (!toy) return null;

        if (this._activeTrigger && (toy.layers || []).some(l => l._trigger === this._activeTrigger)) {
            return this._activeTrigger;
        }

        // Card toolbar state is the most explicit source when activeTrigger was cleared by a focus transition.
        const cardActiveTrig = document.querySelector('#bjc-' + portId + ' .bj-trig-btn.bj-trig-active')?.dataset?.trig || null;
        if (cardActiveTrig && (toy.layers || []).some(l => l._trigger === cardActiveTrig)) {
            return cardActiveTrig;
        }

        // Resolve trigger from checked rows using source toy layer metadata.
        const selectedTriggers = new Set();
        document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => {
            if (!cb.checked) return;
            const idx = parseInt(cb.dataset.idx, 10);
            if (!Number.isFinite(idx)) return;
            const trig = toy.layers?.[idx]?._trigger;
            if (trig) selectedTriggers.add(trig);
        });
        if (selectedTriggers.size === 1) return [...selectedTriggers][0];

        // Fallback to expanded preview layers if they still carry _trigger.
        const layerTriggers = new Set((layers || []).map(l => (l && l._trigger) ? l._trigger : '').filter(Boolean));
        if (layerTriggers.size === 1) return [...layerTriggers][0];

        // Last fallback: if all highlighted trigger buttons across cards point to one trigger.
        const highlighted = [...document.querySelectorAll('.bj-trig-btn.bj-trig-active')]
            .map(b => b.dataset?.trig)
            .filter(Boolean);
        const uniqueHighlighted = [...new Set(highlighted)];
        if (uniqueHighlighted.length === 1 && (toy.layers || []).some(l => l._trigger === uniqueHighlighted[0])) {
            return uniqueHighlighted[0];
        }

        return null;
    },

    _sceneCycleLayers(scene) {
        const out = [];
        if (!scene) return out;
        if (Array.isArray(scene.matrixLayers)) out.push(...scene.matrixLayers);
        const stripMap = scene.stripLayersByIndex || {};
        Object.keys(stripMap).forEach(k => {
            const layers = stripMap[k] || [];
            layers.forEach(l => out.push(l));
        });
        if (Array.isArray(scene.toyLayers)) out.push(...scene.toyLayers);
        return out;
    },

    _stopLatchedLoop() {
        if (this._latchedLoopTimer) {
            clearTimeout(this._latchedLoopTimer);
            this._latchedLoopTimer = null;
        }
        this._latchedLoopPort = null;
        this._latchedLoopTrigger = null;
        this._latchedSelectionOnly = false;
    },

    _startLatchedLoop(portId, trigger, fallbackLayers, opts = {}) {
        this._stopLatchedLoop();
        this._latchedLoopPort = portId;
        this._latchedLoopTrigger = trigger || null;
        this._latchedSelectionOnly = !!opts.selectionOnly;

        const tick = () => {
            if (!this._latchedLoopPort || !this.latchedToys[this._latchedLoopPort]) {
                this._stopLatchedLoop();
                return;
            }

            const syncLive = this._isSyncLive(this._syncActive);
            const liveLayers = this._getSelectedLayers(this._latchedLoopPort);
            if (!this._latchedLoopTrigger && !this._latchedSelectionOnly) {
                const inferred = this._getTriggerContext(this._latchedLoopPort, liveLayers);
                if (inferred) {
                    this._latchedLoopTrigger = inferred;
                    this._activeTrigger = inferred;
                }
            }

            let cycleLayers = liveLayers.length ? liveLayers : (fallbackLayers || []);
            if (this._latchedLoopTrigger) {
                this._activeTrigger = this._latchedLoopTrigger;
                const scene = this.buildSceneForTrigger({
                    portId: this._latchedLoopPort,
                    trigger: this._latchedLoopTrigger,
                    syncActive: syncLive
                });
                this._setPreviewScene(scene);
                cycleLayers = this._sceneCycleLayers(scene);
            } else {
                this._setPreviewScene(null);
                this._fireToBuilder(cycleLayers);
            }

            const shouldReplay = cycleLayers.some(l => (l.duration > 0 || l.maxDur > 0) && l.effect !== 'Plasma');
            if (!this._latchedLoopTimer || shouldReplay) Builder._resetPreviewTiming();
            if (shouldReplay) {
                const cycleMs = Math.max(300, this._calcCycleDuration(cycleLayers));
                this._latchedLoopTimer = setTimeout(tick, cycleMs);
            } else {
                this._latchedLoopTimer = null;
            }
        };

        tick();
    },
    _fireToBuilder(layers) {
        this._suppressSync = true;
        this._inPreview = true;
        this._setPreviewScene(null);
        Builder._resetPreviewTiming();  // v13.12: restart W timing + auto-resume
        try {
            // Expand NUM_LAYERS for previews with >6 layers (e.g. letter effects)
            if (layers.length > Builder.NUM_LAYERS) {
                this._origNumLayers = Builder.NUM_LAYERS;
                Builder.NUM_LAYERS = layers.length;
                while (Builder.layers.length < Builder.NUM_LAYERS) Builder.layers.push(Builder._defaultLayer());
            }
            for (let i = 0; i < Builder.NUM_LAYERS; i++) {
                Builder.layers[i] = i < layers.length ? this._cloneLayerForBuilder(layers[i]) : Builder._defaultLayer();
            }
            Builder._initSparkleState(); Builder._updateTabIndicators(); Builder._updateGenStr();
        } finally { this._suppressSync = false; }
    },

    _indicateOn(portId, color) {
        const ind = document.getElementById('bji-' + portId);
        if (ind) { ind.style.background = color || '#f5a623'; ind.style.boxShadow = '0 0 6px ' + (color || '#f5a623'); }
        document.getElementById('bjc-' + portId)?.classList.add('bj-active');
        this._toyIconOn(portId, color);
    },
    _indicateOff(portId) {
        const timedState = this._timedToyPreviewState?.[String(portId)];
        if (timedState?.rafId) cancelAnimationFrame(timedState.rafId);
        if (this._timedToyPreviewState) delete this._timedToyPreviewState[String(portId)];
        const ind = document.getElementById('bji-' + portId);
        const toy = this.importedToys.find(t => t.portId === portId);
        const isBeacon = this._isBeaconToy(toy);
        if (ind) {
            if (isBeacon) {
                const beaconHex = this._previewColorForToy(toy, []);
                const beaconRgb = this._hexToRgb(beaconHex);
                ind.style.width = '12px';
                ind.style.height = '12px';
                ind.style.borderRadius = '6px';
                ind.style.marginRight = '4px';
                ind.style.flexShrink = '0';
                ind.style.background = `rgba(${beaconRgb.r},${beaconRgb.g},${beaconRgb.b},0.22)`;
                ind.style.border = '1px solid ' + beaconHex;
                ind.style.boxShadow = `0 0 10px rgba(${beaconRgb.r},${beaconRgb.g},${beaconRgb.b},0.18)`;
            } else {
                ind.style.width = '';
                ind.style.height = '';
                ind.style.borderRadius = '';
                ind.style.marginRight = '';
                ind.style.flexShrink = '';
                ind.style.background = '#1a2030';
                ind.style.border = '';
                ind.style.boxShadow = 'none';
            }
        }
        const card = document.getElementById('bjc-' + portId);
        if (card) {
            card.classList.remove('bj-active');
            card.classList.remove('bj-phys-flash');
            card.style.borderColor = '';
            card.style.boxShadow = '';
            card.style.background = '';
        }
        document.querySelectorAll('[id^="bjlr-' + portId + '-"]').forEach(el => el.classList.remove('bj-firing-row'));
        document.getElementById('bjm-' + portId)?.classList.remove('bj-firing');
        if (isBeacon) {
            const icon = document.getElementById('bjtib-' + portId);
            const beaconHex = this._previewColorForToy(toy, []);
            const beaconRgb = this._hexToRgb(beaconHex);
            if (icon) {
                icon.style.color = beaconHex;
                icon.style.textShadow = `0 0 6px rgba(${beaconRgb.r},${beaconRgb.g},${beaconRgb.b},0.20)`;
                icon.classList.remove('bj-tib-active');
            }
        } else {
            this._toyIconOff(portId);
        }
    },

    // Issue 3: Physical toys get visible card flash matching effect color  1500ms
    _flashPhysicalCard(portId, color) {
        const card = document.getElementById('bjc-' + portId); if (!card) return;
        const ind = document.getElementById('bji-' + portId);
        const effectColor = color || '#ff9800';
        // Flash the indicator dot large and bright
        if (ind) {
            ind.style.cssText = 'width:16px;height:16px;border-radius:8px;background:' + effectColor +
                ';box-shadow:0 0 16px ' + effectColor + ',0 0 32px ' + effectColor + ',0 0 48px ' + effectColor + '60;border:2px solid ' + effectColor +
                ';margin-right:4px;flex-shrink:0;transition:all .15s;';
        }
        // Flash card border + strong glow
        card.style.borderColor = effectColor;
        card.style.boxShadow = '0 0 16px ' + effectColor + '80, 0 0 32px ' + effectColor + '40, inset 0 0 12px ' + effectColor + '30';
        card.classList.add('bj-active');
        // Light toy icon bar
        this._toyIconOn(portId, effectColor);
        // 1500ms visible duration
        setTimeout(() => {
            if (ind) ind.style.cssText = '';
            card.style.borderColor = '';
            card.style.boxShadow = '';
            card.classList.remove('bj-active');
            this._toyIconOff(portId);
        }, 1500);
    },

    // Calculate one full cycle duration from a set of layers
    _calcCycleDuration(layers) {
        let maxCycle = 0;
        for (const l of layers) {
            let t = 0;
            if (this._isVariableStrobeLayer(l) || l?._emissiveStrobe) { t = this._calcLayerCycleDuration(l); }
            else if (l.maxDur > 0) { t = l.maxDur; }
            else if (l.blink > 0) { t = l.blink * 2 + (l.fu || 0) + (l.fd || 0); }
            else if (l.duration > 0) { t = (l.f || 0) + (l.fu || 0) + l.duration + (l.fd || 0); }
            else if (l.fu > 0 && l.fd > 0) { t = (l.f || 0) + l.fu + l.fd; }
            else if (l.fu > 0 || l.fd > 0) { t = (l.f || 0) + (l.fu || 0) + (l.fd || 0); }
            else if (l.f > 0) { t = l.f * 2; } // F200 = 200ms cycle
            else { t = 800; }
            if (t > maxCycle) maxCycle = t;
        }
        return Math.max(500, maxCycle);
    },

    _isNewEffectDraftMode(portId) {
        return !!this._newEffectPort && String(this._newEffectPort) === String(portId);
    },

    _getDraftPreviewLayers(portId) {
        if (!this._isNewEffectDraftMode(portId)) return [];
        return (Builder.layers || [])
            .filter(l => l && l.active && l.color)
            .map(l => ({ ...l }));
    },

    _stopDraftPreview(portId) {
        this.activeTimers.forEach(t => clearTimeout(t));
        this.activeTimers = [];
        delete this.latchedToys[portId];
        document.getElementById('bjm-' + portId)?.classList.remove('bj-firing');
        document.getElementById('bjl-' + portId)?.classList.remove('bj-firing');
        this._stopLatchedLoop();
        this._stopTimedToyPreview(portId, false);
        this._setPreviewScene(null);
        this._indicateOff(portId);
    },

    _previewDraftMomentary(portId) {
        const toy = this.importedToys.find(t => t.portId === portId);
        if (!toy) return false;
        const layers = this._getDraftPreviewLayers(portId);
        if (!layers.length) return true;
        const isEmissivePhysical = this._isEmissivePhysicalToy(toy);
        const visualColor = isEmissivePhysical ? this._previewColorForToy(toy, layers) : this._resolveHex(layers[0].color);

        Object.keys(this.latchedToys).forEach(p => {
            delete this.latchedToys[p];
            document.getElementById('bjl-' + p)?.classList.remove('bj-firing');
            this._stopTimedToyPreview(p, false);
            this._indicateOff(p);
        });
        this._stopLatchedLoop();
        this.activeTimers.forEach(t => clearTimeout(t));
        this.activeTimers = [];

        document.getElementById('bjm-' + portId)?.classList.add('bj-firing');

        if (toy?._display === 'physical' || toy?._display === 'indicator') {
            if (isEmissivePhysical) {
                this._startTimedToyPreview(toy, layers, { color: visualColor, loop: false });
            } else {
                this._flashPhysicalCard(portId, visualColor);
            }
            const dur = this._calcToyPreviewDuration(toy, layers);
            this.activeTimers = [setTimeout(() => this._stopDraftPreview(portId), dur)];
            return true;
        }

        const scene = this._buildSceneForExplicitLayers(toy, layers);
        this._setPreviewScene(scene);
        Builder._resetPreviewTiming();
        if (!isEmissivePhysical) this._indicateOn(portId, visualColor);
        const cycleLayers = this._sceneCycleLayers(scene);
        const dur = this._calcCycleDuration(cycleLayers.length ? cycleLayers : layers);
        this.activeTimers = [setTimeout(() => this._stopDraftPreview(portId), dur)];
        return true;
    },

    _startDraftLatchedLoop(portId) {
        const toy = this.importedToys.find(t => t.portId === portId);
        if (!toy) return false;

        const tick = () => {
            if (!this.latchedToys[portId] || !this._isNewEffectDraftMode(portId)) {
                this._stopDraftPreview(portId);
                return;
            }
            const layers = this._getDraftPreviewLayers(portId);
            if (!layers.length) {
                this._stopDraftPreview(portId);
                return;
            }
            const isEmissivePhysical = this._isEmissivePhysicalToy(toy);
            const visualColor = isEmissivePhysical ? this._previewColorForToy(toy, layers) : this._resolveHex(layers[0].color);

            if (toy?._display === 'physical' || toy?._display === 'indicator') {
                if (isEmissivePhysical) {
                    this._startTimedToyPreview(toy, layers, { color: visualColor, loop: true });
                } else {
                    this._flashPhysicalCard(portId, visualColor);
                }
                this._latchedLoopTimer = null;
                return;
            }

            const scene = this._buildSceneForExplicitLayers(toy, layers);
            this._setPreviewScene(scene);
            Builder._resetPreviewTiming();
            if (!isEmissivePhysical) this._indicateOn(portId, visualColor);
            const cycleLayers = this._sceneCycleLayers(scene);
            const replaySource = cycleLayers.length ? cycleLayers : layers;
            const shouldReplay = replaySource.some(l => (l.duration > 0 || l.maxDur > 0) && l.effect !== 'Plasma');
            if (shouldReplay) {
                const cycleMs = Math.max(300, this._calcCycleDuration(replaySource));
                this._latchedLoopTimer = setTimeout(tick, cycleMs);
            } else {
                this._latchedLoopTimer = null;
            }
        };

        this._stopLatchedLoop();
        this._latchedLoopPort = portId;
        this._latchedLoopTrigger = null;
        this._latchedSelectionOnly = true;
        tick();
        return true;
    },

    fireMomentary(portId) {
        const toy = this.importedToys.find(t => t.portId === portId);
        if (this._showSupportBlock(toy, 'Momentary preview is unavailable.')) return;
        this._checkToyShapeAvailability(toy);
        this._setFocus(portId, {
            preserveTrigger: true,
            clearPreview: false,
            skipSectionScroll: true
        });
        if (this._isNewEffectDraftMode(portId)) {
            this._setTriggerLinkMode(false);
            this._previewDraftMomentary(portId);
            return;
        }
        this._setTriggerLinkMode(false);
        this._stopLatchedLoop();

        // Clear any latches first
        Object.keys(this.latchedToys).forEach(p => {
            delete this.latchedToys[p]; document.getElementById('bjl-' + p)?.classList.remove('bj-firing'); this._indicateOff(p);
        });

        const layers = this._getSelectedLayers(portId); if (!layers.length) return;
        const isEmissivePhysical = this._isEmissivePhysicalToy(toy);
        const visualColor = isEmissivePhysical ? this._previewColorForToy(toy, layers) : this._resolveHex(layers[0].color);
        const previewLayers = isEmissivePhysical
            ? this._buildToyPreviewLayers(toy, layers, { strobePlacement: this._strobeMatrixPlacement(0, 1) })
            : layers;
        if (isEmissivePhysical) this._startTimedToyPreview(toy, layers, { color: visualColor, loop: false });
        if (toy?._display === 'physical' || toy?._display === 'indicator') {
            if (isEmissivePhysical) {
                document.getElementById('bjm-' + portId)?.classList.add('bj-firing');
                this._markToyRowsFiring(portId);
                this._syncPreviewToyManualPeers(toy, previewLayers, { loop: false, buttonId: 'bjm-' });
                const dur = this._calcToyPreviewDuration(toy, previewLayers);
                this.activeTimers.forEach(t => clearTimeout(t));
                this.activeTimers = [setTimeout(() => {
                    document.getElementById('bjm-' + portId)?.classList.remove('bj-firing');
                    this._clearSyncedPreviewToyPeers(toy);
                    this._indicateOff(portId);
                }, dur)];
                return;
            }
            this._flashPhysicalCard(portId, visualColor); return;
        }

        document.getElementById('bjm-' + portId)?.classList.add('bj-firing');
        if (!isEmissivePhysical) this._indicateOn(portId, visualColor);

        // Momentary honors explicit checkbox selection only.
        this._setPreviewScene(null);
        this._fireToBuilder(previewLayers);
        let cycleLayers = previewLayers;

        // Single cycle: auto-stop after one full timing cycle
        const dur = this._calcCycleDuration(cycleLayers);
        this.activeTimers.forEach(t => clearTimeout(t));
        this.activeTimers = [setTimeout(() => {
            document.getElementById('bjm-' + portId)?.classList.remove('bj-firing');
            this._indicateOff(portId); this._clearBuilder();
        }, dur)];
    },

    toggleLatch(portId) {
        const toy = this.importedToys.find(t => t.portId === portId);
        if (this._showSupportBlock(toy, 'Latch preview is unavailable.')) return;
        this._checkToyShapeAvailability(toy, this._activeTrigger || null);
        if (this._triggerLinkMode) {
            this._setStatus('Latch is disabled while Trigger Link preview is active.', '#f5a623');
            return;
        }
        this._setFocus(portId, {
            preserveTrigger: true,
            clearPreview: false,
            skipSectionScroll: true
        });
        if (this._isNewEffectDraftMode(portId)) {
            this._setTriggerLinkMode(false);
            if (this.latchedToys[portId]) {
                this._stopDraftPreview(portId);
                return;
            }
            Object.keys(this.latchedToys).forEach(p => this._stopDraftPreview(p));
            this.latchedToys[portId] = true;
            document.getElementById('bjl-' + portId)?.classList.add('bj-firing');
            this._startDraftLatchedLoop(portId);
            return;
        }
        this._setTriggerLinkMode(false);
        this._syncActive = this._isSyncLive(this._syncActive);
        const btn = document.getElementById('bjl-' + portId);

        if (this.latchedToys[portId]) {
            delete this.latchedToys[portId];
            btn?.classList.remove('bj-firing');
            this._stopLatchedLoop();
            this._clearSyncedPreviewToyPeers(toy);
            this._indicateOff(portId);
            this._clearBuilder();
            return;
        }

        Object.keys(this.latchedToys).forEach(p => {
            delete this.latchedToys[p];
            document.getElementById('bjl-' + p)?.classList.remove('bj-firing');
            this._indicateOff(p);
        });
        this._stopLatchedLoop();

        let layers = this._getSelectedLayers(portId);
        let trigCtx = null;
        if (!layers.length) return;
        const isEmissivePhysical = this._isEmissivePhysicalToy(toy);
        const visualColor = isEmissivePhysical ? this._previewColorForToy(toy, layers) : this._resolveHex(layers[0].color);
        if (isEmissivePhysical) this._startTimedToyPreview(toy, layers, { color: visualColor, loop: true });

        if (toy?._display === 'physical' || toy?._display === 'indicator') {
            if (isEmissivePhysical) {
                this.latchedToys[portId] = true;
                btn?.classList.add('bj-firing');
                this._markToyRowsFiring(portId);
                this._syncPreviewToyManualPeers(toy, layers, { loop: true, buttonId: 'bjl-' });
                return;
            }
            this._flashPhysicalCard(portId, visualColor);
            return;
        }

        if (trigCtx) {
            this._activeTrigger = trigCtx;
            this.importedToys.forEach(otherToy => {
                const card = document.getElementById('bjc-' + otherToy.portId);
                if (!card) return;
                const hasTrigger = (otherToy.layers || []).some(l => l._trigger === trigCtx);
                card.querySelectorAll('.bj-trig-btn').forEach(b => {
                    b.classList.toggle('bj-trig-active', hasTrigger && b.dataset.trig === trigCtx);
                });
            });
        }

        this.latchedToys[portId] = true;
        btn?.classList.add('bj-firing');
        if (!isEmissivePhysical) this._indicateOn(portId, visualColor);
        const previewLayers = isEmissivePhysical
            ? this._buildToyPreviewLayers(toy, layers, { strobePlacement: this._strobeMatrixPlacement(0, 1) })
            : layers;
        this._startLatchedLoop(portId, trigCtx, previewLayers, { selectionOnly: !trigCtx });
    },
    //  Sync All: fire same trigger across all cards 
    toggleSync() {
        this._syncActive = !this._syncActive;
        const btn = document.getElementById('dob-pb-sync');
        if (btn) btn.classList.toggle('bj-sync-active', this._syncActive);
        const icon = document.getElementById('dob-sync-icon');
        if (icon) icon.textContent = this._syncActive ? 'LINK' : 'UNLINK';
        const label = btn?.querySelector('.dob-pb-label');
        if (label) label.textContent = this._syncActive ? 'Sync ON' : 'Sync OFF';
        this._updatePreviewScopeStatus();

        if (this._latchedLoopPort && this.latchedToys[this._latchedLoopPort]) {
            const fallback = this._getSelectedLayers(this._latchedLoopPort);
            this._startLatchedLoop(this._latchedLoopPort, this._latchedLoopTrigger, fallback, {
                selectionOnly: this._latchedSelectionOnly
            });
            return;
        }

        if (this._activeToyPort && this._activeTrigger) {
            const scene = this.buildSceneForTrigger({
                portId: this._activeToyPort,
                trigger: this._activeTrigger,
                syncActive: this._syncActive
            });
            this._setPreviewScene(scene);
            Builder._resetPreviewTiming();
        }
    },
    fireTrigger(portId, trigger, btnEl) {
        const toy = this.importedToys.find(t => t.portId === portId);
        if (this._showSupportBlock(toy, 'Trigger preview is unavailable.')) return;
        this._checkToyShapeAvailability(toy, trigger);
        const isSameActiveTriggerLink =
            !!this._triggerLinkMode &&
            this._triggerLinkPort === portId &&
            this._triggerLinkTrigger === trigger;

        // v13.13.25: Clean up any previous sync-expanded layers before processing new trigger
        if (this._origNumLayers) {
            Builder.NUM_LAYERS = this._origNumLayers;
            Builder.layers.length = Builder.NUM_LAYERS;
            this._origNumLayers = null;
        }
        this._setFocus(portId, {
            skipSectionScroll: true
        });
        const card = document.getElementById('bjc-' + portId);
        card?.querySelectorAll('.bj-trig-btn').forEach(b => b.classList.remove('bj-trig-active'));
        if (isSameActiveTriggerLink) {
            btnEl?.classList.remove('bj-trig-active');
            this._activeTrigger = null;
            this._setTriggerLinkMode(false);
            this._indicateOff(portId); this._clearBuilder(); return;
        }
        this._clearLatchedCards();
        btnEl?.classList.add('bj-trig-active');
        this._activeTrigger = trigger; // Track for render masking
        this._setTriggerLinkMode(true, portId, trigger);
        this._scopePage = 0; // Reset page for new trigger
        this.selectByTrigger(portId, trigger);
        if (!toy) return;

        // Navigate window to first layer with this trigger
        // _loadSectionLayers puts real data into Builder.layers  renders + editable
        const trigIdx = (toy.layers || []).findIndex(l => l._trigger === trigger);
        if (trigIdx >= 0) {
            this._writeBackLayers(toy.toyName);
            this.layerWindow[toy.toyName] = { start: trigIdx };
            this._loadSectionLayers(toy.toyName); // masks non-matching triggers
        }

        // Indicate on card (color border + icon)
        let layers = this._getSelectedLayers(portId);
        // Do not hard-fail trigger playback if checkbox selection got out of sync.
        // Fallback to trigger-owned layers so matrix->strip handoffs cannot deadlock.
        if (!layers.length) {
            layers = (toy.layers || [])
                .filter(l => l._trigger === trigger)
                .map(l => this._expandLayerForPreview(l) || l)
                .filter(Boolean);
        }
        if (!layers.length) return;
        const isEmissivePhysical = this._isEmissivePhysicalToy(toy);
        const visualColor = isEmissivePhysical ? this._previewColorForToy(toy, layers) : this._resolveHex(layers[0].color);
        if (isEmissivePhysical) this._startTimedToyPreview(toy, layers, { color: visualColor, loop: true });
        if (toy._display === 'physical' || toy._display === 'indicator') {
            if (isEmissivePhysical) {
                this.importedToys.forEach(otherToy => {
                    if (!otherToy || String(otherToy.portId) === String(portId)) return;
                    const otherCard = document.getElementById('bjc-' + otherToy.portId);
                    if (otherCard) {
                        otherCard.querySelectorAll('.bj-trig-btn.bj-trig-active').forEach(b => b.classList.remove('bj-trig-active'));
                    }
                    this._indicateOff(otherToy.portId);
                });
                this._markToyRowsFiring(portId, trigger);
                this._syncEmissivePhysicalTriggerPeers(toy, trigger);
                return;
            }
            this._flashPhysicalCard(portId, visualColor); return;
        }
        if (!isEmissivePhysical) this._indicateOn(portId, visualColor);

        // v13.13.25: Clear ALL secondary card highlights first (prevents stale triggers)
        this.importedToys.forEach(otherToy => {
            if (otherToy.portId === portId) return;
            const otherCard = document.getElementById('bjc-' + otherToy.portId);
            if (otherCard) {
                otherCard.querySelectorAll('.bj-trig-btn.bj-trig-active').forEach(b => b.classList.remove('bj-trig-active'));
            }
            this._indicateOff(otherToy.portId);
        });

        // Only light or mark secondary cards when Sync is actually active.
        if (this._syncActive) {
            this.importedToys.forEach(otherToy => {
                if (otherToy.portId === portId) return;
                const hasTrigger = (otherToy.layers || []).some(l => l._trigger === trigger);
                if (!hasTrigger) return;
                const otherCard = document.getElementById('bjc-' + otherToy.portId);
                if (otherCard) {
                    otherCard.querySelectorAll('.bj-trig-btn').forEach(b => {
                        b.classList.toggle('bj-trig-active', b.dataset.trig === trigger);
                    });
                }
                const otherLayers = (otherToy.layers || []).filter(l => l._trigger === trigger);
                if (!otherLayers.length) return;
                if (this._isEmissivePhysicalToy(otherToy)) {
                    this._startTimedToyPreview(otherToy, otherLayers, {
                        color: this._previewColorForToy(otherToy, otherLayers),
                        loop: true
                    });
                } else {
                    this._indicateOn(otherToy.portId, this._resolveHex(otherLayers[0].color));
                }
            });
        }

        const scene = this.buildSceneForTrigger({
            portId,
            trigger,
            syncActive: this._syncActive
        });
        this._setPreviewScene(scene);
        Builder._resetPreviewTiming();
    },

    previewLayer(portId, idx) {
        const toy = this.importedToys.find(t => t.portId === portId);
        if (this._showSupportBlock(toy, 'Layer preview is unavailable.')) return;
        this._checkToyShapeAvailability(toy, toy?.layers?.[idx]?._trigger || null);
        this._setFocus(portId, {
            skipSectionScroll: true
        });
        this._setTriggerLinkMode(false);
        Object.keys(this.latchedToys).forEach(p => {
            delete this.latchedToys[p]; document.getElementById('bjl-' + p)?.classList.remove('bj-firing'); this._indicateOff(p);
        });
        this._clearBuilder();
        if (!toy) return;
        const layer = toy.layers[idx]; if (!layer) return;
        const isEmissivePhysical = this._isEmissivePhysicalToy(toy);
        const visualColor = isEmissivePhysical ? this._previewColorForToy(toy, [layer]) : this._resolveHex(layer.color);
        if (isEmissivePhysical) this._startTimedToyPreview(toy, [layer], { color: visualColor, loop: false });
        if (toy._display === 'physical' || toy._display === 'indicator') {
            if (isEmissivePhysical) {
                document.getElementById('bjlr-' + portId + '-' + idx)?.classList.add('bj-firing-row');
                this.activeTimers.forEach(t => clearTimeout(t));
                this.activeTimers = [setTimeout(() => { this._indicateOff(portId); this._clearBuilder(); }, this._calcToyPreviewDuration(toy, [layer]))];
                return;
            }
            this._flashPhysicalCard(portId, visualColor); return;
        }
        // Expand @variables@ for rendering
        const expanded = this._normalizePreviewLayerForToy(toy, layer, { strobePlacement: this._strobeMatrixPlacement(0, 1) });
        if (!expanded) { this._flashPhysicalCard(portId, '#5a7a90'); return; } // Non-renderable
        if (!isEmissivePhysical) this._indicateOn(portId, this._resolveHex(expanded.color));
        document.getElementById('bjlr-' + portId + '-' + idx)?.classList.add('bj-firing-row');
        this._fireToBuilder([expanded]);
        this.activeTimers.forEach(t => clearTimeout(t));
        this.activeTimers = [setTimeout(() => { this._indicateOff(portId); this._clearBuilder(); }, this._calcLayerCycleDuration(expanded))];
    },

    _clearBuilder() {
        this._stopExamplePreview({ restore: false });
        this._setTriggerLinkMode(false);
        this._stopLatchedLoop();
        this.activeTimers.forEach(t => clearTimeout(t));
        this.activeTimers = [];
        Object.keys(this._timedToyPreviewState || {}).forEach(portId => this._stopTimedToyPreview(portId, false));
        this._suppressSync = true;
        this._inPreview = true;
        this._setPreviewScene(null);
        this._triggerScope = null; this._triggerScopeSection = null;
        try {
            if (this._origNumLayers) {
                Builder.NUM_LAYERS = this._origNumLayers;
                Builder.layers.length = Builder.NUM_LAYERS;
                this._origNumLayers = null;
            }
            this._rebuildLayerTabs(Builder.NUM_LAYERS);
            for (let i = 0; i < Builder.NUM_LAYERS; i++) Builder.layers[i] = Builder._defaultLayer();
            Builder._initSparkleState();
            Builder._updateTabIndicators(); Builder._updateGenStr();
            // Clear trigger highlights
            if (this._activeToyPort) {
                const card = document.getElementById('bjc-' + this._activeToyPort);
                card?.querySelectorAll('.bj-layer-row').forEach(r => r.classList.remove('bj-trig-highlight'));
            }
        } finally { this._suppressSync = false; }
    },

    selectAll(portId, state) {
        document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => { cb.checked = state; });
        this._onCheckboxChanged(portId);
    },
    selectByTrigger(portId, trigger) {
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => { cb.checked = false; });
        toy.layers.forEach((l, i) => {
            if (l._trigger === trigger) {
                const cb = document.querySelector('.bj-lcb[data-port="' + portId + '"][data-idx="' + i + '"]');
                if (cb) cb.checked = true;
            }
        });
        this._onCheckboxChanged(portId);
    },
    toggleMaximize(portId) {
        const card = document.getElementById('bjc-' + portId); if (!card) return;
        const grid = document.getElementById('bjson-card-grid'); if (!grid) return;
        const wasMax = card.classList.contains('bj-max');
        const draftPort = String(this._newEffectPort || '');
        const draftCard = draftPort ? document.getElementById('bjc-' + draftPort) : null;
        const draftWillLoseMax = !!draftCard && draftCard.classList.contains('bj-max') &&
            (draftPort === String(portId) || !wasMax);
        if (draftWillLoseMax) {
            this._cancelNewEffect(true);
        }
        // Un-maximize any currently maximized card and move it back
        document.querySelectorAll('.bj-card.bj-max').forEach(c => {
            c.classList.remove('bj-max');
            // Move back to original position (before the placeholder)
            const placeholder = document.getElementById('bj-max-placeholder');
            if (placeholder) { placeholder.parentNode.insertBefore(c, placeholder); placeholder.remove(); }
        });
        if (!wasMax) {
            // Leave a placeholder at card's original position
            const ph = document.createElement('div'); ph.id = 'bj-max-placeholder'; ph.style.display = 'none';
            card.parentNode.insertBefore(ph, card);
            // Move card to top of grid
            grid.insertBefore(card, grid.firstChild);
            card.classList.add('bj-max');
            this._scrollElementIntoWorkspaceView(card, { align:'start' });
            this._resetDocumentScrollIfNeeded();
        }
    },
    editInBuilder(toyName) {
        if (Builder.activeSection) this._writeBackLayers(Builder.activeSection);
        this._activeTrigger = null; // Clear trigger filter
        this._clearBuilder();
        Builder.activeSection = toyName;
        document.querySelectorAll('.dob-sec-btn').forEach(b => b.classList.toggle('active', b.dataset.section === toyName));
        Builder._checkSingleLock(); this._loadSectionLayers(toyName);
        // Promote + maximize focused card
        const toy = this.importedToys.find(t => t.toyName === toyName);
        if (toy) {
            // Un-maximize previous card
            if (this._activeToyPort && this._activeToyPort !== toy.portId) {
                const prevCard = document.getElementById('bjc-' + this._activeToyPort);
                if (prevCard) prevCard.classList.remove('bj-max');
            }
            this._activeToyPort = toy.portId;
            document.querySelectorAll('.bj-card.bj-focus').forEach(c => c.classList.remove('bj-focus'));
            const card = document.getElementById('bjc-' + toy.portId);
            if (card) {
                card.classList.add('bj-focus', 'bj-max');
                const grid = document.getElementById('bjson-card-grid');
                const firstCard = grid?.querySelector('.bj-card');
                if (grid && firstCard && firstCard !== card) grid.insertBefore(card, firstCard);
                this._scrollElementIntoWorkspaceView(card, { align:'nearest' });
                this._resetDocumentScrollIfNeeded();
            }
        }
    },

    // 
    //  SECTION BUTTONS  Issue 6: dataset.section for filter matching
    // 
    _showTableTitle(tableName) {
        let title = document.getElementById('bjson-table-title');
        if (!title) {
            title = document.createElement('div'); title.id = 'bjson-table-title';
            // Insert inside the title row (between Target Section label and E Code) for vertical centering
            const titleRow = document.querySelector('.dob-ws-title-row');
            const ecode = titleRow?.querySelector('.dob-ecode-wrap');
            if (titleRow && ecode) titleRow.insertBefore(title, ecode);
            else if (titleRow) titleRow.appendChild(title);
        }
        title.textContent = '* ' + tableName + ' *';
        title.style.display = '';
    },
    _hideTableTitle() {
        const title = document.getElementById('bjson-table-title');
        if (title) title.style.display = 'none';
    },

    _rebuildSectionBtns() {
        const c = document.getElementById('dob-section-btns'); if (!c) return;
        c.innerHTML = '';
        Builder.SECTIONS.forEach(s => {
            const toy = this.importedToys.find(t => t.toyName === s);
            const count = this.sectionLayers[s]?.length || 0;
            const b = document.createElement('button');
            b.className = 'dob-sec-btn' + (s === Builder.activeSection ? ' active' : '');
            b.dataset.section = s; // Issue 6: for filter matching
            b.textContent = s;
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size:0.5rem;opacity:0.5;margin-left:4px;';
            badge.textContent = '(' + count + ')';
            b.appendChild(badge);
            b.title = 'Port ' + (toy?.portId || '?') + ' | ' + count + ' layers';
            b.onclick = () => {
                if (this.jsonMode && Builder.activeSection) this._writeBackLayers(Builder.activeSection);
                document.querySelectorAll('.dob-sec-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active'); Builder.activeSection = s; Builder._checkSingleLock();
                if (this.jsonMode) {
                    this._activeTrigger = null; // Clear trigger filter on section switch
                    this._clearBuilder();
                    this._loadSectionLayers(s);
                    // Scroll focused card into view, promote to top, maximize
                    const toy = this.importedToys.find(t => t.toyName === s);
                    if (toy) {
                        // Un-maximize previous card
                        if (this._activeToyPort && this._activeToyPort !== toy.portId) {
                            const prevCard = document.getElementById('bjc-' + this._activeToyPort);
                            if (prevCard) prevCard.classList.remove('bj-max');
                        }
                        document.querySelectorAll('.bj-card.bj-focus').forEach(c => c.classList.remove('bj-focus'));
                        const card = document.getElementById('bjc-' + toy.portId);
                        if (card) {
                            card.classList.add('bj-focus', 'bj-max');
                            // Move card to top of grid for visibility
                            const grid = document.getElementById('bjson-card-grid');
                            const firstCard = grid?.querySelector('.bj-card');
                            if (grid && firstCard && firstCard !== card) {
                                grid.insertBefore(card, firstCard);
                            }
                            this._scrollElementIntoWorkspaceView(card, { align:'nearest' });
                            this._resetDocumentScrollIfNeeded();
                        }
                        this._activeToyPort = toy.portId;
                    }
                }
                Builder._saveState();
            };
            c.appendChild(b);
        });
        this._filterSectionBtns(); // Apply initial filter
    },

    // 
    //  LAYER WINDOW
    // 
    _loadSectionLayers(sn) {
        this._suppressSync = true;
        this._inPreview = false;
        this._setPreviewScene(null);
        Builder._resetPreviewTiming();  // v13.12: restart W timing + auto-resume
        try {
            if (this._origNumLayers) { Builder.NUM_LAYERS = this._origNumLayers; Builder.layers.length = Builder.NUM_LAYERS; this._origNumLayers = null; }
            const allLayers = this.sectionLayers[sn];
            const toy = this.importedToys.find(t => t.toyName === sn) || null;
            if (!allLayers || !allLayers.length) {
                this._triggerScope = null; this._triggerScopeSection = null;
                for (let i = 0; i < Builder.NUM_LAYERS; i++) Builder.layers[i] = Builder._defaultLayer();
                Builder.currentLayerIdx = 0; Builder.loadLayerToUI(0);
                Builder._updateTabIndicators(); Builder._updateZLabels(); Builder._updateGenStr();
                this._rebuildLayerTabs(6); this._updateLayerNav(sn, 0, 0); this._autoFitGenStr({ persist: false }); this._syncGenStrHighlightToCurrentLayer(); return;
            }
            if (this._activeTrigger) {
                // === TRIGGER-SCOPED MODE ===
                this._triggerScope = [];
                for (let i = 0; i < allLayers.length; i++) { if (allLayers[i]._trigger === this._activeTrigger) this._triggerScope.push(i); }
                if (!this._triggerScope.length) { this._triggerScope = null; this._triggerScopeSection = null; } else this._triggerScopeSection = sn;
                if (this._triggerScope) {
                    const sLen = this._triggerScope.length, tabs = Math.min(sLen, this._tabsPerPage);
                    const maxPg = Math.max(0, Math.ceil(sLen / tabs) - 1);
                    if (this._scopePage > maxPg) this._scopePage = maxPg;
                    const pgStart = this._scopePage * tabs, pgEnd = Math.min(pgStart + tabs, sLen), pgCount = pgEnd - pgStart;
                    this._origNumLayers = 6; Builder.NUM_LAYERS = pgCount;
                    while (Builder.layers.length < pgCount) Builder.layers.push(Builder._defaultLayer());
                    if (Builder.layers.length > pgCount) Builder.layers.length = pgCount;
                    for (let i = 0; i < pgCount; i++) {
                        const mi = this._triggerScope[pgStart + i];
                        Builder.layers[i] = this._cloneLayerForBuilder(allLayers[mi], toy);
                        Builder.layers[i].active = true;
                    }
                    this._rebuildLayerTabs(pgCount);
                    Builder.currentLayerIdx = 0; Builder.loadLayerToUI(0);
                    Builder._updateTabIndicators(); Builder._updateZLabels();
                    Builder._updateGenStr(); Builder._initSparkleState();
                    this._updateLayerNav(sn, pgStart, sLen);
                    this._autoFitGenStr({ persist: false });
                    this._highlightTriggerRows();
                    const restoredPreview = this._restoreScopedPreviewAfterLayerLoad(sn);
                    if (!restoredPreview && toy?.portId && this._activeTrigger) {
                        const fallbackScene = this.buildSceneForTrigger({
                            portId: toy.portId,
                            trigger: this._activeTrigger,
                            syncActive: this._syncActive
                        });
                        this._setPreviewScene(fallbackScene);
                        Builder._resetPreviewTiming();
                    }
                    this._syncGenStrHighlightToCurrentLayer();
                    return;
                }
            }
            // === NO TRIGGER (default) - deactivate all ===
            this._triggerScope = null; this._triggerScopeSection = null; this._scopePage = 0;
            const win = this.layerWindow[sn] || { start: 0 };
            this._rebuildLayerTabs(Math.min(6, allLayers.length));
            for (let i = 0; i < Builder.NUM_LAYERS; i++) {
                const src = win.start + i;
                Builder.layers[i] = src < allLayers.length ? this._cloneLayerForBuilder(allLayers[src], toy) : Builder._defaultLayer();
                Builder.layers[i].active = false;
            }
            Builder.currentLayerIdx = 0; Builder.loadLayerToUI(0);
            Builder._updateTabIndicators(); Builder._updateZLabels();
            Builder._updateGenStr(); Builder._initSparkleState();
            this._updateLayerNav(sn, win.start, allLayers.length);
            this._autoFitGenStr({ persist: false });
            this._restoreScopedPreviewAfterLayerLoad(sn);
            this._syncGenStrHighlightToCurrentLayer();
        } finally { this._suppressSync = false; }
    },

    _updateLayerNav(sn, pgStart, total) {
        let nav = document.getElementById('bjson-layer-nav');
        if (!nav) {
            nav = document.createElement('div'); nav.id = 'bjson-layer-nav';
            nav.style.cssText = 'padding:3px 8px;background:#0d1520;border-top:1px solid #1a2e40;border-bottom:1px solid #1a2e40;font-size:0.6rem;color:#5a7a90;display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex-shrink:0;';
        }
        const actions = document.querySelector('.dob-tab-actions');
        if (actions?.parentNode && nav.parentNode !== actions.parentNode) {
            actions.parentNode.insertBefore(nav, actions.nextSibling);
        } else if (actions?.parentNode && nav.previousElementSibling !== actions) {
            actions.parentNode.insertBefore(nav, actions.nextSibling);
        } else if (!actions?.parentNode) {
            const scroll = document.getElementById('dob-sidebar-scroll');
            if (scroll && nav.parentNode !== scroll) scroll.insertBefore(nav, scroll.firstChild);
        }
        const mkB = (txt, dis, fn) => { const b = document.createElement('button'); b.className = 'dob-btn dob-btn-sm'; b.style.cssText = 'font-size:0.55rem;padding:1px 5px;'; b.textContent = txt; b.disabled = dis; b.onclick = fn; return b; };
        if (this._triggerScope) {
            const tLen = this._triggerScope.length, tabs = Math.min(tLen, this._tabsPerPage);
            const pgEnd = Math.min(pgStart + tabs, tLen), maxPg = Math.max(0, Math.ceil(tLen / tabs) - 1);
            nav.style.display = 'flex'; nav.innerHTML = '';
            if (tLen > tabs) {
                nav.appendChild(mkB('< Prev', this._scopePage <= 0, () => {
                    this._writeBackLayers(sn);
                    this._scopePage--;
                    this._loadSectionLayers(sn);
                }));
                const pos = document.createElement('span'); pos.style.color = '#f5a623';
                pos.textContent = this._activeTrigger + ': ' + (pgStart+1) + '-' + pgEnd + ' of ' + tLen;
                nav.appendChild(pos);
                nav.appendChild(mkB('Next >', this._scopePage >= maxPg, () => {
                    this._writeBackLayers(sn);
                    this._scopePage++;
                    this._loadSectionLayers(sn);
                }));
            } else {
                const pos = document.createElement('span'); pos.style.color = '#f5a623';
                pos.textContent = this._activeTrigger + ': ' + tLen + ' layer' + (tLen !== 1 ? 's' : '');
                nav.appendChild(pos);
            }
            // Tab count slider
            const spacer = document.createElement('span'); spacer.style.flex = '1'; nav.appendChild(spacer);
            const sL = document.createElement('span'); sL.textContent = '# Tabs:'; sL.style.cssText = 'color:#5a9ab5;font-size:0.5rem;';
            const sl = document.createElement('input'); sl.type = 'range'; sl.min = '4'; sl.max = '12'; sl.value = String(this._tabsPerPage);
            sl.style.cssText = 'width:60px;height:10px;accent-color:#f5a623;';
            const sV = document.createElement('span'); sV.textContent = this._tabsPerPage; sV.style.cssText = 'color:#f5a623;font-size:0.5rem;min-width:14px;';
            sl.oninput = () => {
                sV.textContent = sl.value;
                this._writeBackLayers(sn);
                this._tabsPerPage = parseInt(sl.value);
                this._scopePage = 0;
                this._loadSectionLayers(sn);
            };
            nav.appendChild(sL); nav.appendChild(sl); nav.appendChild(sV);
            this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false });
            return;
        }
        // Non-scoped nav
        if (total === 0 || total <= Builder.NUM_LAYERS) {
            nav.style.display = 'none';
            this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false });
            return;
        }
        nav.style.display = 'flex'; nav.innerHTML = '';
        const win = this.layerWindow[sn] || { start: 0 };
        const end = Math.min(win.start + Builder.NUM_LAYERS, total);
        nav.appendChild(mkB('< Prev', win.start <= 0, () => this.shiftWindow(sn, -Builder.NUM_LAYERS)));
        const pos2 = document.createElement('span'); pos2.style.color = '#f5a623';
        pos2.textContent = 'Layers ' + (win.start+1) + '-' + end + ' of ' + total;
        nav.appendChild(pos2);
        nav.appendChild(mkB('Next >', end >= total, () => this.shiftWindow(sn, Builder.NUM_LAYERS)));
        this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false });
    },

    _jumpToTrigger(sn, trigger) {
        const idx = (this.sectionLayers[sn]||[]).findIndex(l => l._trigger === trigger); if (idx < 0) return;
        this._writeBackLayers(sn); this.layerWindow[sn] = { start: idx }; this._loadSectionLayers(sn);
    },
    shiftWindow(sn, delta) {
        const all = this.sectionLayers[sn]; if (!all) return;
        this._writeBackLayers(sn); const win = this.layerWindow[sn];
        win.start = Math.max(0, Math.min(all.length - 1, win.start + delta)); this._loadSectionLayers(sn);
    },
    _writeBackLayers(sn) {
        if (this._newEffectPort) return;
        // Preview/momentary/latch states are transient and must never persist into section data.
        if (this._inPreview) return;
        const all = this.sectionLayers[sn]; if (!all) return;
        const scopeActive = !!(this._triggerScope && this._triggerScopeSection === sn);
        if (scopeActive) {
            const tabs = Math.min(this._triggerScope.length, this._tabsPerPage);
            const pgStart = this._scopePage * tabs;
            for (let i = 0; i < Builder.NUM_LAYERS; i++) {
                const si = pgStart + i; if (si >= this._triggerScope.length) break;
                const mi = this._triggerScope[si]; if (mi >= all.length) continue;
                const prev = all[mi];
                const trig = prev._trigger, origRaw = prev._originalRaw, extra = prev._extra;
                const copy = { ...Builder.layers[i], _trigger: trig, _originalRaw: origRaw, _extra: extra };
                copy.active = true;
                if (prev?._dirToken && (!copy._dirToken || this._normalizeDirectionCode(copy.dir) === this._normalizeDirectionCode(prev.dir))) {
                    copy._dirToken = prev._dirToken;
                }
                const prevRaw = prev._raw;
                const prevRuntimeKey = this._layerRuntimeKey(prev);
                const newRaw = prevRaw ? this._mergeEditedLayerRaw(prevRaw, prev, copy) : this._layerToRaw(copy);
                const nextRuntimeKey = this._layerRuntimeKey(copy);
                copy._raw = (newRaw === prevRaw && nextRuntimeKey === prevRuntimeKey) ? prevRaw : newRaw;
                all[mi] = copy;
            }
        } else {
            const win = this.layerWindow[sn]; if (!win) return;
            for (let i = 0; i < Builder.NUM_LAYERS; i++) {
                const idx = win.start + i;
                if (idx < all.length) {
                    const prev = all[idx];
                    const trig = prev._trigger, origRaw = prev._originalRaw, extra = prev._extra;
                    const copy = { ...Builder.layers[i], _trigger: trig, _originalRaw: origRaw, _extra: extra };
                    copy.active = true;
                    if (prev?._dirToken && (!copy._dirToken || this._normalizeDirectionCode(copy.dir) === this._normalizeDirectionCode(prev.dir))) {
                        copy._dirToken = prev._dirToken;
                    }
                    const prevRaw = prev._raw;
                    const prevRuntimeKey = this._layerRuntimeKey(prev);
                    const newRaw = prevRaw ? this._mergeEditedLayerRaw(prevRaw, prev, copy) : this._layerToRaw(copy);
                    const nextRuntimeKey = this._layerRuntimeKey(copy);
                    copy._raw = (newRaw === prevRaw && nextRuntimeKey === prevRuntimeKey) ? prevRaw : newRaw;
                    all[idx] = copy;
                }
            }
        }
        this._regenerateSectionString(sn);
    },

    // Map Builder.layers index to master allLayers index (trigger-scope aware)
    _getMasterIndex(builderIdx) {
        const sn = Builder.activeSection;
        if (this._triggerScope && this._triggerScopeSection === sn) {
            const tabs = Math.min(this._triggerScope.length, this._tabsPerPage);
            const scopeIdx = this._scopePage * tabs + builderIdx;
            if (scopeIdx >= 0 && scopeIdx < this._triggerScope.length) return this._triggerScope[scopeIdx];
            if (this._triggerScope.length) {
                const clamped = Math.max(0, Math.min(scopeIdx, this._triggerScope.length - 1));
                return this._triggerScope[clamped];
            }
            return -1;
        }
        const win = this.layerWindow[sn];
        return win ? (win.start + builderIdx) : builderIdx;
    },

    _resolveMasterIndex(builderIdx, allLayers, sectionName) {
        if (!allLayers || !allLayers.length) return this._getMasterIndex(builderIdx);
        let idx = this._getMasterIndex(builderIdx);
        if (idx >= 0 && idx < allLayers.length) return idx;

        const win = this.layerWindow[sectionName || Builder.activeSection];
        if (win) {
            const wIdx = win.start + builderIdx;
            if (wIdx >= 0 && wIdx < allLayers.length) return wIdx;
        }

        return Math.max(0, Math.min(builderIdx, allLayers.length - 1));
    },

    // Dynamically rebuild layer tab buttons to match current scope
    _rebuildLayerTabs(count) {
        const tabDiv = document.getElementById('dob-layerTabs'); if (!tabDiv) return;
        tabDiv.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const btn = document.createElement('button');
            btn.className = 'dob-ltab' + (i === 0 ? ' active' : '');
            btn.textContent = 'L' + (i + 1);
            btn.dataset.masterIdx = String(this._getMasterIndex(i));
            btn.onclick = () => {
                Builder.switchLayer(i);
                this._syncGenStrHighlightToCurrentLayer();
            };
            btn.addEventListener('mouseenter', () => this._previewGenStrHighlightForBuilderIdx(i));
            btn.addEventListener('mouseleave', () => this._syncGenStrHighlightToCurrentLayer());
            btn.addEventListener('focus', () => this._previewGenStrHighlightForBuilderIdx(i));
            btn.addEventListener('blur', () => this._syncGenStrHighlightToCurrentLayer());
            tabDiv.appendChild(btn);
        }
        // v13.12: "" button if > 6 layers
        if (count > 6) {
            const rm = document.createElement('button');
            rm.className = 'dob-ltab-rm';
            rm.textContent = '-';
            rm.title = 'Remove last layer';
            rm.onclick = () => Builder.removeLayer();
            tabDiv.appendChild(rm);
        }
        // v13.12: "+" button
        const add = document.createElement('button');
        add.className = 'dob-ltab-add';
        add.textContent = '+';
        add.title = 'Add layer';
        add.onclick = () => Builder.addLayer();
        tabDiv.appendChild(add);
    },

    // Highlight card rows that belong to current trigger scope
    _highlightTriggerRows() {
        if (!this._activeToyPort) return;
        const card = document.getElementById('bjc-' + this._activeToyPort); if (!card) return;
        card.querySelectorAll('.bj-layer-row').forEach(r => r.classList.remove('bj-trig-highlight'));
        if (this._triggerScope) {
            this._triggerScope.forEach(idx => {
                const row = document.getElementById('bjlr-' + this._activeToyPort + '-' + idx);
                if (row) row.classList.add('bj-trig-highlight');
            });
        }
    },

    _setGenStrHighlight(masterIdx, mode = 'active') {
        const gs = document.getElementById('dob-genstr');
        if (!gs) return;
        gs.querySelectorAll('.bj-genseg').forEach(seg => seg.classList.remove('bj-genseg-active', 'bj-genseg-hover'));
        if (!Number.isFinite(masterIdx) || gs._bjsonEditing) return;
        const cls = mode === 'hover' ? 'bj-genseg-hover' : 'bj-genseg-active';
        gs.querySelectorAll('.bj-genseg[data-master-idx="' + masterIdx + '"]').forEach(seg => seg.classList.add(cls));
    },

    _setLiveGenStrHighlights(masterIdxs) {
        const gs = document.getElementById('dob-genstr');
        if (!gs) return;
        const liveSet = new Set((masterIdxs || []).filter(idx => Number.isFinite(idx)).map(idx => String(idx)));
        gs.querySelectorAll('.bj-genseg').forEach(seg => {
            seg.classList.toggle('bj-genseg-live', liveSet.has(String(seg.dataset.masterIdx || '')));
        });
    },

    _getCheckedMasterIndicesForPort(portId, layers) {
        const checked = [];
        if (!portId || !Array.isArray(layers) || !layers.length) return checked;
        document.querySelectorAll('.bj-lcb[data-port="' + portId + '"]').forEach(cb => {
            if (!cb.checked) return;
            const idx = parseInt(cb.dataset.idx, 10);
            if (Number.isFinite(idx) && idx >= 0 && idx < layers.length) checked.push(idx);
        });
        return checked;
    },

    _syncLiveGenStrHighlights(sectionName) {
        const gs = document.getElementById('dob-genstr');
        if (!gs || gs._bjsonEditing || !this.jsonMode || typeof Builder === 'undefined') {
            this._setLiveGenStrHighlights([]);
            return;
        }
        const sn = sectionName || Builder.activeSection;
        const layers = this.sectionLayers[sn] || [];
        if (!layers.length || !this._activeToyPort) {
            this._setLiveGenStrHighlights([]);
            return;
        }
        const checked = this._getCheckedMasterIndicesForPort(this._activeToyPort, layers);
        if (!checked.length) {
            this._setLiveGenStrHighlights([]);
            return;
        }
        const now = Date.now();
        const previewStart = Number(Builder._previewStartTime || now);
        const elapsed = Math.max(0, now - previewStart);
        const liveMasterIdxs = [];
        checked.forEach(idx => {
            const layer = layers[idx];
            if (!layer) return;
            const hasVisual = typeof Builder._layerHasVisualContent === 'function'
                ? Builder._layerHasVisualContent(layer)
                : !!(layer.active && layer.color);
            if (!hasVisual) return;
            const waitMs = Math.max(0, Number(layer.wait || 0));
            if (elapsed < waitMs) return;
            const tAfterWait = elapsed - waitMs;
            const cyclePeriod = typeof Builder._cyclePeriod === 'function' ? Builder._cyclePeriod(layer) : 0;
            const opacity = typeof Builder._computeOpacity === 'function'
                ? Builder._computeOpacity(layer, tAfterWait, cyclePeriod)
                : 0;
            if (opacity > 0.001) liveMasterIdxs.push(idx);
        });
        this._setLiveGenStrHighlights(liveMasterIdxs);
    },

    _previewGenStrHighlightForBuilderIdx(builderIdx) {
        this._setGenStrHighlight(this._getMasterIndex(builderIdx), 'hover');
    },

    _syncGenStrHighlightToCurrentLayer() {
        if (typeof Builder === 'undefined') return;
        this._setGenStrHighlight(this._getMasterIndex(Builder.currentLayerIdx), 'active');
    },

    // 
    //  CARD DRAG REORDER + ORDER PERSISTENCE
    // 
    _reorderCard(srcPort, targetPort) {
        if (srcPort === targetPort) return;
        const grid = document.getElementById('bjson-card-grid'); if (!grid) return;
        const srcCard = document.getElementById('bjc-' + srcPort);
        const tgtCard = document.getElementById('bjc-' + targetPort);
        if (!srcCard || !tgtCard) return;

        // Swap card DOM positions instead of inserting/pushing neighbors.
        const ph = document.createElement('div');
        grid.replaceChild(ph, srcCard);
        grid.replaceChild(srcCard, tgtCard);
        grid.replaceChild(tgtCard, ph);

        // Update persisted order from current DOM
        this._cardOrder = [];
        grid.querySelectorAll('.bj-card[data-port]').forEach(c => {
            this._cardOrder.push(c.dataset.port);
        });
        this._markLayoutDirty();

        // Re-insert category dividers based on new order
        this._refreshCategoryDividers();
    },

    _refreshCategoryDividers() {
        const grid = document.getElementById('bjson-card-grid'); if (!grid) return;
        // Remove all existing dividers
        grid.querySelectorAll('.bj-cat-divider').forEach(d => d.remove());
        // Re-insert dividers at category boundaries
        let lastCat = '';
        const cards = grid.querySelectorAll('.bj-card[data-port]');
        cards.forEach(card => {
            const toy = this.importedToys.find(t => t.portId === card.dataset.port);
            if (toy && toy._cat !== lastCat) {
                lastCat = toy._cat;
                const def = this.CATS[toy._cat] || this.CATS.other;
                const catCount = this.importedToys.filter(t => t._cat === toy._cat).length;
                const hdr = document.createElement('div');
                hdr.className = 'bj-cat-divider'; hdr.dataset.cat = toy._cat;
                hdr.innerHTML = '<span class="bj-cat-icon" style="color:' + def.color + '">' + def.icon + '</span> ' +
                    def.label + ' <span class="bj-cat-count">(' + catCount + ')</span>';
                card.parentNode.insertBefore(hdr, card);
            }
        });
        this._applyFilter();
    },

    // 
    //  @VARIABLE@ EXPANSION FOR PREVIEW
    // 
    // Position data from simulator VAR_TOYS for flasher/strobe @tokens@
    VAR_POSITIONS: {
        'flasherclo': {al:0, at:0, aw:14, ah:100},
        'flashercli': {al:20, at:0, aw:14, ah:100},
        'flashercc':  {al:40, at:0, aw:14, ah:100},
        'flashercri': {al:60, at:0, aw:14, ah:100},
        'flashercro': {al:80, at:0, aw:14, ah:100},
        'flshemulo':  {al:0, at:0, aw:19, ah:100, shp:'SHPCircle3'},
        'flshemuli':  {al:20, at:0, aw:19, ah:100, shp:'SHPCircle3'},
        'flshemuc':   {al:40, at:0, aw:19, ah:100, shp:'SHPCircle3'},
        'flshemuri':  {al:60, at:0, aw:19, ah:100, shp:'SHPCircle3'},
        'flshemuro':  {al:80, at:0, aw:19, ah:100, shp:'SHPCircle3'},
        'strblft':    {al:0, at:0, aw:9, ah:30, color:'White', hex:'#FFFFFF', shp:'SHPCircle3'},
        'strbrgt':    {al:91, at:0, aw:9, ah:30, color:'White', hex:'#FFFFFF', shp:'SHPCircle3'},
    },
    // 
    //  NEW EFFECT  Add layers to an existing toy (controls in card title bar)
    // 
    _startNewEffect(portId) {
        if (this._newEffectPort && this._newEffectPort !== portId) this._cancelNewEffect(true);
        this._clearPreservedDraftRawText();
        this._setFocus(portId);
        this._newEffectPort = portId;
        this._editTargetPort = portId;
        this._editTargetMasterIdx = null;
        const toy = this.importedToys.find(t => t.portId === portId); if (!toy) return;
        const card = document.getElementById('bjc-' + portId); if (!card) return;

        // 1. Maximize the card (same logic as toggleMaximize)
        if (!card.classList.contains('bj-max')) this.toggleMaximize(portId);
        card.classList.add('bj-editing');

        // 2. Build New Effect controls bar INSIDE the card (after header, before layers)
        let bar = card.querySelector('.bj-ne-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'bj-ne-bar';
            const layerDiv = document.getElementById('bjlayers-' + portId);
            if (layerDiv) card.insertBefore(bar, layerDiv);
            else card.appendChild(bar);
        }

        const existingTrigs = [...new Set(toy.layers.map(l => l._trigger).filter(Boolean))].sort();
        bar.innerHTML = '';
        bar.classList.add('bj-ne-active');

        // Checkbox + label
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
        cb.className = 'bj-ne-check'; cb.id = 'bj-ne-cb';
        const lbl = document.createElement('label'); lbl.className = 'bj-ne-label';
        lbl.textContent = 'NEW EFFECT'; lbl.htmlFor = 'bj-ne-cb';
        cb.onchange = () => { if (!cb.checked) this._cancelNewEffect(); };

        // Trigger input with datalist
        const trigLabel = document.createElement('span');
        trigLabel.style.cssText = 'color:#5a9ab5;font-size:0.5rem;font-weight:600;'; trigLabel.textContent = 'Trigger:';
        const trigInput = document.createElement('input'); trigInput.className = 'bj-ne-trigger';
        trigInput.id = 'bj-ne-trig'; trigInput.placeholder = 'S2, W45...';
        trigInput.list = 'bj-ne-trig-list-' + portId;
        const dl = document.createElement('datalist'); dl.id = 'bj-ne-trig-list-' + portId;
        existingTrigs.forEach(t => { const o = document.createElement('option'); o.value = t; dl.appendChild(o); });
        trigInput.oninput = () => { this._newEffectTrigger = trigInput.value.trim().toUpperCase(); };

        // Effect text field  auto-syncs from Generated DOF String
        const txtLabel = document.createElement('span');
        txtLabel.style.cssText = 'color:#5a9ab5;font-size:0.5rem;font-weight:600;'; txtLabel.textContent = 'Effect:';
        const txtInput = document.createElement('input'); txtInput.className = 'bj-ne-input';
        txtInput.id = 'bj-ne-text'; txtInput.placeholder = 'Auto-fills from Builder controls, or type code here...';

        // Action buttons
        const addBtn = document.createElement('button'); addBtn.className = 'bj-ne-add';
        addBtn.textContent = 'Add Effect'; addBtn.onclick = () => this._commitNewEffect();
        const clearDraftBtn = document.createElement('button'); clearDraftBtn.className = 'bj-ne-clear-draft';
        clearDraftBtn.textContent = 'X';
        clearDraftBtn.title = 'Clear the current new-effect draft';
        clearDraftBtn.onclick = () => this._clearNewEffectDraft();

        // Hint
        const hint = document.createElement('div'); hint.className = 'bj-ne-hint';
        hint.textContent = toy.toyName + '  Set trigger, use Builder controls to design effect, then click Add Effect. Use New again later to add another effect.';

        bar.append(cb, lbl, trigLabel, trigInput, dl, txtLabel, txtInput, addBtn, clearDraftBtn, hint);

        // 3. Clear Builder for fresh layer
        this._activeTrigger = null;
        this._inPreview = false; // Clear preview state  Builder is now in editing mode
        this._stopLatchedLoop();
        this._setPreviewScene(null);
        Builder._resetPreviewTiming();
        this._suppressSync = true;
        for (let i = 0; i < Builder.NUM_LAYERS; i++) Builder.layers[i] = Builder._defaultLayer();
        Builder.layers[0].active = true;
        Builder.currentLayerIdx = 0; Builder.loadLayerToUI(0);
        Builder._updateTabIndicators(); Builder._updateZLabels(); Builder._updateGenStr();
        this._suppressSync = false;

        // 4. Add placeholder row at bottom of card layers
        this._addNewEffectPlaceholder(portId);
    },

    _addNewEffectPlaceholder(portId) {
        const layerDiv = document.getElementById('bjlayers-' + portId); if (!layerDiv) return;
        layerDiv.querySelector('.bj-new-row')?.remove();
        const row = document.createElement('div');
        row.className = 'bj-layer-row bj-new-row';
        row.id = 'bj-ne-row-' + portId;
        row.innerHTML = '<span style="color:#f5a623;font-size:0.5rem;padding-left:4px;">NEW New layer  use Builder controls or type effect code above...</span>';
        layerDiv.appendChild(row);
        this._scrollElementIntoNearestView(row, { align:'nearest' });
    },

    _resetNewEffectPlaceholder() {
        if (!this._newEffectPort) return;
        const row = document.getElementById('bj-ne-row-' + this._newEffectPort);
        if (!row) return;
        row.innerHTML = '<span style="color:#f5a623;font-size:0.5rem;padding-left:4px;">NEW New layer  use Builder controls or type effect code above...</span>';
    },

    _clearNewEffectDraft() {
        if (!this._newEffectPort) return;
        this._stopDraftPreview(this._newEffectPort);
        this._stopExamplePreview();
        this._clearPreservedDraftRawText();
        this._newEffectTrigger = '';
        const trigInput = document.getElementById('bj-ne-trig');
        if (trigInput) trigInput.value = '';
        const txtInput = document.getElementById('bj-ne-text');
        if (txtInput) txtInput.value = '';
        this._activeTrigger = null;
        const card = document.getElementById('bjc-' + this._newEffectPort);
        card?.querySelectorAll('.bj-trig-btn').forEach(btn => btn.classList.remove('bj-trig-active'));
        this._suppressSync = true;
        this._inPreview = false;
        this._stopLatchedLoop();
        this._setPreviewScene(null);
        Builder._resetPreviewTiming();
        for (let i = 0; i < Builder.NUM_LAYERS; i++) Builder.layers[i] = Builder._defaultLayer();
        Builder.layers[0].active = true;
        Builder.currentLayerIdx = 0;
        Builder.loadLayerToUI(0);
        Builder._updateTabIndicators();
        Builder._updateZLabels();
        Builder._updateGenStr();
        this._suppressSync = false;
        this._resetNewEffectPlaceholder();
    },

    _syncNewEffectFromBuilder() {
        if (!this._newEffectPort) return;
        if (this._applyPreservedDraftRawToUi()) {
            const rowPreserved = document.getElementById('bj-ne-row-' + this._newEffectPort);
            if (rowPreserved) {
                const trig = this._newEffectTrigger || '??';
                rowPreserved.innerHTML =
                    '<span style="color:#f5a623;font-size:0.48rem;padding:0 3px;">NEW</span>' +
                    '<span style="color:#00bcd4;font-size:0.48rem;font-weight:600;padding-right:4px;">' + this._esc(trig) + '</span>' +
                    '<span style="font-size:0.48rem;color:#b0c4de;font-family:monospace;">' + this._esc(this._preservedDraftRawText) + '</span>';
            }
            return;
        }
        const genStr = document.getElementById('dob-genstr')?.textContent?.trim() || '';
        const txtInput = document.getElementById('bj-ne-text');
        if (txtInput && genStr && !genStr.startsWith('-')) {
            txtInput.value = genStr;
        }
        // Update placeholder row with live preview of what's being built
        const row = document.getElementById('bj-ne-row-' + this._newEffectPort);
        if (row && genStr && !genStr.startsWith('-')) {
            const trig = this._newEffectTrigger || '??';
            row.innerHTML =
                '<span style="color:#f5a623;font-size:0.48rem;padding:0 3px;">NEW</span>' +
                '<span style="color:#00bcd4;font-size:0.48rem;font-weight:600;padding-right:4px;">' + this._esc(trig) + '</span>' +
                '<span style="font-size:0.48rem;color:#b0c4de;font-family:monospace;">' + this._esc(genStr) + '</span>';
        }
    },

    _commitNewEffect() {
        if (!this._newEffectPort) return;
        Builder._resetPreviewTiming();  // v13.12: restart W timing + auto-resume
        const toy = this.importedToys.find(t => t.portId === this._newEffectPort);
        if (!toy) { this._cancelNewEffect(); return; }

        const trigger = this._newEffectTrigger;
        if (!trigger) { alert('Please enter a trigger (e.g. S2, W45, E112)'); return; }

        // Get effect string from text input or Generated DOF String
        let effectStr = document.getElementById('bj-ne-text')?.value?.trim() || '';
        if (!effectStr) {
            effectStr = document.getElementById('dob-genstr')?.textContent?.trim() || '';
        }
        if (!effectStr || effectStr.startsWith('-')) {
            alert('No effect defined. Use Builder controls or type effect code.'); return;
        }

        // Parse effect string into layer(s)
        // User's trigger field ALWAYS takes priority  strip any trigger prefix from pasted code
        const rawLayers = effectStr.split(/\s*\/\s*/).filter(Boolean);
        const newLayers = [];
        for (const raw of rawLayers) {
            // Strip leading trigger tokens (S1, W250, ON, E112, compound S1|W2, etc.)
            const stripped = raw.trim().replace(/^(?:(?:W\d+|S\d+|ON|E\d+)(?:\|(?:W\d+|S\d+|ON|E\d+))*)\s+/i, '').trim();
            if (!stripped) continue;
            const fullRaw = trigger + ' ' + stripped;
            const parsed = this._parseEffectString(fullRaw, this._parseContextForToy(toy));
            parsed.forEach(l => {
                l._originalRaw = '';
                newLayers.push(l);
            });
        }
        if (!newLayers.length) { alert('Could not parse effect string.'); return; }

        // Find insertion point: after last existing layer with same trigger
        // This keeps same-trigger layers contiguous for the window system
        const allLayers = this.sectionLayers[toy.toyName] || [];
        let insertIdx = allLayers.length; // Default: end
        for (let i = allLayers.length - 1; i >= 0; i--) {
            if (allLayers[i]._trigger === trigger) {
                insertIdx = i + 1; // Insert right after last matching trigger layer
                break;
            }
        }

        // Splice new layers into correct position
        allLayers.splice(insertIdx, 0, ...newLayers);
        this.sectionLayers[toy.toyName] = allLayers;
        toy.layers = allLayers;

        // Regenerate section string
        this._regenerateSectionString(toy.toyName);
        this._updateCardChangeState(toy.portId);

        // Rebuild card layer rows. Keep selection focused on the newly inserted rows
        // instead of checking every row, so DOF String and edit targeting stay scoped.
        const insertedChecked = new Set();
        for (let i = 0; i < newLayers.length; i++) insertedChecked.add(insertIdx + i);
        this._rebuildCardLayers(toy, insertIdx, newLayers.length, { checkedIndices: insertedChecked });
        // Keep editor explicitly bound to the first inserted row so subsequent control
        // changes in New Effect mode still target a concrete layer.
        this._editTargetPort = toy.portId;
        this._editTargetMasterIdx = insertIdx;

        // Rebuild trigger buttons on the card
        this._rebuildCardTriggerBar(toy);

        console.log('[BuilderJSON] Added', newLayers.length, 'layer(s) to', toy.toyName, 'trigger:', trigger);

        // Close New Effect mode immediately after commit so subsequent slider edits
        // are clearly normal edits on the committed card rows, not a fresh draft.
        this._clearPreservedDraftRawText();
        this._activeTrigger = trigger;
        this._cancelNewEffect(true);

        const card = document.getElementById('bjc-' + toy.portId);
        card?.querySelectorAll('.bj-trig-btn').forEach(b => b.classList.remove('bj-trig-active'));
        const trigBtn = this._findTriggerButton(toy.portId, trigger);
        trigBtn?.classList.add('bj-trig-active');
        this._onCheckboxChanged(toy.portId, insertIdx, true);

        if (this._toyBlockedFromPreview(toy)) return;

        // Auto-fire the committed trigger once so the user sees the new effect immediately.
        setTimeout(() => {
            this._suppressSync = true;
            try {
                // Manually set trigger state without going through full fireTrigger
                // which can perturb the current editor binding/order.
                this._activeTrigger = trigger;
                const fireCard = document.getElementById('bjc-' + toy.portId);
                fireCard?.querySelectorAll('.bj-trig-btn').forEach(b => b.classList.remove('bj-trig-active'));
                const fireBtn = this._findTriggerButton(toy.portId, trigger);
                fireBtn?.classList.add('bj-trig-active');
                // Navigate window to trigger and load
                const trigIdx = (toy.layers || []).findIndex(l => l._trigger === trigger);
                if (trigIdx >= 0) {
                    this.layerWindow[toy.toyName] = { start: trigIdx };
                    this._loadSectionLayers(toy.toyName);
                    this._onCheckboxChanged(toy.portId, insertIdx, true);
                }
                // Indicate on card
                const layers = this._getSelectedLayers(toy.portId);
                if (layers.length) {
                    if (this._isEmissivePhysicalToy(toy)) {
                        this._startTimedToyPreview(toy, layers, {
                            color: this._previewColorForToy(toy, layers),
                            loop: true
                        });
                    }
                    else this._indicateOn(toy.portId, this._resolveHex(layers[0].color));
                }
                // Ensure visual output is actually rendered (matrix/strip) for auto-fire path.
                const scene = this.buildSceneForTrigger({
                    portId: toy.portId,
                    trigger,
                    syncActive: this._syncActive
                });
                this._setPreviewScene(scene);
                Builder._resetPreviewTiming();
            } finally {
                this._suppressSync = false;
            }
        }, 100);
    },

    _cancelNewEffect(keepMax) {
        const portId = this._newEffectPort;
        if (!portId) return;
        this._stopDraftPreview(portId);
        this._clearPreservedDraftRawText();
        this._newEffectPort = null;
        this._newEffectTrigger = '';
        const card = document.getElementById('bjc-' + portId);
        if (card) {
            card.classList.remove('bj-editing');
            // Remove the controls bar
            card.querySelector('.bj-ne-bar')?.remove();
        }
        // Remove placeholder row
        document.getElementById('bj-ne-row-' + portId)?.remove();
        // Un-maximize unless keepMax
        if (!keepMax && card?.classList.contains('bj-max')) this.toggleMaximize(portId);
        // Restore Builder to current section layers
        if (Builder.activeSection) this._loadSectionLayers(Builder.activeSection);
    },

    // Rebuild layer rows in card body, highlighting newly added ones
    _rebuildCardLayers(toy, highlightStart, highlightCount, opts = {}) {
        const layerDiv = document.getElementById('bjlayers-' + toy.portId);
        if (!layerDiv) return;
        const blocked = this._toyBlockedFromPreview(toy);
        const checkedIndices = (opts.checkedIndices instanceof Set) ? opts.checkedIndices : null;
        // Remove placeholder
        layerDiv.querySelector('.bj-new-row')?.remove();
        // Clear and rebuild ALL rows
        layerDiv.innerHTML = '';
        layerDiv.classList.add('bj-two-col');
        toy.layers.forEach((layer, idx) => {
            const row = document.createElement('div'); row.className = 'bj-layer-row';
            row.id = 'bjlr-' + toy.portId + '-' + idx;
            // Highlight newly added rows
            if (highlightStart !== undefined && idx >= highlightStart && idx < highlightStart + highlightCount) {
                row.classList.add('bj-new-row-added');
            }
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'bj-lcb'; cb.checked = checkedIndices ? checkedIndices.has(idx) : true;
            cb.dataset.port = toy.portId; cb.dataset.idx = idx;
            cb.onchange = () => this._onCheckboxChanged(toy.portId, idx, cb.checked);
            const num = document.createElement('div'); num.className = 'bj-lnum'; num.textContent = idx + 1;
            const sum = document.createElement('div'); sum.className = 'bj-lsum';
            sum.contentEditable = 'true'; sum.spellcheck = false;
            sum.textContent = layer._raw || this._layerToRaw(layer);
            sum.dataset.port = toy.portId; sum.dataset.idx = idx;
            if (layer._extra?.some(t => /^@\w+@$/.test(t))) sum.classList.add('bj-has-var');
            sum.onblur = () => this._onCardRowEdited(toy.portId, idx, sum.textContent);
            sum.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); sum.blur(); }
                if (e.key === 'Escape') { e.preventDefault(); sum.textContent = (toy.layers[idx]?._originalRaw) || ''; sum.blur(); }
            };
            const play = document.createElement('button'); play.className = 'bj-play-btn'; play.textContent = '>'; play.title = 'Preview';
            if (blocked) {
                play.disabled = true;
                play.title = toy._support?.note || 'This layer cannot preview in the current cabinet profile.';
            }
            play.onclick = () => this.previewLayer(toy.portId, idx);
            row.appendChild(cb); row.appendChild(num); row.appendChild(sum); row.appendChild(play);
                const del = document.createElement('button'); del.className = 'bj-del-btn'; del.textContent = 'X'; del.title = 'Delete this layer';
                del.onclick = (e) => { e.stopPropagation(); this._deleteLayer(toy.portId, idx); };
                row.appendChild(del);

            layerDiv.appendChild(row);
        });
        // Scroll to first new row
        if (highlightStart !== undefined) {
            const newRow = document.getElementById('bjlr-' + toy.portId + '-' + highlightStart);
            if (newRow) this._scrollElementIntoNearestView(newRow, { align:'center' });
        }
    },

    // Rebuild trigger button bar in card
    _rebuildCardTriggerBar(toy) {
        const card = document.getElementById('bjc-' + toy.portId); if (!card) return;
        const blocked = this._toyBlockedFromPreview(toy);
        // Remove both original toolbar and any previously rebuilt bar
        card.querySelector('.bj-toolbar')?.remove();
        card.querySelector('.bj-trig-bar')?.remove();
        const trigs = [...new Set(toy.layers.map(l => l._trigger).filter(Boolean))];
        if (!trigs.length) return;
        // Rebuild using original toolbar format
        const bar = document.createElement('div'); bar.className = 'bj-toolbar';
        bar.addEventListener('mousedown', (e) => e.stopPropagation());
        const allLbl = document.createElement('label'); allLbl.textContent = 'All';
        allLbl.onclick = () => this.selectAll(toy.portId, true);
        const noneLbl = document.createElement('label'); noneLbl.textContent = 'None';
        noneLbl.onclick = () => this.selectAll(toy.portId, false);
        bar.appendChild(allLbl); bar.appendChild(document.createTextNode(' ')); bar.appendChild(noneLbl);
        bar.appendChild(Object.assign(document.createElement('div'), { className: 'bj-sep' }));
        trigs.forEach(t => {
            const tb = document.createElement('span'); tb.className = 'bj-trig-btn';
            tb.textContent = t; tb.dataset.port = toy.portId; tb.dataset.trig = t;
            if (blocked) {
                tb.classList.add('bj-trig-disabled');
                tb.title = toy._support?.note || 'This trigger cannot preview in the current cabinet profile.';
            }
            tb.onclick = () => this.fireTrigger(toy.portId, t, tb);
            bar.appendChild(tb);
        });
        // Arrow key navigation hint for large trigger lists
        if (trigs.length > 5) {
            const hint = document.createElement('span');
            hint.className = 'bj-nav-hint';
            hint.textContent = '<- -> keys to browse';
            hint.title = 'Use Left/Right arrow keys to step through triggers sequentially';
            bar.appendChild(hint);
        }
        // Insert after header area, before layer list or ne-bar
        const neBar = card.querySelector('.bj-ne-bar');
        const layerDiv = document.getElementById('bjlayers-' + toy.portId);
        const insertBefore = neBar || layerDiv;
        if (insertBefore) card.insertBefore(bar, insertBefore);
        else card.appendChild(bar);
    },

    // Find a trigger button in a card by trigger name
    _findTriggerButton(portId, trigger) {
        const card = document.getElementById('bjc-' + portId); if (!card) return null;
        const btns = card.querySelectorAll('.bj-trig-btn');
        for (const b of btns) {
            if (b.dataset.trig === trigger || b.dataset.trigger === trigger || b.textContent === trigger) return b;
        }
        return null;
    },

    NON_RENDERABLE_VARS: new Set(['dt','t','rgbsplit','playon']),

    _hasNonRenderableVars(toy) {
        return toy.layers.some(l =>
            l._extra?.some(t => {
                const m = t.match(/^@(\w+)@$/);
                return m && this.NON_RENDERABLE_VARS.has(m[1].toLowerCase());
            }) ||
            (l._raw && /^@(rgbsplit|dt|t|playon)@/i.test(l._raw.trim()))
        );
    },

    // Expand @tokens@ for preview rendering; returns modified copy or null if non-renderable only
    _expandLayerForPreview(layer) {
        if (!layer) return layer;
        // Quick check: does this layer have @variables@?
        const raw = layer._raw || '';
        if (!raw.includes('@')) return layer;

        // Pure non-renderable: layer is ONLY @dt@ or @rgbsplit@ etc with no color/shape
        const trimRaw = raw.trim();
        if (/^(W\d+[\|W\d]*\s+)?@(dt|t|rgbsplit|playon)@$/i.test(trimRaw)) return null;

        const expanded = {...layer, _extra: [...(layer._extra || [])]};
        expanded._extra = expanded._extra.filter(tok => {
            const m = tok.match(/^@(\w+)@$/);
            if (!m) return true;
            const key = m[1].toLowerCase();

            // Flasher/strobe positions  inject params for matrix MX rendering
            const uv = this._userVariables?.[key];
            const pos = uv || this.VAR_POSITIONS[key];
            if (pos) {
                if (expanded.al === 0 && pos.al !== undefined) expanded.al = pos.al;
                if (expanded.aw === 100 && pos.aw !== undefined) expanded.aw = pos.aw;
                if (expanded.ah === 100 && pos.ah !== undefined) expanded.ah = pos.ah;
                if (pos.at !== undefined) expanded.at = pos.at;
                if (!expanded.shp && pos.shp) expanded.shp = pos.shp;
                if (pos.color && (!expanded.color || expanded.hex === '#000000')) {
                    expanded.color = pos.color; expanded.hex = pos.hex || this._resolveHex(pos.color);
                }
                expanded._posInjected = true;
                return false; // consumed
            }
            // Letter/Number shapes
            if (/^letter[a-z]$/i.test(key) || /^number\d$/i.test(key)) {
                expanded.shp = 'SHP' + m[1].charAt(0).toUpperCase() + m[1].slice(1);
                return false;
            }
            // Shape aliases
            if (/^pointplop|circlepulse|roundpulse|squareplop|diamondboxpulse|vlinepulse|updown|leftright$/i.test(key)) {
                expanded.shp = 'SHP' + m[1].charAt(0).toUpperCase() + m[1].slice(1);
                return false;
            }
            // Non-renderable  keep in _extra, skip for preview
            if (this.NON_RENDERABLE_VARS.has(key)) return true;
            return true; // unknown vars preserved
        });

        // Bug 3: Strobe/flasher @position@ layers often have no color token
        // Default to White so the effect is visible on the matrix
        if (expanded._posInjected && (!expanded.color || expanded.hex === '#000000')) {
            expanded.color = 'White';
            expanded.hex = '#FFFFFF';
        }

        return expanded;
    },

    // Attempt to expand via App.substituteVariables if the INI is loaded
    _trySubstituteVariable(raw) {
        if (typeof App === 'undefined' || !App.data?.variables?.size) return raw;
        const rom = this.importedConfig?.rom?.toLowerCase() || '';
        return App.substituteVariables(raw, rom);
    },

    // 
    //  DOF STRING PARSER  pipes, @vars@, nobool, I tokens, APC preserved
    // 
    _parseEffectString(str, opts = {}) {
        if (typeof window !== 'undefined' && window.DOFShared?.Parser?.parseEffectString) {
            return window.DOFShared.Parser.parseEffectString(str, {
                toyName: opts?.toyName || '',
                toyType: opts?.toyType || '',
                portId: opts?.portId || '',
                isStrobeContext: this._isStrobeToy({ toyName: opts?.toyName || '', portId: opts?.portId || '' }),
                resolveHex: this._resolveHex.bind(this),
                isParameterToken: this._isP.bind(this)
            });
        }
        if (!str || !str.trim()) return [];
        return str.replace(/\\\//g, '\x00').split('/').map(s => s.replace(/\x00/g, '/').trim()).filter(Boolean)
            .map(s => this._parseLayer(s, opts)).filter(Boolean);
    },

    _parseLayer(raw, opts = {}) {
        if (typeof window !== 'undefined' && window.DOFShared?.Parser?.parseLayer) {
            return window.DOFShared.Parser.parseLayer(raw, {
                toyName: opts?.toyName || '',
                toyType: opts?.toyType || '',
                portId: opts?.portId || '',
                isStrobeContext: this._isStrobeToy({ toyName: opts?.toyName || '', portId: opts?.portId || '' }),
                resolveHex: this._resolveHex.bind(this),
                isParameterToken: this._isP.bind(this)
            });
        }
        const str = raw.trim(); if (!str) return null;
        const d = {
            active:true, color:'', hex:'#000000', effect:'', duration:0, blink:200, bpw:50,
            fu:0, fd:0, f:0, wait:0, mhold:0, maxDur:0, maxInt:48, plasmaSpeed:100, plasmaDensity:100, plasmaColor2:'',
            al:0, aw:100, at:0, ah:100, as:0, ass:0, assMs:0, asa:0, dir:'',
            afden:0, afmin:50, afmax:150, affade:0, shp:'', zlayer:0,
            useSourceColor:false,
            bitmap:{ left:null, top:null, width:null, height:null, frame:null, frameCount:null, fps:null, frameDelayMs:null, stepDirection:'', stepSize:null, behaviour:'' },
            _trigger:'', _raw:str, _extra:[], _pulseCount:0
        };
        const toks = str.split(/\s+/); let i = 0;
        const isStrobeContext = this._isStrobeToy({ toyName: opts?.toyName || '', portId: opts?.portId || '' });
        const treatLeadingLampAsTrigger =
            i < toks.length &&
            /^L\d+$/i.test(toks[i]) &&
            (opts?.toyType === 'phys' || opts?.toyType === 'rgb');
        if (treatLeadingLampAsTrigger) {
            d._trigger = toks[i].toUpperCase();
            i++;
        } else if (i<toks.length && /^L-?\d+$/i.test(toks[i]) && i+1<toks.length && /^(W\d|S\d|ON|E\d)/i.test(toks[i+1])) {
            d.zlayer = parseInt(toks[i].slice(1)); i++;
        }
        if (i<toks.length && /^(W\d+|S\d+|ON|E\d+)(\|[A-Z]\d+)*$/i.test(toks[i])) { d._trigger = toks[i].toUpperCase(); i++; }
        if (i<toks.length && /^invert$/i.test(toks[i])) { d._extra.push(toks[i]); i++; }
        if (i<toks.length && !this._isP(toks[i]) && !/^\d+$/.test(toks[i]) && !toks[i].startsWith('@')) {
            if (/^blink$/i.test(toks[i])) { d.effect = 'Blink'; i++; }
            else if (/^plasma$/i.test(toks[i])) { d.effect = 'Plasma'; i++; }
            else { d.color = toks[i]; d.hex = this._resolveHex(toks[i]); i++; }
        }
        if (i<toks.length && /^@\w+@$/.test(toks[i])) { d._extra.push(toks[i]); i++; }
        if (i<toks.length && /^\d+$/.test(toks[i])) { d.duration = parseInt(toks[i]); i++; }
        while (i < toks.length) {
            const t = toks[i];
            if (/^@\w+@$/.test(t)) { d._extra.push(t); i++; continue; }
            if (/^AT-?\d+$/i.test(t)) { d.at=parseInt(t.slice(2));i++;continue; }
            if (/^AH\d+$/i.test(t)) { d.ah=parseInt(t.slice(2));i++;continue; }
            if (/^AL-?\d+$/i.test(t)) { d.al=parseInt(t.slice(2));i++;continue; }
            if (/^AW\d+$/i.test(t)) { d.aw=parseInt(t.slice(2));i++;continue; }
            if (/^AS?D[DULR]$/i.test(t)) {
                d._dirToken = t.toUpperCase();
                d.dir = d._dirToken.replace(/^ASD/, 'AD');
                i++;
                continue;
            }
            if (/^AS\d+$/i.test(t) && !/^ASS/i.test(t)) { d.as=parseInt(t.slice(2));i++;continue; }
            if (/^ASS\d+$/i.test(t)) { d.ass=parseInt(t.slice(3));i++;continue; }
            if (/^ASSMS\d+$/i.test(t)) { d.assMs=parseInt(t.slice(5));i++;continue; }
            if (/^ASA-?\d+$/i.test(t)) { d.asa=parseInt(t.slice(3), 10);i++;continue; }
            if (/^AFDEN\d+$/i.test(t)) { d.afden=parseInt(t.slice(5));i++;continue; }
            if (/^AFMIN\d+$/i.test(t)) { d.afmin=parseInt(t.slice(5));i++;continue; }
            if (/^AFMAX\d+$/i.test(t)) { d.afmax=parseInt(t.slice(5));i++;continue; }
            if (/^AFFADE\d+$/i.test(t)) { d.affade=parseInt(t.slice(6));i++;continue; }
            if (/^SHP/i.test(t)) { d.shp=t;i++;continue; }
            if (/^FU\d+$/i.test(t)) { d.fu=parseInt(t.slice(2));i++;continue; }
            if (/^FD\d+$/i.test(t)) { d.fd=parseInt(t.slice(2));i++;continue; }
            if (/^F\d+$/i.test(t) && !/^FU|^FD/i.test(t)) { d.f=parseInt(t.slice(1));i++;continue; }
            if (/^BPW\d+$/i.test(t)) { d.bpw=parseInt(t.slice(3));i++;continue; }
            if (/^APS\d+$/i.test(t)) { d.plasmaSpeed=parseInt(t.slice(3)); d.effect='Plasma'; i++;continue; }
            if (/^APD\d+$/i.test(t)) { d.plasmaDensity=parseInt(t.slice(3)); d.effect='Plasma'; i++;continue; }
            if (/^PS\d+$/i.test(t)) { d.plasmaDensity=parseInt(t.slice(2)); d.effect='Plasma'; i++;continue; } // legacy
            if (/^PV\d+$/i.test(t)) { d.plasmaSpeed=parseInt(t.slice(2)); d.effect='Plasma'; i++;continue; }   // legacy
            // Legacy migration: older Builder emitted "MAX{dur} Max{int}".
            // If MAX is already set and we see exact-case Max{n}, treat it as intensity.
            if (/^Max\d+$/.test(t) && d.maxDur > 0 && d.maxInt === 48) { d.maxInt=this._normalizeIntensityTokenValue(parseInt(t.slice(3)));i++;continue; }
            if (/^MAX\d+$/i.test(t)) { d.maxDur=parseInt(t.slice(3));i++;continue; }
            if (/^I#[0-9a-f]+$/i.test(t)) { d.maxInt=this._intensityFromHexToken(t.slice(2));i++;continue; }
            if (/^I\d+$/i.test(t)) { d.maxInt=this._normalizeIntensityTokenValue(parseInt(t.slice(1)));i++;continue; }
            if (/^M\d+$/i.test(t) && !/^MX|^MAX/i.test(t)) { d.mhold=parseInt(t.slice(1));i++;continue; }
            if (/^nobool$/i.test(t)) { d._extra.push(t);i++;continue; }
            if (/^APC.+/i.test(t)) { d.plasmaColor2=t.slice(3); d.effect='Plasma'; i++;continue; }
            if (/^ABL-?\d+$/i.test(t)) { d.bitmap.left=parseInt(t.slice(3), 10);i++;continue; }
            if (/^ABT-?\d+$/i.test(t)) { d.bitmap.top=parseInt(t.slice(3), 10);i++;continue; }
            if (/^ABW\d+$/i.test(t)) { d.bitmap.width=parseInt(t.slice(3), 10);i++;continue; }
            if (/^ABH\d+$/i.test(t)) { d.bitmap.height=parseInt(t.slice(3), 10);i++;continue; }
            if (/^ABF\d+$/i.test(t)) { d.bitmap.frame=parseInt(t.slice(3), 10);i++;continue; }
            if (/^AAC\d+$/i.test(t)) { d.bitmap.frameCount=parseInt(t.slice(3), 10);i++;continue; }
            if (/^AAF\d+$/i.test(t)) { d.bitmap.fps=parseInt(t.slice(3), 10); d.bitmap.frameDelayMs = d.bitmap.fps > 0 ? Math.round(1000 / d.bitmap.fps) : null; i++;continue; }
            if (/^AAD[A-Z]$/i.test(t)) { d.bitmap.stepDirection=t.slice(3).toUpperCase();i++;continue; }
            if (/^AAS\d+$/i.test(t)) { d.bitmap.stepSize=parseInt(t.slice(3), 10);i++;continue; }
            if (/^AAB.+$/i.test(t)) { d.bitmap.behaviour=t.slice(3).toUpperCase();i++;continue; }
            if (/^BNP/i.test(t)) { d._extra.push(t);i++;continue; }
            if (/^invert$/i.test(t)) { d._extra.push(t); i++; continue; }
            if (t.toUpperCase() === 'BLINK') { d.effect='Blink';i++; if (i<toks.length && /^\d+$/.test(toks[i])) { d.blink=parseInt(toks[i]);i++; } continue; }
            if (t.toUpperCase() === 'PLASMA') { d.effect='Plasma'; i++; continue; }
            if (!d.color && !this._isP(t) && !/^\d+$/.test(t) && !t.startsWith('@')) {
                d.color = t;
                d.hex = this._resolveHex(t);
                i++;
                continue;
            }
            if (/^L-?\d+$/i.test(t)) { d.zlayer=parseInt(t.slice(1));i++;continue; }
            if (/^W\d+$/i.test(t) && d._trigger) { d.wait=parseInt(t.slice(1));i++;continue; }
            if (/^\d+$/.test(t) && d.duration===0) { d.duration=parseInt(t);i++;continue; }
            if (/^\d+$/.test(t) && isStrobeContext && d.duration > 0 && d._pulseCount === 0) { d._pulseCount=parseInt(t);i++;continue; }
            d._extra.push(t); i++;
        }
        if (!d.effect && d.fu > 0 && d.fd > 0) d.effect = 'Pulse';
        // DOF F token = combined fade (both up and down at same rate)
        if (d.f > 0) {
            if (d.fu === 0) d.fu = d.f;
            if (d.fd === 0) d.fd = d.f;
            if (!d.effect) d.effect = 'Pulse';
        }
        d.useSourceColor = !d.color && (!!d.shp || ['left','top','width','height','frame','frameCount','fps','frameDelayMs','stepSize'].some(key => d.bitmap[key] !== null && d.bitmap[key] !== undefined && d.bitmap[key] !== '') || !!d.bitmap.stepDirection || !!d.bitmap.behaviour);
        return d;
    },

    _isP(t) { return /^(AT|AH|AL|AW|AB|AD|AS|AF|SHP|FU|FD|F\d|L-?\d|BLINK|PLASMA|BPW|APS\d|APD\d|PS\d|PV\d|APC|MAX|M\d|BNP|AAC|AAF|AAD[A-Z]|AAS\d|AAB.+|ASA-?\d|ASSMS\d|I\d|I#[0-9A-F]+|nobool)/i.test(t); },

    _extractApcFromExtra(extra) {
        if (!Array.isArray(extra)) return '';
        const tok = extra.find(t => /^APC.+/i.test(t));
        return tok ? tok.slice(3) : '';
    },
    _normalizeApcToken(value) {
        const raw = (value || '').trim();
        if (!raw) return '';
        if (typeof Builder !== 'undefined' && Array.isArray(Builder.allColors)) {
            const compact = raw.toLowerCase().replace(/[\s_-]+/g, '');
            const exact = Builder.allColors.find(c => c.n.toLowerCase().replace(/[\s_-]+/g, '') === compact);
            if (exact) return exact.n;
            const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
            if (m) {
                const hex = '#' + m[1].toUpperCase();
                const byHex = Builder.allColors.find(c => (c.h || '').toUpperCase() === hex);
                if (byHex) return byHex.n;
                const toRgb = (h) => {
                    const n = parseInt((h || '#000000').replace('#', '').padStart(6, '0'), 16);
                    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
                };
                const target = toRgb(hex);
                let best = Builder.allColors[0]?.n || 'White';
                let bestDist = Number.POSITIVE_INFINITY;
                Builder.allColors.forEach(c => {
                    const rgb = toRgb(c.h);
                    const dr = target[0] - rgb[0];
                    const dg = target[1] - rgb[1];
                    const db = target[2] - rgb[2];
                    const dist = (dr * dr) + (dg * dg) + (db * db);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = c.n;
                    }
                });
                return best;
            }
        }
        return raw.replace(/\s+/g, '_');
    },

    _resolveHex(colorName) {
        if (!colorName) return '#000000';
        if (colorName.startsWith('#')) return colorName;
        if (Builder.allColors) {
            const clean = colorName.toLowerCase().replace(/_/g, '');
            const found = Builder.allColors.find(c => c.n.toLowerCase().replace(/_/g, '') === clean);
            if (found) return found.h;
        }
        return '#888888';
    },

    // 
    //  SERIALIZATION / EXPORT
    // 
    _regenerateSectionString(sn) {
        const layers = this.sectionLayers[sn];
        const toy = this.importedToys.find(t => t.toyName === sn);
        if (!layers || !layers.length) {
            Builder.sectionConfigs[sn] = '';
            if (toy) toy.rawUser = '';
            Builder.renderStaging();
            return;
        }
        // Full config always uses all active layers (for export/apply)
        Builder.sectionConfigs[sn] = layers.filter(l => l.active !== false)
            .map(l => l._raw || this._layerToRaw(l)).filter(Boolean).join('/');
        if (toy) toy.rawUser = Builder.sectionConfigs[sn];
        Builder.renderStaging();
        // JSON mode display policy: always show checked rows (raw format with trigger).
        this._updateJsonGenStrFromCheckedRows(sn);
    },

    _updateJsonGenStrFromCheckedRows(sn) {
        if (this._newEffectPort) return;
        if (!this._activeToyPort) return;
        const toy = this.importedToys.find(t => t.portId === this._activeToyPort);
        if (!toy || toy.toyName !== sn) return;
        const gs = document.getElementById('dob-genstr');
        if (!gs || gs._bjsonEditing) return;
        const layers = this.sectionLayers[sn] || [];
        const checked = this._getCheckedMasterIndicesForPort(this._activeToyPort, layers);
        if (!checked.length) {
            gs.textContent = '- no rows selected -';
            gs.style.color = '#5a7a90';
            this._lastGenStr = gs.textContent.trim();
            this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false });
            this._setLiveGenStrHighlights([]);
            return;
        }
        const segments = checked
            .map(i => ({ masterIdx: i, raw: layers[i]?._raw || this._layerToRaw(layers[i]) }))
            .filter(seg => !!seg.raw);
        const checkedStr = segments.map(seg => seg.raw).join(' / ');
        if (!checkedStr) {
            gs.textContent = '- no rows selected -';
            gs.style.color = '#5a7a90';
            this._lastGenStr = gs.textContent.trim();
            this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false });
            this._setLiveGenStrHighlights([]);
            return;
        }
        gs.innerHTML = segments.map(seg =>
            '<span class="bj-genseg" data-master-idx="' + seg.masterIdx + '">' + this._esc(seg.raw) + '</span>'
        ).join('<span class="bj-gensep"> / </span>');
        gs.style.color = '#3aaa3a';
        this._lastGenStr = checkedStr;
        this._applyGenStrHeightPreference(this._genStrHeightPx, { persist: false });
        this._syncGenStrHighlightToCurrentLayer();
        this._syncLiveGenStrHighlights(sn);
    },

    _qaSleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    _qaClearMatrixSignalCache() {
        const cache = Builder?._matrixColorCache;
        if (cache?.length) cache.fill(0);
    },

    async _qaWaitForFreshPreviewFrame(maxWaitMs = 120) {
        const start = performance.now();
        const initialScene = Builder?._previewScene;
        while ((performance.now() - start) < maxWaitMs) {
            await this._qaSleep(16);
            if (Builder?._previewScene === initialScene) {
                const lit = this._qaMatrixLitPixelCount();
                if (lit > 0 || (performance.now() - start) >= 32) break;
            } else {
                break;
            }
        }
    },

    _qaFindToyByName(names = [], fallbackFilter = null) {
        for (const n of names) {
            const hit = this.importedToys.find(t => String(t.toyName || '').toLowerCase() === String(n).toLowerCase());
            if (hit) return hit;
        }
        if (typeof fallbackFilter === 'function') return this.importedToys.find(fallbackFilter) || null;
        return null;
    },

    _qaSceneSummary(scene) {
        const stripKeys = Object.keys(scene?.stripLayersByIndex || {});
        return {
            matrixLayers: (scene?.matrixLayers || []).length,
            stripBuckets: stripKeys.length,
            stripKeys,
            unresolved: (scene?.unresolvedStripRoutes || []).length,
            participants: (scene?.participants || []).length
        };
    },

    _qaMatrixRenderCases() {
        return [
            { id: 'QA-MX-01', name: 'Static Full Width Band', code: 'W18 Red AT40 AH20' },
            { id: 'QA-MX-02', name: 'Narrow Horizontal Scanner', code: 'W18 Red AL0 AW20 AT40 AH20 ADR AS200' },
            { id: 'QA-MX-03', name: 'Narrow Vertical Scanner', code: 'W18 Red AL40 AW20 AT0 AH20 ADD AS200' },
            { id: 'QA-MX-04', name: 'Full Width Moving Band', code: 'W18 Red AL0 AW100 AT40 AH20 ADR AS200' },
            { id: 'QA-MX-05', name: 'Blink With FU FD', code: 'W18 Red Blink 1000 BPW20 FU200 FD200' },
            { id: 'QA-MX-06', name: 'One Shot Fade Out', code: 'W18 Red AL20 AW20 AT40 AH20 FD500' },
            { id: 'QA-MX-07', name: 'One Shot Pulse', code: 'W18 Red AL20 AW20 AT40 AH20 FU200 FD500' },
            { id: 'QA-MX-08', name: 'Duration Plus Fade Tail', code: 'W18 Red AL20 AW20 AT40 AH20 700 FD300' },
            { id: 'QA-MX-09', name: 'Moving FD Comet', code: 'W18 Red AL0 AW20 AT40 AH20 ADR AS200 FD300' },
            { id: 'QA-MX-10', name: 'Moving FU Ramp', code: 'W18 Red AL0 AW20 AT40 AH20 ADR AS200 FU300' },
            { id: 'QA-MX-11', name: 'Moving FU FD Trail', code: 'W18 Red AL0 AW20 AT40 AH20 ADR AS200 FU250 FD250' },
            { id: 'QA-MX-12', name: 'Staggered Two Layer Chase', code: 'W18 Red AL0 AW20 AT35 AH12 ADR AS200/W18 Blue AL0 AW20 AT53 AH12 ADR AS200 W250' },
            { id: 'QA-MX-13', name: 'Layer Overlap Order', code: 'W18 Red AL20 AW30 AT35 AH20 L1/W18 Blue AL30 AW30 AT35 AH20 L2' },
            { id: 'QA-MX-14', name: 'Sparkle Density', code: 'W18 Red AL0 AW100 AT40 AH20 AFDEN30 AFMIN100 AFMAX160' },
            { id: 'QA-MX-15', name: 'Plasma Fill', code: 'W18 Midnight_blue AL0 AW100 AT40 AH20 APCRed' },
            { id: 'QA-MX-16', name: 'Built In Shape', code: 'W18 Red AL35 AW30 AT20 AH60 SHPCircle3' },
            { id: 'QA-MX-17', name: 'Letter Shape', code: 'W18 White AL35 AW30 AT10 AH80 SHPLetterA' },
            { id: 'QA-MX-18', name: 'Custom Shape Pack', code: 'W18 Dark_slate_gray Blink M300 AH100 AL0 AT0 AW17 SHPMBCRETRDKGRY' }
        ];
    },

    _qaMatrixLitPixelCount() {
        const cache = Builder?._matrixColorCache;
        if (!cache || !cache.length) return 0;
        let lit = 0;
        for (let i = 0; i < cache.length; i++) {
            if (cache[i] > 0) lit++;
        }
        return lit;
    },

    _qaMissingShapeNames(layers) {
        if (!Array.isArray(layers) || !layers.length) return [];
        const builtIn = /^(shpletter[a-z]|shpdigit[0-9]|shpcircle3|shpcircle|shproundpulse|shpdiamondboxpulse|shparrow(left|right|up|down)|shpfillleftright|shpupdown|shpfilltopbottom|shpfillbottomtop)$/i;
        const loadedShapes = (typeof App !== 'undefined' && App.data?.shapes) ? App.data.shapes : null;
        const missing = [];
        layers.forEach(layer => {
            const raw = String(layer?.shp || '').trim();
            if (!raw || builtIn.test(raw)) return;
            const key = raw.toLowerCase().startsWith('shp') ? raw.slice(3).toLowerCase() : raw.toLowerCase();
            if (!loadedShapes || !loadedShapes.has(key)) missing.push(raw);
        });
        return [...new Set(missing)];
    },

    _qaBitmapSourceStatus(layers) {
        const bitmapLayers = (Array.isArray(layers) ? layers : []).filter(layer => {
            const b = layer?.bitmap || {};
            return [b.left, b.top, b.width, b.height, b.frame, b.frameCount, b.fps, b.frameDelayMs, b.stepDirection, b.stepSize]
                .some(v => v !== null && v !== undefined && v !== '');
        });
        const source = this._getActiveBitmapSource();
        return {
            requested: bitmapLayers.length > 0,
            layerCount: bitmapLayers.length,
            frameSource: source?.source || 'none',
            frameCount: source?.frameCount || 0,
            warning: bitmapLayers.length > 0 && !(source?.frameCount)
                ? 'Bitmap parameters parsed, but no bitmap frame source is loaded. Load a table bitmap in Builder.'
                : ''
        };
    },

    previewEffectString(code, opts = {}) {
        if (!this.jsonMode || !this.importedToys?.length) {
            throw new Error('JSON mode is not active or no config is imported.');
        }

        const toy = (opts.portId
            ? this.importedToys.find(t => String(t.portId) === String(opts.portId))
            : null) || (opts.toyName
                ? this.importedToys.find(t => String(t.toyName || '').toLowerCase() === String(opts.toyName).toLowerCase())
                : null) || (this._activeToyPort
                    ? this.importedToys.find(t => String(t.portId) === String(this._activeToyPort))
                    : null) || this._resolveDisplayToyForRender() || null;

        if (!toy) {
            throw new Error('No preview-capable toy was found. Focus a card or pass { toyName } / { portId }.');
        }

        const parsed = this._parseEffectString(String(code || ''), this._parseContextForToy(toy));
        if (!parsed.length) {
            throw new Error('Effect string could not be parsed into any layers.');
        }

        const scene = this._buildSceneForExplicitLayers(toy, parsed);
        this._setFocus(toy.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
        this._activeToyPort = toy.portId;
        this._activeTrigger = parsed[0]?._trigger || '';
        this._setPreviewScene(scene);
        Builder._resetPreviewTiming();

        const report = {
            toy: { portId: toy.portId, toyName: toy.toyName, display: toy._display },
            code: String(code || ''),
            scene: this._qaSceneSummary(scene),
            missingShapes: this._qaMissingShapeNames(parsed),
            bitmapSource: this._qaBitmapSourceStatus(parsed),
            layers: parsed.length
        };
        if (!opts?.silent) console.log('[BuilderJSON.previewEffectString]', report);
        return report;
    },

    clearPreviewEffectString() {
        this._activeTrigger = '';
        this._setPreviewScene(null);
        Builder._resetPreviewTiming();
        this._setStatus('Effect string preview cleared.', '#8aacca');
    },

    _qaMatrixBoundsFromCache(cols = 0, rows = 0) {
        const cache = Builder?._matrixColorCache;
        if (!cache || !cache.length || !cols || !rows) {
            return { lit: 0, minX: -1, maxX: -1, minY: -1, maxY: -1, spanX: 0, spanY: 0 };
        }
        let lit = 0;
        let minX = cols, maxX = -1, minY = rows, maxY = -1;
        for (let i = 0; i < cache.length; i++) {
            if (!(cache[i] > 0)) continue;
            lit++;
            const x = i % cols;
            const y = Math.floor(i / cols);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        if (!lit) return { lit: 0, minX: -1, maxX: -1, minY: -1, maxY: -1, spanX: 0, spanY: 0 };
        return {
            lit,
            minX,
            maxX,
            minY,
            maxY,
            spanX: (maxX - minX) + 1,
            spanY: (maxY - minY) + 1
        };
    },

    _qaMatrixSignalFromCache(cols = 0, rows = 0) {
        const cache = Builder?._matrixColorCache;
        if (!cache || !cache.length || !cols || !rows) {
            return {
                lit: 0,
                minX: -1,
                maxX: -1,
                minY: -1,
                maxY: -1,
                spanX: 0,
                spanY: 0,
                energy: 0,
                avgIntensity: 0,
                maxIntensity: 0,
                energyPct: 0,
                centerX: -1,
                centerY: -1
            };
        }

        let lit = 0;
        let minX = cols, maxX = -1, minY = rows, maxY = -1;
        let energy = 0;
        let maxIntensity = 0;
        let weightX = 0;
        let weightY = 0;

        for (let i = 0; i < cache.length; i++) {
            const packed = cache[i];
            if (!(packed > 0)) continue;
            const r = (packed >> 16) & 255;
            const g = (packed >> 8) & 255;
            const b = packed & 255;
            const intensity = Math.max(r, g, b);
            if (!(intensity > 0)) continue;
            lit++;
            energy += intensity;
            if (intensity > maxIntensity) maxIntensity = intensity;
            const x = i % cols;
            const y = Math.floor(i / cols);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            weightX += x * intensity;
            weightY += y * intensity;
        }

        if (!lit || !(energy > 0)) {
            return {
                lit: 0,
                minX: -1,
                maxX: -1,
                minY: -1,
                maxY: -1,
                spanX: 0,
                spanY: 0,
                energy: 0,
                avgIntensity: 0,
                maxIntensity: 0,
                energyPct: 0,
                centerX: -1,
                centerY: -1
            };
        }

        return {
            lit,
            minX,
            maxX,
            minY,
            maxY,
            spanX: (maxX - minX) + 1,
            spanY: (maxY - minY) + 1,
            energy,
            avgIntensity: Number((energy / lit).toFixed(1)),
            maxIntensity,
            energyPct: Number(((energy / (255 * cols * rows)) * 100).toFixed(2)),
            centerX: Number((weightX / energy).toFixed(2)),
            centerY: Number((weightY / energy).toFixed(2))
        };
    },

    _qaSummarizeEffectSignal(samples = [], meta = {}) {
        const litSamples = samples.filter(row => row.lit > 0);
        const peakEnergy = samples.reduce((best, row) => row.energy > (best?.energy || -1) ? row : best, null);
        const peakLit = samples.reduce((best, row) => row.lit > (best?.lit || -1) ? row : best, null);
        const darkFrames = samples.filter(row => row.lit === 0).length;
        let relightCount = 0;
        let firstLitAt = null;
        let lastLitAt = null;
        let hasBeenLit = false;
        let wasDark = true;
        let minCenterX = Number.POSITIVE_INFINITY;
        let maxCenterX = Number.NEGATIVE_INFINITY;
        let minCenterY = Number.POSITIVE_INFINITY;
        let maxCenterY = Number.NEGATIVE_INFINITY;

        samples.forEach(row => {
            if (row.lit > 0) {
                if (firstLitAt === null) firstLitAt = row.t;
                lastLitAt = row.t;
                if (hasBeenLit && wasDark) relightCount++;
                hasBeenLit = true;
                wasDark = false;
                if (row.centerX >= 0) {
                    if (row.centerX < minCenterX) minCenterX = row.centerX;
                    if (row.centerX > maxCenterX) maxCenterX = row.centerX;
                }
                if (row.centerY >= 0) {
                    if (row.centerY < minCenterY) minCenterY = row.centerY;
                    if (row.centerY > maxCenterY) maxCenterY = row.centerY;
                }
            } else if (hasBeenLit) {
                wasDark = true;
            }
        });

        const notes = [];
        if (relightCount > 0) notes.push(`relit ${relightCount}x`);
        if (darkFrames > 0 && firstLitAt !== null && lastLitAt !== null && darkFrames < samples.length) notes.push(`${darkFrames} dark samples`);
        const moveSpanX = Number.isFinite(minCenterX) && Number.isFinite(maxCenterX) ? Number((maxCenterX - minCenterX).toFixed(2)) : 0;
        const moveSpanY = Number.isFinite(minCenterY) && Number.isFinite(maxCenterY) ? Number((maxCenterY - minCenterY).toFixed(2)) : 0;

        return {
            id: meta.id || '',
            section: meta.section || '',
            control: meta.control || '',
            name: meta.name || '',
            firstLitAt,
            peakEnergyAt: peakEnergy?.t ?? null,
            peakEnergy: peakEnergy?.energy ?? 0,
            peakLit: peakLit?.lit ?? 0,
            peakLitAt: peakLit?.t ?? null,
            lastLitAt,
            visibleMs: firstLitAt === null || lastLitAt === null ? 0 : Math.max(0, lastLitAt - firstLitAt),
            relightCount,
            darkFrames,
            moveSpanX,
            moveSpanY,
            peakAvgIntensity: peakEnergy?.avgIntensity ?? 0,
            notes: notes.join(' | ')
        };
    },

    async _qaCollectEffectSignalSamples(code, opts = {}) {
        const sampleMs = Math.max(16, Number(opts.sampleMs || 50));
        const durationMs = Math.max(sampleMs * 2, Number(opts.durationMs || 2500));
        const preview = this.previewEffectString(code, { ...opts, silent: true });
        const cols = Number(Builder?.previewCols || 0);
        const rows = Number(Builder?.previewRows || 0);
        this._qaClearMatrixSignalCache();
        const started = performance.now();
        await this._qaWaitForFreshPreviewFrame();
        const samples = [];

        while ((performance.now() - started) < durationMs) {
            const t = performance.now() - started;
            const signal = this._qaMatrixSignalFromCache(cols, rows);
            samples.push({
                t: Math.round(t),
                lit: signal.lit,
                energy: signal.energy,
                avgIntensity: signal.avgIntensity,
                maxIntensity: signal.maxIntensity,
                energyPct: signal.energyPct,
                minX: signal.minX,
                maxX: signal.maxX,
                spanX: signal.spanX,
                minY: signal.minY,
                maxY: signal.maxY,
                spanY: signal.spanY,
                centerX: signal.centerX,
                centerY: signal.centerY
            });
            await this._qaSleep(sampleMs);
        }

        const withDeltas = samples.map((row, idx) => {
            if (!idx) {
                return { ...row, dLit: 0, dEnergy: 0, dCenterX: 0, dCenterY: 0 };
            }
            const prev = samples[idx - 1];
            return {
                ...row,
                dLit: row.lit - prev.lit,
                dEnergy: row.energy - prev.energy,
                dCenterX: (row.centerX >= 0 && prev.centerX >= 0) ? Number((row.centerX - prev.centerX).toFixed(2)) : 0,
                dCenterY: (row.centerY >= 0 && prev.centerY >= 0) ? Number((row.centerY - prev.centerY).toFixed(2)) : 0
            };
        });

        return {
            code: String(code || ''),
            preview,
            cols,
            rows,
            sampleMs,
            durationMs,
            samples: withDeltas
        };
    },

    async profileEffectSignal(code, opts = {}) {
        const profile = await this._qaCollectEffectSignalSamples(code, opts);
        const summary = this._qaSummarizeEffectSignal(profile.samples, {
            id: opts.id,
            section: opts.section,
            control: opts.control,
            name: opts.name
        });
        console.table(profile.samples);
        console.log('[BuilderJSON.profileEffectSignal]', {
            code: String(code || ''),
            preview: profile.preview,
            summary,
            sampleMs: profile.sampleMs,
            durationMs: profile.durationMs,
            samples: profile.samples
        });
        return { ...profile, summary };
    },

    _qaCurrentFormCases() {
        return [
            { id: 'QA-CF-01', section: 'Effect & Timing', control: 'Wait W', name: 'Delayed Start', code: 'W18 Red AL20 AW20 AT40 AH20 W300', durationMs: 1200, sampleMs: 40 },
            { id: 'QA-CF-02', section: 'Effect & Timing', control: 'Fade Up FU', name: 'Fade In Ramp', code: 'Red AL20 AW20 AT40 AH20 FU400', durationMs: 900, sampleMs: 40 },
            { id: 'QA-CF-03', section: 'Effect & Timing', control: 'Fade Down FD', name: 'Fade Out Tail', code: 'Red AL20 AW20 AT40 AH20 FD400', durationMs: 900, sampleMs: 40 },
            { id: 'QA-CF-04', section: 'Effect & Timing', control: 'Fade In F', name: 'Legacy Fade In', code: 'Red AL20 AW20 AT40 AH20 F400', durationMs: 900, sampleMs: 40 },
            { id: 'QA-CF-05', section: 'Effect & Timing', control: 'Duration', name: 'Timed One Shot', code: 'Red AL20 AW20 AT40 AH20 700', durationMs: 1200, sampleMs: 40 },
            { id: 'QA-CF-06', section: 'Effect & Timing', control: 'MAX', name: 'Max Duration Clamp', code: 'Red AL20 AW20 AT40 AH20 MAX600', durationMs: 1100, sampleMs: 40 },
            { id: 'QA-CF-07', section: 'Effect & Timing', control: 'Intensity I', name: 'Half Intensity', code: 'Red AL20 AW20 AT40 AH20 I24', durationMs: 500, sampleMs: 40 },
            { id: 'QA-CF-08', section: 'Area & Motion', control: 'Speed AS', name: 'Smooth Scroll', code: 'Red AL0 AW20 AT40 AH20 ADR AS600', durationMs: 1600, sampleMs: 50 },
            { id: 'QA-CF-09', section: 'Area & Motion', control: 'Step ASS', name: 'Step Shift', code: 'Red AL0 AW20 AT40 AH20 ADR ASS200', durationMs: 1600, sampleMs: 50 },
            { id: 'QA-CF-10', section: 'Area & Motion', control: 'Time ASSMS', name: 'Timed Shift', code: 'Red AL0 AW20 AT40 AH20 ADR ASSMS1200', durationMs: 1800, sampleMs: 50 },
            { id: 'QA-CF-11', section: 'Area & Motion', control: 'Accel ASA+', name: 'Positive Acceleration', code: 'Red AL0 AW20 AT40 AH20 ADR ASS200 ASA50', durationMs: 1800, sampleMs: 50 },
            { id: 'QA-CF-12', section: 'Area & Motion', control: 'Accel ASA-', name: 'Negative Acceleration', code: 'Red AL0 AW20 AT40 AH20 ADR ASS200 ASA-50', durationMs: 1800, sampleMs: 50 },
            { id: 'QA-CF-13', section: 'Sparkle', control: 'AFDEN/AFMIN/AFMAX', name: 'Sparkle Envelope', code: 'Red AL0 AW100 AT40 AH20 AFDEN30 AFMIN100 AFMAX160', durationMs: 1400, sampleMs: 50 },
            { id: 'QA-CF-14', section: 'Sparkle', control: 'AFFADE', name: 'Sparkle Fade', code: 'Red AL0 AW100 AT40 AH20 AFDEN40 AFMIN120 AFMAX120 AFFADE250', durationMs: 1600, sampleMs: 50 }
        ];
    },

    async runCurrentFormQAPack(opts = {}) {
        if (!this.jsonMode || !this.importedToys?.length) {
            throw new Error('JSON mode is not active or no config is imported.');
        }

        const toy = (opts.portId
            ? this.importedToys.find(t => String(t.portId) === String(opts.portId))
            : null) || (opts.toyName
                ? this.importedToys.find(t => String(t.toyName || '').toLowerCase() === String(opts.toyName).toLowerCase())
                : null) || this._resolveDisplayToyForRender() || this._qaFindToyByName(
                    ['Custom MX 1', 'PF Back Effects MX', 'PF Back Effects MX HD'],
                    t => t._display === 'matrix' || t._display === 'both'
                );

        if (!toy) {
            throw new Error('No matrix-capable toy was found. Focus a matrix card or pass { toyName }.');
        }

        const prev = {
            activeToyPort: this._activeToyPort,
            activeTrigger: this._activeTrigger,
            previewScene: Builder._previewScene,
            paused: !!Builder._paused
        };

        const report = {
            build: BUILDER_JSON_BUILD,
            startedAt: new Date().toISOString(),
            toy: { portId: toy.portId, toyName: toy.toyName, display: toy._display },
            tests: []
        };

        try {
            this._setFocus(toy.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
            const cases = this._qaCurrentFormCases();
            for (let i = 0; i < cases.length; i++) {
                const testCase = cases[i];
                this._setStatus(
                    `[Current Form QA ${i + 1}/${cases.length}] ${testCase.id} - ${testCase.name}`,
                    '#00bcd4'
                );
                const profile = await this._qaCollectEffectSignalSamples(testCase.code, {
                    ...opts,
                    toyName: toy.toyName,
                    durationMs: testCase.durationMs,
                    sampleMs: testCase.sampleMs
                });
                const summary = this._qaSummarizeEffectSignal(profile.samples, testCase);
                report.tests.push({
                    id: testCase.id,
                    section: testCase.section,
                    control: testCase.control,
                    name: testCase.name,
                    code: testCase.code,
                    sampleMs: profile.sampleMs,
                    durationMs: profile.durationMs,
                    ...summary
                });
            }
        } finally {
            this._activeToyPort = prev.activeToyPort || '';
            this._activeTrigger = prev.activeTrigger || '';
            this._setPreviewScene(prev.previewScene || null);
            if (prev.previewScene) Builder._resetPreviewTiming();
            if (prev.paused && !Builder._paused) Builder.togglePlayback();
            if (!prev.previewScene) this._setStatus('Current-form QA pack finished.', '#8aacca');
        }

        report.finishedAt = new Date().toISOString();
        console.table(report.tests.map(t => ({
            id: t.id,
            section: t.section,
            control: t.control,
            firstLitAt: t.firstLitAt,
            peakEnergyAt: t.peakEnergyAt,
            lastLitAt: t.lastLitAt,
            peakLit: t.peakLit,
            peakEnergy: t.peakEnergy,
            moveSpanX: t.moveSpanX,
            moveSpanY: t.moveSpanY,
            relightCount: t.relightCount,
            notes: t.notes
        })));
        console.log('[BuilderJSON.runCurrentFormQAPack]', {
            ...report,
            note: 'This is a measurement pass, not a visual demo. It repaints through multiple cases quickly; use profileEffectSignal/profileEffectMotion for a single control test.'
        });
        return report;
    },

    describeBuilderControlGaps() {
        const gaps = [
            {
                parameter: 'ASSMS',
                uiSection: 'AREA & MOTION',
                insertAfter: 'Step ASS',
                controlType: 'Range + number input',
                notes: 'Time in ms to shift through the effect area. Builder runtime already reads #dob-assms if added.'
            },
            {
                parameter: 'ASA',
                uiSection: 'AREA & MOTION',
                insertAfter: 'ASSMS',
                controlType: 'Signed range + number input',
                notes: 'Acceleration/deceleration for shift speed. Needs a negative-capable numeric input and symmetric slider range.'
            },
            {
                parameter: 'Source color authoring',
                uiSection: 'COLOR',
                insertAfter: 'Top of color swatch grid',
                controlType: 'Small toggle / pill',
                notes: 'Not a DOF token. Needed so Builder can omit the color token and preserve source-color bitmap/atlas shape art.'
            },
            {
                parameter: 'ABL / ABT / ABW / ABH / ABF',
                uiSection: 'New BITMAP accordion',
                insertAfter: 'After SHAPES',
                controlType: 'Compact source-frame rows',
                notes: 'Bitmap crop rectangle and base frame selection. Best kept separate from destination area controls.'
            },
            {
                parameter: 'AAC / AAF / AAD / AAS / AAB',
                uiSection: 'New BITMAP accordion',
                insertAfter: 'Below bitmap source-frame rows',
                controlType: 'Animation subgroup with range/number/select controls',
                notes: 'Bitmap animation count, fps, step direction, step size, and behaviour.'
            }
        ];
        console.table(gaps);
        console.log('[BuilderJSON.describeBuilderControlGaps]', gaps);
        return gaps;
    },

    async profileEffectMotion(code, opts = {}) {
        const sampleMs = Math.max(16, Number(opts.sampleMs || 50));
        const durationMs = Math.max(sampleMs * 2, Number(opts.durationMs || 2500));
        const preview = this.previewEffectString(code, opts);
        const cols = Number(Builder?.previewCols || 0);
        const rows = Number(Builder?.previewRows || 0);
        const started = performance.now();
        const samples = [];

        while ((performance.now() - started) < durationMs) {
            const t = performance.now() - started;
            const bounds = this._qaMatrixBoundsFromCache(cols, rows);
            samples.push({
                t: Math.round(t),
                lit: bounds.lit,
                minX: bounds.minX,
                maxX: bounds.maxX,
                spanX: bounds.spanX,
                minY: bounds.minY,
                maxY: bounds.maxY
            });
            await this._qaSleep(sampleMs);
        }

        const deltas = samples.map((row, idx) => {
            if (!idx) return { ...row, dx: 0 };
            const prev = samples[idx - 1];
            return { ...row, dx: (row.minX >= 0 && prev.minX >= 0) ? (row.minX - prev.minX) : 0 };
        });

        console.table(deltas);
        console.log('[BuilderJSON.profileEffectMotion]', {
            code: String(code || ''),
            preview,
            sampleMs,
            durationMs,
            samples: deltas
        });
        return deltas;
    },

    stopMatrixRenderQAPack() {
        this._matrixQARunToken = null;
        this._setStatus('Matrix QA pack stopped.', '#f5a623');
    },

    async runMatrixRenderQAPack(opts = {}) {
        const report = {
            build: BUILDER_JSON_BUILD,
            startedAt: new Date().toISOString(),
            toy: null,
            dwellMs: Math.max(700, Number(opts.dwellMs || 1800)),
            tests: []
        };

        if (!this.jsonMode || !this.importedToys?.length) {
            throw new Error('JSON mode is not active or no config is imported.');
        }

        const toy = (opts.portId
            ? this.importedToys.find(t => String(t.portId) === String(opts.portId))
            : null) || (opts.toyName
                ? this.importedToys.find(t => String(t.toyName || '').toLowerCase() === String(opts.toyName).toLowerCase())
                : null) || this._resolveDisplayToyForRender() || this._qaFindToyByName(
                    ['Custom MX 1', 'PF Back Effects MX', 'PF Back Effects MX HD'],
                    t => t._display === 'matrix' || t._display === 'both'
                );

        if (!toy) {
            throw new Error('No matrix-capable toy was found. Focus a matrix card or pass { toyName }.');
        }
        if (!(toy._display === 'matrix' || toy._display === 'both')) {
            throw new Error('Selected toy is not matrix-capable in the current Builder support model.');
        }

        const runToken = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
        this._matrixQARunToken = runToken;
        report.toy = { portId: toy.portId, toyName: toy.toyName, display: toy._display };

        const prev = {
            activeToyPort: this._activeToyPort,
            activeTrigger: this._activeTrigger,
            previewScene: Builder._previewScene,
            activeSection: Builder.activeSection,
            paused: !!Builder._paused
        };

        const cases = this._qaMatrixRenderCases();

        try {
            this._setFocus(toy.portId, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });

            for (let i = 0; i < cases.length; i++) {
                if (this._matrixQARunToken !== runToken) break;

                const testCase = cases[i];
                const parsed = this._parseEffectString(testCase.code, this._parseContextForToy(toy));
                const scene = this._buildSceneForExplicitLayers(toy, parsed);
                const missingShapes = this._qaMissingShapeNames(parsed);

                this._setPreviewScene(scene);
                Builder._resetPreviewTiming();
                this._activeToyPort = toy.portId;
                this._activeTrigger = parsed[0]?._trigger || '';
                this._setStatus(
                    `[Matrix QA ${i + 1}/${cases.length}] ${testCase.id} - ${testCase.name}`,
                    '#00bcd4'
                );
                console.log(
                    `[Matrix QA ${i + 1}/${cases.length}] ${testCase.id} | ${testCase.name}\n${testCase.code}`
                );

                await this._qaSleep(report.dwellMs);

                report.tests.push({
                    id: testCase.id,
                    name: testCase.name,
                    code: testCase.code,
                    matrixLayers: (scene?.matrixLayers || []).length,
                    litPixels: this._qaMatrixLitPixelCount(),
                    missingShapes
                });
            }
        } finally {
            const completed = this._matrixQARunToken === runToken;
            this._matrixQARunToken = null;

            if (prev.activeSection && prev.activeSection !== Builder.activeSection) {
                this._loadSectionLayers(prev.activeSection);
            }
            this._activeToyPort = prev.activeToyPort;
            this._activeTrigger = prev.activeTrigger;
            if (prev.activeToyPort) {
                this._setFocus(prev.activeToyPort, { preserveTrigger: true, clearPreview: false, skipSectionScroll: true });
            }
            this._setPreviewScene(prev.previewScene || null);
            if (prev.previewScene) Builder._resetPreviewTiming();
            if (prev.paused && !Builder._paused) Builder.togglePlayback();
            this._setStatus(
                completed
                    ? `Matrix QA pack finished for ${toy.toyName}.`
                    : `Matrix QA pack stopped for ${toy.toyName}.`,
                completed ? '#4caf50' : '#f5a623'
            );
        }

        report.finishedAt = new Date().toISOString();
        console.table(report.tests.map(t => ({
            id: t.id,
            litPixels: t.litPixels,
            matrixLayers: t.matrixLayers,
            missingShapes: t.missingShapes.join(', ')
        })));
        console.log('[BuilderJSON Matrix QA]', report);
        return report;
    },

    // Regression harness for JSON mode state interactions.
    // Run from console: await BuilderJSON.runRegressionSuite()
    async runRegressionSuite(opts = {}) {
        const report = {
            build: BUILDER_JSON_BUILD,
            startedAt: new Date().toISOString(),
            tests: []
        };
        const add = (name, pass, details = {}) => report.tests.push({ name, pass: !!pass, details });
        const touchedPorts = new Set();

        if (!this.jsonMode || !this.importedToys?.length) {
            add('Precondition JSON Mode', false, { reason: 'JSON mode is not active or no toys imported' });
            report.finishedAt = new Date().toISOString();
            console.table(report.tests);
            return report;
        }

        const matrixToy = this._qaFindToyByName(
            ['PF Back Effects MX', 'PF Back Effects MX HD'],
            t => t._display === 'matrix' && /back/i.test(String(t.toyName || ''))
        );
        const stripToy = this._qaFindToyByName(
            ['PF Left Effects MX', 'PF Right Effects MX', 'PF Left Effects MX HD', 'PF Right Effects MX HD'],
            t => t._display === 'strip' && /effects/i.test(String(t.toyName || ''))
        );

        add('Toy Discovery', !!(matrixToy && stripToy), {
            matrixToy: matrixToy?.toyName || null,
            stripToy: stripToy?.toyName || null
        });
        if (!matrixToy || !stripToy) {
            report.finishedAt = new Date().toISOString();
            console.table(report.tests);
            return report;
        }

        const stripRoute = this._getEffectiveStripIndices(stripToy, 'qa');
        add('Strip Route Available', Array.isArray(stripRoute) && stripRoute.length > 0, {
            toy: stripToy.toyName,
            route: stripRoute
        });

        const matrixTrigger = opts.matrixTrigger ||
            (matrixToy.layers.find(l => l._trigger)?._trigger) ||
            'W1';
        const stripTrigger = opts.stripTrigger || 'W100';

        try {
            // Scenario 1: matrix fire first
            const matrixBtn = this._findTriggerButton(matrixToy.portId, matrixTrigger);
            this.fireTrigger(matrixToy.portId, matrixTrigger, matrixBtn || null);
            await this._qaSleep(120);
            const matrixScene = Builder._previewScene;
            add('Scenario Matrix Fire', (this._qaSceneSummary(matrixScene).matrixLayers > 0), this._qaSceneSummary(matrixScene));

            // Scenario 2: add strip layer through New Effect flow, then fire strip trigger
            this._startNewEffect(stripToy.portId);
            touchedPorts.add(stripToy.portId);
            const trigInput = document.getElementById('bj-ne-trig');
            const txtInput = document.getElementById('bj-ne-text');
            if (trigInput) trigInput.value = stripTrigger;
            this._newEffectTrigger = stripTrigger;
            if (txtInput) txtInput.value = 'Red AT0 AH100 ADD AS600 L1';
            this._commitNewEffect();
            await this._qaSleep(260);

            const stripBtn = this._findTriggerButton(stripToy.portId, stripTrigger);
            this.fireTrigger(stripToy.portId, stripTrigger, stripBtn || null);
            await this._qaSleep(120);
            const stripScene = Builder._previewScene;
            const stripSummary = this._qaSceneSummary(stripScene);
            add('Scenario Strip Fire After Add', stripSummary.stripBuckets > 0 && stripSummary.unresolved === 0, stripSummary);

            // Scenario 3: color/edit controls should update inserted layer
            const tgtToy = this.importedToys.find(t => t.portId === stripToy.portId);
            const tgtIdx = (tgtToy?.layers || []).findIndex(l => l._trigger === stripTrigger);
            const beforeRaw = (tgtIdx >= 0) ? (tgtToy.layers[tgtIdx]._raw || '') : '';
            Builder._setColor('Blue', '#0000FF');
            await this._qaSleep(80);
            const afterRaw = (tgtIdx >= 0) ? (tgtToy.layers[tgtIdx]._raw || '') : '';
            add('Scenario Control Edit Propagates', (tgtIdx >= 0) && beforeRaw !== afterRaw, {
                targetIdx: tgtIdx,
                beforeRaw,
                afterRaw
            });

            // Scenario 4: reset card, re-add effect, fire again without focus hopping
            this._resetCard(stripToy.portId);
            await this._qaSleep(120);
            this._startNewEffect(stripToy.portId);
            const trigInput2 = document.getElementById('bj-ne-trig');
            const txtInput2 = document.getElementById('bj-ne-text');
            if (trigInput2) trigInput2.value = 'W101';
            this._newEffectTrigger = 'W101';
            if (txtInput2) txtInput2.value = 'Green AT0 AH100 ADD AS650 L1';
            this._commitNewEffect();
            await this._qaSleep(260);
            const stripBtn2 = this._findTriggerButton(stripToy.portId, 'W101');
            this.fireTrigger(stripToy.portId, 'W101', stripBtn2 || null);
            await this._qaSleep(120);
            const stripScene2 = Builder._previewScene;
            const stripSummary2 = this._qaSceneSummary(stripScene2);
            add('Scenario Reset Then Re-Add', stripSummary2.stripBuckets > 0 && stripSummary2.unresolved === 0, stripSummary2);

            // Scenario 5: sync toggle should preserve active preview renderability
            const beforeSync = this._syncActive;
            this.toggleSync();
            await this._qaSleep(80);
            this.toggleSync();
            this._syncActive = beforeSync;
            add('Scenario Sync Toggle Stability', true, { restoredSync: beforeSync });
        } catch (err) {
            add('Regression Runner Execution', false, { error: String(err?.message || err) });
        } finally {
            // Cleanup touched cards back to baseline
            touchedPorts.forEach(pid => this._resetCard(pid));
            if (this._newEffectPort) this._cancelNewEffect(true);
            this._setPreviewScene(null);
            this._setTriggerLinkMode(false);
            this._activeTrigger = null;
            this._stopLatchedLoop();
            this._inPreview = false;
        }

        report.finishedAt = new Date().toISOString();
        report.passed = report.tests.every(t => t.pass);
        const passCount = report.tests.filter(t => t.pass).length;
        console.table(report.tests.map(t => ({ test: t.name, pass: t.pass })));
        console.log('[BuilderJSON QA] ' + passCount + '/' + report.tests.length + ' passed', report);
        return report;
    },

    handleExport() {
        if (!this.importedConfig) { alert('No config loaded.'); return; }
        // BUG FIX: Write back current section AND regenerate ALL section strings
        // to ensure every toy's config reflects the latest sectionLayers data.
        if (Builder.activeSection) this._writeBackLayers(Builder.activeSection);
        this.importedToys.filter(t => !t._previewOnly).forEach(t => this._regenerateSectionString(t.toyName));
        const o = {
            table: this.importedConfig.table || '', type: this.importedConfig.type || 'table_config',
            rom: this.importedConfig.rom || '', rom_aliases: this.importedConfig.rom_aliases || '', config: {}
        };
        this.importedToys.filter(t => !t._previewOnly).forEach(t => {
            const entry = { toy: t.toyName, user: Builder.sectionConfigs[t.toyName] || '' };
            if (this.importFormat === 'public_config' && t.rawPublic !== undefined) entry.public = t.rawPublic;
            o.config[t.portId] = entry;
        });
        const str = JSON.stringify(o, null, 4);
        const name = prompt('Save as:', (o.table || 'config').replace(/\s+/g, '_') + '_config.json');
        if (!name) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([str], { type:'application/json' }));
        a.download = name; a.click(); URL.revokeObjectURL(a.href);
    },

    // 
    //  EXIT
    // 
    exitJsonMode() {
        if (!confirm('Exit JSON mode? Unsaved changes will be lost.')) return;
        if (this._newEffectPort) this._cancelNewEffect();
        this._stopExamplePreview({ restore: false });
        this._unhookGenStr();
        this._setPreviewScene(null);
        if (this.originalSections) {
            Builder.SECTIONS = [...this.originalSections];
            Builder.SINGLE_SECTIONS = [...(this.originalSingleSections || [])];
        }
        this.jsonMode = false; this.importedConfig = null; this.importedToys = [];
        this._stopLatchedLoop();
        this.sectionLayers = {}; this.layerWindow = {}; this.latchedToys = {};
        this._cardSyncState = {};
        this._activeToyPort = null; this._activeTrigger = null; this._cardOrder = null; this._dragSrc = null;
        this._editTargetPort = null; this._editTargetMasterIdx = null;
        this._inPreview = false; this._suppressSync = false; this._triggerScope = null; this._triggerScopeSection = null; this._scopePage = 0; this._syncActive = false;
        this._triggerLinkMode = false; this._triggerLinkPort = null; this._triggerLinkTrigger = null;
       
        // Restore NUM_LAYERS if expanded for preview
        if (this._origNumLayers) {
            Builder.NUM_LAYERS = this._origNumLayers;
            Builder.layers.length = Builder.NUM_LAYERS;
            this._origNumLayers = null;
        }
        Builder.activeSection = Builder.SECTIONS[0] || ''; Builder.sectionConfigs = {};
        Builder._buildSectionBtns(); Builder.renderStaging();
        for (let i = 0; i < Builder.NUM_LAYERS; i++) Builder.layers[i] = Builder._defaultLayer();
        this._rebuildLayerTabs(Builder.NUM_LAYERS);
        Builder.loadLayerToUI(0); Builder._updateTabIndicators(); Builder._updateGenStr();
        this._setStatus('', '#5a7a90');
        ['bjson-export-btn','bjson-exit-btn'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        const nav = document.getElementById('bjson-layer-nav'); if (nav) nav.style.display = 'none';
        const cw = document.getElementById('bjson-card-wrap'); if (cw) { cw.style.display = 'none'; cw.innerHTML = ''; }
        const fb = document.getElementById('bjson-filter-bar'); if (fb) fb.style.display = 'none';
        const lb = document.getElementById('bjson-layout-bar'); if (lb) lb.style.display = 'none';
        const sp = document.getElementById('bjson-support-panel'); if (sp) sp.style.display = 'none';
        const ep = document.getElementById('bjson-examples-palette'); if (ep) ep.style.display = 'none';
        this._hideTableTitle();
        const tib = document.getElementById('bjson-toy-icons'); if (tib) { tib.style.display = 'none'; tib.innerHTML = ''; }
        this._disableVerticalStrips();
        this.clearTableBitmap({ silent: true });
        if (typeof App !== 'undefined' && typeof App._removeWorkspaceSlot === 'function') {
            App._removeWorkspaceSlot('bj-f-json').catch?.(err => {
                console.warn('[BuilderJSON] Could not clear cached imported JSON slot:', err);
            });
        }
        this._bitmapPreviewHold = false;
        this._bitmapPreviewLoop = true;
        this._bitmapPreviewFrame = 0;
        this._bitmapPreviewFrameDirty = false;
        this._bitmapPreviewLayerKey = '';
        this._bitmapInspectorLive = false;
        document.getElementById('dob-view')?.classList.remove('dob-json-mode');
        this._setLegacyExamplesVisibility(false);
        Builder._saveState();
    },

    //  Arrow key navigation for trigger buttons 
    // When a card has trigger buttons visible,   arrow keys step through them.
    // Only active when no text input/select/slider is focused.
    _initTriggerKeyNav() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            // Don't interfere with inputs, sliders, selects, textareas
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            // Find the active card
            const port = this._activeToyPort;
            if (!port) return;
            const card = document.getElementById('bjc-' + port);
            if (!card) return;
            const btns = [...card.querySelectorAll('.bj-trig-btn')];
            if (btns.length < 2) return;
            // Find currently active trigger index
            const activeIdx = btns.findIndex(b => b.classList.contains('bj-trig-active'));
            let nextIdx;
            if (e.key === 'ArrowRight') {
                nextIdx = activeIdx < 0 ? 0 : (activeIdx + 1) % btns.length;
            } else {
                nextIdx = activeIdx < 0 ? btns.length - 1 : (activeIdx - 1 + btns.length) % btns.length;
            }
            e.preventDefault();
            btns[nextIdx].click();
            // Scroll the trigger button into view within the toolbar
            btns[nextIdx].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
    }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => BuilderJSON.init());
else BuilderJSON.init();




























if (typeof window !== 'undefined') {
    window.BuilderJSON = BuilderJSON;
    window.__BuilderJSON = BuilderJSON;
}





























