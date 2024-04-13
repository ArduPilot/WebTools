# [browser-cjs](#browser-cjs)

> A minimal [*CommonJS*](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/)-like module loader for the browser environment.

As a client-side [*CommonJS*](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) module loader, **[browser-cjs](#browser-cjs)** aims to implement a [Node.js](https://nodejs.org/)-like module loading utility in the browser environment. In other words, it defines in the global scope of the browser a utility function called `require`, whose role is to **synchronously** load (without the need of a JS bundler, such as [Webpack](http://webpack.github.io/) or [Browserify](http://browserify.org/)) JS modules defined with to the [*CommonJS*](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) module syntax.

**Note:**
In a case when the runtime environment already supports the `require` utility function (such as the [ElectronJS](https://electronjs.org) environment, or the [NWJS](https://nwjs.io/) environment), **[browser-cjs](#browser-cjs)** will not override or replace the existing `require` function; instead, it will reuse it as-is.

## Installation

To give **[browser-cjs](#browser-cjs)** a try install it with `npm`, using

```sh
npm install browser-cjs
```

or

```sh
npm install --save browser-cjs
```

and load it in your page from its installation package using an HTML `script` tag, as shown in the following example:

```html
<script src="/node_modules/browser-cjs/require.js"></script>
```

As an alternative, you may download a copy locally or reference it directly from [**unpkg**](`https://unpkg.com/browser-cjs/require.js`):

```html
// For production
<script src="https://unpkg.com/browser-cjs/require.min.js"></script>

// For development
<script src="https://unpkg.com/browser-cjs/require.js"></script>
```

## Usage

Once the **[browser-cjs](#browser-cjs)** module loader is fully loaded, and its `require` utility function available in the browser's global scope, it is ready for loading content, which includes [CommonJS](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) modules and `JSON` data files.

### Loading [CommonJS](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) modules

[CommonJS](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) modules, or Javascript files in [CommonJS](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) module format, are files that expose JS functionality typically using the `module.exports` syntax. Here is an example of such a module:

```js
module.exports = 'This is a string';
```

To use **[browser-cjs](#browser-cjs)** for loading and evaluating JS files in [CommonJS](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) module format, simply call the globally available function `require` with the name of the module file given as argument (as it's done in [`Node.js`](https://nodejs.org/)).

For instance, to load a module called `moduleName.js`:

```html
<script>
  const moduleName = require("/path/to/moduleName.js");
  // ...
  // The rest of the code goes here...
</script>
```

**Important:**

**It is necessary to specify the extension of the file (`.es6`, `.js`, etc.), because without the extension, **[browser-cjs](#browser-cjs)** will assume that `moduleName` is a directory and it will try to load the `/path/to/nodeModule/<package.main>` file, where `<package.main>` is the file `main` specified in the `package.json` (e.g.: `main: "./index.js"`).** (Please refer to the [Limitations](#limitations) section).

### `JSON` data files

In addition to [*CommonJS*](http://eng.wealthfront.com/2015/06/16/an-introduction-to-commonjs/) modules, **[browser-cjs](#browser-cjs)** supports loading plain `JSON` files as well. However, it is important to keep in mind that **[browser-cjs](#browser-cjs)** loads content synchronously, and in most cases a synchronous operation is not the desired or recommended way of loading this type of files (unless there is a specific reason for that, such as loading configuration files, or other special cases in which a synchronous operation is acceptable, or even preferred over an asynchronous operation).

Thus, to let **[browser-cjs](#browser-cjs)** know that the content it has to load is not a module, but a `JSON` data file, the file name must end with the `.json` extension. Here are some examples of loading JSON files with **[browser-cjs](#browser-cjs)**'s `require` utility:

```js
const config = require("/path/to/file/config.json");
const package = require("/package.json");
```

## Options

To allow the user to modify its default configuration, **[browser-cjs](#browser-cjs)** supports a set of options (or parameters), which includes:

* `scripts` - a comma separated list of prerequisite non-CommonJS Javascript files,
* `styles` - a comma separated list of stylesheets,
* `base_dir` - the base URL (URI) to automatically prepend to all relative links. The default option is `base_dir="/"`, and
* `main` - the module with entry point role (the module to load and run first). The default value of `main` is `null`, in which case no module will be automatically loaded and executed.

These options can be passed as data attributes (using the `data-` prefix) to the `script` tag that loads the library as in the following example:

```html
<script
  src="/node_modules/browser-cjs/require.js"
  data-base_dir="./dist"
  data-styles="./css/style.css"
  data-scripts="https://unpkg.com/react@16/umd/react.production.min.js, https://unpkg.com/react-dom@16/umd/react-dom.production.min.js, https://unpkg.com/prop-types@15.6/prop-types.min.js"
  data-main="./dist/index.js">
</script>
```

In the example above the `script` tag, in addition to loading the `require.js` file, specifies the base URL for all relative links, specifies also a stylesheet and some pre-requisite (probably non-CommonJS compatible) scripts to load, and indicates the file to load and execute first as the main entry point of the application.

### Example

Next is a sample app that uses **[browser-cjs](#browser-cjs)**' `require` function to load the `package.json` file of this package and display the package `name`, `description` and `version` of the package, as well as the `version` of the preloaded `jquery` library.

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Browser-CJS Example</title>

    <!-- load the <b>browser-cjs</b> library -->
    <script src="../../../../require.js" data-scripts="https://unpkg.com/jquery@3.3.1/dist/jquery.js">
    </script>

    <!-- the main script -->
    <script>
      window.addEventListener("load", () => {
        const package = require("./package.json");
        $("#root").html(`<div>
          <h2>${package.name}</h2>
          <p>${package.description}</p>
          <div>Version: <span>${package.version}</span></div>
          <hr />
          <div>jQuery version: <span>${$.fn.jquery}</span></div>
        </div>`);
      });
    </script>
  </head>

  <body>
    <div id="root"></div>
  </body>
</html>
```

## Limitations

Since this library is not designed for the [`Node.js`](https://nodejs.org/) environment, but rather for the browser environment, it will behave slightly different than the module loader of [`Node.js`](https://nodejs.org/), and the main reason is that the browser's limitations and constrains still apply.

One major difference is that the `require()` function of **[browser-cjs](#browser-cjs)**, unlike the `require()` function of [`Node.js`](https://nodejs.org/), resolves the path to a given module relative to the current directory, the root directory or the `data-base_dir` script attribute, if provided.

For this reason, modules located inside `npm` packages must be requested by their full path relative to the `node_modules` directory, as in the following examples:

```js
const atob = require("/node_modules/atob");
const use = require("/node_modules/use");
const wrappy = require("/node_modules/wrappy");
```

acknowledging that due to the client-side limitations and constrains there is no guarantee that all [`Node.js`](https://nodejs.org/) modules will be able to run, or run correctly, in the browser environment.

## Version

1.0.3

## Demo Apps

Here is a list of sample demo apps that use **[browser-cjs](#browser-cjs)** as a module loader:

* [EventListDemo](./demo/EventListApp/readme.md#eventlistdemo) App - A simple ReactJS app, that displays a list of upcoming events, uses browser-cjs as a module loader for the custom ReactJS Components it is built with.
