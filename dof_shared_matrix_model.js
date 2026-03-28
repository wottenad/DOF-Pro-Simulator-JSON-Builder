(function(global) {
    'use strict';

    const DOFShared = global.DOFShared = global.DOFShared || {};
    const util = DOFShared.util || {};
    const Spec = DOFShared.Spec || {};

    function getShapeMap(env) {
        if (env && env.shapes) return env.shapes;
        if (global.App && global.App.data && global.App.data.shapes) return global.App.data.shapes;
        return null;
    }

    function getShapeInfo(layer, env) {
        const key = util.normShapeKey(layer && layer.shp);
        const shapes = getShapeMap(env);
        const shape = key && shapes ? shapes.get(key) : null;
        return {
            key,
            exists: !!shape,
            animated: !!shape?.animated,
            frameCount: Number(shape?.frameCount || 1),
            frameDur: Number(shape?.frameDur || 0),
            stepDir: String(shape?.stepDir || ''),
            stepSize: Number(shape?.stepSize || 0)
        };
    }

    function hasBitmap(layer) {
        const b = layer?.bitmap || {};
        return [b.left, b.top, b.width, b.height, b.frame, b.frameCount, b.frameDelayMs, b.fps, b.stepDirection, b.stepSize, b.offset]
            .some(v => v !== null && v !== undefined && v !== '');
    }

    function capabilityFlags(env) {
        return Object.assign({}, Spec.capabilities || {}, env?.capabilities || {});
    }

    function classifyLayer(layer, env) {
        const caps = capabilityFlags(env);
        const shapeInfo = getShapeInfo(layer, env);
        const bitmap = hasBitmap(layer);
        const gaps = [];
        let family = 'areaFill';
        let label = 'RGBA Matrix Area/Shift Effect';

        if (bitmap) {
            const animatedBitmap = (layer.bitmap?.frameCount || 0) > 1 ||
                (layer.bitmap?.frameDelayMs || 0) > 0 ||
                (layer.bitmap?.fps || 0) > 0 ||
                !!layer.bitmap?.stepDirection ||
                !!layer.bitmap?.stepSize ||
                !!layer.bitmap?.behaviour;
            family = layer._colorExplicit
                ? 'colorScaleBitmap'
                : (animatedBitmap ? 'bitmapAnimation' : 'bitmapFrame');
            label = layer._colorExplicit
                ? 'RGBA Matrix Color Scale Bitmap Effect'
                : (animatedBitmap
                    ? 'RGBA Matrix Bitmap Animation Effect'
                    : 'RGBA Matrix Bitmap Effect');
            if (!caps.bitmapInLiveRenderer || !caps.bitmapInBuilderRenderer) {
                gaps.push('Bitmap-family effects are not yet routed through one shared live/builder evaluator.');
            }
        } else if (layer?.shp) {
            family = layer._colorExplicit ? 'colorScaleShape' : 'shape';
            label = layer._colorExplicit
                ? 'RGBA Matrix Color Scale Shape Effect'
                : 'RGBA Matrix Shape Effect';
            if (!layer._colorExplicit && !caps.sourceColorShapes) {
                gaps.push('Source-color shape rendering is not yet separated from color-scaled shape rendering.');
            }
            if (shapeInfo.animated && !caps.animationBehaviour) {
                gaps.push('Animated shape playback does not yet model all DirectOutput animation behaviour metadata.');
            }
            if (shapeInfo.animated && !caps.dataExtractMode) {
                gaps.push('Animated shape extraction does not yet expose DirectOutput data extract mode semantics.');
            }
        } else if ((layer?.effect || '').toLowerCase() === 'plasma') {
            family = 'areaFill';
            label = 'RGBA Matrix Area/Shift Effect';
        }

        if ((layer?.ass || 0) > 0 && !caps.assMs) {
            gaps.push('ASS speed tokens are parsed, but ASSMS timing semantics are not yet implemented in the shared evaluator.');
        }
        if (layer?.assMs > 0 && !caps.assMs) {
            gaps.push('ASSMS timing is documented but not yet implemented in the shared evaluator.');
        }
        if (layer?.asa && !caps.asa) {
            gaps.push('ASA direction/animation semantics are not yet implemented in the shared evaluator.');
        }
        if (((layer?.as || 0) > 0 || (layer?.ass || 0) > 0 || (layer?.assMs || 0) > 0 || (layer?.asa || 0) !== 0) && layer?.dir && !caps.docFaithfulShiftMotion) {
            gaps.push('Moving matrix effects still use legacy wrap-style shift motion instead of a documented DirectOutput-faithful shift model.');
        }

        return {
            family,
            documentedFamily: label,
            support: gaps.length ? 'partial' : 'implemented',
            shape: shapeInfo,
            bitmap,
            gaps
        };
    }

    function summarizeLayers(layers, env) {
        const entries = (Array.isArray(layers) ? layers : []).map((layer, idx) => {
            const model = classifyLayer(layer, env);
            return {
                index: idx,
                trigger: String(layer?._trigger || ''),
                color: String(layer?.color || layer?.colorToken || ''),
                effect: String(layer?.effect || ''),
                family: model.family,
                documentedFamily: model.documentedFamily,
                support: model.support,
                shape: model.shape.key || '',
                animatedShape: model.shape.animated,
                bitmap: model.bitmap,
                gaps: model.gaps
            };
        });

        const counts = {};
        entries.forEach(entry => {
            counts[entry.family] = (counts[entry.family] || 0) + 1;
        });

        return {
            entries,
            counts,
            documentedFamilies: Spec.documentedMatrixFamilies || []
        };
    }

    DOFShared.MatrixModel = {
        classifyLayer,
        summarizeLayers,
        getShapeInfo
    };
    DOFShared.modules.matrixModel = { version: DOFShared.version, build: DOFShared.build };
})(window);
