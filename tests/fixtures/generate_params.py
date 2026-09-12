#!/usr/bin/env python3
"""Small independent packed-parameter vectors, verified by MAVProxy's decoder."""
import json
import struct
from pathlib import Path
from MAVProxy.modules.lib.param_ftp import ftp_param_decode

params = [
    ('TEST_I8', -12, 1, 0),
    ('TEST_I16', -1234, 2, -1234),
    ('TEST_I32', 16777217, 3, 0),
    ('TEST_FLOAT', 1.25, 4, 0.5),
    ('TEST_OPTIONS', 5, 3, 0),
    ('TEST_READONLY', 1, 1, 1),
]
formats = {1:'b',2:'h',3:'i',4:'f'}
packet = bytearray(struct.pack('<HHH', 0x671c,len(params),len(params)))
previous = ''
offsets = {}
for name,value,kind,default in params:
    common = 0
    while common < min(len(previous),len(name)) and previous[common] == name[common]:
        common += 1
    suffix = name[common:]
    packet += bytes([kind|0x10,common|((len(suffix)-1)<<4)]) + suffix.encode()
    offsets[name] = {'offset':len(packet),'type':kind}
    packet += struct.pack('<'+formats[kind]*2,value,default)
    packet += b'\0\0'  # padding between records
    previous = name
assert len(ftp_param_decode(bytes(packet)).params) == len(params)
# Upload header's final word is the total byte length, not parameter count.
entry = bytes([3,0x70]) + b'TEST_I32' + struct.pack('<i',16777219)
upload = struct.pack('<HHH',0x671b,1,6+len(entry)) + entry
Path(__file__).with_name('params.json').write_text(json.dumps({'hex':packet.hex(),'offsets':offsets,'uploadHex':upload.hex()},indent=2)+'\n')
