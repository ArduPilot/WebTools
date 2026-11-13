'use strict';
// Small, dependency-free MAVLink 2 subset for ArduPilot OSD configuration.
// Field layouts follow mavlink/ardupilotmega.xml and common.xml (wire order).
const defs={
  0:['HEARTBEAT',[['uint32_t','custom_mode'],['uint8_t','type'],['uint8_t','autopilot'],['uint8_t','base_mode'],['uint8_t','system_status'],['uint8_t','mavlink_version']]],
  20:['PARAM_REQUEST_READ',[['int16_t','param_index'],['uint8_t','target_system'],['uint8_t','target_component'],['char[16]','param_id']]],
  21:['PARAM_REQUEST_LIST',[['uint8_t','target_system'],['uint8_t','target_component']]],
  22:['PARAM_VALUE',[['float','param_value'],['uint16_t','param_count'],['uint16_t','param_index'],['char[16]','param_id'],['uint8_t','param_type']]],
  23:['PARAM_SET',[['float','param_value'],['uint8_t','target_system'],['uint8_t','target_component'],['char[16]','param_id'],['uint8_t','param_type']]],
  11033:['OSD_PARAM_CONFIG',[['uint32_t','request_id'],['float','min_value'],['float','max_value'],['float','increment'],['uint8_t','target_system'],['uint8_t','target_component'],['uint8_t','osd_screen'],['uint8_t','osd_index'],['char[16]','param_id'],['uint8_t','config_type']]],
  11034:['OSD_PARAM_CONFIG_REPLY',[['uint32_t','request_id'],['uint8_t','result']]],
  11035:['OSD_PARAM_SHOW_CONFIG',[['uint32_t','request_id'],['uint8_t','target_system'],['uint8_t','target_component'],['uint8_t','osd_screen'],['uint8_t','osd_index']]],
  11036:['OSD_PARAM_SHOW_CONFIG_REPLY',[['uint32_t','request_id'],['float','min_value'],['float','max_value'],['float','increment'],['uint8_t','result'],['char[16]','param_id'],['uint8_t','config_type']]]
};
const sizes={uint32_t:4,int32_t:4,float:4,uint16_t:2,int16_t:2,uint8_t:1,int8_t:1};
function size(t){return t.startsWith('char[')?Number(t.slice(5,-1)):sizes[t];}
function crcStep(crc,b){let x=(b^(crc&255))&255;x^=(x<<4)&255;return ((crc>>8)^(x<<8)^(x<<3)^(x>>4))&65535;}
function crcBytes(bytes,initial=0xffff){let c=initial;for(const b of bytes)c=crcStep(c,b);return c;}
const enc=new TextEncoder(),dec=new TextDecoder();
function crcExtra(id){const [name,fields]=defs[id];let c=crcBytes(enc.encode(name+' '));for(const [type,key] of fields){const base=type.startsWith('char[')?'char':type;c=crcBytes(enc.encode(base+' '+key+' '),c);if(type.startsWith('char['))c=crcStep(c,size(type));}return (c&255)^(c>>8);}
const extras=Object.fromEntries(Object.keys(defs).map(id=>[id,crcExtra(Number(id))]));
function payloadEncode(id,values){const fields=defs[id][1];const length=fields.reduce((s,[t])=>s+size(t),0),out=new Uint8Array(length),v=new DataView(out.buffer);let p=0;for(const [type,key]of fields){const x=values[key]??0;if(type==='float')v.setFloat32(p,x,true);else if(type==='uint32_t')v.setUint32(p,x,true);else if(type==='int32_t')v.setInt32(p,x,true);else if(type==='uint16_t')v.setUint16(p,x,true);else if(type==='int16_t')v.setInt16(p,x,true);else if(type==='uint8_t')v.setUint8(p,x);else if(type==='int8_t')v.setInt8(p,x);else if(type.startsWith('char['))out.set(enc.encode(String(x)).slice(0,size(type)),p);p+=size(type);}return out;}
// MAVLink 2 removes trailing zero bytes from payloads. Decode against the
// full message layout after restoring those implicit zeros, including char[16].
function payloadDecode(id,bytes){
 const fields=defs[id][1];
 const fullLength=fields.reduce((sum,[type])=>sum+size(type),0);
 if(bytes.length>fullLength)throw Error(`Oversized MAVLink payload for ${id}`);
 const padded=new Uint8Array(fullLength);
 padded.set(bytes);
 const v=new DataView(padded.buffer),out={};
 let p=0;
 for(const [type,key] of fields){
  const n=size(type);
  if(type==='float')out[key]=v.getFloat32(p,true);
  else if(type==='uint32_t')out[key]=v.getUint32(p,true);
  else if(type==='int32_t')out[key]=v.getInt32(p,true);
  else if(type==='uint16_t')out[key]=v.getUint16(p,true);
  else if(type==='int16_t')out[key]=v.getInt16(p,true);
  else if(type==='uint8_t')out[key]=v.getUint8(p);
  else if(type==='int8_t')out[key]=v.getInt8(p);
  else if(type.startsWith('char['))out[key]=dec.decode(padded.subarray(p,p+n)).replace(/\0.*$/,'');
  p+=n;
 }
 return out;
}

