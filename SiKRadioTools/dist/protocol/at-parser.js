/**
 * AT command response parser for SiK radios
 */
/** Parse ATI5-style parameter output: S0: FORMAT=22, S1: SERIAL_SPEED=57, S3:NETID=26, etc. */
export function parseATI5Response(lines) {
    const params = {};
    const paramRe = /^S(\d+):\s*(\w+)=(.+)$/;
    const shortRe = /^S(\d+)=(.+)$/;
    for (const line of lines) {
        const t = line.trim();
        let m = t.match(paramRe);
        if (m) {
            const [, regNum, key, value] = m;
            const num = parseInt(value, 10);
            const val = isNaN(num) ? value.trim() : num;
            params[key] = val;
            params[`S${regNum}`] = val;
        }
        else {
            m = t.match(shortRe);
            if (m) {
                const [, regNum, value] = m;
                const num = parseInt(value, 10);
                params[`S${regNum}`] = isNaN(num) ? value.trim() : num;
            }
        }
    }
    return params;
}
/** Check if response indicates OK */
export function isOK(line) {
    return /^OK\s*$/i.test(line.trim());
}
/** Check if response indicates ERROR */
export function isError(line) {
    return /^ERROR\s*$/i.test(line.trim());
}
/** Extract lines between command and OK/ERROR */
export function parseATResponse(lines) {
    const result = { ok: false, lines: [] };
    for (const line of lines) {
        const t = line.trim();
        if (isOK(t)) {
            result.ok = true;
            break;
        }
        if (isError(t)) {
            result.ok = false;
            break;
        }
        if (t.length > 0) {
            result.lines.push(t);
        }
    }
    if (result.lines.length > 0 && result.lines.some((l) => /^S\d+:\s*\w+=/.test(l))) {
        result.params = parseATI5Response(result.lines);
    }
    return result;
}
/** Parse a single ATSn? response: "57" or "value" */
export function parseATSResponse(lines) {
    for (const line of lines) {
        const t = line.trim();
        if (isOK(t) || isError(t))
            continue;
        const num = parseInt(t, 10);
        return isNaN(num) ? t : num;
    }
    return null;
}
//# sourceMappingURL=at-parser.js.map