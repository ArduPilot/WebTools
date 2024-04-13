"use strict";

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

var React = window.React;
var Component = React.Component;

var EventItem = require("./EventItem.js");

var FILTER_OPTIONS = {
  all: "",
  important: "important",
  upcoming: "upcoming",
  finished: "finished"
};
var SORT_OPTIONS = {
  asc: "asc",
  desc: "desc"
};

module.exports =
/*#__PURE__*/
function (_Component) {
  _inherits(EventList, _Component);

  function EventList(props) {
    var _this;

    _classCallCheck(this, EventList);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(EventList).call(this, props));
    _this.state = {
      queryString: "",
      filterOption: FILTER_OPTIONS.all,
      sortOption: SORT_OPTIONS.asc,
      items: []
    };
    _this.onSearchChange = _this.onSearchChange.bind(_assertThisInitialized(_this));
    _this.onFilterSelectionChange = _this.onFilterSelectionChange.bind(_assertThisInitialized(_this));
    _this.onSortChange = _this.onSortChange.bind(_assertThisInitialized(_this));
    _this._compareByTitle = _this._compareBy.bind(_assertThisInitialized(_this), "title");
    return _this;
  }

  _createClass(EventList, [{
    key: "componentDidMount",
    value: function componentDidMount() {
      return this.loadData();
    }
  }, {
    key: "loadData",
    value: function loadData() {
      var _this2 = this;

      fetch(' ../data/eventList.json').then(function (resp) {
        return resp.json();
      }).then(function (eventData) {
        _this2.setState({
          items: eventData
        });
      });
      return this;
    }
  }, {
    key: "onSearchChange",
    value: function onSearchChange(event) {
      if (event && event.target && event.target.value !== this.state.queryString) {
        this.setState({
          queryString: event.target.value
        });
      }

      return this;
    }
  }, {
    key: "onFilterSelectionChange",
    value: function onFilterSelectionChange(event) {
      if (event && event.target && event.target.name === "filter-select") {
        this.setState({
          filterOption: event.target.value
        });
      }

      return this;
    }
  }, {
    key: "onSortChange",
    value: function onSortChange() {
      this.setState({
        sortOption: this.state.sortOption === SORT_OPTIONS.asc ? SORT_OPTIONS.desc : SORT_OPTIONS.asc
      });
      return this;
    }
  }, {
    key: "render",
    value: function render() {
      var checked = this.state.filterOption;
      return React.createElement("div", {
        className: "layout wrapme column align-center justify-center"
      }, React.createElement("div", {
        className: "search-bar elevation-3"
      }, React.createElement("input", {
        placeholder: "Search",
        type: "text",
        name: "search",
        value: this.state.queryString,
        onChange: this.onSearchChange
      })), React.createElement("div", {
        className: "layout align-center justify-space-between row",
        style: {
          width: "100%"
        }
      }, React.createElement("div", {
        className: "upcoming-events-filter-group"
      }, React.createElement("input", {
        type: "radio",
        id: "allSelect",
        name: "filter-select",
        value: FILTER_OPTIONS.all,
        checked: !this.state.filterOption ? "checked" : false,
        onChange: this.onFilterSelectionChange
      }), React.createElement("label", {
        htmlFor: "allSelect"
      }, "All"), React.createElement("input", {
        type: "radio",
        id: "importantSelect",
        name: "filter-select",
        value: FILTER_OPTIONS.important,
        checked: this.state.filterOption === FILTER_OPTIONS.important ? "checked" : false,
        onChange: this.onFilterSelectionChange
      }), React.createElement("label", {
        htmlFor: "importantSelect"
      }, "Important"), React.createElement("input", {
        type: "radio",
        id: "upcomingSelect",
        name: "filter-select",
        value: FILTER_OPTIONS.upcoming,
        checked: this.state.filterOption === FILTER_OPTIONS.upcoming ? "checked" : false,
        onChange: this.onFilterSelectionChange
      }), React.createElement("label", {
        htmlFor: "upcomingSelect"
      }, "Upcoming"), React.createElement("input", {
        type: "radio",
        id: "finishedSelect",
        name: "filter-select",
        value: FILTER_OPTIONS.finished,
        checked: this.state.filterOption === FILTER_OPTIONS.finished ? "checked" : false,
        onChange: this.onFilterSelectionChange
      }), React.createElement("label", {
        htmlFor: "finishedSelect"
      }, "Finished")), React.createElement("button", {
        type: "button",
        onClick: this.onSortChange,
        className: "v-btn v-btn--flat",
        style: {
          alignSelf: "flex-end",
          color: "rgb(158, 158, 158)",
          marginRight: "1.4em",
          position: "relative"
        }
      }, React.createElement("div", {
        className: "v-btn__content"
      }, React.createElement("span", {
        style: {
          paddingRight: "0.4em"
        }
      }, "Filter"), React.createElement("i", {
        "aria-hidden": "true",
        className: this.state.sortOption === SORT_OPTIONS.asc ? "v-icon material-icons rotate180" : "v-icon material-icons"
      }, "filter_list")))), React.createElement("ul", {
        className: "event-card-list"
      }, this._getItemsFiltered().map(function (item, i) {
        return React.createElement(EventItem, {
          key: i,
          index: i,
          title: item.title,
          date: item.date,
          desc: item.desc,
          address: item.address,
          pic: item.pic,
          month: item.month,
          day: item.day,
          important: item.important,
          upcoming: item.upcoming
        });
      })));
    }
  }, {
    key: "_compareBy",
    value: function _compareBy(prop, a, b) {
      if (a[prop].toLowerCase() < b[prop].toLowerCase()) {
        return this.state.sortOption === SORT_OPTIONS.asc ? -1 : 1;
      }

      if (a[prop].toLowerCase() > b[prop].toLowerCase()) {
        return this.state.sortOption === SORT_OPTIONS.asc ? 1 : -1;
      }

      return 0;
    }
  }, {
    key: "_getItemsFiltered",
    value: function _getItemsFiltered() {
      var prop = this.state.filterOption;
      var allItems = this.state.items;
      var queryString = this.state.queryString.toLowerCase();
      var fullTxt = "";
      var items = allItems || [];

      switch (prop) {
        case FILTER_OPTIONS.important:
        case FILTER_OPTIONS.upcoming:
          items = allItems.filter(function (item) {
            fullTxt = "".concat(item.title, " ").concat(item.date, " ").concat(item.desc, " ").concat(item.address, " ").concat(item.month, " ").concat(item.day).toLowerCase();
            return item[prop] === true && fullTxt.includes(queryString);
          });
          break;

        case FILTER_OPTIONS.finished:
          items = allItems.filter(function (item) {
            fullTxt = "".concat(item.title, " ").concat(item.date, " ").concat(item.desc, " ").concat(item.address, " ").concat(item.month, " ").concat(item.day).toLowerCase();
            return item[FILTER_OPTIONS.upcoming] === false && fullTxt.includes(queryString);
          });
          break;

        case FILTER_OPTIONS.all:
        default:
          items = allItems.filter(function (item) {
            fullTxt = "".concat(item.title, " ").concat(item.date, " ").concat(item.desc, " ").concat(item.address, " ").concat(item.month, " ").concat(item.day).toLowerCase();
            return fullTxt.includes(queryString);
          });
          break;
      }

      items.sort(this._compareByTitle);
      return items;
    }
  }]);

  return EventList;
}(Component);