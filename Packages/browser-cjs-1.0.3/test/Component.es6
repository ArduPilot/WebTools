module.exports = class Component {
  constructor(props) {
    this.state = {};
    this.setState(props);
  }

  setState(props) {
    props = typeof props === "object" ? props : {};
    this.state = Object.assign(this.state, props);
  }

  render() {
    return `<div id="${this.state.id || ""}">${this.state.value || ""}</div>`;
  }
};