/* Optional, reusable DOM layer for MAVParam. Load mavparam-ui.css alongside it. */
(function(root) {
    'use strict';
    function element(tag, text, className) {
        const el=document.createElement(tag);
        if (text !== undefined) el.textContent=text;
        if (className) el.className=className;
        return el;
    }
    function button(text, action) {
        const el=element('button',text); el.type='button'; el.onclick=action; return el;
    }
    class MAVParamUI {
        constructor({definitions=new MAVParamDefinitions()}={}) {
            this.definitions=definitions; this.client=null; this.vehicle='Rover'; this.page=0;
            this.pageSize=50; this.drafts=new Map(); this.importValues=null;
            this.dialog=element('dialog',undefined,'mavparam-dialog');
            this.dialog.setAttribute('aria-label','Parameters');
            const header=element('header');
            header.append(element('h2','Parameters'),button('Close',()=>this.dialog.close()));
            this.summary=element('div','Connect to a vehicle to fetch parameters.','mavparam-status');
            this.summary.setAttribute('role','status');
            this.metaStatus=element('span','Descriptions not loaded.');
            this.metaRefresh=button('Refresh descriptions',()=>this.loadDefinitions(true));
            const metadata=element('div',undefined,'mavparam-metadata');metadata.append(this.metaStatus,this.metaRefresh);
            const toolbar=element('div',undefined,'mavparam-toolbar');
            this.refreshButton=button('Fetch parameters',()=>this.run('Fetching parameters and defaults…',()=>this.client.refresh(),'Parameters refreshed.'));
            this.saveScope=element('select');this.saveScope.setAttribute('aria-label','Parameters to save');
            for (const [value,label] of [['all','Save all parameters'],['changed','Save non-default parameters']]) {
                const option=element('option',label);option.value=value;this.saveScope.append(option);
            }
            this.saveButton=button('Save to file',()=>this.save());
            this.loadButton=button('Load from file',()=>this.fileInput.click());
            this.fileInput=element('input');this.fileInput.type='file';this.fileInput.accept='.parm,.param,.params,.txt';this.fileInput.hidden=true;
            this.fileInput.onchange=()=>this.loadFile();
            toolbar.append(this.refreshButton,this.saveScope,this.saveButton,this.loadButton,this.fileInput);
            const filters=element('div',undefined,'mavparam-filters');
            this.search=element('input');this.search.type='search';this.search.placeholder='Search parameter names and descriptions';this.search.setAttribute('aria-label','Search parameters');
            this.search.oninput=()=>{this.page=0;this.render();};
            const changedLabel=element('label');
            this.changedOnly=element('input');this.changedOnly.type='checkbox';this.changedOnly.onchange=()=>{this.page=0;this.render();};
            changedLabel.append(this.changedOnly,document.createTextNode(' Non-default only'));
            filters.append(this.search,changedLabel);
            this.importPanel=element('section',undefined,'mavparam-import');this.importPanel.hidden=true;
            this.list=element('div',undefined,'mavparam-list');
            this.count=element('span');
            this.previous=button('Previous',()=>{this.page--;this.render();});
            this.next=button('Next',()=>{this.page++;this.render();});
            const footer=element('footer');footer.append(this.count,this.previous,this.next);
            this.dialog.append(header,this.summary,metadata,toolbar,filters,this.importPanel,this.list,footer);
            document.body.append(this.dialog);this.render();
        }
        setClient(client, vehicle) {
            this.unsubscribe?.();this.client=client;this.vehicle=vehicle || 'Rover';
            this.drafts.clear();this.importValues=null;this.importPanel.hidden=true;this.page=0;
            this.unsubscribe=client?.subscribe(()=>this.render());
            this.message(client ? 'Fetch parameters to begin.' : 'Disconnected. Reconnect to fetch current parameters.');
            this.render();
            if (client && this.dialog.open) this.start();
        }
        open() { if (!this.dialog.open) this.dialog.showModal();this.start(); }
        start() {
            if (!this.client) return;
            if (!this.client.params.size && !this.client.busy) this.refreshButton.click();
            this.loadDefinitions();
        }
        message(text,error=false) { this.summary.textContent=text;this.summary.classList.toggle('mavparam-error',error); }
        async loadDefinitions(refresh=false) {
            const client=this.client, vehicle=this.vehicle;
            if (!client || this.loadingDefinitions) return;
            this.loadingDefinitions=true;this.metaRefresh.disabled=true;
            this.metaStatus.textContent=`Loading ${vehicle} descriptions…`;
            try {
                const result=await this.definitions.load(vehicle,{refresh});
                if (this.client !== client) return;
                client.definitions=result.definitions;
                this.metaStatus.textContent=`${vehicle} descriptions${result.stale ? ' (offline cached copy)' : result.cached ? ' (cached)' : ''}.`;
                this.render();
            } catch (e) {
                if (this.client===client) this.metaStatus.textContent='Descriptions unavailable. Parameter values can still be edited.';
            } finally {this.loadingDefinitions=false;this.metaRefresh.disabled=false; if(this.client && this.client!==client && this.dialog.open) this.loadDefinitions();}
        }
        async run(message,action,success) {
            const client=this.client;
            if (!client || client.busy) return;
            this.message(message);
            try {await action();if (this.client===client) this.message(success);}
            catch(e) {if (this.client===client) this.message(e.message,true);}
            finally {if (this.client===client) this.render();}
        }
        render() {
            const client=this.client, busy=!client || client.busy || !client.connected;
            this.refreshButton.disabled=busy;
            this.saveButton.disabled=!client?.params.size;
            this.loadButton.disabled=busy || !client?.params.size;
            if (this.uploadButton) this.uploadButton.disabled=busy || !this.importChangeCount;
            const params=client?.search(this.search.value,this.changedOnly.checked) || [];
            const pages=Math.max(1,Math.ceil(params.length/this.pageSize));this.page=Math.min(this.page,pages-1);
            this.previous.disabled=this.page===0;this.next.disabled=this.page+1>=pages;
            const start=this.page*this.pageSize;
            this.count.textContent=`${params.length ? start+1 : 0}–${Math.min(start+this.pageSize,params.length)} of ${params.length} matches · ${client?.params.size || 0} parameters`;
            this.list.replaceChildren();
            if (!params.length) {this.list.append(element('p',client?.params.size ? 'No parameters match this search.' : 'No parameters loaded.'));return;}
            const fragment=document.createDocumentFragment();
            for (const p of params.slice(start,start+this.pageSize)) fragment.append(this.row(p,busy));
            this.list.append(fragment);
        }
        row(p,busy) {
            const d=this.client.definitions.get(p.name) || {};
            const changed=p.defaultValue !== undefined && p.value !== p.defaultValue;
            const row=element('article',undefined,'mavparam-row');row.dataset.parameter=p.name;
            if (changed) row.classList.add('mavparam-changed');
            const heading=element('div');heading.append(element('strong',p.name));
            if (d.label) heading.append(element('div',d.label,'mavparam-label'));
            if (d.readOnly) heading.append(element('small','Read-only'));
            const editor=element('form',undefined,'mavparam-value');
            const label=element('label','Value');
            const input=element('input');input.type='text';input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;
            input.setAttribute('aria-label',`${p.name} value`);input.value=this.drafts.get(p.name) ?? MAVParam.formatValue(p);
            input.disabled=busy || d.readOnly;
            input.oninput=()=>this.drafts.set(p.name,input.value);label.append(input);
            const apply=element('button','Apply');apply.type='submit';apply.disabled=busy || d.readOnly;
            editor.onsubmit=event=>{
                event.preventDefault();
                const client=this.client;
                this.run(`Writing ${p.name}…`,async()=>{
                    const values=MAVParam.parseText(`${p.name} ${input.value}`);
                    await client.apply(values);this.drafts.delete(p.name);
                },`${p.name} saved and verified.${d.rebootRequired ? ' Reboot required for this setting.' : ''}`);
            };
            editor.append(label,apply);
            if (Object.keys(d.values || {}).length) {
                const options=element('select');options.setAttribute('aria-label',`${p.name} options`);options.disabled=busy || d.readOnly;
                const placeholder=element('option','Choose an option');placeholder.value='';options.append(placeholder);
                for (const [value,text] of Object.entries(d.values)) {const option=element('option',`${value}: ${text}`);option.value=value;options.append(option);}
                options.value=Object.hasOwn(d.values,String(p.value)) ? String(p.value) : '';
                options.onchange=()=>{if(options.value!==''){input.value=options.value;this.drafts.set(p.name,input.value);}};
                editor.append(options);
            }
            if (Object.keys(d.bitmask || {}).length) {
                const bits=element('details');bits.append(element('summary','Bitmask options'));
                for (const [bit,text] of Object.entries(d.bitmask)) {
                    if (!/^\d+$/.test(bit) || Number(bit)>31) continue;
                    const label=element('label',undefined,'mavparam-bit');const checkbox=element('input');checkbox.type='checkbox';
                    checkbox.checked=Number.isFinite(Number(input.value)) && !!(BigInt(Math.trunc(Number(input.value))) & (1n<<BigInt(bit)));checkbox.disabled=busy || d.readOnly;
                    checkbox.onchange=()=>{
                        try {
                            let value=BigInt(input.value);const mask=1n<<BigInt(bit);
                            value=checkbox.checked ? value|mask : value&~mask;
                            // Packed int32 bitmasks retain bit 31 without float rounding.
                            if (p.type===3) value=BigInt.asIntN(32,value);
                            input.value=String(value);this.drafts.set(p.name,input.value);
                        } catch (_) {this.message('Enter an integer before changing bitmask options.',true);}
                    };
                    label.append(checkbox,document.createTextNode(` ${bit}: ${text}`));bits.append(label);
                }
                editor.append(bits);
            }
            const defaults=element('div',undefined,'mavparam-default');
            defaults.append(element('span',`Default: ${p.defaultValue===undefined ? 'unavailable' : MAVParam.formatValue(p,p.defaultValue)}`));
            if (changed) {
                const reset=button('Reset to default',()=>{
                    const client=this.client;
                    this.run(`Resetting ${p.name}…`,async()=>{await client.reset(p.name);this.drafts.delete(p.name);},`${p.name} reset and verified.`);
                });reset.disabled=busy || d.readOnly;reset.setAttribute('aria-label',`Reset ${p.name} to default`);defaults.append(reset);
            }
            const help=element('div',undefined,'mavparam-help');help.append(element('p',d.description || 'No description available.'));
            const hints=[];
            if (d.units) hints.push(`Units: ${d.units}`);
            if (d.range) hints.push(`Range: ${typeof d.range==='object' ? `${d.range.low} to ${d.range.high}` : d.range}`);
            if (d.increment) hints.push(`Increment: ${d.increment}`);
            if (d.rebootRequired) hints.push('Reboot required');
            help.append(element('small',hints.join(' · ')));
            row.append(heading,editor,defaults,help);return row;
        }
        save() {
            const params=[...this.client.params.values()].filter(p=>this.saveScope.value==='all' || p.defaultValue!==undefined && p.value!==p.defaultValue);
            const url=URL.createObjectURL(new Blob([MAVParam.saveText(params)],{type:'text/plain'}));
            const a=element('a');a.href=url;a.download=`${this.vehicle.toLowerCase()}-${this.saveScope.value}.parm`;a.click();
            setTimeout(()=>URL.revokeObjectURL(url),1000);
            this.message(`Saved ${params.length} parameters. Search does not limit file exports.`);
        }
        async loadFile() {
            const file=this.fileInput.files[0], client=this.client;this.fileInput.value='';
            if (!file || !client) return;
            try {
                if (file.size>4*1024*1024) throw new Error('Parameter file exceeds 4 MiB');
                const values=MAVParam.parseText(await file.text());
                if (client!==this.client) return;
                const skipped=[];
                for (const name of values.keys()) {
                    if (client.params.has(name) && client.definitions.get(name)?.readOnly) {
                        skipped.push(name);values.delete(name);
                    }
                }
                const changes=client.changes(values);
                this.importChangeCount=changes.length;this.importValues=values;this.importPanel.replaceChildren();this.importPanel.hidden=false;
                this.importPanel.append(element('h3',`${file.name}: ${changes.length} changes`));
                if (skipped.length) this.importPanel.append(element('p',`Skipped read-only parameters: ${skipped.join(', ')}`));
                const preview=element('div',undefined,'mavparam-preview');
                for (const p of changes) preview.append(element('div',`${p.name}: ${MAVParam.formatValue(p,p.previousValue)} → ${MAVParam.formatValue(p)}`));
                this.uploadButton=button('Upload changes',()=>this.run('Uploading parameter file and verifying values…',async()=>{
                    await client.apply(values);this.importPanel.hidden=true;this.importValues=null;this.drafts.clear();
                },'Parameter file uploaded and verified.'));
                this.uploadButton.disabled=!changes.length || client.busy;
                this.importPanel.append(preview,this.uploadButton,button('Cancel import',()=>{this.importPanel.hidden=true;this.importValues=null;}));
            } catch(e) {this.importPanel.hidden=true;this.importValues=null;this.message(e.message,true);}
        }
        destroy() {this.unsubscribe?.();this.dialog.remove();}
    }
    root.MAVParamUI=MAVParamUI;
})(globalThis);
