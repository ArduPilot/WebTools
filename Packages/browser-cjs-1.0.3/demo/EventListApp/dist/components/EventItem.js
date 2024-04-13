"use strict";

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

var React = window.React;
var Component = React.Component;

module.exports =
/*#__PURE__*/
function (_Component) {
  _inherits(EventItem, _Component);

  function EventItem(props) {
    _classCallCheck(this, EventItem);

    return _possibleConstructorReturn(this, _getPrototypeOf(EventItem).call(this, props));
  }

  _createClass(EventItem, [{
    key: "render",
    value: function render() {
      return React.createElement("li", {
        "data-index": this.props.index,
        style: {
          opacity: 1,
          height: "100%",
          transform: "scale(1)"
        },
        className: ""
      }, React.createElement("div", {
        className: "event-card v-card"
      }, React.createElement("div", {
        className: "layout row"
      }, React.createElement("img", {
        src: this.props.pic
      }), React.createElement("div", {
        className: "layout column justify-space-between",
        style: {
          padding: "0.8em 1.3em",
          maxWidth: 390
        }
      }, React.createElement("div", null, React.createElement("h1", {
        className: "name"
      }, this.props.title), React.createElement("h3", {
        className: "date"
      }, this.props.date)), React.createElement("div", null, React.createElement("p", {
        className: "desc"
      }, this.props.desc), React.createElement("div", {
        className: "location"
      }, React.createElement("i", {
        "aria-hidden": "true",
        className: "v-icon material-icons"
      }, "location_on"), this.props.address)), React.createElement("div", {
        className: "date-ribbon"
      }, React.createElement("h2", null, this.props.month), React.createElement("h1", null, this.props.day))))));
    }
  }]);

  return EventItem;
}(Component);