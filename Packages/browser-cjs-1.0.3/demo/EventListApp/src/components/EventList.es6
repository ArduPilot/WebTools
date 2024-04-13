const React = window.React;
const Component = React.Component;
const EventItem = require("./EventItem.js");

const FILTER_OPTIONS = {
  all: "",
  important: "important",
  upcoming: "upcoming",
  finished: "finished"
};

const SORT_OPTIONS = {
  asc: "asc",
  desc: "desc"
};

module.exports = class EventList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      queryString: "",
      filterOption: FILTER_OPTIONS.all,
      sortOption: SORT_OPTIONS.asc,
      items: []
    };
    this.onSearchChange = this.onSearchChange.bind(this);
    this.onFilterSelectionChange = this.onFilterSelectionChange.bind(this);
    this.onSortChange = this.onSortChange.bind(this);
    this._compareByTitle = this._compareBy.bind(this, "title");
  }

  componentDidMount() {
    return this.loadData();
  }

  loadData() {
    fetch(' ../data/eventList.json').then((resp) => {
      return resp.json();
    }).then((eventData) => {
      this.setState({ items: eventData });
    });
    return this;
  }

  onSearchChange(event) {
    if (event && event.target && event.target.value !== this.state.queryString) {
      this.setState({ queryString: event.target.value });
    }
    return this;
  }

  onFilterSelectionChange(event) {
    if (event && event.target && event.target.name === "filter-select") {
      this.setState({ filterOption: event.target.value });
    }
    return this;
  }

  onSortChange() {
    this.setState({ sortOption: this.state.sortOption === SORT_OPTIONS.asc ? SORT_OPTIONS.desc : SORT_OPTIONS.asc });
    return this;
  }

  render() {
    const checked = this.state.filterOption;
    return (<div className="layout wrapme column align-center justify-center">
      <div className="search-bar elevation-3">
        <input placeholder="Search" type="text" name="search" value={this.state.queryString} onChange={this.onSearchChange} />
      </div>
      <div className="layout align-center justify-space-between row" style={{ width: "100%" }}>
        <div className="upcoming-events-filter-group">
          <input type="radio" id="allSelect" name="filter-select" value={FILTER_OPTIONS.all} checked={!this.state.filterOption ? "checked" : false} onChange={this.onFilterSelectionChange} />
          <label htmlFor="allSelect">All</label>
          <input type="radio" id="importantSelect" name="filter-select" value={FILTER_OPTIONS.important} checked={this.state.filterOption === FILTER_OPTIONS.important ? "checked" : false} onChange={this.onFilterSelectionChange} />
          <label htmlFor="importantSelect">Important</label>
          <input type="radio" id="upcomingSelect" name="filter-select" value={FILTER_OPTIONS.upcoming} checked={this.state.filterOption === FILTER_OPTIONS.upcoming ? "checked" : false} onChange={this.onFilterSelectionChange} />
          <label htmlFor="upcomingSelect">Upcoming</label>
          <input type="radio" id="finishedSelect" name="filter-select" value={FILTER_OPTIONS.finished} checked={this.state.filterOption === FILTER_OPTIONS.finished ? "checked" : false} onChange={this.onFilterSelectionChange} />
          <label htmlFor="finishedSelect">Finished</label>
        </div>
        <button type="button" onClick={this.onSortChange} className="v-btn v-btn--flat" style={{ alignSelf: "flex-end", color: "rgb(158, 158, 158)", marginRight: "1.4em", position: "relative" }}>
          <div className="v-btn__content">
            <span style={{ paddingRight: "0.4em" }}>Filter</span>
            <i aria-hidden="true" className={this.state.sortOption === SORT_OPTIONS.asc ? "v-icon material-icons rotate180" : "v-icon material-icons"} >filter_list</i>
          </div>
        </button>
      </div>
      <ul className="event-card-list">{
        this._getItemsFiltered().map((item, i) => {
          return <EventItem key={i} index={i} title={item.title} date={item.date} desc={item.desc} address={item.address} pic={item.pic} month={item.month} day={item.day} important={item.important} upcoming={item.upcoming} />;
        })
      }</ul>
    </div>);
  }

  _compareBy(prop, a, b) {
    if (a[prop].toLowerCase() < b[prop].toLowerCase()) {
      return this.state.sortOption === SORT_OPTIONS.asc ? -1 : 1;
    }
    if (a[prop].toLowerCase() > b[prop].toLowerCase()) {
      return this.state.sortOption === SORT_OPTIONS.asc ? 1 : -1;
    }
    return 0;
  }

  _getItemsFiltered() {
    const prop = this.state.filterOption;
    const allItems = this.state.items;
    const queryString = this.state.queryString.toLowerCase();
    let fullTxt = "";
    let items = allItems || [];

    switch (prop) {
      case FILTER_OPTIONS.important:
      case FILTER_OPTIONS.upcoming:
        items = allItems.filter((item) => {
          fullTxt = `${item.title} ${item.date} ${item.desc} ${item.address} ${item.month} ${item.day}`.toLowerCase();
          return item[prop] === true && fullTxt.includes(queryString);
        });
        break;
      case FILTER_OPTIONS.finished:
        items = allItems.filter((item) => {
          fullTxt = `${item.title} ${item.date} ${item.desc} ${item.address} ${item.month} ${item.day}`.toLowerCase();
          return item[FILTER_OPTIONS.upcoming] === false && fullTxt.includes(queryString);
        });
        break;
      case FILTER_OPTIONS.all:
      default:
        items = allItems.filter((item) => {
          fullTxt = `${item.title} ${item.date} ${item.desc} ${item.address} ${item.month} ${item.day}`.toLowerCase();
          return fullTxt.includes(queryString);
        });
        break;
    }
    items.sort(this._compareByTitle);
    return items;
  }
};