#!/bin/sh

echo "Removing current app directory"
rm -f -r ~/ChromeServer/browser-cjs

echo "Creating a new app directory"
mkdir ~/ChromeServer/browser-cjs
mkdir ~/ChromeServer/browser-cjs/test
mkdir ~/ChromeServer/browser-cjs/demo
mkdir ~/ChromeServer/browser-cjs/demo/EventListApp
mkdir ~/ChromeServer/browser-cjs/demo/EventListApp/css
mkdir ~/ChromeServer/browser-cjs/demo/EventListApp/data
mkdir ~/ChromeServer/browser-cjs/demo/EventListApp/dist

echo "Copying core files into the app directory"
cp -t ~/ChromeServer/browser-cjs/ ./package.json
cp -t ~/ChromeServer/browser-cjs/ ./require.js 
cp -t ~/ChromeServer/browser-cjs/ ./require.min.js 

echo "Copying test files into the app directory"
cp -r -t ~/ChromeServer/browser-cjs/test ./test/*

echo "Copying demo files into the app directory"
cp -r -t ~/ChromeServer/browser-cjs/demo/EventListApp ./demo/EventListApp/index.html
cp -r -t ~/ChromeServer/browser-cjs/demo/EventListApp ./demo/EventListApp/package.json
cp -r -t ~/ChromeServer/browser-cjs/demo/EventListApp ./demo/EventListApp/README.md
cp -r -t ~/ChromeServer/browser-cjs/demo/EventListApp/css ./demo/EventListApp/css/*
cp -r -t ~/ChromeServer/browser-cjs/demo/EventListApp/data ./demo/EventListApp/data/*
cp -r -t ~/ChromeServer/browser-cjs/demo/EventListApp/dist ./demo/EventListApp/dist/*

echo "... Done"
