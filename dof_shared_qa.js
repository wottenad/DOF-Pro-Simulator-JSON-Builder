(function(global) {
    'use strict';

    const DOFShared = global.DOFShared = global.DOFShared || {};

    function parser() {
        return DOFShared.Parser;
    }

    function model() {
        return DOFShared.MatrixModel;
    }

    function parseCodeString(code, opts) {
        if (!parser()) throw new Error('DOFShared.Parser is not available.');
        const normalized = String(code || '').includes(',')
            ? String(code).split(/,(?![^(]*\))/).join('/')
            : String(code || '');
        return parser().parseEffectString(normalized, opts || {});
    }

    function summarize(layers, env) {
        if (!model()) throw new Error('DOFShared.MatrixModel is not available.');
        return model().summarizeLayers(layers, env || {});
    }

    function printSummary(summary) {
        const rows = summary.entries.map(entry => ({
            index: entry.index,
            trigger: entry.trigger,
            color: entry.color,
            effect: entry.effect,
            family: entry.family,
            support: entry.support,
            shape: entry.shape,
            animatedShape: entry.animatedShape ? 'yes' : '',
            bitmap: entry.bitmap ? 'yes' : '',
            gaps: entry.gaps.join(' | ')
        }));
        console.table(rows);
        console.log('[DOFSharedQA] family counts', summary.counts);
        return summary;
    }

    function defaultBuilderParseOpts() {
        if (!global.BuilderJSON) return {};
        const activeToyPort = global.BuilderJSON._activeToyPort;
        const toy = Array.isArray(global.BuilderJSON.importedToys)
            ? global.BuilderJSON.importedToys.find(t => String(t.portId) === String(activeToyPort))
            : null;
        return {
            toyName: toy?.toyName || '',
            toyType: toy ? global.BuilderJSON._inferToyType?.(toy.toyName, toy.portId) : '',
            portId: toy?.portId || '',
            isStrobeContext: !!(toy && global.BuilderJSON._isStrobeToy?.(toy)),
            resolveHex: global.BuilderJSON?._resolveHex?.bind(global.BuilderJSON)
        };
    }

    function atlasCtx() {
        const atlas = global.App?.data?.shapeAtlas;
        if (!atlas) return null;
        return atlas?.getContext ? atlas.getContext('2d') : atlas;
    }

    function shapeInfo(rawShape) {
        const key = DOFShared.util?.normShapeKey ? DOFShared.util.normShapeKey(rawShape) : String(rawShape || '').trim().toLowerCase().replace(/^shp/, '');
        const shape = global.App?.data?.shapes?.get?.(key);
        return { key, shape };
    }

    function frameRectForShape(shape) {
        return {
            x: Number(shape?.x || 0),
            y: Number(shape?.y || 0),
            w: Math.max(1, Number(shape?.w || 1)),
            h: Math.max(1, Number(shape?.h || 1))
        };
    }

    function summarizeShapePixels(imageData) {
        const data = imageData?.data;
        if (!data?.length) {
            return {
                litPixels: 0,
                uniqueRgbCount: 0,
                grayscaleOnly: false,
                whiteOnly: false,
                topColors: []
            };
        }
        const counts = new Map();
        let litPixels = 0;
        let grayscaleOnly = true;
        let whiteOnly = true;
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a <= 0) continue;
            litPixels++;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (!(r === g && g === b)) grayscaleOnly = false;
            if (!(r === 255 && g === 255 && b === 255)) whiteOnly = false;
            const key = r + ',' + g + ',' + b;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        const topColors = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([rgb, count]) => ({ rgb, count }));
        return {
            litPixels,
            uniqueRgbCount: counts.size,
            grayscaleOnly: litPixels > 0 ? grayscaleOnly : false,
            whiteOnly: litPixels > 0 ? whiteOnly : false,
            topColors
        };
    }

    const QA = {
        help() {
            console.log('DOFSharedQA commands:');
            console.log('  DOFSharedQA.describeEffect("S1 Red AL0 AW100 AT40 AH20 ADR AS200")');
            console.log('  DOFSharedQA.auditCodeString(codeString)');
            console.log('  DOFSharedQA.auditCurrentTable()');
            console.log('  DOFSharedQA.auditBuilderGenStr()');
            console.log('  DOFSharedQA.pipelineStatus()');
            console.log('  DOFSharedQA.inspectShapeAtlas("SHPAcdc")');
            return true;
        },

        pipelineStatus() {
            console.table([DOFShared.Spec?.capabilities || {}]);
            return DOFShared.Spec?.capabilities || {};
        },

        describeEffect(raw, opts) {
            const layers = parseCodeString(raw, opts || defaultBuilderParseOpts());
            return printSummary(summarize(layers));
        },

        auditCodeString(code, opts) {
            const layers = parseCodeString(code, opts || defaultBuilderParseOpts());
            return printSummary(summarize(layers));
        },

        auditCurrentTable() {
            const el = document.getElementById('code-monitor');
            const code = el ? (el.innerText || el.textContent || '') : '';
            if (!code.trim()) throw new Error('No table code is loaded in #code-monitor.');
            return this.auditCodeString(code);
        },

        auditBuilderGenStr() {
            const el = document.getElementById('dob-genstr');
            const code = el ? (el.innerText || el.textContent || '') : '';
            if (!code.trim()) throw new Error('No Builder generated string is available.');
            return this.auditCodeString(code, defaultBuilderParseOpts());
        },

        inspectShapeAtlas(rawShape) {
            const ctx = atlasCtx();
            if (!ctx?.canvas) throw new Error('Shape atlas is not loaded.');
            const { key, shape } = shapeInfo(rawShape);
            if (!shape) throw new Error('Shape not found in loaded shape pack: ' + rawShape);
            const rect = frameRectForShape(shape);
            const frame = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
            const summary = summarizeShapePixels(frame);
            const report = {
                input: String(rawShape || ''),
                key,
                animated: !!shape.animated,
                dataExtractMode: shape.dataExtractMode || '',
                animationBehaviour: shape.animationBehaviour || '',
                frameRect: rect,
                litPixels: summary.litPixels,
                uniqueRgbCount: summary.uniqueRgbCount,
                grayscaleOnly: summary.grayscaleOnly,
                whiteOnly: summary.whiteOnly,
                topColors: summary.topColors
            };
            console.log('[DOFSharedQA.inspectShapeAtlas]', report);
            console.table(summary.topColors);
            return report;
        }
    };

    global.DOFSharedQA = QA;
    DOFShared.QA = QA;
    DOFShared.modules.qa = { version: DOFShared.version, build: DOFShared.build };
})(window);
