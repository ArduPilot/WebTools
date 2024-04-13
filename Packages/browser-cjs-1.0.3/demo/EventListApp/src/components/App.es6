const React = window.React;
const Component = React.Component;
const EventList = require("./EventList.js");

module.exports = class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      appInfo: {}
    };
  }

  componentDidMount() {
    const pack = require("../../package.json");
    this.setState({
      appInfo: pack
    });
  }

  render() {
    const title = document.querySelector("head > title");
    title.innerHTML = this.state.appInfo.displayName;

    return (<div data-app="true" className="application theme--light" id="app">
      <div className="application--wrap">
        <header className="app-header">
          <nav className="v-toolbar red" style={{ "marginTop": 0, "paddingRight": 0, "paddingLeft": 0, transform: "translateY(0px)" }}>
            <div className="v-toolbar__content" style={{ height: 56 }}>
              <div className="v-toolbar__title white--text">Events Card List</div>
              <div className="spacer"></div>
            </div>
          </nav>
        </header>
        <main className="v-content" style={{ padding: 0, background: "rgb(238, 238, 238)" }}>
          <div className="v-content__wrap">
            <div className="container">
              <div className="layout justify-center">
                <EventList />
              </div>
            </div>
          </div>
        </main>
        <footer className="app-footer">
        </footer>
      </div>
    </div>);
  }
};
