# [EventListDemo](#eventlistdemo)

A simple ReactJS app, that displays a list of upcoming events, uses [browser-cjs](../../README.md#browser-cjs) as a module loader for the custom ReactJS Components it is built with.

To run the demo app locally, it needs to be deployed on a local instance of a web server.

## [Web Server For Chrome](https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb/related?hl=en)

An example of a simple web server that can quickly be installed, configured and launched locally, is the [Web Server For Chrome](https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb/related?hl=en) app.

To use  as a local web server for deploying and testing the [EventListDemo](#eventlistdemo) app

- first, go to the the [Chrome Web Store](https://chrome.google.com/webstore/category/extensions?hl=en) and add [Web Server For Chrome](https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb/related?hl=en) to your Chrome apps, launch it, and set `~/ChromeServer` as the local directory where it serves the web pages from,
- then, deploy [EventListDemo](#eventlistdemo) app to `~/ChromeServer` (the local directory which [Web Server For Chrome](https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb/related?hl=en) uses to serve the web pages from), by running, under the root directory (`browser-cjs/`), the following command:

  ```sh
  npm run deploy
  ```

- and finally, go to [http://127.0.0.1:8887/browser-cjs/demo/EventListApp/](http://127.0.0.1:8887/browser-cjs/demo/EventListApp/) to load and run the demo app in the browser.
