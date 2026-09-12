/**
 * Intel HEX parser for SiK firmware flashing
 */
function parseHexByte(hex) {
    return parseInt(hex, 16);
}
export function parseIntelHex(content) {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const ranges = new Map();
    let upper = 0;
    let usesBanking = false;
    for (const line of lines) {
        if (!line.startsWith(':'))
            continue;
        const raw = line.slice(1);
        if (raw.length < 10 || raw.length % 2 !== 0) {
            throw new Error(`Invalid HEX line: ${line}`);
        }
        const bytes = [];
        for (let i = 0; i < raw.length; i += 2) {
            bytes.push(parseHexByte(raw.slice(i, i + 2)));
        }
        const count = bytes[0];
        const addr = (bytes[1] << 8) | bytes[2];
        const type = bytes[3];
        const data = bytes.slice(4, 4 + count);
        if (type === 0x00) {
            const abs = (upper << 16) + addr;
            if (upper !== 0)
                usesBanking = true;
            ranges.set(abs, data);
        }
        else if (type === 0x04) {
            if (count !== 2)
                throw new Error('Invalid type 04 record');
            upper = (data[0] << 8) | data[1];
            if (upper !== 0)
                usesBanking = true;
        }
        else if (type === 0x01) {
            break;
        }
    }
    // Merge contiguous ranges
    const merged = new Map();
    const addresses = [...ranges.keys()].sort((a, b) => a - b);
    for (const address of addresses) {
        const bytes = [...(ranges.get(address) ?? [])];
        const nextStart = address + bytes.length;
        if (merged.has(nextStart)) {
            bytes.push(...(merged.get(nextStart) ?? []));
            merged.delete(nextStart);
        }
        let mergedIntoExisting = false;
        for (const [start, existing] of [...merged.entries()]) {
            if (start + existing.length === address) {
                existing.push(...bytes);
                mergedIntoExisting = true;
                break;
            }
        }
        if (!mergedIntoExisting) {
            merged.set(address, bytes);
        }
    }
    const segments = [...merged.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([address, data]) => ({ address, data: new Uint8Array(data) }));
    const totalBytes = segments.reduce((sum, s) => sum + s.data.length, 0);
    if (totalBytes === 0) {
        throw new Error('HEX file contains no data records');
    }
    return { segments, usesBanking, totalBytes };
}
//# sourceMappingURL=hex-parser.js.map