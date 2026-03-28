(function(global) {
    'use strict';

    const DOFShared = global.DOFShared = global.DOFShared || {};
    const util = DOFShared.util || {};

    function defaultResolveHex(colorName) {
        if (!colorName) return '#000000';
        if (String(colorName).startsWith('#')) return String(colorName);
        return '#888888';
    }

    function defaultIsParameterToken(token) {
        return /^(AT|AH|AL|AW|AB|AD|AS|AF|SHP|FU|FD|F\d|L-?\d|BLINK|PLASMA|BPW|APS\d|APD\d|PS\d|PV\d|APC|MAX|M\d|BNP|AAC|AAF|AAD|AAB|AAS|ASA|ASSMS|I\d|I#[0-9A-F]+|nobool)/i.test(token);
    }

    function parseLayer(raw, opts) {
        opts = opts || {};
        const str = String(raw || '').trim();
        if (!str) return null;

        const resolveHex = typeof opts.resolveHex === 'function' ? opts.resolveHex : defaultResolveHex;
        const isParameterToken = typeof opts.isParameterToken === 'function' ? opts.isParameterToken : defaultIsParameterToken;

        const d = {
            active: true,
            color: '',
            colorToken: '',
            hex: '#000000',
            effect: '',
            duration: 0,
            blink: 200,
            bpw: 50,
            fu: 0,
            fd: 0,
            f: 0,
            wait: 0,
            mhold: 0,
            maxDur: 0,
            maxInt: 48,
            plasmaSpeed: 100,
            plasmaDensity: 100,
            plasmaColor2: '',
            al: 0,
            aw: 100,
            at: 0,
            ah: 100,
            as: 0,
            ass: 0,
            assMs: 0,
            asa: 0,
            dir: '',
            afden: 0,
            afmin: 50,
            afmax: 150,
            affade: 0,
            shp: '',
            zlayer: 0,
            bitmap: {
                left: null,
                top: null,
                width: null,
                height: null,
                frame: null,
                frameCount: null,
                fps: null,
                frameDelayMs: null,
                stepDirection: '',
                stepSize: null,
                behaviour: '',
                sequence: '',
                offset: null
            },
            _trigger: '',
            _raw: str,
            _extra: [],
            _pulseCount: 0,
            _colorExplicit: false,
            _dirToken: '',
            _tokens: []
        };

        const toks = str.split(/\s+/);
        d._tokens = toks.slice();

        let i = 0;
        const treatLeadingLampAsTrigger =
            i < toks.length &&
            /^L\d+$/i.test(toks[i]) &&
            (opts.toyType === 'phys' || opts.toyType === 'rgb');

        if (treatLeadingLampAsTrigger) {
            d._trigger = toks[i].toUpperCase();
            i++;
        } else if (
            i < toks.length &&
            /^L-?\d+$/i.test(toks[i]) &&
            i + 1 < toks.length &&
            /^(W\d+|S\d+|ON|E\d+)/i.test(toks[i + 1])
        ) {
            d.zlayer = parseInt(toks[i].slice(1), 10);
            i++;
        }

        if (i < toks.length && /^(W\d+|S\d+|ON|E\d+)(\|[A-Z]\d+)*$/i.test(toks[i])) {
            d._trigger = toks[i].toUpperCase();
            i++;
        }
        if (i < toks.length && /^invert$/i.test(toks[i])) {
            d._extra.push(toks[i]);
            i++;
        }

        if (i < toks.length && !isParameterToken(toks[i]) && !/^\d+$/.test(toks[i]) && !toks[i].startsWith('@')) {
            if (/^blink$/i.test(toks[i])) {
                d.effect = 'Blink';
                i++;
            } else if (/^plasma$/i.test(toks[i])) {
                d.effect = 'Plasma';
                i++;
            } else {
                d.color = toks[i];
                d.colorToken = toks[i];
                d.hex = resolveHex(toks[i]);
                d._colorExplicit = true;
                i++;
            }
        }

        if (i < toks.length && /^@\w+@$/.test(toks[i])) {
            d._extra.push(toks[i]);
            i++;
        }
        if (i < toks.length && /^\d+$/.test(toks[i])) {
            d.duration = parseInt(toks[i], 10);
            i++;
        }

        while (i < toks.length) {
            const t = toks[i];
            if (/^@\w+@$/.test(t)) { d._extra.push(t); i++; continue; }
            if (/^AT-?\d+$/i.test(t)) { d.at = parseInt(t.slice(2), 10); i++; continue; }
            if (/^AH\d+$/i.test(t)) { d.ah = parseInt(t.slice(2), 10); i++; continue; }
            if (/^AL-?\d+$/i.test(t)) { d.al = parseInt(t.slice(2), 10); i++; continue; }
            if (/^AW\d+$/i.test(t)) { d.aw = parseInt(t.slice(2), 10); i++; continue; }
            if (/^AS?D[DULR]$/i.test(t)) {
                d._dirToken = t.toUpperCase();
                d.dir = util.normalizeDir(t);
                i++;
                continue;
            }
            if (/^AS\d+$/i.test(t) && !/^ASS/i.test(t)) { d.as = parseInt(t.slice(2), 10); i++; continue; }
            if (/^ASSMS\d+$/i.test(t)) { d.assMs = parseInt(t.slice(5), 10); i++; continue; }
            if (/^ASS\d+$/i.test(t)) { d.ass = parseInt(t.slice(3), 10); i++; continue; }
            if (/^ASA-?\d+$/i.test(t)) { d.asa = parseInt(t.slice(3), 10); i++; continue; }
            if (/^AFDEN\d+$/i.test(t)) { d.afden = parseInt(t.slice(5), 10); i++; continue; }
            if (/^AFMIN\d+$/i.test(t)) { d.afmin = parseInt(t.slice(5), 10); i++; continue; }
            if (/^AFMAX\d+$/i.test(t)) { d.afmax = parseInt(t.slice(5), 10); i++; continue; }
            if (/^AFFADE\d+$/i.test(t)) { d.affade = parseInt(t.slice(6), 10); i++; continue; }
            if (/^SHP/i.test(t)) { d.shp = t; i++; continue; }
            if (/^FU\d+$/i.test(t)) { d.fu = parseInt(t.slice(2), 10); i++; continue; }
            if (/^FD\d+$/i.test(t)) { d.fd = parseInt(t.slice(2), 10); i++; continue; }
            if (/^F\d+$/i.test(t) && !/^FU|^FD/i.test(t)) { d.f = parseInt(t.slice(1), 10); i++; continue; }
            if (/^BPW\d+$/i.test(t)) { d.bpw = util.clamp(parseInt(t.slice(3), 10), 1, 99); i++; continue; }
            if (/^APS\d+$/i.test(t)) { d.plasmaSpeed = parseInt(t.slice(3), 10); d.effect = 'Plasma'; i++; continue; }
            if (/^APD\d+$/i.test(t)) { d.plasmaDensity = parseInt(t.slice(3), 10); d.effect = 'Plasma'; i++; continue; }
            if (/^PS\d+$/i.test(t)) { d.plasmaDensity = parseInt(t.slice(2), 10); d.effect = 'Plasma'; i++; continue; }
            if (/^PV\d+$/i.test(t)) { d.plasmaSpeed = parseInt(t.slice(2), 10); d.effect = 'Plasma'; i++; continue; }
            if (/^Max\d+$/.test(t) && d.maxDur > 0 && d.maxInt === 48) { d.maxInt = parseInt(t.slice(3), 10); i++; continue; }
            if (/^MAX\d+$/i.test(t)) { d.maxDur = parseInt(t.slice(3), 10); i++; continue; }
            if (/^I#[0-9a-f]+$/i.test(t)) { d.maxInt = t.toUpperCase(); i++; continue; }
            if (/^I\d+$/i.test(t)) { d.maxInt = parseInt(t.slice(1), 10); i++; continue; }
            if (/^M\d+$/i.test(t) && !/^MX|^MAX/i.test(t)) { d.mhold = parseInt(t.slice(1), 10); i++; continue; }
            if (/^APC.+/i.test(t)) { d.plasmaColor2 = t.slice(3); d.effect = 'Plasma'; i++; continue; }
            if (/^ABL-?\d+$/i.test(t)) { d.bitmap.left = parseInt(t.slice(3), 10); i++; continue; }
            if (/^ABT-?\d+$/i.test(t)) { d.bitmap.top = parseInt(t.slice(3), 10); i++; continue; }
            if (/^ABW\d+$/i.test(t)) { d.bitmap.width = parseInt(t.slice(3), 10); i++; continue; }
            if (/^ABH\d+$/i.test(t)) { d.bitmap.height = parseInt(t.slice(3), 10); i++; continue; }
            if (/^ABF\d+$/i.test(t)) { d.bitmap.frame = parseInt(t.slice(3), 10); i++; continue; }
            if (/^AAC\d+$/i.test(t)) {
                d.bitmap.frameCount = parseInt(t.slice(3), 10);
                i++;
                continue;
            }
            if (/^AAF\d+$/i.test(t)) {
                d.bitmap.fps = parseInt(t.slice(3), 10);
                d.bitmap.frameDelayMs = d.bitmap.fps > 0 ? Math.round(1000 / d.bitmap.fps) : null;
                i++;
                continue;
            }
            if (/^AAD[A-Z]$/i.test(t)) {
                d.bitmap.stepDirection = t.slice(3).toUpperCase();
                i++;
                continue;
            }
            if (/^AAS\d+$/i.test(t)) {
                d.bitmap.stepSize = parseInt(t.slice(3), 10);
                d.bitmap.sequence = String(d.bitmap.stepSize);
                i++;
                continue;
            }
            if (/^AAB.+$/i.test(t)) {
                d.bitmap.behaviour = t.slice(3).toUpperCase();
                i++;
                continue;
            }
            if (/^BNP.+$/i.test(t)) { d._extra.push(t); i++; continue; }
            if (/^invert$/i.test(t)) { d._extra.push(t); i++; continue; }
            if (t.toUpperCase() === 'BLINK') {
                d.effect = 'Blink';
                i++;
                if (i < toks.length && /^\d+$/.test(toks[i])) {
                    d.blink = parseInt(toks[i], 10);
                    i++;
                }
                continue;
            }
            if (t.toUpperCase() === 'PLASMA') { d.effect = 'Plasma'; i++; continue; }
            if (!d.color && !isParameterToken(t) && !/^\d+$/.test(t) && !t.startsWith('@')) {
                d.color = t;
                d.colorToken = t;
                d.hex = resolveHex(t);
                d._colorExplicit = true;
                i++;
                continue;
            }
            if (/^L-?\d+$/i.test(t)) { d.zlayer = parseInt(t.slice(1), 10); i++; continue; }
            if (/^W\d+$/i.test(t) && d._trigger) { d.wait = parseInt(t.slice(1), 10); i++; continue; }
            if (/^\d+$/.test(t) && d.duration === 0) { d.duration = parseInt(t, 10); i++; continue; }
            if (/^\d+$/.test(t) && opts.isStrobeContext && d.duration > 0 && d._pulseCount === 0) {
                d._pulseCount = parseInt(t, 10);
                i++;
                continue;
            }
            d._extra.push(t);
            i++;
        }

        if (!d.effect && d.fu > 0 && d.fd > 0) d.effect = 'Pulse';
        if (d.f > 0) {
            if (d.fu === 0) d.fu = d.f;
            if (d.fd === 0) d.fd = d.f;
            if (!d.effect) d.effect = 'Pulse';
        }
        if (!d.hex) d.hex = resolveHex(d.color || '');

        return d;
    }

    function parseEffectString(str, opts) {
        return util.splitEffectSegments(str).map(seg => parseLayer(seg, opts)).filter(Boolean);
    }

    DOFShared.Parser = {
        parseLayer,
        parseEffectString
    };
    DOFShared.modules.parser = { version: DOFShared.version, build: DOFShared.build };
})(window);
