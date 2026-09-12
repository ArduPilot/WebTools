#!/usr/bin/env python3
"""Regenerate independent wire fixtures with pymavlink (not needed to run tests)."""
import json
from pathlib import Path
from pymavlink.dialects.v20 import ardupilotmega as mav

messages = [
    mav.MAVLink_heartbeat_message(11, 3, 137, 5, 4, 3),
    mav.MAVLink_command_int_message(42, 1, 6, 192, 0, 0, 0, 1, 0, 0, -350000000, 1490000000, 0),
    mav.MAVLink_command_ack_message(192, 0, 100, 0, 255, 190),
    mav.MAVLink_global_position_int_message(1234, -350000000, 1490000000, 556000, 1500, 123, -45, 0, 9000),
    mav.MAVLink_attitude_message(1234, 0.1, -0.2, 1.5, 0, 0, 0),
    mav.MAVLink_battery_status_message(0, 0, 0, 2500, [12000] + [65535] * 9, 125, 40, 0, 87, 120, 2, [12001, 12002, 12003, 12004], 1, 4),
    mav.MAVLink_gps_raw_int_message(1234567890123, 3, -350000000, 1490000000, 556000, 80, 110, 123, 9000, 14),
    mav.MAVLink_gps2_raw_message(1234567890123, 3, -350000000, 1490000000, 556000, 80, 110, 123, 9000, 14, 0, 0),
    mav.MAVLink_sys_status_message(1 << 20, 1 << 20, 1 << 20, 50, 12000, 125, 87, 0, 0, 0, 0, 0, 0),
    mav.MAVLink_position_target_global_int_message(1234, 0, 65016, -350000000, 1490000000, 556, 0, 0, 0, 0, 0, 0, 0, 0),
    mav.MAVLink_statustext_message(6, b'Boat ready'),
    mav.MAVLink_file_transfer_protocol_message(0, 255, 190, [i % 256 for i in range(251)]),
    mav.MAVLink_mission_item_int_message(42, 1, 0, 0, 5003, 0, 0, 25, 0, 0, 0, -350000000, 1490000000, 0, 1),
]
link = mav.MAVLink(None, srcSystem=42, srcComponent=1)
link.seq = 17
fixtures = []
for msg in messages:
    fields = msg.to_dict()
    fields.pop('mavpackettype')
    fixtures.append(dict(name=msg.get_type().lower(), fields=fields, hex=msg.pack(link).hex()))
link.signing.secret_key = bytes(range(32))
link.signing.link_id = 7
link.signing.timestamp = 1000000000000
link.signing.sign_outgoing = True
signed = messages[0].pack(link).hex()
link.signing.sign_outgoing = False
v1 = messages[0].pack(link, force_mavlink1=True).hex()
Path(__file__).with_name('mavlink.json').write_text(json.dumps(dict(messages=fixtures, signed=signed, v1=v1), indent=2) + '\n')
