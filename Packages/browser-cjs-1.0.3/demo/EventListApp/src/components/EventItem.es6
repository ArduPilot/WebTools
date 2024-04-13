const React = window.React;
const Component = React.Component;

module.exports = class EventItem extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (<li data-index={this.props.index} style={{ opacity: 1, height: "100%", transform: "scale(1)" }} className="">
      <div className="event-card v-card">
        <div className="layout row">
          <img src={this.props.pic} />
          <div className="layout column justify-space-between" style={{ padding: "0.8em 1.3em", maxWidth: 390 }}>
            <div>
              <h1 className="name">{this.props.title}</h1>
              <h3 className="date">{this.props.date}</h3>
            </div>
            <div>
              <p className="desc">{this.props.desc}</p>
              <div className="location">
                <i aria-hidden="true" className="v-icon material-icons">location_on</i>
                {this.props.address}
              </div>
            </div>
            <div className="date-ribbon">
              <h2>{this.props.month}</h2>
              <h1>{this.props.day}</h1>
            </div>
          </div>
        </div>
      </div>
    </li>);
  }
};
