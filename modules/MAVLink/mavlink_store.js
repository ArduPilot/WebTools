/*
    MAVLink store of recently received messages
    use the mavlink_store object to store and retrieve messages
*/

class MAVLinkMessageStore {
  static _instance = null;        // holds the one and only instance

  constructor() {
    // return the existing instance if it already exists
    if (MAVLinkMessageStore._instance) {
      return MAVLinkMessageStore._instance;
    }

    // first construction, do normal init
    this.store = {};

    // default system and component ids
    this.sysid_default = 1;
    this.compid_default = 1;

    // remember this instance for future constructions
    MAVLinkMessageStore._instance = this;
  }

  // optional helper, some teams prefer this call site
  static getInstance() {
    return new MAVLinkMessageStore();
  }

  // store message in the message store
  // indexed by system id, component id and message id
  store_message(msg) {
    // sanity check msg
    if (
      msg == null ||
      msg._id == null ||
      msg._header == null ||
      msg._header.srcSystem == null ||
      msg._header.srcComponent == null
    ) {
      return;
    }

    // retrieve sender system id and component id
    const sysid = msg._header.srcSystem;
    const compid = msg._header.srcComponent;

    // store message
    if (this.store[sysid] == null) {
      this.store[sysid] = {};
    }
    if (this.store[sysid][compid] == null) {
      this.store[sysid][compid] = {};
    }
    this.store[sysid][compid][msg._id] = msg;
  }

  // retrieve latest message, returns null if not found
  get_latest_message(msgid, sysid = this.sysid_default, compid = this.compid_default) {
    if (this.store[sysid] == null) return null;
    if (this.store[sysid][compid] == null) return null;
    return this.store[sysid][compid][msgid];
  }

  find_message_by_name(name, sysid = this.sysid_default, compid = this.compid_default) {
    if (!this.store[sysid] || !this.store[sysid][compid]) return null;
    for (const id in this.store[sysid][compid]) {
      const msg = this.store[sysid][compid][id];
      if (msg._name === name) return msg;
    }
    return null;
  }

  // get available message names, returns array or null
  get_available_message_names(sysid = this.sysid_default, compid = this.compid_default) {
    if (this.store[sysid] == null) return null;
    if (this.store[sysid][compid] == null) return null;

    const msg_ids = Object.keys(this.store[sysid][compid]);
    if (msg_ids.length === 0) return null;

    const msg_names = msg_ids.map(id => this.store[sysid][compid][id]._name);
    if (msg_names.length === 0) return null;
    return msg_names;
  }
}

// export the class
export default MAVLinkMessageStore;

// export the singleton instance
const mavlink_store = MAVLinkMessageStore.getInstance();
export { mavlink_store };
