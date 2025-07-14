/*
    MAVLink store of recently received messages
    use the mavlink_store object to store and retrieve messages
*/

class MAVLinkMessageStore {
    constructor() {
        this.store = {};
    }

    // default system and component ids
    sysid_default = 1;
    compid_default = 1;

    // store message in the message store
    // indexed by system id, component id and message id
    store_message(msg) {
        // sanity check msg
        if (msg == null || msg._id == null || msg._header == null || msg._header.srcSystem == null || msg._header.srcComponent == null) {
            return;
        }

        // retrieve sender's system id and component id
        let sysid = msg._header.srcSystem;
        let compid = msg._header.srcComponent;

        // store message in the message store
        if (this.store[sysid] == null) {
            this.store[sysid] = {};
        }
        if (this.store[sysid][compid] == null) {
            this.store[sysid][compid] = {};
        }
        this.store[sysid][compid][msg._id] = msg;
    }

    // retrieve latest message from the message store
    // returns null if not found
    get_latest_message(msgid, sysid = this.sysid_default, compid = this.compid_default) {
        if (this.store[sysid] == null) {
            return null;
        }
        if (this.store[sysid][compid] == null) {
            return null;
        }
        return this.store[sysid][compid][msgid];
    }

    find_message_by_name(name, sysid = this.sysid_default, compid = this.compid_default) {
      if (!this.store[sysid] || !this.store[sysid][compid]) {
        return null;
      }

      for (let id in this.store[sysid][compid]) {
        const msg = this.store[sysid][compid][id];
        if (msg._name === name) {
          return msg;
        }
      }

      return null;
    }


    // get available message names.  returns an array of message names
    // or null if no messages are available
    get_available_message_names(sysid = this.sysid_default, compid = this.compid_default) {
        if (this.store[sysid] == null) {
            return null;
        }
        if (this.store[sysid][compid] == null) {
            return null;
        }

        // get all message ids
        let msg_ids = Object.keys(this.store[sysid][compid]);
        if (msg_ids.length == 0) {
            return null;
        }

        // map message ids to message names
        let msg_names = msg_ids.map(msgid => this.store[sysid][compid][msgid]._name);
        if (msg_names.length == 0) {
            return null;
        }
        return msg_names;
    }
}

// export the MAVLinkMessageStore class
export default MAVLinkMessageStore;

// create a new instance of the MAVLinkMessageStore class
// to be used as a singleton
var mavlink_store = new MAVLinkMessageStore();

// export the mavlink_store object
export { mavlink_store };
