(function(global) {
    'use strict';

    const DOFShared = global.DOFShared = global.DOFShared || {};
    const util = DOFShared.util || {};

    function normalizeDir(layer) {
        if (layer?.dir) return String(layer.dir).toUpperCase();
        if (layer?.adDirX === 1) return 'ADR';
        if (layer?.adDirX === -1) return 'ADL';
        if (layer?.adDirY === 1) return 'ADD';
        if (layer?.adDirY === -1) return 'ADU';
        return '';
    }

    function normalizeShape(layer) {
        return String(layer?.shp || layer?.shapeName || '').trim();
    }

    function normalizeHex(layer) {
        const raw = String(layer?.hex || layer?.color || '#000000');
        return raw.startsWith('#') ? raw : raw;
    }

    function intensityScaleFromToken(token) {
        if (typeof token === 'string' && /^#[0-9a-f]{6}$/i.test(token)) {
            const n = parseInt(token.slice(1), 16);
            const r = (n >> 16) & 255;
            const g = (n >> 8) & 255;
            const b = n & 255;
            return Math.max(r, g, b) / 255;
        }
        const num = Number(token);
        if (!Number.isFinite(num)) return 1;
        return util.clamp(num, 0, 48) / 48;
    }

    function hexToRgb(hex) {
        const safe = String(hex || '#000000').replace('#', '');
        const full = safe.length === 3 ? safe.split('').map(c => c + c).join('') : safe.padEnd(6, '0').slice(0, 6);
        const n = parseInt(full, 16);
        if (!Number.isFinite(n)) return [0, 0, 0];
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function cyclePeriod(layer) {
        const effect = String(layer?.effect || '').toLowerCase();
        if (effect === 'blink' || layer?.blink) return Math.max(50, Number(layer?.blink || 200) * 2);
        if (effect === 'pulse') return Math.max(100, Number(layer?.fu || 0) + Number(layer?.fd || 0) || 1200);
        if (effect === 'plasma') return Math.max(300, Number(layer?.plasmaSpeed || 100) * 8);
        const dur = Number(layer?.duration ?? layer?.dur ?? 0);
        return Math.max(500, Number(layer?.fu || 0) + Number(layer?.fd || 0) || (dur > 0 ? dur + 200 : 2000));
    }

    function elapsedForLayer(layer, now, baseStartTime) {
        if (layer && typeof layer.startTime === 'number') {
            if (now < layer.startTime) return { active: false, elapsedMs: 0 };
            return { active: true, elapsedMs: now - layer.startTime };
        }
        const wait = Number(layer?.wait || 0);
        const base = Number(baseStartTime || now);
        const elapsed = now - base;
        if (elapsed < wait) return { active: false, elapsedMs: 0 };
        return { active: true, elapsedMs: elapsed - wait };
    }

    function shiftBaseSpeedPctPerSec(layer) {
        if (Number(layer?.assMs || 0) > 0) {
            return util.clamp(100000 / Number(layer.assMs), 1, 10000);
        }
        if (Number(layer?.ass || 0) > 0) {
            return util.clamp(Number(layer.ass), 1, 10000);
        }
        if (Number(layer?.as || 0) > 0) {
            return util.clamp(Number(layer.as) * 0.1, 1, 10000);
        }
        return 0;
    }

    function usesAreaRelativeShift(layer) {
        return Number(layer?.assMs || 0) > 0 || Number(layer?.ass || 0) > 0;
    }

    function shiftReferenceSpanPx(layer, matrixSpan, areaSpan) {
        if (usesAreaRelativeShift(layer)) return Math.max(1, areaSpan);
        if (Number(layer?.as || 0) > 0) return Math.max(1, matrixSpan);
        return Math.max(1, areaSpan);
    }

    function shiftSpeedPctPerSecAtTime(layer, elapsedMs) {
        const baseSpeed = shiftBaseSpeedPctPerSec(layer);
        const accelPctPerSecSq = Number(layer?.asa || 0);
        if (!(baseSpeed > 0)) return 0;
        if (!Number.isFinite(accelPctPerSecSq) || accelPctPerSecSq === 0) return baseSpeed;
        const elapsedSec = Math.max(0, Number(elapsedMs || 0)) / 1000;
        return util.clamp(baseSpeed + (accelPctPerSecSq * elapsedSec), 1, 10000);
    }

    function shiftDistancePct(layer, elapsedMs) {
        const elapsedSec = Math.max(0, Number(elapsedMs || 0)) / 1000;
        const baseSpeed = shiftBaseSpeedPctPerSec(layer);
        if (!(baseSpeed > 0)) return 0;

        const accelPctPerSecSq = Number(layer?.asa || 0);
        if (!Number.isFinite(accelPctPerSecSq) || accelPctPerSecSq === 0) {
            return baseSpeed * elapsedSec;
        }

        if (accelPctPerSecSq > 0) {
            const capSec = (10000 - baseSpeed) / accelPctPerSecSq;
            if (elapsedSec <= capSec) {
                return (baseSpeed * elapsedSec) + (0.5 * accelPctPerSecSq * elapsedSec * elapsedSec);
            }
            const cappedDist = (baseSpeed * capSec) + (0.5 * accelPctPerSecSq * capSec * capSec);
            return cappedDist + ((elapsedSec - capSec) * 10000);
        }

        const floorSec = (baseSpeed - 1) / Math.abs(accelPctPerSecSq);
        if (elapsedSec <= floorSec) {
            return (baseSpeed * elapsedSec) + (0.5 * accelPctPerSecSq * elapsedSec * elapsedSec);
        }
        const flooredDist = (baseSpeed * floorSec) + (0.5 * accelPctPerSecSq * floorSec * floorSec);
        return flooredDist + (elapsedSec - floorSec);
    }

    function motionOffsetAtTime(layer, elapsedMs, matrixSpanX, matrixSpanY, areaSpanX, areaSpanY, isSingle) {
        if (!(layer?.as || layer?.ass || layer?.assMs || layer?.asa) || isSingle) return { ox: 0, oy: 0 };
        const distPct = shiftDistancePct(layer, elapsedMs);
        const dxPx = (distPct / 100) * shiftReferenceSpanPx(layer, matrixSpanX, areaSpanX);
        const dyPx = (distPct / 100) * shiftReferenceSpanPx(layer, matrixSpanY, areaSpanY);
        const dir = normalizeDir(layer);
        if (dir === 'ADR') return { ox: dxPx, oy: 0 };
        if (dir === 'ADL') return { ox: -dxPx, oy: 0 };
        if (dir === 'ADD') return { ox: 0, oy: dyPx };
        if (dir === 'ADU') return { ox: 0, oy: -dyPx };
        if (dxPx > 0) return { ox: dxPx, oy: 0 };
        return { ox: 0, oy: 0 };
    }

    function wrapTravelPos(pos, min, maxExclusive) {
        const range = maxExclusive - min;
        if (!(range > 0)) return pos;
        return (((pos - min) % range) + range) % range + min;
    }

    function hasBitmap(layer) {
        const b = layer?.bitmap || {};
        return [b.left, b.top, b.width, b.height, b.frame, b.frameCount, b.frameDelayMs, b.fps, b.stepDirection, b.stepSize]
            .some(v => v !== null && v !== undefined && v !== '');
    }

    function getBitmapFrames(env) {
        return env?.bitmapFrames || global.App?.data?.animSim?.gifFrames || null;
    }

    function defaultBitmapWidth(env, frame) {
        return Number(env?.bitmapWidth || frame?.width || global.App?.data?.animSim?.gifWidth || 0);
    }

    function defaultBitmapHeight(env, frame) {
        return Number(env?.bitmapHeight || frame?.height || global.App?.data?.animSim?.gifHeight || 0);
    }

    function bitmapFrameDurationMs(bitmap) {
        if (Number(bitmap?.fps || 0) > 0) return Math.max(1, 1000 / Number(bitmap.fps));
        if (Number(bitmap?.frameDelayMs || 0) > 0) return Math.max(1, Number(bitmap.frameDelayMs));
        return 100;
    }

    function bitmapAnimationStep(layer, now, elapsedMs) {
        const bitmap = layer?.bitmap || {};
        const frameCount = Math.max(1, Number(bitmap.frameCount || 1));
        if (frameCount <= 1) return 0;
        const frameDur = bitmapFrameDurationMs(bitmap);
        const behaviour = String(bitmap.behaviour || 'L').trim().toUpperCase();
        const rawStep = Math.floor(Math.max(0, behaviour === 'C' ? now : elapsedMs) / frameDur);
        if (behaviour === 'O') return Math.min(frameCount - 1, rawStep);
        return ((rawStep % frameCount) + frameCount) % frameCount;
    }

    function resolveBitmapSource(layer, now, elapsedMs, env) {
        const frames = getBitmapFrames(env);
        if (!frames?.length) return null;

        const bitmap = layer?.bitmap || {};
        const baseFrame = Math.max(0, Number(bitmap.frame || 0));
        const stepIndex = bitmapAnimationStep(layer, now, elapsedMs);
        const stepDir = String(bitmap.stepDirection || 'F').trim().toUpperCase();
        const stepSize = Math.max(1, Number(bitmap.stepSize || 1));

        let frameIndex = baseFrame;
        if (stepDir === 'F') frameIndex = baseFrame + (stepIndex * stepSize);
        frameIndex = util.clamp(frameIndex, 0, frames.length - 1);

        const frame = frames[frameIndex];
        if (!frame?.data) return null;

        const sourceW = Math.max(1, defaultBitmapWidth(env, frame));
        const sourceH = Math.max(1, defaultBitmapHeight(env, frame));
        let srcX = Number(bitmap.left ?? 0);
        let srcY = Number(bitmap.top ?? 0);
        if (stepDir === 'L') srcX -= stepIndex * stepSize;
        else if (stepDir === 'D') srcY += stepIndex * stepSize;

        return {
            frame,
            sourceW,
            sourceH,
            srcX,
            srcY,
            srcW: Math.max(1, Number(bitmap.width || sourceW)),
            srcH: Math.max(1, Number(bitmap.height || sourceH))
        };
    }

    function sampleBitmapPixel(bitmapSource, dx, dy, areaW, areaH, trim) {
        if (!bitmapSource?.frame?.data) return null;
        const srcW = Math.max(1, bitmapSource.srcW);
        const srcH = Math.max(1, bitmapSource.srcH);
        const data = bitmapSource.frame.data;
        const trimNorm = Number.isFinite(Number(trim)) ? util.clamp(Number(trim), 0, 1) : 0.55;
        // Preview trim is intentionally one-directional:
        // 0   = no extra edge trimming beyond the base area/core sampler
        // 100 = aggressively trim softer edge pixels to hew closer to the source glyph
        const strongAlphaGate = util.clamp(16 + (trimNorm * 42), 10, 58);
        const strongLitGate = util.clamp(12 + (trimNorm * 36), 8, 48);
        const coreMixTarget = util.clamp(0.82 - (trimNorm * 0.42), 0.30, 0.82);
        const preserveCap = util.clamp(0.22 - (trimNorm * 0.18), 0.01, 0.22);
        const outAlphaGate = util.clamp(8 + (trimNorm * 52), 4, 60);
        const outLitGate = util.clamp(6 + (trimNorm * 40), 4, 46);
        const safeAreaW = Math.max(1, areaW);
        const safeAreaH = Math.max(1, areaH);
        const sx0 = bitmapSource.srcX + ((Math.max(0, Number(dx || 0)) * srcW) / safeAreaW);
        const sx1 = bitmapSource.srcX + (((Math.max(0, Number(dx || 0)) + 1) * srcW) / safeAreaW);
        const sy0 = bitmapSource.srcY + ((Math.max(0, Number(dy || 0)) * srcH) / safeAreaH);
        const sy1 = bitmapSource.srcY + (((Math.max(0, Number(dy || 0)) + 1) * srcH) / safeAreaH);
        const ix0 = Math.floor(sx0);
        const ix1 = Math.ceil(sx1) - 1;
        const iy0 = Math.floor(sy0);
        const iy1 = Math.ceil(sy1) - 1;

        let sumWeight = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumA = 0;
        let strongWeight = 0;
        let strongR = 0;
        let strongG = 0;
        let strongB = 0;
        let strongA = 0;
        let peakAlpha = 0;
        let peakRgb = [0, 0, 0];

        for (let sy = iy0; sy <= iy1; sy++) {
            if (sy < 0 || sy >= bitmapSource.sourceH) continue;
            const oy = Math.max(0, Math.min(sy + 1, sy1) - Math.max(sy, sy0));
            if (oy <= 0) continue;
            for (let sx = ix0; sx <= ix1; sx++) {
                if (sx < 0 || sx >= bitmapSource.sourceW) continue;
                const ox = Math.max(0, Math.min(sx + 1, sx1) - Math.max(sx, sx0));
                const weight = ox * oy;
                if (weight <= 0) continue;
                const idx = ((sy * bitmapSource.sourceW) + sx) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                const alphaNorm = a / 255;
                const lit = Math.max(r, g, b) * alphaNorm;
                sumWeight += weight;
                sumR += r * weight;
                sumG += g * weight;
                sumB += b * weight;
                sumA += a * weight;
                if (a >= strongAlphaGate && lit >= strongLitGate) {
                    const effective = weight * Math.max(0.18, alphaNorm);
                    strongWeight += effective;
                    strongR += r * effective;
                    strongG += g * effective;
                    strongB += b * effective;
                    strongA += a * effective;
                }
                if (a > peakAlpha) {
                    peakAlpha = a;
                    peakRgb = [r, g, b];
                }
            }
        }

        if (!(sumWeight > 0)) return null;

        const avgR = sumR / sumWeight;
        const avgG = sumG / sumWeight;
        const avgB = sumB / sumWeight;
        const avgA = sumA / sumWeight;
        const coreR = strongWeight > 0 ? (strongR / strongWeight) : avgR;
        const coreG = strongWeight > 0 ? (strongG / strongWeight) : avgG;
        const coreB = strongWeight > 0 ? (strongB / strongWeight) : avgB;
        const coreA = strongWeight > 0 ? (strongA / strongWeight) : avgA;

        // Blend the full-area average with a stronger alpha/luma-gated core sample.
        // This keeps thin strokes from vanishing while discarding the dim fringe haze
        // that can otherwise appear as flickering dark halos around glyph edges.
        const coreMix = strongWeight > 0 ? coreMixTarget : 0;
        const mixedR = (avgR * (1 - coreMix)) + (coreR * coreMix);
        const mixedG = (avgG * (1 - coreMix)) + (coreG * coreMix);
        const mixedB = (avgB * (1 - coreMix)) + (coreB * coreMix);
        const mixedA = (avgA * (1 - coreMix)) + (coreA * coreMix);

        // Small peak bias still helps preserve very thin lit strokes, but keep it subtle
        // so isolated dark/low-alpha edge noise does not bloom into visible halos.
        const preserveMix = util.clamp((peakAlpha - mixedA) / 255, 0, preserveCap);
        const out = {
            r: (mixedR * (1 - preserveMix)) + (peakRgb[0] * preserveMix),
            g: (mixedG * (1 - preserveMix)) + (peakRgb[1] * preserveMix),
            b: (mixedB * (1 - preserveMix)) + (peakRgb[2] * preserveMix),
            a: (mixedA * (1 - preserveMix)) + (peakAlpha * preserveMix)
        };
        const outLit = Math.max(out.r || 0, out.g || 0, out.b || 0) * ((out.a || 0) / 255);
        if ((out.a || 0) < outAlphaGate || outLit < outLitGate) return null;
        return out;
    }

    function tintSourceRgb(pixel, targetR, targetG, targetB, alpha, scale, opacity) {
        const chanScaleR = util.clamp(targetR / 255, 0, 1) * scale * opacity * alpha;
        const chanScaleG = util.clamp(targetG / 255, 0, 1) * scale * opacity * alpha;
        const chanScaleB = util.clamp(targetB / 255, 0, 1) * scale * opacity * alpha;
        return {
            r: pixel.r * chanScaleR,
            g: pixel.g * chanScaleG,
            b: pixel.b * chanScaleB
        };
    }

    function plasmaTime(layer, tMs) {
        const speed = Math.max(1, Number(layer?.plasmaSpeed || 100)) / 60;
        const safeMs = ((Math.max(0, Number(tMs || 0)) % 600000) + 600000) % 600000;
        return (safeMs / 1000) * speed;
    }

    function plasmaFactor(layer, dx, dy, areaW, areaH, tMs) {
        const density = Math.max(1, Number(layer?.plasmaDensity ?? 100));
        const scale = Math.max(6, density * 0.32);
        const nx = (dx / Math.max(1, areaW)) * scale;
        const ny = (dy / Math.max(1, areaH)) * scale;
        const t = plasmaTime(layer, tMs);
        const v =
            Math.sin(nx + t) +
            Math.sin(ny - t * 0.8) +
            Math.sin((nx + ny + t * 0.6) * 0.7) +
            Math.sin(Math.sqrt(nx * nx + ny * ny + 1) - t * 1.2);
        return Math.max(0, Math.min(1, (v + 4) / 8));
    }

    function animationFrameForShape(shape, now, elapsedMs) {
        if (!shape?.animated || Number(shape?.frameCount || 1) <= 1) return 0;
        const frameCount = Math.max(1, Number(shape.frameCount || 1));
        const frameDur = Math.max(1, Number(shape.frameDur || 40));
        const behaviour = String(shape.animationBehaviour || 'Loop').toLowerCase();

        if (behaviour === 'once') {
            return Math.min(frameCount - 1, Math.floor(Math.max(0, elapsedMs) / frameDur));
        }
        if (behaviour === 'continue') {
            return Math.floor(Math.max(0, now) / frameDur) % frameCount;
        }
        return Math.floor(Math.max(0, elapsedMs) / frameDur) % frameCount;
    }

    function atlasFrameRect(shape, now, elapsedMs) {
        const frame = animationFrameForShape(shape, now, elapsedMs);
        const stepDir = String(shape?.stepDir || 'Right').toLowerCase();
        const stepSize = Number(shape?.stepSize || 0);
        let srcX = Number(shape?.x || 0);
        let srcY = Number(shape?.y || 0);

        if (stepDir === 'down') srcY += frame * stepSize;
        else if (stepDir === 'up') srcY -= frame * stepSize;
        else if (stepDir === 'left') srcX -= frame * stepSize;
        else srcX += frame * stepSize;

        return {
            x: srcX,
            y: srcY,
            w: Math.max(1, Number(shape?.w || 1)),
            h: Math.max(1, Number(shape?.h || 1))
        };
    }

    function getAtlasPixels(atlas) {
        if (!atlas) return null;
        const ctx = atlas?.getContext ? atlas.getContext('2d') : atlas;
        const canvas = ctx?.canvas || atlas?.canvas || atlas;
        if (!ctx || !canvas) return null;

        const cache = ctx.__dofSharedAtlasPixels;
        if (cache && cache.width === canvas.width && cache.height === canvas.height) return cache;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const next = { width: canvas.width, height: canvas.height, data: imageData.data };
        ctx.__dofSharedAtlasPixels = next;
        return next;
    }

    function sampleAtlasRgba(atlasPixels, x, y) {
        if (!atlasPixels) return null;
        const px = util.clamp(Math.floor(x), 0, atlasPixels.width - 1);
        const py = util.clamp(Math.floor(y), 0, atlasPixels.height - 1);
        const idx = ((py * atlasPixels.width) + px) * 4;
        const data = atlasPixels.data;
        return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3]
        };
    }

    function litValueFromRgba(sample) {
        if (!sample) return 0;
        const alpha = (sample.a || 0) / 255;
        if (alpha <= 0) return 0;
        return Math.max(sample.r || 0, sample.g || 0, sample.b || 0) * alpha;
    }

    function sampleAtlasPixel(atlasPixels, x, y) {
        return litValueFromRgba(sampleAtlasRgba(atlasPixels, x, y));
    }

    function rasterizeBlendPixels(areaW, areaH, frameRect, canvasSource) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(1, areaW);
        tempCanvas.height = Math.max(1, areaH);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.clearRect(0, 0, areaW, areaH);
        tempCtx.drawImage(
            canvasSource,
            frameRect.x, frameRect.y, frameRect.w, frameRect.h,
            0, 0, areaW, areaH
        );
        return tempCtx.getImageData(0, 0, areaW, areaH).data;
    }

    function averageAtlasWindowRgba(atlasPixels, sx0, sy0, sx1, sy1) {
        const xStart = Math.floor(sx0);
        const xEnd = Math.max(xStart, Math.ceil(sx1) - 1);
        const yStart = Math.floor(sy0);
        const yEnd = Math.max(yStart, Math.ceil(sy1) - 1);
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let totalA = 0;
        let count = 0;
        for (let sy = yStart; sy <= yEnd; sy++) {
            for (let sx = xStart; sx <= xEnd; sx++) {
                const sample = sampleAtlasRgba(atlasPixels, sx, sy);
                if (!sample) continue;
                totalR += sample.r;
                totalG += sample.g;
                totalB += sample.b;
                totalA += sample.a;
                count++;
            }
        }
        if (!count) return sampleAtlasRgba(atlasPixels, sx0, sy0);
        return {
            r: totalR / count,
            g: totalG / count,
            b: totalB / count,
            a: totalA / count
        };
    }

    function extractPixelsFromAtlas(shape, areaW, areaH, frameRect, atlasPixels, canvasSource) {
        const mode = String(shape?.dataExtractMode || 'BlendPixels').toLowerCase();
        if (mode === 'blendpixels' && canvasSource) {
            return rasterizeBlendPixels(areaW, areaH, frameRect, canvasSource);
        }
        const pixels = new Uint8ClampedArray(areaW * areaH * 4);
        const srcW = Math.max(1, frameRect.w);
        const srcH = Math.max(1, frameRect.h);

        for (let y = 0; y < areaH; y++) {
            const sy0 = frameRect.y + ((y * srcH) / areaH);
            const sy1 = frameRect.y + (((y + 1) * srcH) / areaH);
            for (let x = 0; x < areaW; x++) {
                const sx0 = frameRect.x + ((x * srcW) / areaW);
                const sx1 = frameRect.x + (((x + 1) * srcW) / areaW);
                let sample = null;

                if (mode === 'singlepixeltopleft') {
                    sample = sampleAtlasRgba(atlasPixels, sx0, sy0);
                } else if (mode === 'singlepixelcenter') {
                    sample = sampleAtlasRgba(atlasPixels, (sx0 + sx1) * 0.5, (sy0 + sy1) * 0.5);
                } else {
                    sample = averageAtlasWindowRgba(atlasPixels, sx0, sy0, sx1, sy1);
                }
                const p = ((y * areaW) + x) * 4;
                pixels[p] = Math.round(sample?.r || 0);
                pixels[p + 1] = Math.round(sample?.g || 0);
                pixels[p + 2] = Math.round(sample?.b || 0);
                pixels[p + 3] = Math.round(sample?.a || 0);
            }
        }
        return pixels;
    }

    function extractMaskFromPixels(areaW, areaH, pixels) {
        const mask = new Uint8Array(areaW * areaH);
        for (let i = 0; i < areaW * areaH; i++) {
            const p = i * 4;
            if (litValueFromRgba({
                r: pixels[p],
                g: pixels[p + 1],
                b: pixels[p + 2],
                a: pixels[p + 3]
            }) >= 20) {
                mask[i] = 1;
            }
        }
        return mask;
    }

    function getShapeMask(layer, areaW, areaH, now, elapsedMs, env) {
        const raw = normalizeShape(layer).toLowerCase();
        if (!raw) return null;
        const key = util.normShapeKey(raw);
        const mask = new Uint8Array(areaW * areaH);
        const shapes = env?.shapes || global.App?.data?.shapes;
        const atlas = env?.shapeAtlas || global.App?.data?.shapeAtlas;

        if (shapes && shapes.has(key) && atlas) {
            return getAtlasShapeMask(key, areaW, areaH, now, elapsedMs, { shapes, shapeAtlas: atlas });
        }

        const isLetter = /^shpletter[a-z]$/.test(raw);
        const isDigit = /^shpdigit[0-9]$/.test(raw);
        const isCircle = raw === 'shpcircle3' || raw === 'shpcircle' || raw === 'shproundpulse';
        const isDiamond = raw === 'shpdiamondboxpulse';
        const isArrow = /^shparrow(left|right|up|down)$/.test(raw);

        if (isLetter || isDigit) {
            const char = isLetter ? raw.slice(-1).toUpperCase() : raw.slice(-1);
            return getTextMask(char, areaW, areaH);
        }
        if (isCircle) {
            const rx = areaW / 2;
            const ry = areaH / 2;
            for (let y = 0; y < areaH; y++) {
                for (let x = 0; x < areaW; x++) {
                    const nx = (x - rx) / rx;
                    const ny = (y - ry) / ry;
                    if ((nx * nx) + (ny * ny) <= 1.0) mask[(y * areaW) + x] = 1;
                }
            }
            return mask;
        }
        if (isDiamond) {
            const cx = areaW / 2;
            const cy = areaH / 2;
            for (let y = 0; y < areaH; y++) {
                for (let x = 0; x < areaW; x++) {
                    if ((Math.abs(x - cx) / cx) + (Math.abs(y - cy) / cy) <= 1.0) mask[(y * areaW) + x] = 1;
                }
            }
            return mask;
        }
        if (isArrow) {
            const dir = raw.replace('shparrow', '');
            const mx = areaW / 2;
            const my = areaH / 2;
            for (let y = 0; y < areaH; y++) {
                for (let x = 0; x < areaW; x++) {
                    const nx = (x - mx) / mx;
                    const ny = (y - my) / my;
                    let draw = false;
                    if (dir === 'right') draw = nx > 0 && Math.abs(ny) < (1 - nx);
                    if (dir === 'left') draw = nx < 0 && Math.abs(ny) < (1 + nx);
                    if (dir === 'up') draw = ny < 0 && Math.abs(nx) < (1 + ny);
                    if (dir === 'down') draw = ny > 0 && Math.abs(nx) < (1 - ny);
                    if (draw) mask[(y * areaW) + x] = 1;
                }
            }
            return mask;
        }

        if (raw === 'shpfillleftright' || raw === 'shpupdown') {
            const sweepPos = ((now % 2000) / 2000) * areaW;
            const bw = Math.max(1, Math.round(areaW * 0.15));
            for (let y = 0; y < areaH; y++) {
                for (let x = Math.floor(sweepPos); x < sweepPos + bw && x < areaW; x++) {
                    mask[(y * areaW) + x] = 1;
                }
            }
            return mask;
        }

        if (raw === 'shpfilltopbottom' || raw === 'shpfillbottomtop') {
            const sweepPos = ((now % 2000) / 2000) * areaH;
            const bh = Math.max(1, Math.round(areaH * 0.15));
            const startRow = (raw === 'shpfillbottomtop')
                ? Math.max(0, areaH - Math.ceil(sweepPos) - bh)
                : Math.floor(sweepPos);
            for (let y = startRow; y < startRow + bh && y < areaH; y++) {
                for (let x = 0; x < areaW; x++) mask[(y * areaW) + x] = 1;
            }
            return mask;
        }

        for (let x = 0; x < areaW; x++) {
            mask[x] = 1;
            mask[((areaH - 1) * areaW) + x] = 1;
        }
        for (let y = 0; y < areaH; y++) {
            mask[y * areaW] = 1;
            mask[(y * areaW) + areaW - 1] = 1;
        }
        return mask;
    }

    function getAtlasShapeMask(shapeKey, areaW, areaH, now, elapsedMs, env) {
        const render = getAtlasShapeRender(shapeKey, areaW, areaH, now, elapsedMs, env);
        return render?.mask || new Uint8Array(areaW * areaH).fill(1);
    }

    function getAtlasShapeRender(shapeKey, areaW, areaH, now, elapsedMs, env) {
        const shapes = env?.shapes;
        const atlas = env?.shapeAtlas;
        const shape = shapes?.get(shapeKey);
        if (!shape || !atlas) return null;

        const atlasPixels = getAtlasPixels(atlas);
        if (!atlasPixels) return null;

        const frameRect = atlasFrameRect(shape, now, elapsedMs);
        const canvasSource = atlas?.canvas || atlas;
        const pixels = extractPixelsFromAtlas(shape, areaW, areaH, frameRect, atlasPixels, canvasSource);
        return {
            width: areaW,
            height: areaH,
            pixels,
            mask: extractMaskFromPixels(areaW, areaH, pixels)
        };
    }

    function sampleRenderedPixel(render, x, y) {
        if (!render?.pixels) return null;
        const px = util.clamp(Math.floor(x), 0, render.width - 1);
        const py = util.clamp(Math.floor(y), 0, render.height - 1);
        const idx = ((py * render.width) + px) * 4;
        const data = render.pixels;
        return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3]
        };
    }

    function getTextMask(char, areaW, areaH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(1, areaW);
        tempCanvas.height = Math.max(1, areaH);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#fff';
        tempCtx.font = 'bold ' + Math.round(areaH * 1.1) + 'px monospace';
        tempCtx.textAlign = 'center';
        tempCtx.textBaseline = 'middle';
        tempCtx.fillText(char, areaW / 2, areaH / 2);
        const pixels = tempCtx.getImageData(0, 0, areaW, areaH).data;
        const mask = new Uint8Array(areaW * areaH);
        for (let i = 0; i < areaW * areaH; i++) {
            if (pixels[(i * 4) + 3] > 40) mask[i] = 1;
        }
        return mask;
    }

    function evaluateFrame(opts) {
        const now = Number(opts?.now || Date.now());
        const cols = Math.max(1, Number(opts?.cols || 1));
        const rows = Math.max(1, Number(opts?.rows || 1));
        const total = cols * rows;
        const baseStartTime = Number(opts?.baseStartTime || now);
        const source = Array.isArray(opts?.layers) ? opts.layers : [];

        const mxR = new Uint8ClampedArray(total);
        const mxG = new Uint8ClampedArray(total);
        const mxB = new Uint8ClampedArray(total);
        if (opts?.seedR?.length === total) mxR.set(opts.seedR);
        if (opts?.seedG?.length === total) mxG.set(opts.seedG);
        if (opts?.seedB?.length === total) mxB.set(opts.seedB);

        const bitmapTrim = Number.isFinite(Number(opts?.bitmapTrim)) ? util.clamp(Number(opts.bitmapTrim), 0, 1) : 0.55;
        const sorted = source
            .map((layer, idx) => ({ layer, idx: layer?._sceneIdx ?? idx }))
            .filter(entry => entry.layer && entry.layer.active !== false && (entry.layer.color || entry.layer.hex || entry.layer.shp || entry.layer.shapeName))
            .sort((a, b) => ((a.layer.zlayer ?? a.layer.layer ?? 0) - (b.layer.zlayer ?? b.layer.layer ?? 0)));

        sorted.forEach(({ layer, idx }) => {
            const timing = elapsedForLayer(layer, now, baseStartTime);
            if (!timing.active) return;

            const dir = normalizeDir(layer);
            const hasShiftMotion = !!(dir && (Number(layer?.as || 0) > 0 || Number(layer?.ass || 0) > 0 || Number(layer?.assMs || 0) > 0 || Number(layer?.asa || 0) !== 0));
            const blinkValue = Number(layer?.blink || 0);
            const isBPWSpatial = !!(dir && blinkValue !== 0 && Number(layer?.bpw || 0) > 0 && Number(layer?.bpw || 0) < 50);
            const opacity = typeof opts?.opacityAtTime === 'function'
                ? opts.opacityAtTime(layer, {
                    now,
                    elapsedMs: timing.elapsedMs,
                    cyclePeriod: cyclePeriod(layer),
                    isBPWSpatial,
                    hasShiftMotion
                })
                : 1.0;
            if (opacity <= 0) return;

            const hex = normalizeHex(layer);
            const scale = typeof opts?.intensityScaleFromToken === 'function'
                ? opts.intensityScaleFromToken(layer?.maxInt)
                : intensityScaleFromToken(layer?.maxInt);
            const [r0, g0, b0] = hexToRgb(hex);
            const color2Hex = typeof opts?.resolveColorHex === 'function'
                ? opts.resolveColorHex(layer?.plasmaColor2, '#00FF00')
                : (String(layer?.plasmaColor2 || '').startsWith('#') ? layer.plasmaColor2 : '#00FF00');
            const [r2, g2, b2] = hexToRgb(color2Hex || '#00FF00');
            const baseR = Math.round(r0 * scale * opacity);
            const baseG = Math.round(g0 * scale * opacity);
            const baseB = Math.round(b0 * scale * opacity);
            const baseR2 = Math.round(r2 * scale * opacity);
            const baseG2 = Math.round(g2 * scale * opacity);
            const baseB2 = Math.round(b2 * scale * opacity);

            let areaL = Math.floor((Number(layer?.al || 0) / 100) * cols);
            let areaW = Math.max(1, Math.floor(((Number(layer?.al || 0) + Number(layer?.aw || 100)) / 100) * cols) - areaL);
            let areaT = Math.floor((Number(layer?.at || 0) / 100) * rows);
            let areaH = Math.max(1, Math.floor(((Number(layer?.at || 0) + Number(layer?.ah || 100)) / 100) * rows) - areaT);

            if (isBPWSpatial) {
                const blinkMs = Math.max(50, blinkValue > 0 ? blinkValue : 500);
                const stepPct = (Number(layer?.ass || 0) > 0) ? (Number(layer.ass) * 0.1) : Number(layer?.bpw || 50);
                const sweepPeriod = blinkMs * (100 / stepPct);
                const sweepFrac = (timing.elapsedMs % sweepPeriod) / sweepPeriod;
                if (dir === 'ADR' || dir === 'ADL') {
                    const barW = Math.max(1, Math.round(areaW * Number(layer?.bpw || 50) / 100));
                    const pos = dir === 'ADR' ? sweepFrac : (1 - sweepFrac);
                    areaL = areaL + Math.round(pos * (areaW - barW));
                    areaW = barW;
                } else if (dir === 'ADD' || dir === 'ADU') {
                    const barH = Math.max(1, Math.round(areaH * Number(layer?.bpw || 50) / 100));
                    const pos = dir === 'ADD' ? sweepFrac : (1 - sweepFrac);
                    areaT = areaT + Math.round(pos * (areaH - barH));
                    areaH = barH;
                }
            }

            const motion = isBPWSpatial
                ? { ox: 0, oy: 0 }
                : motionOffsetAtTime(
                    { as: layer?.as, ass: layer?.ass, assMs: layer?.assMs, asa: layer?.asa, dir },
                    timing.elapsedMs,
                    cols,
                    rows,
                    areaW,
                    areaH,
                    false
                );
            const shiftedAreaL = (dir === 'ADR' || dir === 'ADL')
                ? wrapTravelPos(
                    areaL + Math.round(motion.ox),
                    -areaW,
                    cols
                )
                : areaL;
            const shiftedAreaT = (dir === 'ADD' || dir === 'ADU')
                ? wrapTravelPos(
                    areaT + Math.round(motion.oy),
                    -areaH,
                    rows
                )
                : areaT;
            const shapeName = normalizeShape(layer);
            const shapeKey = util.normShapeKey(String(shapeName || '').toLowerCase());
            const shapeRender = shapeName && (opts?.shapes || global.App?.data?.shapes)?.has?.(shapeKey)
                ? getAtlasShapeRender(shapeKey, areaW, areaH, now, timing.elapsedMs, {
                    shapes: opts?.shapes || global.App?.data?.shapes,
                    shapeAtlas: opts?.shapeAtlas || global.App?.data?.shapeAtlas
                })
                : null;
            const shapeMask = shapeRender?.mask || (shapeName ? getShapeMask(layer, areaW, areaH, now, timing.elapsedMs, opts) : null);
            const bitmapSource = hasBitmap(layer) ? resolveBitmapSource(layer, now, timing.elapsedMs, opts) : null;
            if (hasBitmap(layer) && !bitmapSource) return;

            const hasSpatialGradient = !isBPWSpatial &&
                hasShiftMotion &&
                (Number(layer?.fd || 0) > 0 || Number(layer?.fu || 0) > 0) &&
                (dir === 'ADR' || dir === 'ADL' || dir === 'ADD' || dir === 'ADU');

            let gradDirX = 0;
            let gradDirY = 0;
            let gradSpeedPxPerSec = 0;
            if (hasSpatialGradient) {
                if (dir === 'ADR') gradDirX = 1;
                else if (dir === 'ADL') gradDirX = -1;
                else if (dir === 'ADD') gradDirY = 1;
                else if (dir === 'ADU') gradDirY = -1;
                const speedPctPerSec = shiftSpeedPctPerSecAtTime(layer, timing.elapsedMs);
                if (gradDirX !== 0) {
                    gradSpeedPxPerSec = (speedPctPerSec / 100) * shiftReferenceSpanPx(layer, cols, areaW);
                } else if (gradDirY !== 0) {
                    gradSpeedPxPerSec = (speedPctPerSec / 100) * shiftReferenceSpanPx(layer, rows, areaH);
                }
            }

            for (let dy = 0; dy < areaH; dy++) {
                for (let dx = 0; dx < areaW; dx++) {
                    if (shapeMask && !shapeMask[(dy * areaW) + dx]) continue;
                    const shapePixel = shapeRender ? sampleRenderedPixel(shapeRender, dx, dy) : null;
                    if (shapeRender && (!shapePixel || shapePixel.a <= 0)) continue;
                    const bitmapPixel = bitmapSource ? sampleBitmapPixel(bitmapSource, dx, dy, areaW, areaH, bitmapTrim) : null;
                    if (bitmapSource && (!bitmapPixel || bitmapPixel.a <= 0)) continue;

                    let sparkleFade = 1.0;
                    if (Number(layer?.afden || 0) > 0 && typeof opts?.sparkleAtPixel === 'function') {
                        const pixelIndex = ((areaT + dy) * cols) + (areaL + dx);
                        sparkleFade = opts.sparkleAtPixel(layer, {
                            layerIndex: Math.abs(idx),
                            pixelIndex,
                            now,
                            dx,
                            dy,
                            areaL,
                            areaT,
                            areaW,
                            areaH,
                            cols,
                            rows
                        });
                        if (sparkleFade <= 0) continue;
                    }

                    let gradFade = 1.0;
                    if (hasSpatialGradient && gradSpeedPxPerSec > 0) {
                        let distLeadPx;
                        let distTrailPx;
                        if (gradDirX === 1) { distLeadPx = areaW - 1 - dx; distTrailPx = dx; }
                        else if (gradDirX === -1) { distLeadPx = dx; distTrailPx = areaW - 1 - dx; }
                        else if (gradDirY === 1) { distLeadPx = areaH - 1 - dy; distTrailPx = dy; }
                        else { distLeadPx = dy; distTrailPx = areaH - 1 - dy; }
                        const leadMs = (distLeadPx / gradSpeedPxPerSec) * 1000;
                        const trailMs = (distTrailPx / gradSpeedPxPerSec) * 1000;
                        if (Number(layer?.fd || 0) > 0) gradFade *= Math.max(0, 1 - leadMs / Number(layer.fd));
                        if (Number(layer?.fu || 0) > 0) gradFade *= Math.min(1, trailMs / Number(layer.fu));
                        if (gradFade <= 0.005) continue;
                    }

                    const px = shiftedAreaL + dx;
                    const py = shiftedAreaT + dy;
                    if (px < 0 || px >= cols || py < 0 || py >= rows) continue;
                    const pixel = (py * cols) + px;
                    const isPlasma = !bitmapSource && String(layer?.effect || '').toLowerCase() === 'plasma';
                    const mix = isPlasma ? plasmaFactor(layer, dx, dy, areaW, areaH, timing.elapsedMs) : 0.0;
                    let outR = isPlasma ? (baseR + ((baseR2 - baseR) * mix)) : baseR;
                    let outG = isPlasma ? (baseG + ((baseG2 - baseG) * mix)) : baseG;
                    let outB = isPlasma ? (baseB + ((baseB2 - baseB) * mix)) : baseB;
                    if (shapePixel) {
                        const alpha = (shapePixel.a || 0) / 255;
                        if (layer?._colorExplicit) {
                            const tinted = tintSourceRgb(shapePixel, r0, g0, b0, alpha, scale, opacity);
                            outR = tinted.r;
                            outG = tinted.g;
                            outB = tinted.b;
                        } else {
                            outR = shapePixel.r * scale * opacity * alpha;
                            outG = shapePixel.g * scale * opacity * alpha;
                            outB = shapePixel.b * scale * opacity * alpha;
                        }
                    }
                    if (bitmapPixel) {
                        const alpha = (bitmapPixel.a || 0) / 255;
                        if (layer?._colorExplicit) {
                            const tinted = tintSourceRgb(bitmapPixel, r0, g0, b0, alpha, scale, opacity);
                            outR = tinted.r;
                            outG = tinted.g;
                            outB = tinted.b;
                        } else {
                            outR = bitmapPixel.r * scale * opacity * alpha;
                            outG = bitmapPixel.g * scale * opacity * alpha;
                            outB = bitmapPixel.b * scale * opacity * alpha;
                        }
                    }
                    const fade = sparkleFade * gradFade;
                    mxR[pixel] = Math.round(outR * fade);
                    mxG[pixel] = Math.round(outG * fade);
                    mxB[pixel] = Math.round(outB * fade);
                }
            }
        });

        return { r: mxR, g: mxG, b: mxB };
    }

    DOFShared.MatrixEvaluator = {
        evaluateFrame,
        getShapeMask
    };
    DOFShared.modules.matrixEval = { version: DOFShared.version, build: DOFShared.build };
})(window);