class MavlinkSerial{
 constructor(onMessage,onDisconnect){this.onMessage=onMessage;this.onDisconnect=onDisconnect;this.seq=0;this.buffer=new Uint8Array(0);this.pending=[];this.active=false;this.sys=255;this.comp=190;this.targetSystem=0;this.targetComponent=1;}
 async connect(baud){if(!navigator.serial)throw Error('Web Serial is unavailable. Use Chrome/Edge over HTTPS or localhost.');this.port=await navigator.serial.requestPort();await this.port.open({baudRate:baud,bufferSize:8192});this.active=true;this.reader=this.port.readable.getReader();this.writer=this.port.writable.getWriter();this.readLoop();}
 async disconnect(){this.active=false;for(const p of this.pending.splice(0)){clearTimeout(p.timer);p.reject(Error('Disconnected'));}try{await this.reader?.cancel();}catch{}try{this.reader?.releaseLock();}catch{}try{this.writer?.releaseLock();}catch{}try{await this.port?.close();}catch{}this.onDisconnect?.();}
 async readLoop(){try{while(this.active){const {value,done}=await this.reader.read();if(done)break;if(value)this.feed(value);}}catch(e){if(this.active)this.onDisconnect?.(e);}finally{if(this.active){this.active=false;this.onDisconnect?.(Error('USB serial connection closed'));}}}
 feed(chunk){const merged=new Uint8Array(this.buffer.length+chunk.length);merged.set(this.buffer);merged.set(chunk,this.buffer.length);this.buffer=merged;while(this.buffer.length>=8){let pos=this.buffer.findIndex(b=>b===0xfd||b===0xfe);if(pos<0){this.buffer=new Uint8Array(0);break;}if(pos)this.buffer=this.buffer.slice(pos);const v2=this.buffer[0]===0xfd,header=v2?10:6;if(this.buffer.length<header)break;const payloadLength=this.buffer[1],signed=v2&&Boolean(this.buffer[2]&1),frameLen=header+payloadLength+2+(signed?13:0);if(this.buffer.length<frameLen)break;const frame=this.buffer.slice(0,frameLen);this.buffer=this.buffer.slice(frameLen);const id=v2?(frame[7]|frame[8]<<8|frame[9]<<16):frame[5];if(!(id in defs))continue;const received=frame[header+payloadLength]|frame[header+payloadLength+1]<<8;let c=crcBytes(frame.slice(1,header+payloadLength));c=crcStep(c,extras[id]);if(c!==received)continue;const message={id,sysid:frame[v2?5:3],compid:frame[v2?6:4],...payloadDecode(id,frame.slice(header,header+payloadLength))};this.onMessage?.(message);for(const pending of [...this.pending])if(pending.match(message)){this.pending.splice(this.pending.indexOf(pending),1);clearTimeout(pending.timer);pending.resolve(message);}}if(this.buffer.length>16384)this.buffer=this.buffer.slice(-4096);}
 async send(id,values){if(!this.active)throw Error('Not connected');const payload=payloadEncode(id,values),frame=new Uint8Array(10+payload.length+2);frame[0]=0xfd;frame[1]=payload.length;frame[4]=this.seq++&255;frame[5]=this.sys;frame[6]=this.comp;frame[7]=id&255;frame[8]=(id>>8)&255;frame[9]=(id>>16)&255;frame.set(payload,10);let c=crcBytes(frame.slice(1,-2));c=crcStep(c,extras[id]);frame[frame.length-2]=c&255;frame[frame.length-1]=c>>8;await this.writer.write(frame);}
 wait(match,ms=2200){return new Promise((resolve,reject)=>{const pending={match,resolve,reject,timer:null};pending.timer=setTimeout(()=>{this.pending.splice(this.pending.indexOf(pending),1);reject(Error('MAVLink response timed out'));},ms);this.pending.push(pending);});}
 async request(id,values,match,ms){const waiting=this.wait(match,ms);try{await this.send(id,values);}catch(e){const p=this.pending.find(x=>x.match===match);if(p){clearTimeout(p.timer);this.pending.splice(this.pending.indexOf(p),1);p.reject(e);}throw e;}return waiting;}
}
window.MavlinkSerial=MavlinkSerial;
