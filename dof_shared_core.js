(function(global) {
    'use strict';

    const DOFShared = global.DOFShared || {};
    const VERSION = '0.1.0';
    const BUILD = '2026-03-15a';

    DOFShared.version = VERSION;
    DOFShared.build = BUILD;
    DOFShared.modules = DOFShared.modules || {};
    DOFShared.util = DOFShared.util || {};
    DOFShared.Spec = DOFShared.Spec || {};

    DOFShared.util.splitEffectSegments = function(str) {
        if (!str || !String(str).trim()) return [];
        return String(str)
            .replace(/\\\//g, '\x00')
            .split('/')
            .map(s => s.replace(/\x00/g, '/').trim())
            .filter(Boolean);
    };

    DOFShared.util.clamp = function(value, min, max) {
        const num = Number(value);
        if (!Number.isFinite(num)) return min;
        return Math.max(min, Math.min(max, num));
    };

    DOFShared.util.toInt = function(value, fallback) {
        const num = parseInt(value, 10);
        return Number.isFinite(num) ? num : fallback;
    };

    DOFShared.util.normalizeDir = function(token) {
        const upper = String(token || '').toUpperCase();
        if (!upper) return '';
        return upper.replace(/^ASD/, 'AD');
    };

    DOFShared.util.normShapeKey = function(raw) {
        const shape = String(raw || '').trim().toLowerCase();
        return shape.startsWith('shp') ? shape.slice(3) : shape;
    };

    DOFShared.Spec.documentedMatrixFamilies = [
        { key: 'areaFill', label: 'RGBA Matrix Area/Shift Effect' },
        { key: 'shape', label: 'RGBA Matrix Shape Effect' },
        { key: 'colorScaleShape', label: 'RGBA Matrix Color Scale Shape Effect' },
        { key: 'bitmapFrame', label: 'RGBA Matrix Bitmap Effect' },
        { key: 'bitmapAnimation', label: 'RGBA Matrix Bitmap Animation Effect' },
        { key: 'colorScaleBitmap', label: 'RGBA Matrix Color Scale Bitmap Effect' }
    ];

    DOFShared.Spec.capabilities = {
        sharedParser: true,
        sharedLiveRenderer: false,
        sharedBuilderRenderer: false,
        animationBehaviour: false,
        dataExtractMode: false,
        sourceColorShapes: false,
        bitmapInLiveRenderer: false,
        bitmapInBuilderRenderer: false,
        assMs: false,
        asa: false,
        unifiedFrameEvaluator: false,
        docFaithfulShiftMotion: false
    };

    global.__DOF_BUILD_INFO = global.__DOF_BUILD_INFO || {};
    global.__DOF_BUILD_INFO.dof_shared_core = {
        version: VERSION,
        build: BUILD,
        file: 'dof_shared_core.js'
    };

    DOFShared.modules.core = { version: VERSION, build: BUILD };
    global.DOFShared = DOFShared;
})(window);
