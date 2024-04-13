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

var EventList = require("./EventList.js");

module.exports =
/*#__PURE__*/
function (_Component) {
  _inherits(App, _Component);

  function App(props) {
    var _this;

    _classCallCheck(this, App);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(App).call(this, props));
    _this.state = {
      appInfo: {}
    };
    return _this;
  }

  _createClass(App, [{
    key: "componentDidMount",
    value: function componentDidMount() {
      var pack = require("../../package.json");

      this.setState({
        appInfo: pack
      });
    }
  }, {
    key: "render",
    value: function render() {
      var title = document.querySelector("head > title");
      title.innerHTML = this.state.appInfo.displayName;
      return React.createElement("div", {
        "data-app": "true",
        className: "application theme--light",
        id: "app"
      }, React.createElement("div", {
        className: "application--wrap"
      }, React.createElement("header", {
        className: "app-header"
      }, React.createElement("nav", {
        className: "v-toolbar red",
        style: {
          "marginTop": 0,
          "paddingRight": 0,
          "paddingLeft": 0,
          transform: "translateY(0px)"
        }
      }, React.createElement("div", {
        className: "v-toolbar__content",
        style: {
          height: 56
        }
      }, React.createElement("div", {
        className: "v-toolbar__title white--text"
      }, "Events Card List"), React.createElement("div", {
        className: "spacer"
      })))), React.createElement("main", {
        className: "v-content",
        style: {
          padding: 0,
          background: "rgb(238, 238, 238)"
        }
      }, React.createElement("div", {
        className: "v-content__wrap"
      }, React.createElement("div", {
        className: "container"
      }, React.createElement("div", {
        className: "layout justify-center"
      }, React.createElement(EventList, null))))), React.createElement("footer", {
        className: "app-footer"
      })));
    }
  }]);

  return App;
}(Component);