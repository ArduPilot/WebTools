'use strict';
const METADATA_URLS={Plane:'https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml',Copter:'https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml',Rover:'https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.xml'};
const $=id=>document.getElementById(id);
const emptySlot=()=>({name:'',min:'',max:'',increment:'',config_type:0,enabled:false,source:'Offline'});
const state={vehicle:'Plane',screen:5,slots:{},metadata:{},cache:{},request:0};
for(const screen of [5,6])for(let slot=1;slot<=9;slot++)state.slots[`${screen}:${slot}`]=emptySlot();
// Show an in-progress label until the action settles, including failures.
// Allow one paint frame so synchronous operations visibly update their button.
async function withProgress(id, label, action){
 const button=$(id);
 if(button.dataset.progress==='1')return;
 const original=button.textContent;
 const wasDisabled=button.disabled;
 button.dataset.progress='1';
 button.textContent=label;
 button.disabled=true;
 button.setAttribute('aria-busy','true');
 try{
  await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  return await action();
 }catch(error){log(`Warning: ${original} failed: ${error.message}`,'warning');}
 finally{
  delete button.dataset.progress;
  button.removeAttribute('aria-busy');
  button.textContent=original;
  button.disabled=wasDisabled;
  if(typeof updateUsbStatus==='function')updateUsbStatus();
 }
}
function log(message,type='info'){const line=document.createElement('div');line.className='log-'+type;line.textContent=`[${new Date().toLocaleTimeString()}] ${message}`;$('log').append(line);$('log').scrollTop=$('log').scrollHeight;}
function parseMetadata(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid XML');const result={};for(const param of doc.getElementsByTagName('param')){const name=(param.getAttribute('name')||'').split(':').pop().toUpperCase();if(!name)continue;const fields={};for(const field of param.getElementsByTagName('field'))fields[(field.getAttribute('name')||'').toLowerCase()]=(field.textContent||'').trim();const range=(fields.range||'').split(/\s+/);result[name]={min:range.length===2?range[0]:'',max:range.length===2?range[1]:'',increment:fields.increment||'',description:param.getAttribute('documentation')||'',readonly:fields.readonly==='true'};}if(!Object.keys(result).length)throw Error('No parameters found in XML');return result;}
function applyMetadata(xml,source){const parsed=parseMetadata(xml);state.metadata=parsed;state.cache[state.vehicle]=parsed;$('metaStatus').textContent=`${state.vehicle}: ${Object.keys(parsed).length} parameters (${source})`;render();fillMissing(false);log(`${state.vehicle} metadata loaded successfully (${Object.keys(parsed).length} parameters).`,'success');}
async function downloadMetadata(){const vehicle=state.vehicle;const request=++state.request;if(state.cache[vehicle]){state.metadata=state.cache[vehicle];$('metaStatus').textContent=`${vehicle}: ${Object.keys(state.metadata).length} parameters (cached)`;render();log(`${vehicle} metadata loaded from cache.`,'success');return;}$('metaStatus').textContent=`Downloading ${vehicle} metadata…`;log(`Downloading ${vehicle} metadata…`);try{const response=await fetch(METADATA_URLS[vehicle],{cache:'default'});if(!response.ok)throw Error(`HTTP ${response.status}`);const xml=await response.text();if(request!==state.request||vehicle!==state.vehicle)return;applyMetadata(xml,'online');}catch(error){if(request!==state.request)return;$('metaStatus').textContent='Metadata download unavailable';log(`Warning: Could not download metadata (${error.message}). Try Load metadata XML; the host may block browser cross-origin requests.`,'warning');}}
function fillMissing(announce=true){let count=0;for(const slot of Object.values(state.slots)){const meta=state.metadata[slot.name];if(!meta)continue;for(const field of ['min','max','increment'])if(slot[field]===''&&meta[field]!==''){slot[field]=meta[field];count++;}}render();if(announce)log(count?`Successfully filled ${count} empty range fields.`:'No empty range fields with metadata values found.',count?'success':'info');}
function parameterPicker(slot,tr){
 const wrapper=document.createElement('div');wrapper.className='parameter-picker';
 const name=document.createElement('input');name.type='text';name.value=slot.name;name.placeholder='<BLANK / DISABLED>';name.autocomplete='off';name.disabled=!slot.enabled;name.setAttribute('aria-label','Parameter name');name.setAttribute('role','combobox');name.setAttribute('aria-autocomplete','list');name.setAttribute('aria-expanded','false');
 const arrow=document.createElement('button');arrow.type='button';arrow.className='picker-arrow';arrow.textContent='▾';arrow.title='Browse available parameters';arrow.setAttribute('aria-label','Show parameter choices');arrow.disabled=!slot.enabled;
 const menu=document.createElement('div');menu.className='picker-menu';menu.setAttribute('role','listbox');menu.hidden=true;
 wrapper.append(name,arrow,menu);
 const choices=()=>{const typed=name.value.trim().toUpperCase();const names=Object.keys(state.metadata).filter(n=>n.includes(typed)).sort();if(slot.name&&!names.includes(slot.name)&&slot.name.includes(typed))names.unshift(slot.name);return names.slice(0,100);};
 let selected=-1;
 function close(){menu.hidden=true;name.setAttribute('aria-expanded','false');selected=-1;}
 function select(value){slot.name=value;slot.enabled=Boolean(value);slot.source='Edited';const meta=state.metadata[value];if(meta)for(const f of ['min','max','increment'])if(slot[f]===''&&meta[f]!=='')slot[f]=meta[f];close();render();}
 function open(){if(name.disabled)return;const matches=choices();menu.replaceChildren();const blank=document.createElement('button');blank.type='button';blank.className='picker-option';blank.textContent='<BLANK / DISABLED>';blank.addEventListener('mousedown',e=>e.preventDefault());blank.addEventListener('click',()=>select(''));menu.append(blank);for(const value of matches){const item=document.createElement('button');item.type='button';item.className='picker-option';item.textContent=value;item.setAttribute('role','option');item.addEventListener('mousedown',e=>e.preventDefault());item.addEventListener('click',()=>select(value));menu.append(item);}if(!matches.length){const info=document.createElement('div');info.className='picker-empty';info.textContent='No matching metadata parameters';menu.append(info);}menu.hidden=false;name.setAttribute('aria-expanded','true');selected=-1;}
 name.addEventListener('input',()=>{slot.name=name.value.trim().toUpperCase();slot.source='Edited';updateDescription(tr,slot);open();});
 name.addEventListener('focus',()=>open());
 name.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(menu.hidden)open();const items=[...menu.querySelectorAll('.picker-option')];if(!items.length)return;selected=(selected+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((item,i)=>item.classList.toggle('highlight',i===selected));items[selected].scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&!menu.hidden){e.preventDefault();const items=menu.querySelectorAll('.picker-option');if(selected>=0&&items[selected])items[selected].click();else{close();const meta=state.metadata[slot.name];if(meta)for(const f of ['min','max','increment'])if(slot[f]===''&&meta[f]!=='')slot[f]=meta[f];render();}}});
 arrow.addEventListener('click',()=>{if(menu.hidden){name.focus();open();}else close();});
 name.addEventListener('blur',()=>{setTimeout(()=>{if(!wrapper.contains(document.activeElement))close();},120);});
 return wrapper;
}
function render(){for(const screen of [5,6]){$(`tab${screen}`).classList.toggle('active',screen===state.screen);$(`tab${screen}`).setAttribute('aria-selected',String(screen===state.screen));}const tbody=$('slots');tbody.replaceChildren();for(let i=1;i<=9;i++){const key=`${state.screen}:${i}`,slot=state.slots[key];const tr=document.createElement('tr');const number=document.createElement('td');number.textContent=String(i);const enable=document.createElement('input');enable.type='checkbox';enable.className='slot-enable';enable.checked=slot.enabled===true;enable.title='Enable or disable this OSD parameter slot';enable.setAttribute('aria-label',`Enable OSD${state.screen} slot ${i}`);enable.addEventListener('change',()=>{slot.enabled=enable.checked;slot.source='Edited';render();});number.append(document.createElement('br'),enable);tr.append(number);tr.classList.toggle('slot-disabled',!slot.enabled);const paramTd=document.createElement('td');paramTd.append(parameterPicker(slot,tr));tr.append(paramTd);for(const field of ['min','max','increment']){const td=document.createElement('td');const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.value=slot[field];input.disabled=!slot.enabled;input.title=field==='increment'?'OSD adjustment step size':`OSD ${field}imum allowed value`;input.addEventListener('input',()=>{slot[field]=input.value;slot.source='Edited';updateDescription(tr,slot);});td.append(input);tr.append(td);}const desc=document.createElement('td');desc.className='desc';tr.append(desc);updateDescription(tr,slot);tbody.append(tr);}}
function clearAll(){if(!confirm('Clear and disable all 18 parameter slots on Screens 5 and 6?\n\nThis only changes the editor. The flight controller is NOT changed unless you click Write to FC.'))return;for(const key of Object.keys(state.slots))state.slots[key]={...emptySlot(),source:'Cleared'};render();log('All 18 editor slots cleared and disabled. FC unchanged until Write to FC.','success');}
function updateDescription(tr,slot){const desc=tr.lastElementChild;const origin=slot.source||'Offline';const status=slot.enabled===false?' (disabled)':'';desc.textContent=origin+status;}
function download(filename,text,mime){const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function saveJson(){const out={format:1,vehicle:state.vehicle,slots:{}};for(const [key,slot]of Object.entries(state.slots))out.slots[key]={name:slot.name,min:slot.min,max:slot.max,increment:slot.increment,config_type:slot.config_type||0,enabled:slot.enabled,source:slot.source};download('ardupilot_osd_config.json',JSON.stringify(out,null,2)+'\n','application/json');log('JSON configuration saved successfully.','success');}
function loadJson(text){const data=JSON.parse(text);if(!data||typeof data.slots!=='object'||!data.slots)throw Error('Missing slots object');for(const key of Object.keys(state.slots)){const slot=data.slots[key];if(!slot)continue;state.slots[key]={name:String(slot.name||'').toUpperCase(),min:String(slot.min??''),max:String(slot.max??''),increment:String(slot.increment??''),config_type:Number(slot.config_type)||0,enabled:slot.enabled===undefined?Boolean(slot.name):Boolean(slot.enabled),source:'JSON file'};}if(METADATA_URLS[data.vehicle]){$('vehicle').value=data.vehicle;switchVehicle(data.vehicle);}render();log('JSON configuration loaded successfully. Loaded slot Enable states are now the desired settings; the last FC read remains the comparison baseline.','success');}
function parseParam(text){let count=0;for(const line of text.split(/\r?\n/)){const trimmed=line.trim();if(!trimmed||trimmed.startsWith('#'))continue;const parts=trimmed.split(/[\s,=]+/);const name=parts[0],value=parts[1];if(value===undefined)continue;const match=/^OSD([56])_PARAM([1-9])_(MIN|MAX|INCR|EN)$/.exec(name);if(!match)continue;const slot=state.slots[`${match[1]}:${match[2]}`];if(match[3]==='EN'){slot.enabled=Number(value)!==0;}else slot[match[3]==='INCR'?'increment':match[3].toLowerCase()]=value;count++;}render();log(count?`Imported ${count} numeric/enable OSD fields. Names cannot be reconstructed from KEY/IDX/GRP in a .param file.`:'Warning: No supported OSD5/6 numeric fields found.',count?'success':'warning');}
function exportParam(){const lines=['# ArduPilot OSD Parameter Editor: numeric slot settings ONLY','# WARNING: This file does not set OSD slot parameter names (KEY/IDX/GRP).','# Verify all assignments on the FC before using these settings.'];let count=0;for(const [key,slot]of Object.entries(state.slots)){const [screen,index]=key.split(':');const prefix=`OSD${screen}_PARAM${index}_`;lines.push(`${prefix}EN,${slot.enabled!==false&&slot.name?1:0}`);for(const [field,suffix]of [['min','MIN'],['max','MAX'],['increment','INCR']]){const value=slot[field].trim();if(value==='')continue;if(!Number.isFinite(Number(value))){log(`Warning: Invalid ${field} in slot ${key}; export canceled.`,'warning');return;}lines.push(`${prefix}${suffix},${value}`);count++;}}download('ardupilot_osd_numeric_only.param',lines.join('\n')+'\n','text/plain');log(`Exported ${count} numeric fields and 18 enable flags. Parameter assignments are NOT included.`,'success');}
async function loadFile(event,handler){
 const file=event.target.files?.[0];if(!file)return;
 const label=event.target.closest('.filebtn');
 const textNode=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
 const original=textNode?.textContent;
 if(textNode)textNode.textContent='LOADING…';
 label.classList.add('is-loading');label.setAttribute('aria-busy','true');
 try{
  await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  await handler(await file.text());
 }catch(error){log(`Error loading ${file.name}: ${error.message}`,'warning');}
 finally{
  if(textNode)textNode.textContent=original;
  label.classList.remove('is-loading');label.removeAttribute('aria-busy');
  event.target.value='';
 }
}
function switchVehicle(vehicle){state.vehicle=vehicle;state.request++;state.metadata={};$('metaStatus').textContent=`${vehicle}: metadata not loaded`;downloadMetadata();}
$('vehicle').addEventListener('change',event=>switchVehicle(event.target.value));
$('fetchMeta').addEventListener('click',()=>withProgress('fetchMeta','DOWNLOADING…',async()=>{delete state.cache[state.vehicle];await downloadMetadata();}));
$('xmlFile').addEventListener('change',event=>loadFile(event,text=>applyMetadata(text,'local XML')));
$('jsonFile').addEventListener('change',event=>loadFile(event,loadJson));
$('paramFile').addEventListener('change',event=>loadFile(event,parseParam));
$('saveJson').addEventListener('click',()=>withProgress('saveJson','SAVING…',saveJson));
$('clearAll').addEventListener('click',()=>withProgress('clearAll','CLEARING…',clearAll));
$('saveParam').addEventListener('click',()=>withProgress('saveParam','EXPORTING…',exportParam));
$('fill').addEventListener('click',()=>withProgress('fill','FILLING…',()=>fillMissing()));
$('clearLog').addEventListener('click',()=>withProgress('clearLog','CLEARING…',()=>$('log').replaceChildren()));
for(const screen of [5,6])$(`tab${screen}`).addEventListener('click',()=>{state.screen=screen;render();});
render();log('Offline editor ready. Choose a vehicle to load metadata, or load JSON/XML files.');downloadMetadata();
