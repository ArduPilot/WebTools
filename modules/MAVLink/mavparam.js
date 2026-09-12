/* ArduPilot packed parameters over MAVFTP. No UI or SimpleGCS dependencies.
 * Wire format: AP_Filesystem_Param.cpp and MAVProxy modules/lib/param_ftp.py.
 */
(function(root) {
    'use strict';
    const DOWNLOAD = '@PARAM/param.pck?withdefaults=1';
    const UPLOAD = '@PARAM/param.pck';
    const sizes = {1:1, 2:2, 3:4, 4:4};
    const validName = name => /^[A-Z0-9_]{1,16}$/.test(name);
    const valueForType = (value, type) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Value must be a finite number');
        const limits = {1:[-128,127], 2:[-32768,32767], 3:[-2147483648,2147483647]};
        if (type === 4) {
            const result = Math.fround(value);
            if (!Number.isFinite(result)) throw new Error('Value exceeds float32 range');
            return result;
        }
        if (!limits[type] || !Number.isInteger(value) || value < limits[type][0] || value > limits[type][1]) {
            throw new Error(`Value does not fit parameter type ${type}`);
        }
        return value;
    };
    function readValue(view, offset, type) {
        return type === 1 ? view.getInt8(offset) : type === 2 ? view.getInt16(offset,true) :
            type === 3 ? view.getInt32(offset,true) : view.getFloat32(offset,true);
    }
    function writeValue(view, offset, type, value) {
        if (type === 1) view.setInt8(offset,value);
        else if (type === 2) view.setInt16(offset,value,true);
        else if (type === 3) view.setInt32(offset,value,true);
        else view.setFloat32(offset,value,true);
    }
    function decode(data) {
        if (!(data instanceof Uint8Array) || data.length < 6) throw new Error('Truncated parameter header');
        const view = new DataView(data.buffer,data.byteOffset,data.byteLength);
        const magic = view.getUint16(0,true), count = view.getUint16(2,true), total = view.getUint16(4,true);
        if (![0x671b,0x671c].includes(magic) || count !== total) throw new Error('Invalid or partial parameter file');
        const params = new Map();
        let offset = 6, previous = '';
        while (offset < data.length) {
            if (data[offset] === 0) { offset++; continue; } // Block padding.
            if (offset + 2 > data.length) throw new Error('Truncated parameter record');
            const type = data[offset] & 15, flags = data[offset] >> 4;
            const common = data[offset+1] & 15, suffix = (data[offset+1] >> 4) + 1;
            const hasDefault = magic === 0x671c && flags === 1;
            if (!sizes[type] || flags > (magic === 0x671c ? 1 : 0) || common > previous.length || common+suffix > 16) {
                throw new Error('Invalid parameter type, flags or name prefix');
            }
            offset += 2;
            if (offset + suffix + sizes[type]*(hasDefault ? 2 : 1) > data.length) throw new Error('Truncated parameter value');
            const name = previous.slice(0,common) + String.fromCharCode(...data.subarray(offset,offset+suffix));
            if (!validName(name) || params.has(name)) throw new Error('Invalid or duplicate parameter name');
            offset += suffix;
            const value = valueForType(readValue(view,offset,type),type); offset += sizes[type];
            let defaultValue = magic === 0x671c ? value : undefined;
            if (hasDefault) { defaultValue = valueForType(readValue(view,offset,type),type); offset += sizes[type]; }
            params.set(name,{name,value,type,defaultValue});
            previous = name;
        }
        if (params.size !== count) throw new Error(`Parameter count mismatch: ${params.size} / ${count}`);
        return params;
    }
    function encodeUpload(params) {
        const list = [...params].sort((a,b)=>a.name.localeCompare(b.name,'en'));
        const chunks = []; let previous = '', length = 6;
        const names = new Set();
        for (const p of list) {
            if (!validName(p.name) || names.has(p.name)) throw new Error('Invalid or duplicate parameter name');
            names.add(p.name);
            const value = valueForType(p.value,p.type);
            let common = 0;
            while (common < Math.min(previous.length,p.name.length,15) && previous[common] === p.name[common]) common++;
            const suffix = p.name.slice(common);
            const bytes = new Uint8Array(2+suffix.length+sizes[p.type]);
            bytes[0] = p.type; bytes[1] = ((suffix.length-1)<<4)|common;
            bytes.set(new TextEncoder().encode(suffix),2);
            writeValue(new DataView(bytes.buffer),2+suffix.length,p.type,value);
            chunks.push(bytes); length += bytes.length; previous = p.name;
        }
        if (length > 65535 || list.length > 65535) throw new Error('Packed upload exceeds the 65535-byte format limit; split the file');
        const result = new Uint8Array(length), view = new DataView(result.buffer);
        view.setUint16(0,0x671b,true); view.setUint16(2,list.length,true); view.setUint16(4,length,true);
        let offset=6; for (const chunk of chunks) { result.set(chunk,offset); offset+=chunk.length; }
        return result;
    }
    function parseText(text) {
        const values = new Map();
        for (const [index,raw] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
            const line = raw.split(/[#;]/,1)[0].trim();
            if (!line) continue;
            const fields = line.split(/[\s,=]+/);
            let name, value;
            if (fields.length === 2) [name,value] = fields;
            else if (fields.length === 5 && /^\d+$/.test(fields[0]) && /^\d+$/.test(fields[1])) [, ,name,value] = fields;
            else throw new Error(`Line ${index+1}: expected PARAM_NAME VALUE`);
            name = name.toUpperCase();
            if (!validName(name) || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) {
                throw new Error(`Line ${index+1}: invalid name or value`);
            }
            if (values.has(name)) throw new Error(`Line ${index+1}: duplicate ${name}`);
            values.set(name,Number(value));
        }
        if (!values.size) throw new Error('No parameters in file');
        return values;
    }
    function formatValue(p, value=p.value) {
        // Use the shortest decimal that round-trips to the same float32.
        if (p.type !== 4) return String(value);
        for (let digits=1; digits<=9; digits++) {
            const text = Number(value.toPrecision(digits)).toString();
            if (Math.fround(Number(text)) === value) return text;
        }
        return String(value);
    }
    function saveText(params) {
        return '# ArduPilot parameters\n' + [...params].sort((a,b)=>a.name.localeCompare(b.name,'en'))
            .map(p=>`${p.name}\t${formatValue(p)}`).join('\n')+'\n';
    }

    class MAVParam {
        constructor({ftp}) {
            this.ftp = ftp;
            this.params = new Map();
            this.definitions = new Map();
            this.connected = true;
            this.busy = false;
            this.generation = 0;
            this.listeners = new Set();
        }
        subscribe(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
        emit() { for (const cb of this.listeners) cb(this); }
        disconnect() { this.connected=false; this.generation++; this.params.clear(); this.emit(); }
        async transaction(fn) {
            if (!this.connected) throw new Error('Vehicle disconnected');
            if (this.busy) throw new Error('A parameter operation is already in progress');
            this.busy = true; this.emit();
            const generation = this.generation;
            try { return await fn(()=>{if (!this.connected || generation !== this.generation) throw new Error('Vehicle disconnected');}); }
            finally { this.busy=false; this.emit(); }
        }
        async download(check) {
            const data = await new Promise(resolve=>this.ftp.getFile(DOWNLOAD,resolve,{timeoutMs:20000,sizeIsEstimate:true,fixedReadSize:true}));
            check();
            if (!data) throw new Error('Parameter download failed');
            const params = decode(data);
            this.params = params;
            return params;
        }
        refresh() { return this.transaction(check=>this.download(check)); }
        changes(values) {
            if (!this.params.size) throw new Error('Fetch parameters first');
            const changes = [];
            for (const [name,raw] of values) {
                const p = this.params.get(name);
                if (!p) throw new Error(`Unknown parameter: ${name}`);
                const value = valueForType(raw,p.type);
                if (value === p.value) continue;
                if (this.definitions.get(name)?.readOnly) throw new Error(`${name} is read-only`);
                changes.push({...p,value,previousValue:p.value});
            }
            return changes;
        }
        async apply(values) {
            return this.transaction(async check=>{
                const changes = this.changes(values);
                if (!changes.length) return [];
                const bytes = encodeUpload(changes);
                const sent = await new Promise(resolve=>this.ftp.putFile(UPLOAD,bytes,resolve,{timeoutMs:20000}));
                check();
                // Even a failed upload can have applied a prefix on file close.
                // Refresh rather than displaying optimistic cached values.
                try { await this.download(check); }
                catch (e) { this.params.clear(); throw new Error(`Upload outcome unverified: ${e.message}. Fetch parameters again.`); }
                if (sent === null || sent === undefined) throw new Error('Upload failed or close was not acknowledged; current values have been refreshed');
                const rejected = changes.filter(p=>this.params.get(p.name)?.value !== p.value);
                if (rejected.length) throw new Error(`Vehicle did not retain requested values: ${rejected.map(p=>p.name).join(', ')}`);
                return changes;
            });
        }
        reset(name) {
            const p = this.params.get(name);
            if (p?.defaultValue === undefined) return Promise.reject(new Error('Default unavailable'));
            return this.apply(new Map([[name,p.defaultValue]]));
        }
        search(query='', nonDefault=false) {
            const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
            return [...this.params.values()].filter(p=>{
                if (nonDefault && (p.defaultValue === undefined || p.value === p.defaultValue)) return false;
                const d = this.definitions.get(p.name);
                const text = `${p.name} ${d?.label || ''} ${d?.description || ''}`.toLowerCase();
                return terms.every(term=>text.includes(term));
            }).sort((a,b)=>a.name.localeCompare(b.name,'en'));
        }
        static vehicleName(type) {
            if ([10,11].includes(type)) return 'Rover';
            if (type === 1 || (type >= 19 && type <= 25)) return 'Plane';
            if (type === 12) return 'Sub';
            if (type === 5) return 'AntennaTracker';
            if (type === 7) return 'Blimp';
            if (type === 4) return 'Heli';
            return 'Copter';
        }
    }
    Object.assign(MAVParam,{decode,encodeUpload,parseText,saveText,formatValue,valueForType,DOWNLOAD,UPLOAD});

    // ArduPilot publishes JSON from the same definitions used by MAVProxy's
    // XML help/editor. Cache per vehicle, refresh weekly, retain offline copies.
    class MAVParamDefinitions {
        constructor({fetch:fetcher=globalThis.fetch, cache=globalThis.caches, maxAge=7*86400000,
                     baseUrl='https://autotest.ardupilot.org/Parameters'}={}) {
            this.fetcher=fetcher.bind(globalThis); this.cache=cache; this.maxAge=maxAge; this.baseUrl=baseUrl;
            this.memory=new Map();
        }
        static parse(data) {
            const result=new Map();
            for (const group of Object.values(data)) {
                if (!group || typeof group !== 'object') continue;
                for (const [key,p] of Object.entries(group)) {
                    if (!p || typeof p !== 'object') continue;
                    const name=key.split(':').at(-1);
                    if (!validName(name)) continue;
                    result.set(name,{name,label:p.DisplayName || p.displayName || p.humanName || '',description:p.Description || p.description || p.documentation || '',
                        units:p.Units || '',range:p.Range,increment:p.Increment,values:p.Values || {},bitmask:p.Bitmask || {},
                        readOnly:String(p.ReadOnly).toLowerCase()==='true',rebootRequired:String(p.RebootRequired).toLowerCase()==='true'});
                }
            }
            if (!result.size) throw new Error('Empty or invalid parameter definitions');
            return result;
        }
        async load(vehicle, {refresh=false}={}) {
            if (!['Rover','Plane','Copter','Sub','AntennaTracker','Blimp','Heli'].includes(vehicle)) throw new Error('Unknown vehicle definitions');
            // Canonical directories avoid legacy redirects without CORS headers.
            const directory={Rover:'APMrover2',Plane:'ArduPlane',Copter:'ArduCopter',Sub:'ArduSub',Heli:'ArduCopter'}[vehicle] || vehicle;
            const url=`${this.baseUrl}/${directory}/apm.pdef.json`;
            let cached=this.memory.get(url), store;
            try {
                store=await this.cache?.open('mavparam-definitions-v1');
                if (!cached) {
                    const response=await store?.match(url);
                    if (response) cached={data:await response.json(),time:Number(response.headers.get('X-MAVParam-Cached'))};
                }
            } catch (_) { /* Private browsing or cache quota: use memory. */ }
            if (cached && !refresh && Date.now()-cached.time < this.maxAge) return {definitions:MAVParamDefinitions.parse(cached.data),cached:true,stale:false};
            try {
                const response=await this.fetcher(url,{signal:AbortSignal.timeout(15000)});
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data=await response.json(), definitions=MAVParamDefinitions.parse(data);
                cached={data,time:Date.now()}; this.memory.set(url,cached);
                try { await store?.put(url,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','X-MAVParam-Cached':String(cached.time)}})); } catch (_) {}
                return {definitions,cached:false,stale:false};
            } catch (error) {
                if (cached) return {definitions:MAVParamDefinitions.parse(cached.data),cached:true,stale:true};
                throw error;
            }
        }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports={MAVParam,MAVParamDefinitions};
    else Object.assign(root,{MAVParam,MAVParamDefinitions});
})(globalThis);
