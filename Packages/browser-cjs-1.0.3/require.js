"use strict";

/*
Copyright (c) 2019 Lucian Vuc <https://github.com/luciVuc>

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:
The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * A minimal CommonJS-compatible (nodejs-like) module loader for the browser environment.
 */
window.require = typeof require === "function" ? function (require, document) {
  var tmp = document.querySelector("script[data-main]");

  if (tmp) {
    require(tmp.dataset.main);
  }

  return require;
}(require, document) : function (document) {
  var COMMA_DELIMITER = /,[ ]*/gim;
  var SLASH_DELIMITER = /[\/]+/gmi;
  /**
   * load prerequisites (non-CJS scripts, stylesheets, etc.)
   *
   * @returns {String} The base directory
   */

  function loadPrerequisites() {
    var head = document.head;
    var tmpScripts = document.querySelector("script[data-scripts]");
    var tmpStyles = document.querySelector("script[data-styles]");
    var styles = tmpStyles ? tmpStyles.dataset.styles : "";
    var scripts = tmpScripts ? tmpScripts.dataset.scripts : "";
    var tmpBaseDir = document.querySelector("script[data-base_dir]");
    var tag;
    var baseDir = tmpBaseDir && tmpBaseDir.dataset.base_dir;
    baseDir = baseDir && typeof baseDir === "string" ? baseDir : "./";
    baseDir = new URL(baseDir, location.href).href;

    if (baseDir) {
      tag = document.createElement("base");
      tag.setAttribute("href", baseDir);
      head.append(tag);
    }

    if (typeof styles === "string") {
      styles.trim().replace(COMMA_DELIMITER, ",").split(",").forEach(function (url) {
        tag = document.createElement("link");
        tag.setAttribute("rel", "stylesheet");
        tag.setAttribute("type", "text/css");
        tag.setAttribute("href", url.trim());
        head.append(tag);
      });
    }

    if (typeof scripts === "string") {
      scripts.trim().replace(COMMA_DELIMITER, ",").split(",").forEach(function (url) {
        tag = document.createElement("script");
        tag.setAttribute("type", "text/javascript");
        tag.setAttribute("src", url.trim());
        head.append(tag);
      });
    }

    return baseDir;
  }
  /**
   * Performs a synchronous XHR
   *
   * @param {String} url The request URL
   * @returns {XMLHttpRequest} The XHR instance
   */


  function getSynchXHR(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send();
    return xhr;
  }
  /**
   * If the file path given as argument does not have an extension
   * (such as `.js`, `.es6`, `.json`, etc.), the assumption is that
   * it is a package, and it tries to determine the file name designated
   * as **main** in the `package.json` file, and attach it to the 
   * given file path.
   *
   * @param {String} filePath
   * @returns {String} The complete file path, including the main file name
   */


  function getFileName(filePath) {
    filePath = typeof filePath === "string" ? filePath : "";

    if (filePath.indexOf(".") < 0) {
      var xhr = getSynchXHR("".concat(filePath, "/package.json"));

      if (xhr.status === 200) {
        var pack = JSON.parse(xhr.responseText);
        filePath = filePath + "/" + pack.main;
      }
    }

    return filePath;
  }

  return function () {
    var modules = {};
    var baseDir = loadPrerequisites();
    var tmpMain = document.querySelector("script[data-main]");
    var mainStr = tmpMain ? tmpMain.dataset.main : null;
    /**
     * Loads CommonJS type of JS modules in the browser.
     *
     * @param {String} file The name of the file containing the Common JS module.
     * @param {String} resPath  The path, if not the default one, to the Common JS module.
     * @returns
     */

    function require(dirname, file) {
      file = typeof file === "string" ? file.trim() : "";
      var uri = new URL(file, dirname);
      uri.pathname = getFileName(uri.pathname);
      dirname = uri.href.substr(0, uri.href.lastIndexOf("/") + 1);
      var filename = uri.pathname.substr(uri.pathname.lastIndexOf("/") + 1);

      if (modules.hasOwnProperty(uri.href)) {
        return modules[uri.href];
      } else {
        var xhr = getSynchXHR(uri.href);

        if (xhr.status === 200) {
          var module = {};

          if (/(.json)$/gi.test(filename)) {
            module.exports = JSON.parse(xhr.responseText);
          } else {
            module.exports = {};
            new Function("exports", "require", "module", "__filename", "__dirname", "\n              ".concat(xhr.responseText, "\n              //# sourceURL=").concat(uri.href, "\n            ")).call(this, module.exports, require.bind(this, dirname), module, filename, dirname);
            modules[uri.href] = module.exports;
          }

          return module.exports;
        }
      }

      return;
    }

    Object.defineProperty(require, "modules", {
      set: Function.prototype,

      /**
       * The list af all currently loaded JS modules.
       */
      get: function get() {
        return modules;
      }
    });

    var req = require.bind(this, baseDir); // Load the main (entry point) file


    if (mainStr) {
      window.addEventListener("load", req.bind(this, new URL(mainStr, baseDir).href));
    }

    return req;
  }();
}(document);
