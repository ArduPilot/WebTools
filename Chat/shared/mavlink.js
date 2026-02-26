export let MAVLink = null;
export let mavlink_ws = null;

export function setMAVLink(instance) {
    MAVLink = instance;
}

export function setMavlinkWS(ws) {
    mavlink_ws = ws;
}
