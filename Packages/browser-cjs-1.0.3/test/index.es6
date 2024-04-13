QUnit.module("browser-cjs -> require", {
  beforeEach: (assert) => {
    //  assert.ok( true, "before test case" );
  },
  afterEach: (assert) => {
    //  assert.ok( true, "after test case" );
  }
});

QUnit.test("`browser-cjs`initialized", (assert) => {
  assert.ok(typeof require === "function", "window.require is defined");
  assert.ok(typeof QUnit !== "undefined", "QUnit library loaded by `browser-cjs` through the `script` attribute");
});

QUnit.test("'require` caches modules", (assert) => {
  const m1 = require(__dirname + '/foo.es6');
  const m2 = require('./foo.es6'); // Same location, different string parameter
  assert.ok(m1 === m2) // true
});

QUnit.test("`require` loads CommonJS modules that export various data types", (assert) => {
  const foo = require('./foo.es6');
  assert.ok(foo === 'This is a string', "String-exporting module");

  const keys = require('./keys.es6');
  assert.ok(typeof keys === "object" && keys["13"] === "enter", "Object-exporting module");

  const util = require("./util.es6");
  assert.equal(util.convertKeyCode("13"), "enter");
  assert.equal(util.convertKeyCode(13), "enter");
  assert.equal(util.convertKeyCode(14), undefined);
  assert.equal(util.getName(), "utils");

  const Component = require("./Component.es6");
  const component = new Component({
    id: "1",
    value: "Hello"
  });
  assert.equal(component.render(), '<div id="1">Hello</div>', "Class-exporting module");

  const db = require("./DB.es6");
  assert.ok(db.connect() === true && typeof db.query() === "object", "Singleton-exporting module");
});

QUnit.test("Through `require`, CommonJS modules only expose public variables.", (assert) => {
  const panel = require("./panel.es6");
  assert.equal(typeof (panel.onDomLoaded), 'function');
  assert.equal(typeof (panel.onBtnClick), 'undefined');
  assert.equal(typeof (onBtnClick), 'undefined');
});
