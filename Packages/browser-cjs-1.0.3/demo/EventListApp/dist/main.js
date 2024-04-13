"use strict";

var ReactDOM = window.ReactDOM;
var React = window.React;
var Component = React.Component;

var App = require("./components/App.js");

ReactDOM.render(React.createElement(App, null), document.querySelector("#root"));